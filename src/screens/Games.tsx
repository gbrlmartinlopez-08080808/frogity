import { PondPairs } from './PondPairs';
import { tr } from '../lib/i18n';
import { useCallback, useEffect, useState, useRef } from 'react';
import { dayKey, earnBlock, freezeStatus, useStore } from '../lib/store';
import * as db from '../lib/db';
import { getLevels, setLevels, type Variant } from '../lib/games';
import { onBack } from '../lib/native';
import { Icon } from '../ui/Icon';
import { Froggy } from '../ui/Froggy';
import { toast } from '../ui/kit';
import { Deep, Pick, Sling } from './Climb';

/**
 * The five blocks on the way to a freeze day, drawn the way the streak calendar draws a day: an `@` for each block won, and the
 * fifth is the `~` that the calendar uses for a freeze day. Plain ink, nothing else.
 */
export function Blocks({ n, big = false, fresh = -1 }: { n: number; big?: boolean; fresh?: number }) {
  return (
    <span className={`bk-row${big ? ' big' : ''}`} role="img" aria-label={`${n} of 5 blocks toward a freeze day`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const on = i < n;
        const last = i === 4;
        return (
          <b key={i} className={`bk mono${on ? ' on' : ''}${last ? ' freeze' : ''}${last && n >= 4 ? ' near' : ''}${i === fresh ? ' fresh' : ''}`}>
            {last ? '~' : on ? '@' : '·'}
          </b>
        );
      })}
    </span>
  );
}

/** The Play tab: the blocks, the freeze day, and the one climb (the way up is chosen from the lily itself). */
export function Play() {
  const freeze = useStore((s) => s.freeze);
  const fz = freezeStatus(freeze);
  const [levels, setLv] = useState({ sling: 1, deep: 1, pond: 1 });
  const [run, setRun] = useState<Variant | null>(null);
  useEffect(() => {
    getLevels().then(setLv);
  }, [run]);
  const won = freeze.blockDay === dayKey();
  return (
    <div className="int-scroll">
      <div className="play-hero flat">
        <div className="play-top">
          <Froggy mood={won ? 'smug' : 'happy'} size="sm" />
          <div>
            <b>{tr("Reach the top, win a block")}</b>
            <span className="mono">{tr("four blocks, then the fifth is a freeze day")}</span>
          </div>
        </div>
        <Blocks n={Math.min(4, fz.blocks)} big />
        <p className="mono">{won ? 'today’s block is won — another tomorrow' : `${fz.blocks}/5 · a block comes only when Froggy reaches the top`}</p>
        <div className="play-freeze">
          <span>
            <b>{fz.available}</b>{tr(" freeze day")}{fz.available === 1 ? '' : 's'}{tr(" ready")}</span>
          <small className="mono">
            {fz.weekly ? 'your free one is ready (it comes back 15 days after you use it)' : `your free one is back in ${fz.back} day${fz.back === 1 ? '' : 's'}`}
            {fz.bonus > 0 ? ` · +${fz.bonus} won` : ''}
          </small>
        </div>
      </div>

      <button className="pill pond-start" onClick={() => setRun('pond')}>{tr('Pond pairs · a quiet memory game')}</button>
      <Pick key={run ? 1 : 0} inline levels={levels} onPick={setRun} />
      <p className="int-foot mono">{tr("· · ·")}{'\n'}{tr("unlimited tries · the top is the only way to a block, one a day")}</p>
      {run && <Run variant={run} onClose={() => setRun(null)} />}
    </div>
  );
}

const INTRO: Record<Variant, { title: string; art: string; steps: string[] }> = {
  pond: { title: 'Pond pairs', art: '(@) ~ [ ? ] [ ? ]', steps: ['Turn two cards and find the matching plant names.', 'Take your time; use a peek if you need a hand.', 'Find all six pairs to finish the pond. Practice does not earn a daily reward.'] },
  sling: {
    title: 'Sling',
    art: '   \\x/        /x\\\n     (@) ~~~~~> \\x/\n     (  v  )',
    steps: ['Put your thumb anywhere and pull back, like a sling. Let go: the tongue flies the other way.', 'Stick to a fly and Froggy swings. Let go and shoot the next one before the fly wriggles free (the ring shows how long).', 'Falling? Just tap: the tongue grabs the nearest thing. Avoid the bees, and look for twigs, leaves, dragonflies and wind.'],
  },
  deep: {
    title: 'Deep cuts',
    art: '    .--.\n   ( ?? )   ^\n    `--´   /|\\\n   (@) (@)',
    steps: ['You get a question with many right answers: name a country, a bird, a battle…', 'The rarer your answer, the higher the tongue soars, and Froggy follows it to a new lily. Common answers barely lift it.', 'Wrong or unknown answers are forgiven a few times. Time out and Froggy slips. Rare answers in a row build a streak.'],
  },
};
function Intro({ variant, onGo }: { variant: Variant; onGo: () => void }) {
  const t = INTRO[variant];
  return (
    <div className="game-intro">
      <pre className="mono" aria-hidden>
        {t.art}
      </pre>
      <h2>{t.title}</h2>
      <ol>
        {t.steps.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <button className="pill" onClick={onGo}>{tr("Let’s climb")}</button>
    </div>
  );
}
const introKey = (v: Variant) => `game:intro:${v}`;
const seenIntro = (v: Variant) => {
  try {
    return !!localStorage.getItem(introKey(v));
  } catch {
    return true;
  }
};

function Run({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [practice, setPractice] = useState(false);
  const [stats, setStats] = useState({ played: 0, wins: 0 });
  const finishing = useRef(false);
  useEffect(() => { db.get<{ played: number; wins: number }>('kv', 'game:stats:' + variant).then(s => s && setStats(s)); const hide = () => { if (document.hidden) setPaused(true); }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, [variant]);
  const [intro, setIntro] = useState(true);
  const [lv, setLv] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => { if (paused || intro) return; const tick = window.setInterval(() => { if (!finishing.current) setSeconds(s => s + 1); }, 1000); return () => clearInterval(tick); }, [paused, intro, round]);
  const [result, setResult] = useState<null | { win: boolean; text: string; block?: string; fresh: number; freeze: boolean }>(null);
  useEffect(() => {
    getLevels().then((l) => setLv(l[variant]));
  }, [variant]);
  useEffect(() => onBack(() => { if (!paused && !intro && !result) setPaused(true); else onClose(); return true; }), [onClose, paused, intro, result]);
  useEffect(() => { const field = document.querySelector('.game .stagebox'); field?.toggleAttribute('inert', paused); }, [paused]);

  const finish = useCallback(
    async (win: boolean, text: string) => {
      if (finishing.current) return; finishing.current = true;
      const old = await db.get<{played: number; wins: number}>('kv', 'game:stats:' + variant) ?? { played: 0, wins: 0 };
      const next = { played: old.played + 1, wins: old.wins + (win ? 1 : 0) };
      await db.put('kv', 'game:stats:' + variant, next); setStats(next);
      let block: string | undefined;
      let fresh = -1;
      let freeze = false;
      if (win && !practice) {
        const l = await getLevels();
        l[variant] += 1;
        await setLevels(l);
        setLv(l[variant]);
        const before = freezeStatus().blocks;
        const r = earnBlock();
        if (r.ok) {
          freeze = r.freeze;
          fresh = r.freeze ? 4 : before;
          block = r.freeze ? 'Four blocks, then the ~ — a freeze day is yours.' : `A block for your freeze day · ${r.blocks}/5`;
          if (r.freeze) toast('You won a freeze day', 'award');
        } else block = r.reason;
      }
      setResult({ win, text, block, fresh, freeze });
    },
    [variant, practice],
  );
  const again = () => {
    finishing.current = false;
    setPaused(false);
    setSeconds(0);
    setResult(null);
    setRound((n) => n + 1);
  };
  return (
    <div className="game" data-paused={paused ? "true" : "false"} role="dialog" aria-label={tr("The climb")}>
      <header>
        <button className="game-x" onClick={onClose} aria-label={tr("Close the game")}>
          <Icon name="back" size={22} />
        </button>
        <b>{variant === 'sling' ? 'Sling' : variant === 'deep' ? 'Deep cuts' : 'Pond pairs'}</b>
        <span className="mono">{tr("level ")}{lv ?? 1}</span>
      </header>
      <div className="game-controls">
        <span className="mono">{stats.wins}{tr(" wins · ")}{stats.played}{tr(" completed runs")}{practice ? ' · practice: no rewards' : ''}</span>
        {!intro && !result && <button className="pill sm" onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>}
        {intro && <label><input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} />{tr(" Gentle practice · shorter climb, no rewards")}</label>}
      </div>
      {paused && <div className="game-pause" role="dialog" aria-label={tr("Game paused")}><h2>{tr("Take a breath")}</h2><p>{tr("Your climb is waiting.")}</p><button className="pill" onClick={() => setPaused(false)}>{tr("Resume climb")}</button><button className="pill ghost" onClick={onClose}>{tr("Leave game")}</button></div>}
      <div className="game-playfield" inert={paused}>
      {intro && (
        <Intro
          variant={variant}
          onGo={() => {
            try {
              localStorage.setItem(introKey(variant), '1');
            } catch {
              /* private mode */
            }
            setIntro(false);
          }}
        />
      )}
      </div>
      {!intro && lv !== null && !result && (variant === 'sling' ? <Sling key={round} practice={practice} level={lv} onEnd={finish} /> : variant === 'deep' ? <Deep key={round} practice={practice} level={lv} onEnd={finish} /> : <PondPairs key={round} paused={paused} level={lv} onEnd={finish} />)}
      {result && (
        <div className="game-end">
          <Froggy mood={result.win ? 'bigSmile' : 'sad'} size="lg" />
          <h2>{result.win ? 'At the top' : 'Into the water'}</h2>
          <p>{result.text}</p><p className="mono">Climb time · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2, '0')}</p><p className="mono">{practice ? 'Practice complete · try a daily climb when ready' : `${stats.wins} wins in ${stats.played} completed climbs`}</p>
          {result.freeze && <div className="freeze-card mono">{tr("~ a freeze day keeps a streak alive over a missed day")}</div>}
          {result.block && <p className="blockmsg mono">{result.block}</p>}
          {!result.win && <p className="blockmsg mono">{tr("no block — only the top counts")}</p>}
          <Blocks n={Math.min(4, freezeStatus().blocks)} fresh={result.fresh} big />
          <div className="det-act" style={{ justifyContent: 'center' }}>
            <button className="pill" onClick={again}>
              {result.win ? 'Climb again' : 'Try again'}
            </button>
            <button className="pill ghost" onClick={onClose}>{tr("Back to the lily")}</button>

          </div>
        </div>
      )}
    </div>
  );
}
