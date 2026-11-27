import { tr } from '../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bestVoice, detectLanguage, LANG_NAME, listVoices, openVoiceInstall, queueSpeak, speak, speechText, stopSpeaking, ttsAvailable, type Voice } from '../lib/tts';
import { NEURAL_PREFIX, NEURAL_VOICES, NeuralPlayer, sharedEngine, isNeural, lighterThan, neuralDownload, neuralId, neuralStored, neuralSupported } from '../lib/neural';
import { VoiceSheet } from './VoiceSheet';
import { Scrub } from './Scrub';
import { goPage } from './paged';
import { firstVisibleSentence, isReferenceLine, markSaying, referenceRanges, sentenceAtPoint, sentenceRaw, sentenceText, spansOf, wrapSentences } from './dom';
import { updateSettings, useStore } from '../lib/store';
import { isNative, mediaStart, mediaStop, mediaUpdate, onMediaAction, tap } from '../lib/native';
import { notifyPermission } from '../lib/reminders';
import { askWorkFree, workFree } from '../lib/workNotice';
import * as db from '../lib/db';
import { Icon } from '../ui/Icon';
import { Ruler, Sheet, toast } from '../ui/kit';

interface Props {
  root: HTMLElement | null;
  scroller: HTMLElement | null;
  startAt?: number | null; // sentence index to start from (e.g. "Listen from here")
  onPlaying: (p: boolean) => void;
  docId: string;
  title?: string;
  coverId?: string;
  /** where the position bar goes: the reader keeps it in one place, right above its main controls */
  barSlot?: HTMLElement | null;
}

const SLEEP = [0, 10, 20, 30, 60];
/** The reading language chips: auto first, then the languages with natural voices. */
const LANG_CYCLE = ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt'];
const LANG_CODES: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' };

export function ListenBar({ root, scroller, startAt, onPlaying, docId, title = 'Frogity', coverId, barSlot }: Props) {
  const settings = useStore((s) => s.settings);
  const [idx, setIdx] = useState(0);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pop, setPop] = useState<'speed' | null>(null);
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [batterySheet, setBatterySheet] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [sleep, setSleep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [langTag, setLangTag] = useState('en-US'); // the language the book is read in
  const [langAuto, setLangAuto] = useState(true);
  const rangeSeen = useRef((() => { try { return localStorage.getItem('tts:ranges') === '1'; } catch { return false; } })()); // this phone's voice engine reports where it is (word by word), so silence can be noticed quickly
  const neuralSlow = useRef(false); // the studio voice could not keep up on this phone: the phone's own voice reads
  const storedRef = useRef<string[]>([]);
  storedRef.current = stored;
  const player = useRef<NeuralPlayer | null>(null);
  const neuralBroken = useRef(false);
  const neuralRetry = useRef(0); // a failed piece is made again once, with the engine started afresh
  const bestRef = useRef<string | undefined>(undefined);
  const sleepAt = useRef(0);
  const rateT = useRef(0);
  const token = useRef(0);
  const lang = useRef('en-US');
  const idxRef = useRef(0);
  idxRef.current = idx;
  const wordsAll = useRef(0); // the words in the whole book, counted once (not on every render)
  const refs = useRef<[number, number][]>([]); // reference lists, notes and footnotes: not read aloud
  const opts = useRef(settings);
  opts.current = settings;

  // prepare sentences
  useEffect(() => {
    if (!root) return;
    const n = wrapSentences(root);
    wordsAll.current = (root.textContent?.match(/\S+/g) ?? []).length;
    setTotal(n);
    refs.current = referenceRanges(root, n);
    const forced = localStorage.getItem('lang:' + docId);
    const found = forced && forced !== 'auto' ? LANG_CODES[forced] ?? forced : detectLanguage(root.textContent ?? '').lang;
    lang.current = found;
    setLangTag(found);
    setLangAuto(!forced || forced === 'auto');
    root.classList.add('listening');
    const saved = Number(localStorage.getItem('listen:' + docId) ?? NaN);
    const first = scroller ? firstVisibleSentence(root, scroller) : 0;
    setIdx(Number.isFinite(saved) && Math.abs(saved - first) < 40 ? saved : first);
    return () => {
      root.classList.remove('listening', 'focus');
      markSaying(root, null);
    };
  }, [root, scroller, docId]);

  useEffect(() => {
    root?.classList.toggle('focus', settings.focusListen && playing);
  }, [root, settings.focusListen, playing]);

  // ---- listening as a "track": lock-screen / notification player, keeps going with the screen off
  const media = useRef(false);
  const handlers = useRef<Record<string, () => void>>({});
  const coverB64 = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isNative || !coverId) return;
    db.get<Blob>('blobs', coverId).then((b) => {
      if (!b) return;
      const r = new FileReader();
      r.onload = () => (coverB64.current = String(r.result).split(',')[1]);
      r.readAsDataURL(b);
    });
  }, [coverId]);
  useEffect(() => {
    let off = () => {};
    onMediaAction((a) => handlers.current[a]?.()).then((f) => (off = f));
    return () => {
      off();
      if (media.current) mediaStop();
      media.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const left = total ? Math.max(1, Math.round(((total - idx) / total) * wordsAll.current / (165 * settings.ttsRate))) : 0;
    const subtitle = `${left ? left + ' min left · ' : ''}${idx + 1}/${total || '–'}`;
    if (playing && !media.current) {
      media.current = true;
      notifyPermission(true).finally(() => mediaStart({ title, subtitle, playing: true, cover: coverB64.current }));
    } else if (media.current) mediaUpdate({ title, subtitle, playing });
  }, [playing, Math.floor(idx / 8)]); // eslint-disable-line react-hooks/exhaustive-deps

  // load the studio voice as soon as listening opens, so pressing play starts at once
  useEffect(() => {
    const v = settings.ttsVoice;
    if (!isNeural(v) || !neuralSupported() || neuralBroken.current) return;
    // the first engine first, then the helper (so the first one never competes for the phone while it loads)
    // the voice loads while the reader looks at the controls; pressing play never waits for it (the phone's voice covers)
    const t = setTimeout(() => sharedEngine.init(neuralId(v)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [settings.ttsVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listVoices().then(setVoices);
    neuralStored().then(setStored);
  }, []);
  useEffect(() => {
    bestRef.current = bestVoice(voices, lang.current)?.id;
  }, [voices, total, langTag]);

  const follow = (el: HTMLElement | null) => {
    if (!el || !scroller) return;
    const r = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    if (scroller.classList.contains('paged')) {
      // flipping pages: turn to the page the sentence is on
      if (r.left < sr.left - 2 || r.right > sr.right + 2) goPage(scroller, Math.round((scroller.scrollLeft + r.left - sr.left) / Math.max(1, scroller.getBoundingClientRect().width)));
      return;
    }
    if (r.top < sr.top + 90 || r.bottom > sr.bottom - 260) {
      scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - sr.height * 0.3, behavior: 'smooth' });
    }
  };

  /**
   * What to say next: a few whole sentences together, so the voice carries its intonation from one to the next
   * instead of finishing every sentence as if it were the end. `offset` starts the first sentence mid-way (a tapped word).
   */
  const buildChunk = (from: number, n: number, offset: number, target: number) => {
    if (!root) return null;
    const parts: { i: number; at: number; w: number }[] = [];
    let text = '';
    let i = from;
    // one paragraph per request: the voice ends it, and the gap before the next request is the space between paragraphs
    const blockOf = (k: number) => spansOf(root, k)[0]?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, pre, dd, dt');
    let block: Element | null | undefined;
    for (; i < n; i++) {
      if (text && block !== undefined && blockOf(i) !== block) break;
      if (!(i === from && offset > 0) && refs.current.some(([a, b]) => i >= a && i < b)) continue; // sources and notes are not read
      const raw = i === from && offset > 0 ? sentenceRaw(root, i).slice(offset) : sentenceText(root, i);
      if (isReferenceLine(raw.trim())) continue;
      let t = speechText(raw, lang.current.slice(0, 2));
      if (!t || !speakable(t)) continue;
      if (!/[.!?…:;,"”’)\]]$/.test(t)) t += '.'; // a heading or list line: a breath before the next one
      if (text && text.length + t.length > target * 1.35) break;
      parts.push({ i, at: text ? text.length + 1 : 0, w: t.length });
      text += (text ? ' ' : '') + t;
      block = blockOf(i);
      if (text.length >= target) {
        i++;
        break;
      }
    }
    return text ? { text, parts, next: i } : null;
  };

  /**
   * The voice to use for this book: the chosen one while it speaks the book's language; otherwise a natural voice of that
   * language if one is on the phone, otherwise the phone's best voice for it (never an English voice reading Spanish).
   */
  const resolveVoice = (): string | undefined => {
    const chosen = opts.current.ttsVoice;
    const dl = lang.current.slice(0, 2);
    const cl = !chosen ? dl : isNeural(chosen) ? NEURAL_VOICES.find((v) => NEURAL_PREFIX + v.id === chosen)?.lang.slice(0, 2) : voices.find((v) => v.id === chosen)?.lang.slice(0, 2);
    if (chosen && (opts.current.autoVoice === false || !cl || cl === dl)) return chosen;
    const mine = NEURAL_VOICES.filter((v) => v.lang.slice(0, 2) === dl && storedRef.current.includes(v.id)).sort((x, y) => Number(y.lang === lang.current) - Number(x.lang === lang.current) || Number(!!y.rec) - Number(!!x.rec))[0];
    if (mine) return NEURAL_PREFIX + mine.id;
    return bestVoice(voices, lang.current)?.id; // none natural installed: the phone's own voice for that language
  };
  /** Said once per book: the book is in a language that has no voice on this phone yet. */
  const told = useRef('');
  const tellVoice = () => {
    const dl = lang.current.slice(0, 2);
    if (told.current === dl || dl === 'en') return;
    told.current = dl;
    const name = LANG_NAME[dl] ?? dl;
    const natural = NEURAL_VOICES.some((v) => v.lang.slice(0, 2) === dl);
    if (storedRef.current.some((id) => NEURAL_VOICES.find((v) => v.id === id)?.lang.slice(0, 2) === dl)) return;
    if (bestVoice(voices, lang.current)) return toast(`Reading in ${name} with the phone’s ${name} voice${natural ? ' · a natural one is in Voice' : ''}`, undefined, natural ? () => setVoiceSheet(true) : undefined);
    toast(natural ? `This book is in ${name}. Get a natural ${name} voice →` : `This book is in ${name} but the phone has no ${name} voice. Install one →`, undefined, () => (natural ? setVoiceSheet(true) : openVoiceInstall()));
  };

  /** Skips what is not worth hearing: rows of numbers, formulas, table cells. */
  const speakable = (t: string) => {
    const letters = (t.match(/\p{L}/gu) ?? []).length;
    return letters >= 2 && (t.length < 14 || letters / t.length > 0.45);
  };

  /**
   * Studio voice. One engine keeps the voice loaded; pieces are made ahead and placed on one audio clock right behind
   * the last, so speech flows. If the phone ever falls behind, playback waits (a short, deliberate pause while it catches
   * up) instead of stuttering. While the voice is still loading, the phone's own voice reads and hands over by itself.
   */
  const runNeural = async (from: number, my: number, sel: string, n: number, offset: number) => {
    if (!root) return;
    const eng = sharedEngine;
    const vid = neuralId(sel);
    if (!eng.isReady(vid)) {
      // The chosen voice is still loading. Listening never waits for it: the phone's own voice starts within a moment and
      // the studio voice takes over, at the next sentence, as soon as it is ready.
      const loading = eng.init(vid).then(
        () => 'ready' as const,
        (e) => (console.warn('studio voice failed to load', e), 'failed' as const),
      );
      // the chosen voice is worth waiting for: a few seconds with "preparing…" rather than starting in another voice and
      // changing mid-page. Only a voice that is very late (or fails) hands the first sentences to the phone's own voice.
      const label = NEURAL_VOICES.find((v) => v.id === vid)?.label ?? '';
      setNote(`preparing ${label}…`);
      setBusy(true);
      const out = await Promise.race([loading, new Promise<'late'>((res) => setTimeout(() => res('late'), 12000))]);
      setNote('');
      if (my !== token.current) return;
      if (out === 'ready') return runNeural(from, my, sel, n, offset);
      if (out === 'failed') {
        neuralBroken.current = true;
        toast('The studio voice couldn’t start — using the phone’s voice');
        return void run(from, offset);
      }
      let settled: 'ready' | 'failed' | null = null;
      void loading.then((r) => {
        settled = r;
        if (r === 'failed') neuralBroken.current = true;
      });
      // (the phone's voice reads in short pieces while it waits, and the moment the studio voice has loaded or has failed, this returns)
      const r = await runSystem(from, my, n, offset, undefined, () => settled !== null, true);
      if (my !== token.current) return;
      if (!r.done) {
        if (settled === 'ready') return runNeural(r.at, my, sel, n, 0);
        await runSystem(r.at, my, n, 0, undefined); // it could not load: the phone's voice reads on, in long smooth pieces again
      }
      return;
    }
    setNote('');
    // a slow phone: a lighter voice of this language plays smoother
    if (eng.rtf > 0.9) {
      const cur = NEURAL_VOICES.find((v) => v.id === vid);
      const light = cur && lighterThan(cur);
      if (light && storedRef.current.includes(light.id)) {
        await updateSettings({ ttsVoice: NEURAL_PREFIX + light.id });
        toast(`${cur.label} is heavy for this phone — using ${light.label}`);
        return void run(from, offset);
      }
      if (light) toast(`${cur.label} is heavy for this phone. “${light.label}” would play smoother — open Voice to get it`, undefined, () => setVoiceSheet(true));
    }
    const rate = opts.current.ttsRate;
    const say = Math.min(rate, 2);
    const tempo = rate > 2 ? rate / 2 : 1; // beyond 2× the voice itself stops getting faster: speed up playback a little
    const pl = (player.current = new NeuralPlayer(tempo, 0.25));
    setBusy(true);

    // the pipeline: pieces being made (in order), what has been placed, how fast this phone is
    type Job = { ch: NonNullable<ReturnType<typeof buildChunk>>; p: Promise<{ samples: Float32Array; rate: number; ms?: number }> };
    const jobs: Job[] = [];
    let at = from;
    let off = offset;
    let made = 0;
    let rtf = Math.max(0.15, eng.rtf || 0.5); // seconds of work per second of speech (measured, then kept up to date)
    let finished = false;
    let shown = -1;
    let holding = false;
    let holdSince = 0;
    const dry: number[] = []; // when it ran dry, over the last minute and a half
    let gaveUp = false;
    const CPS = 14; // characters per second of speech at 1×

    /** This phone cannot make speech as fast as it is spoken: carry on with the phone's own voice, at the sentence being heard. */
    const giveUp = () => {
      if (gaveUp || my !== token.current) return;
      gaveUp = true;
      neuralSlow.current = true;
      const here = pl.current() ?? idxRef.current;
      pl.stop();
      const cur = NEURAL_VOICES.find((v) => v.id === vid);
      const light = cur && lighterThan(cur);
      // a lighter studio voice of the same language reads on in the same kind of voice: used at once when it is on the phone,
      // fetched in the background when it is not (the phone's own voice reads only until it is there)
      if (light && storedRef.current.includes(light.id)) {
        neuralSlow.current = false;
        void updateSettings({ ttsVoice: NEURAL_PREFIX + light.id }).then(() => run(here, 0));
        toast(`${cur.label} is heavy for this phone — going on with ${light.label}`);
        return;
      }
      if (light) {
        toast(`Getting ${light.label}, a lighter voice that plays smoothly on this phone — the phone’s voice reads until then`);
        void neuralDownload(light.id, () => {}).then(async () => {
          storedRef.current = [...storedRef.current, light.id];
          await updateSettings({ ttsVoice: NEURAL_PREFIX + light.id });
          neuralSlow.current = false;
          toast(`${light.label} is ready — it reads from the next time you press Listen`);
        }, () => {});
      } else toast('The studio voice cannot keep up on this phone right now — reading with the phone’s voice');
      void run(here, 0);
    };

    // The watcher follows the audio clock. It runs with the screen's frames while the book is on screen and on a timer
    // when it is not (screen off, another app): the sleep timer, the end of the book and the lock-screen position must
    // all keep working exactly then.
    let raf = 0;
    const beat = window.setInterval(() => document.hidden && watch(), 400);
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(watch);
    };
    const endWatch = () => {
      clearInterval(beat);
      cancelAnimationFrame(raf);
    };
    const watch = () => {
      if (my !== token.current) return endWatch();
      const i = pl.current();
      if (i !== null && i !== shown) {
        shown = i;
        setBusy(false);
        setIdx(i);
        localStorage.setItem('listen:' + docId, String(i));
        follow(markSaying(root, i));
      }
      const now = Date.now();
      // ran dry while more is on its way: wait quietly for a few seconds (never longer), then go on with what there is
      if (!holding && pl.started() && !finished && pl.ahead() < 0.12 && (jobs.length || at < n)) {
        dry.push(now);
        while (dry.length && now - dry[0] > 90_000) dry.shift();
        if (dry.length >= 6) return endWatch(), giveUp();
        holding = true;
        holdSince = now;
        pl.hold();
        setNote('catching up…');
      } else if (holding && (pl.ahead() >= 4 || now - holdSince > 9000 || (finished && jobs.length === 0))) {
        holding = false;
        pl.unhold();
        setNote('');
      }
      if (sleepAt.current && Date.now() > sleepAt.current && pl.started()) {
        sleepAt.current = 0;
        setSleep(0);
        toast('Sleep timer — paused. Sweet dreams.');
        endWatch();
        return pause();
      }
      if (finished && !holding && (pl.drained() || pl.empty())) {
        endWatch();
        setPlaying(false);
        onPlaying(false);
        return;
      }
      again();
    };
    again();

    // how many characters may the next piece have, so it is ready before the speech ahead of it has been heard?
    const size = () => {
      if (made === 0) return 24;
      const ahead = pl.buffered() + jobs.reduce((x, j) => x + j.ch.text.length / (CPS * say), 0);
      const budget = Math.round(((ahead * CPS * say) / rtf) * 0.55);
      // a piece cannot be interrupted once the phone has started making it, so none is longer than about four seconds of
      // work: a skip, a tapped word or a new speed is answered in that time at worst, however slow the phone
      const cap = Math.max(110, Math.min(340, Math.round((4 / rtf) * CPS * say)));
      return Math.max(made < 3 ? 30 : 110, Math.min(made < 3 ? 40 * 2 ** made : cap, budget));
    };
    /** The next piece: whole sentences when they fit, otherwise the next phrase of a long sentence. */
    const piece = (target: number) => {
      const ch = buildChunk(at, n, off, target);
      if (!ch || ch.text.length <= target * 1.15) return ch;
      const first = ch.parts[0];
      if (ch.parts.length > 1) {
        const keep = ch.parts.filter((p) => p.at + p.w <= target * 1.15);
        if (keep.length) {
          const last = keep[keep.length - 1];
          return { text: ch.text.slice(0, last.at + last.w), parts: keep, next: last.i + 1 };
        }
      }
      const startOff = first.i === at ? off : 0;
      const raw = sentenceRaw(root, first.i).slice(startOff);
      const lo = Math.min(made === 0 ? 12 : 20, raw.length);
      const hi = Math.max(lo + 10, Math.round(target * 1.1));
      const m = raw.slice(lo, hi).search(/[,;:—–)]\s/);
      const cut = m >= 0 ? lo + m + 1 : lo + Math.max(0, raw.slice(lo, hi).lastIndexOf(' '));
      if (cut <= 10 || cut >= raw.length - 8) return ch;
      const head = speechText(raw.slice(0, cut), lang.current.slice(0, 2));
      if (!head) return ch;
      return { text: head, parts: [{ i: first.i, at: 0, w: head.length }], next: first.i, off: startOff + cut };
    };
    const fill = () => {
      while (my === token.current && at < n && jobs.length < 3 && pl.ahead() < 60) {
        const ch = piece(size()) as (NonNullable<ReturnType<typeof buildChunk>> & { off?: number }) | null;
        if (!ch) {
          at = n;
          break;
        }
        off = ch.off ?? 0;
        at = ch.next;
        const t0 = performance.now();
        const p = eng.say(ch.text, say).then((r) => {
          const secs = r.samples.length / r.rate / say;
          rtf = rtf * 0.6 + Math.max(0.1, (r.ms ?? performance.now() - t0) / 1000 / Math.max(0.4, secs)) * 0.4;
          return r;
        });
        p.catch(() => {});
        jobs.push({ ch, p });
        made++;
      }
    };
    while (my === token.current) {
      fill();
      const job = jobs.shift();
      if (!job) break;
      try {
        const r = await job.p;
        if (my !== token.current) return;
        console.debug(`[studio] ${job.ch.parts.length} sentence(s), ${(r.samples.length / r.rate).toFixed(1)} s of speech · ${pl.ahead().toFixed(1)} s ready ahead · rtf ${rtf.toFixed(2)}`);
        // pauses like a narrator's: a breath after a sentence, a longer one between paragraphs and after a heading
        const lastI = job.ch.parts[job.ch.parts.length - 1].i;
        const endsSentence = /[.!?…]["”’)\]]*$/.test(job.ch.text) && job.ch.next > lastI;
        const blockOf = (i: number) => spansOf(root, i)[0]?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, pre, dd, dt');
        const here = endsSentence ? blockOf(lastI) : null;
        const gap = !endsSentence ? (/[,;:—–]$/.test(job.ch.text) ? 0.08 : 0.02) : here && /^H\d$/.test(here.tagName) ? 0.7 : here && here !== blockOf(lastI + 1) ? 0.55 : 0.2;
        pl.enqueue(job.ch.parts.map((p) => ({ i: p.i, w: p.w })), r.samples, r.rate, gap);
        neuralRetry.current = 0;
      } catch (e) {
        if (my !== token.current) return;
        console.warn('studio voice failed', e);
        // once: the engine is started afresh and the same piece is made again (a hiccup is not a reason to change voice)
        if (neuralRetry.current < 1) {
          neuralRetry.current++;
          try {
            eng.dispose();
            await eng.init(vid);
            if (my !== token.current) return;
            pl.stop();
            return void runNeural(job.ch.parts[0].i, my, sel, n, 0);
          } catch {
            /* it really cannot: the phone's voice reads on */
          }
        }
        neuralBroken.current = true;
        pl.stop();
        toast('The studio voice stopped — using the phone’s voice');
        run(job.ch.parts[0].i);
        return;
      }
      while (my === token.current && pl.ahead() > 60) await new Promise((r) => setTimeout(r, 250));
    }
    if (my !== token.current) return;
    pl.release();
    finished = true;
  };

  /**
   * The phone's own voice: several sentences per request (so it doesn't end every sentence on a falling note), and the
   * engine's word positions move the highlight. `handoff` is asked after each piece: when it says yes, this returns and the
   * studio voice takes over from the next sentence.
   */
  const runSystem = async (from: number, my: number, n: number, offset: number, chosen: string | undefined, handoff?: () => boolean, short = false): Promise<{ at: number; done: boolean }> => {
    let at = from;
    let off = offset;
    let first = true;
    let fails = 0;
    let voiceOff = false; // after a few misses in a row, the engine is left to pick its own voice
    type PreT = { ch: NonNullable<ReturnType<typeof buildChunk>>; q: Promise<Awaited<ReturnType<typeof queueSpeak>>>; from: number };
    const hold: { pre: PreT | null } = { pre: null };
    const dropPre = () => {
      if (!hold.pre) return;
      hold.pre.q.then((q) => q.off());
      hold.pre = null;
      stopSpeaking();
    };
    while (at < n || hold.pre) {
      if (my !== token.current) return { at, done: true };
      if (handoff?.()) return { at, done: false };
      // the piece was handed to the engine while the last one was still playing (so there is no gap between them)?
      const queued = hold.pre;
      hold.pre = null;
      const ch = queued ? queued.ch : buildChunk(at, n, off, first || short || fails > 0 ? 70 : 300);
      const chunkOff = queued ? 0 : off;
      const chunkFrom = queued ? queued.from : at;
      const startOfRun = first;
      off = 0;
      first = false;
      if (!ch) break;
      at = ch.next;
      const show = (k: number) => {
        const i = ch.parts[k].i;
        setIdx(i);
        localStorage.setItem('listen:' + docId, String(i));
        follow(markSaying(root!, i));
      };
      let cur = 0;
      let heard = false;
      const t0 = Date.now();
      console.debug(`[listen] piece from sentence ${ch.parts[0].i} (${ch.text.length} characters${queued ? ', already queued' : ''})`);
      show(0);
      setBusy(false);
      const s = opts.current;
      const so = { rate: s.ttsRate, pitch: s.ttsPitch, voice: voiceOff ? undefined : chosen ?? bestRef.current, lang: lang.current };
      const q = await (queued ? queued.q : queueSpeak(ch.text, so, false));
      const move = (pos: number) => {
        let k = cur;
        while (k + 1 < ch.parts.length && ch.parts[k + 1].at <= pos) k++;
        if (k !== cur) {
          cur = k;
          show(k);
        }
        // past the middle of this piece: the next one is queued now, so the voice rolls on into it
        // (a new paragraph is not queued: it starts after this one ends, so the space between paragraphs is heard)
        const sameBlock = () => {
          const a = spansOf(root!, ch.parts[ch.parts.length - 1].i)[0]?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, pre, dd, dt');
          return !!a && a === spansOf(root!, at)[0]?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, pre, dd, dt');
        };
        if (!handoff && !hold.pre && at < n && pos > ch.text.length * 0.5 && sameBlock()) {
          const nx = buildChunk(at, n, 0, 300);
          if (nx) {
            const from = at;
            at = nx.next;
            hold.pre = { ch: nx, q: queueSpeak(nx.text, so, true), from };
          }
        }
      };
      let life = Date.now();
      q.on((ci) => {
        heard = true;
        if (!rangeSeen.current) {
          rangeSeen.current = true;
          try {
            localStorage.setItem('tts:ranges', '1');
          } catch {
            /* private mode */
          }
        }
        life = Date.now();
        move(ci);
      });
      const timer = setInterval(() => !heard && move(((Date.now() - t0) / 1000) * 14 * s.ttsRate), 250);
      // An engine that goes quiet (it died, another app took it) must not leave the book silent: the piece is judged every
      // moment. An engine that reports words and then says nothing for 4 s is stuck; one that does report words but has not said
      // one 4 s after a piece was handed to it (3 s at the very start of reading) is stuck too; one that reports nothing at all is given the longest the piece
      // can take at this speed plus a margin. Then the engine is stopped and the piece is made again.
      let stallT = 0;
      const limit = new Promise<'stalled'>((res) => {
        stallT = window.setInterval(() => {
          const now = Date.now();
          const rate = Math.max(0.5, s.ttsRate);
          const quiet = heard ? now - life > 4000 : rangeSeen.current ? now - t0 > (startOfRun ? 3200 : 4200) : now - t0 > (ch.text.length / (11 * rate)) * 1000 + 3500;
          if (quiet) res('stalled');
        }, 400);
      });
      let r: 'done' | 'stopped' | 'stalled' = await Promise.race([q.done, limit]);
      clearInterval(stallT);
      q.off();
      clearInterval(timer);
      if (my !== token.current) return { at, done: true };
      if (r === 'stalled') {
        console.warn('[listen] the phone’s voice stopped answering — starting it again');
        await stopSpeaking();
        r = 'stopped';
      }
      // handed over mid-piece: the sentence being heard is read again by the new voice
      if (r === 'stopped' && handoff?.()) return { at: ch.parts[Math.min(cur, ch.parts.length - 1)].i, done: false };
      if (r === 'stopped') {
        // not stopped by the reader (that is caught above) and not handed over: the phone's engine dropped out
        // (another app took the audio, the engine restarted). Start again from the sentence that was being read, a little
        // later each time; after a few misses let the engine use its own default voice. Only a long run of misses gives up.
        dropPre();
        fails++;
        if (fails >= 3) voiceOff = true;
        if (fails <= 8) {
          await new Promise((res) => setTimeout(res, Math.min(2500, 250 * fails)));
          if (my !== token.current) return { at, done: true };
          const k = Math.min(cur, ch.parts.length - 1);
          at = k === 0 ? chunkFrom : ch.parts[k].i;
          off = k === 0 ? chunkOff : 0;
          continue;
        }
        if (my === token.current) {
          setPlaying(false);
          onPlaying(false);
          setBusy(false);
          toast('The phone’s voice stopped — tap play to go on', undefined, () => setVoiceSheet(true));
        }
        return { at, done: true };
      }
      fails = 0;
      if (sleepAt.current && Date.now() > sleepAt.current) {
        dropPre();
        sleepAt.current = 0;
        setSleep(0);
        toast('Sleep timer — paused. Sweet dreams.');
        pause(); // (the player, the lock screen and the reader all hear that it stopped)
        return { at, done: true };
      }
    }
    if (my === token.current) {
      setPlaying(false);
      onPlaying(false);
    }
    return { at, done: true };
  };

  /** Not left out of battery saving? Once in a while (not every time), say what that costs and offer to fix it. */
  const asked = useRef(false);
  const maybeAskBattery = async () => {
    if (!isNative || asked.current) return;
    asked.current = true;
    if (await workFree()) return;
    const st = (await db.get<{ at: number; n: number }>('kv', 'batteryAsk').catch(() => undefined)) ?? { at: 0, n: 0 };
    const wait = (st.n >= 3 ? 7 : 2) * 864e5;
    if (Date.now() - st.at < wait) return;
    await db.put('kv', 'batteryAsk', { at: Date.now(), n: st.n + 1 }).catch(() => {});
    setTimeout(() => setBatterySheet(true), 2500);
  };

  const run = useCallback(
    async (from: number, offset = 0) => {
      if (!root) return;
      // whatever was playing stops first, completely: no old audio, no sentences still being made
      player.current?.stop();
      player.current = null;
      stopSpeaking();
      sharedEngine.cancel();
      const my = ++token.current;
      setPlaying(true);
      onPlaying(true);
      void maybeAskBattery();
      const n = Number(root.dataset.wrapped ?? 0);
      const chosen = resolveVoice();
      // nothing on this phone can speak (no speech engine, or none of its voices installed): say so, with the way out
      if (!isNeural(chosen) && !(await listVoices()).length) {
        if (my !== token.current) return;
        setPlaying(false);
        onPlaying(false);
        const canStudio = neuralSupported();
        toast(canStudio ? 'This phone has no voice of its own. Get a natural voice' : 'This phone has no voice installed. Install one', undefined, () => (canStudio ? setVoiceSheet(true) : openVoiceInstall()));
        return;
      }
      if (my !== token.current) return;
      tellVoice();
      if (isNeural(chosen) && !neuralBroken.current && !neuralSlow.current) return runNeural(from, my, chosen, n, offset);
      await runSystem(from, my, n, offset, chosen);
    },
    [root, docId, onPlaying], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pause = useCallback(() => {
    clearTimeout(skipTimer.current);
    skipTimer.current = 0;
    token.current++;
    stopSpeaking();
    player.current?.stop();
    player.current = null;
    sharedEngine.cancel();
    setNote('');
    setBusy(false);
    setPlaying(false);
    onPlaying(false);
  }, [onPlaying]);

  // external "listen from here"
  useEffect(() => {
    if (startAt !== null && startAt !== undefined && root) {
      pause();
      setTimeout(() => run(startAt), 60);
    }
  }, [startAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The supervisor. Whatever goes wrong underneath (a voice that went quiet, an engine that stopped answering, a phone that fell
  // behind), reading must not stay silent: if the place has not moved for far longer than a sentence can take, reading starts
  // again from the sentence it was on. A voice that needs this often is swapped for the phone's own, which is steadier.
  const beat = useRef({ idx: -1, at: 0, restarts: [] as number[] });
  useEffect(() => {
    if (!playing) return;
    beat.current.idx = idxRef.current;
    beat.current.at = Date.now();
    const iv = window.setInterval(() => {
      const now = Date.now();
      if (idxRef.current !== beat.current.idx) {
        beat.current.idx = idxRef.current;
        beat.current.at = now;
        return;
      }
      if (skipTimer.current) return; // the reader is skipping about: it starts again by itself
      const len = root ? sentenceRaw(root, idxRef.current).length : 160;
      const allowed = Math.max(16_000, (len / (10 * Math.max(0.5, opts.current.ttsRate))) * 1600 + 10_000);
      if (now - beat.current.at < allowed) return;
      beat.current.at = now;
      const rs = (beat.current.restarts = beat.current.restarts.filter((t) => now - t < 240_000));
      rs.push(now);
      console.warn(`[listen] no progress for ${Math.round(allowed / 1000)} s — starting again (${rs.length})`);
      if (rs.length >= 3 && isNeural(opts.current.ttsVoice) && !neuralSlow.current) {
        neuralSlow.current = true;
        toast('The studio voice kept stalling — reading with the phone’s voice, which is steadier');
      }
      void run(idxRef.current);
    }, 2500);
    return () => clearInterval(iv);
  }, [playing, root, run]); // eslint-disable-line react-hooks/exhaustive-deps

  // tap any word (playing or paused) → carry on reading from that word
  useEffect(() => {
    if (!root) return;
    const on = (e: MouseEvent) => {
      if (window.getSelection()?.toString()) return;
      if ((e.target as HTMLElement).closest('a, button, input, textarea')) return;
      const hit = sentenceAtPoint(root, e.clientX, e.clientY);
      if (!hit) return;
      e.stopPropagation();
      e.preventDefault();
      tap('select');
      pause();
      setIdx(hit.i);
      follow(markSaying(root, hit.i));
      setTimeout(() => run(hit.i, hit.offset), 60);
    };
    root.addEventListener('click', on, true);
    return () => root.removeEventListener('click', on, true);
  }, [root, run, pause]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      pause(); // the voice itself stays loaded in the app, ready for the next book
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const restartAtCurrent = () => {
    if (playing) {
      pause();
      setTimeout(() => run(idxRef.current), 80);
    }
  };

  const skipTimer = useRef(0);
  /** Taps on skip move the place at once and are quiet; the voice starts again from the new place when the taps stop. */
  const skip = (d: number) => {
    tap();
    const next = Math.max(0, Math.min(total - 1, idxRef.current + d));
    idxRef.current = next;
    setIdx(next);
    if (root) follow(markSaying(root, next));
    if (playing || skipTimer.current) {
      token.current++;
      stopSpeaking();
      player.current?.stop();
      player.current = null;
      sharedEngine.cancel();
      setNote('');
      clearTimeout(skipTimer.current);
      skipTimer.current = window.setTimeout(() => {
        skipTimer.current = 0;
        run(idxRef.current);
      }, 380);
    }
  };

  handlers.current = {
    toggle: () => (playing ? pause() : run(idxRef.current)),
    play: () => (playing ? undefined : run(idxRef.current)),
    pause: () => (playing ? pause() : undefined),
    next: () => skip(5),
    prev: () => skip(-5),
    stop: () => {
      pause();
      mediaStop();
      media.current = false;
    },
  };

  if (!ttsAvailable())
    return (
      <div className="listen">
        <div className="listen-top">{tr("Text-to-speech is not available on this device.")}</div>
      </div>
    );

  const wpm = 165 * settings.ttsRate;
  const leftWords = root ? Math.round(((total - idx) / Math.max(1, total)) * wordsAll.current) : 0;
  const leftMin = Math.max(1, Math.round(leftWords / wpm));
  /** the whole track, in minutes (for the scrubber's label) */
  const leftAll = total ? (leftMin * total) / Math.max(1, total - idx) : 0;
  // the voice that will really read this book (a Spanish book is not read by the English voice that is the default)
  const using = resolveVoice();
  const nv = isNeural(using) && !neuralBroken.current && !neuralSlow.current ? NEURAL_VOICES.find((v) => NEURAL_PREFIX + v.id === using) : undefined;
  const voice = nv ? undefined : voices.find((v) => v.id === using) ?? voices.find((v) => v.id === bestRef.current);
  const docLang = langTag.slice(0, 2);
  const pct = total > 1 ? Math.round((idx / (total - 1)) * 100) : 0;
  const status = note || (busy ? 'getting ready…' : playing ? 'reading aloud' : 'paused');

  const scrubEl = (
      <Scrub
        className="listen-scrub2 dockbar"
        ariaLabel="Position in the track"
        value={total > 1 ? idx / (total - 1) : 0}
        label={(v) => {
          const i = Math.round(v * Math.max(0, total - 1));
          return `${Math.round(v * 100)}% · ${Math.max(0, Math.round(((total - i) / Math.max(1, total)) * leftAll))} min left`;
        }}
        onChange={(v, final) => {
          const i = Math.round(v * Math.max(0, total - 1));
          if (!root) return;
          if (!final) {
            follow(markSaying(root, i));
            return;
          }
          setIdx(i);
          localStorage.setItem('listen:' + docId, String(i));
          if (playing) run(i);
          else follow(markSaying(root, i));
        }}
      />
  );

  return (
    <div className="listen" style={{ position: 'relative' }}>
      {pop === 'speed' && (
        <div className="popover">
          <Ruler
            value={settings.ttsRate}
            min={0.5}
            max={3}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={(v) => {
              updateSettings({ ttsRate: v });
              opts.current = { ...opts.current, ttsRate: v };
              clearTimeout(rateT.current);
              rateT.current = window.setTimeout(restartAtCurrent, 450);
            }}
            label="Speed"
          />
        </div>
      )}
      <div className="listen-top">
        <span className={`eq${playing ? ' on' : ''}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="grow">{status}</span>
        <span className="mono">{leftMin}{tr(" min left")}</span>
      </div>
      {barSlot ? createPortal(scrubEl, barSlot) : scrubEl}
      <div className="listen-times mono" aria-hidden>
        <span>{pct}{tr("%")}</span>
        <span>
          {idx + 1}{tr(" / ")}{total || '–'}
        </span>
      </div>
      <div className="listen-ctrl">
        <button className="sm" onClick={() => skip(-5)} aria-label={tr("Back five sentences")}>
          <Icon name="rew" size={22} />
        </button>
        <button className="sm" onClick={() => skip(-1)} aria-label={tr("Previous sentence")}>
          <Icon name="prev" size={22} />
        </button>
        <button
          className="big"
          onClick={() => {
            tap('medium');
            if (playing) pause();
            else run(idx);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={26} stroke={2.6} />
        </button>
        <button className="sm" onClick={() => skip(1)} aria-label={tr("Next sentence")}>
          <Icon name="next" size={22} />
        </button>
        <button className="sm" onClick={() => skip(5)} aria-label={tr("Forward five sentences")}>
          <Icon name="fwd" size={22} />
        </button>
      </div>
      <div className="listen-chips">
        <button className={pop === 'speed' ? 'on' : ''} onClick={() => setPop(pop === 'speed' ? null : 'speed')}>
          <Icon name="speed" size={15} />
          <span className="lbl">{settings.ttsRate.toFixed(1)}{tr("×")}</span>
        </button>
        <button onClick={() => setVoiceSheet(true)}>
          <Icon name="voice" size={15} />
          <span className="lbl">{nv ? nv.label : voice ? (/^[a-z]{2,3}[-_]/i.test(voice.name) ? `Phone · ${voice.lang.slice(0, 2).toUpperCase()}` : voice.name.replace(/^(Google|Microsoft)\s*/, '').replace(/\s+(Online|Natural|Desktop|Mobile)\b.*$/i, '')) : 'Voice'}</span>
        </button>
        <button
          className={langAuto ? '' : 'on'}
          onClick={() => {
            const cur = langAuto ? 'auto' : localStorage.getItem('lang:' + docId) ?? 'auto';
            const next = LANG_CYCLE[(Math.max(0, LANG_CYCLE.indexOf(cur)) + 1) % LANG_CYCLE.length];
            localStorage.setItem('lang:' + docId, next);
            const found = next === 'auto' ? detectLanguage(root?.textContent ?? '').lang : LANG_CODES[next];
            lang.current = found;
            setLangTag(found);
            setLangAuto(next === 'auto');
            told.current = '';
            toast(next === 'auto' ? `Language: automatic · ${LANG_NAME[found.slice(0, 2)] ?? found}` : `Reading in ${LANG_NAME[next]}`);
            restartAtCurrent();
          }}
          aria-label={`Reading language: ${LANG_NAME[docLang] ?? docLang}${langAuto ? ' (automatic)' : ''}`}
        >
          <Icon name="globe" size={15} />
          <span className="lbl">{docLang.toUpperCase()}</span>
          {langAuto && <small>{tr("auto")}</small>}
        </button>
        <button
          className={sleep ? 'on' : ''}
          onClick={() => {
            const next = SLEEP[(SLEEP.indexOf(sleep) + 1) % SLEEP.length];
            setSleep(next);
            sleepAt.current = next ? Date.now() + next * 60_000 : 0;
            toast(next ? `Sleep in ${next} min` : 'Sleep timer off');
          }}
          aria-label={tr("Sleep timer")}
        >
          <Icon name="timer" size={15} />
          <span className="lbl">{sleep ? `${sleep}m` : tr('Sleep')}</span>
        </button>
        <button className={settings.focusListen ? 'on' : ''} onClick={() => updateSettings({ focusListen: !settings.focusListen })} aria-label={tr("Focus on the sentence being read")}>
          <Icon name="ear" size={15} />
        </button>
      </div>
      <Sheet open={batterySheet} onClose={() => setBatterySheet(false)} title={tr("Keep listening smooth")}>
        <div style={{ padding: '0 20px 20px', display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, font: '400 15.5px/1.45 var(--serif)', color: 'var(--ink-2)' }}>{tr("Your phone puts apps to sleep when the screen is off to save battery, and that is when the voice stutters or stops. If Frogity is left out of battery saving:")}</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, font: '400 14.5px/1.4 var(--serif)' }}>
            <li>{tr("the next sentences are prepared and downloaded in the background, ahead of the voice")}</li>
            <li>{tr("reading goes on without gaps with the screen off or another app open")}</li>
            <li>{tr("the voice doesn’t drop out when the phone is idle in your pocket")}</li>
          </ul>
          <p className="mono" style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>{tr("Frogity uses power only while it reads. You can change this later in Settings.")}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pill"
              onClick={() => {
                setBatterySheet(false);
                askWorkFree();
              }}
            >{tr("Allow background")}</button>
            <button className="pill ghost" onClick={() => setBatterySheet(false)}>{tr("Not now")}</button>
          </div>
        </div>
      </Sheet>
      <VoiceSheet
        open={voiceSheet}
        onClose={() => setVoiceSheet(false)}
        docLang={docLang}
        stored={stored}
        refreshStored={async () => setStored(await neuralStored())}
        voices={voices}
        bestId={bestRef.current}
        onPicked={() => {
          neuralBroken.current = false;
          neuralSlow.current = false;
          restartAtCurrent();
        }}
      />
    </div>
  );
}
