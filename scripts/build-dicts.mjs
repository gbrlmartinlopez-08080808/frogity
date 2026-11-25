// Builds the offline dictionaries the app downloads (Settings → Dictionaries, and the word sheet when a book is in another language).
// Source: Wiktionary, as extracted by wiktextract and published at kaikki.org (CC BY-SA / GFDL, like Wiktionary itself).
//
//   node scripts/build-dicts.mjs <edition> [outDir]      edition = en | es | fr | de | it | pt
//   node scripts/build-dicts.mjs pairs [outDir]           joins the translation tables written by the six runs
//
// Each edition is streamed (never stored), so the multi-gigabyte files need no disk space. It writes:
//   <lang>.json.gz        the language's own dictionary, definitions written in that language
//   pairs-<lang>.json     every translation the edition lists (word → word in another of the six languages)
// and `pairs` turns those into <from>_<to>.json.gz: a word in one language → its translations in another.
import fs from 'node:fs';
import zlib from 'node:zlib';
import https from 'node:https';

const LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt'];
const SKIP_POS = new Set(['name', 'abbrev', 'symbol', 'character', 'phrase', 'proverb', 'prefix', 'suffix', 'infix', 'interfix', 'circumfix', 'affix', 'punct', 'romanization', 'prep_phrase', 'combining_form']);
const SRC = {
  en: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl',
  es: 'https://kaikki.org/eswiktionary/Espa%C3%B1ol/kaikki.org-dictionary-Espa%C3%B1ol.jsonl',
  fr: 'https://kaikki.org/frwiktionary/Fran%C3%A7ais/kaikki.org-dictionary-Fran%C3%A7ais.jsonl',
  de: 'https://kaikki.org/dewiktionary/Deutsch/kaikki.org-dictionary-Deutsch.jsonl',
  it: 'https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl',
  pt: 'https://kaikki.org/ptwiktionary/Portugu%C3%AAs/kaikki.org-dictionary-Portugu%C3%AAs.jsonl',
};
const [, , what, out = 'dicts'] = process.argv;
fs.mkdirSync(out, { recursive: true });

/** A pack: gzip of one JSON line for the facts, then one line per piece ({"k": "ca", "v": {word: entry}}), so the phone can store it
 * piece by piece without ever holding the whole dictionary in memory. */
function writePack(path, meta, shards) {
  const lines = [JSON.stringify(meta), ...Object.entries(shards).map(([k, v]) => JSON.stringify({ k, v }))];
  const buf = zlib.gzipSync(lines.join('\n') + '\n', { level: 9 });
  fs.writeFileSync(path, buf);
  return buf.length;
}
function readMeta(path) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('utf8');
  return JSON.parse(txt.slice(0, txt.indexOf('\n')));
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** the shard a word lives in on the phone: its first two letters without accents */
const fold = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function get(url, from) {
  return new Promise((res, rej) => {
    const headers = { 'User-Agent': 'frogity-dict-builder' };
    if (from) headers.Range = `bytes=${from}-`;
    https
      .get(url, { headers }, (r) => {
        if (r.statusCode !== 200 && r.statusCode !== 206) return rej(new Error(`${url}: ${r.statusCode}`));
        res(r);
      })
      .on('error', rej);
  });
}
/** the file line by line; a dropped connection picks up where it stopped (HTTP range) */
async function* lines(url) {
  let offset = 0;
  let buf = '';
  const dec = new TextDecoder();
  for (let tries = 0; ; tries++) {
    try {
      const r = await get(url, offset);
      for await (const chunk of r) {
        offset += chunk.length;
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          yield buf.slice(0, i);
          buf = buf.slice(i + 1);
        }
      }
      if (buf) yield buf;
      return;
    } catch (e) {
      if (tries > 30) throw e;
      console.warn('  retry at', offset, e.code ?? e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function edition(lang) {
  const dict = new Map(); // word → [pos, glosses[], example?, ipa?][]
  const pairs = {}; // to → Map(word → Set(words))
  let n = 0;
  for await (const line of lines(SRC[lang])) {
    if (!line) continue;
    n++;
    if (n % 200000 === 0) console.log(lang, n, dict.size);
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.lang_code !== lang || !e.word) continue;
    const word = clean(e.word);
    if (word.length > 40 || /\s/.test(word) || /[\d@#/\\]/.test(word)) continue;
    // names, abbreviations, symbols, affixes and set phrases: the encyclopedia tab covers names, and the rest is rarely tapped in a book
    if (SKIP_POS.has(e.pos)) continue;
    // translations (the English edition carries them per sense; the others per entry)
    for (const t of [...(e.translations ?? []), ...(e.senses ?? []).flatMap((s) => s.translations ?? [])]) {
      const to = t.lang_code ?? t.code;
      if (!LANGS.includes(to) || to === lang || !t.word) continue;
      const tw = clean(t.word);
      if (tw.length > 40 || tw.split(' ').length > 4) continue;
      const m = (pairs[to] ??= new Map());
      const s = m.get(word) ?? new Set();
      if (s.size < 8) s.add(tw);
      m.set(word, s);
    }
    const senses = [];
    const lemmas = [];
    let formGloss;
    let example;
    for (const s of e.senses ?? []) {
      // an inflected form ("pies", "encyclopédie" as a verb form): kept as a pointer to its base word, which the phone looks up too
      const fo = (s.form_of ?? []).map((f) => clean(f.word)).filter((w) => w && w !== word);
      if (fo.length || (s.tags ?? []).includes('form-of')) {
        for (const w of fo) if (lemmas.length < 3 && !lemmas.includes(w)) lemmas.push(w);
        if (lang === 'en' && !formGloss) formGloss = clip(clean((s.glosses ?? []).at(-1)), 70);
        continue;
      }
      const g = clean((s.glosses ?? []).at(-1));
      if (!g || g.length < 2 || /^(?:alternative form|obsolete form|rare form)/i.test(g) && senses.length) continue;
      if (senses.length < 3 && !senses.includes(g)) senses.push(clip(g, 150));

    }
    const pos = clean(e.pos);
    if (!senses.length) {
      if (!lemmas.length) continue;
      // an inflected form only: "=base" (English adds what kind of form: "=pie|plural of pie")
      const cur = dict.get(word);
      if (cur === undefined) dict.set(word, '=' + lemmas.join(',') + (formGloss ? '|' + formGloss : ''));
      else if (Array.isArray(cur) && cur.length < 4 && !cur.some((x) => x[4])) cur.push([pos, formGloss ? [formGloss] : [], 0, 0, lemmas]);
      continue;
    }
    const ipa = lang === 'en' ? (e.sounds ?? []).find((s) => s.ipa)?.ipa : undefined;
    let list = dict.get(word) ?? [];
    if (typeof list === 'string') {
      // it was only a form so far: it is a word of its own too (keep the pointer as one more entry)
      const [l, g] = list.slice(1).split('|');
      list = [['form', g ? [g] : [], 0, 0, l.split(',')]];
      dict.set(word, list);
    }
    if (list.length >= 4) continue;
    const same = list.find((x) => x[0] === pos);
    if (same) {
      for (const g of senses) if (same[1].length < 4 && !same[1].includes(g)) same[1].push(g);
      continue;
    }
    const entry = [pos, senses];
    if (example || ipa) entry.push(example ?? 0);
    if (ipa) entry.push(clean(ipa));
    list.push(entry);
    dict.set(word, list);
  }
  // shards: words grouped by their first two (folded) letters, so the phone stores and reads small pieces
  const shards = {};
  for (const [w, v] of dict) {
    const k = fold(w).slice(0, 2) || '_';
    (shards[k] ??= {})[w] = v;
  }
  const meta = { lang, v: 1, words: dict.size, built: new Date().toISOString().slice(0, 10), source: 'Wiktionary (kaikki.org), CC BY-SA' };
  writePack(`${out}/${lang}.ndjson.gz`, meta, shards);
  const pj = {};
  for (const [to, m] of Object.entries(pairs)) pj[to] = Object.fromEntries([...m].map(([w, s]) => [w, [...s]]));
  fs.writeFileSync(`${out}/pairs-${lang}.json`, JSON.stringify(pj));
  console.log(lang, 'done', dict.size, 'words', Object.fromEntries(Object.entries(pairs).map(([k, m]) => [k, m.size])));
}

function joinPairs() {
  // pair[from][to]: Map(word → Set): what an edition lists directly, plus every other edition's list read backwards
  // each pair scores: listed by the word's own language 3, by the other language (read backwards) 2; the best eight are kept
  const P = {};
  const add = (from, to, a, b, w) => {
    const m = ((P[from] ??= {})[to] ??= new Map());
    const s = m.get(a) ?? new Map();
    s.set(b, (s.get(b) ?? 0) + w);
    m.set(a, s);
  };
  for (const ed of LANGS) {
    const f = `${out}/pairs-${ed}.json`;
    if (!fs.existsSync(f)) continue;
    const pj = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [to, words] of Object.entries(pj))
      for (const [w, ts] of Object.entries(words))
        for (const [i, t] of ts.entries()) {
          // early in a short list counts most: "tired → cansado, fatigado" says more about cansado than "shot → …, cansado, …"
          add(ed, to, w, t, 3 / (1 + 0.3 * i));
          add(to, ed, t, w, 2 / (1 + i) + 1 / ts.length);
        }
  }
  const index = [];
  for (const [from, tos] of Object.entries(P))
    for (const [to, m] of Object.entries(tos)) {
      const shards = {};
      for (const [w, s] of m) ((shards[fold(w).slice(0, 2) || '_'] ??= {})[w] = [...s].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([t]) => t));
      const meta = { from, to, v: 1, words: m.size, built: new Date().toISOString().slice(0, 10), source: 'Wiktionary (kaikki.org), CC BY-SA' };
      const bytes = writePack(`${out}/${from}_${to}.ndjson.gz`, meta, shards);
      index.push({ id: `${from}_${to}`, from, to, words: m.size, bytes });
      console.log(`${from}_${to}`, m.size, (bytes / 1e6).toFixed(1) + 'MB');
    }
  for (const l of LANGS) {
    const f = `${out}/${l}.ndjson.gz`;
    if (fs.existsSync(f)) {
      const meta = readMeta(f);
      index.push({ id: l, from: l, words: meta.words, bytes: fs.statSync(f).size });
    }
  }
  fs.writeFileSync(`${out}/index.json`, JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), packs: index }, null, 1));
}

if (what === 'pairs') joinPairs();
else if (what === 'convert') {
  for (const l of LANGS) {
    const f = `${out}/${l}.json.gz`;
    if (!fs.existsSync(f)) continue;
    const { meta, shards } = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
    console.log(l, writePack(`${out}/${l}.ndjson.gz`, meta, shards));
    fs.unlinkSync(f);
  }
}
else if (LANGS.includes(what)) await edition(what);
else console.log('usage: build-dicts.mjs <en|es|fr|de|it|pt|pairs> [outDir]');
