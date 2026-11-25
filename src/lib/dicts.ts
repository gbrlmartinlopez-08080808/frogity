// Offline dictionaries. Built from Wiktionary by scripts/build-dicts.mjs and kept in the repository (dicts/), downloaded once and then
// read from the phone — no connection needed to look a word up.
//
//   <lang>          the language's own dictionary: definitions written in that language (en, es, fr, de, it, pt)
//   <from>_<to>     translations: a word in one language → the same word in another (en_es: tired → cansado, fatigado)
//
// The phone keeps every pack cut into small pieces (all the words that start with the same two letters), in a database of its own, so
// a lookup reads a few kilobytes instead of the whole dictionary.
import * as db from './db';
import { getLang } from './i18n';

export const DICT_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt'] as const;
export type DictLang = (typeof DICT_LANGS)[number];
export const isDictLang = (l?: string): l is DictLang => !!l && (DICT_LANGS as readonly string[]).includes(l);

const BASES = [
  'https://raw.githubusercontent.com/gbrlmartinlopez-08080808/frogity/main/dicts/',
  'https://raw.githubusercontent.com/gbrlmartinlopez-08080808/frogity/ccr-7c69f4c6-2ca02t/dicts/',
];

export interface PackInfo {
  id: string;
  from: string;
  to?: string;
  words: number;
  bytes: number;
}
/** [part of speech, definitions, example (or 0), pronunciation (or 0), base words when this is an inflected form] */
export type DictEntry = [string, string[], (string | 0)?, (string | 0)?, string[]?];

// ---------------------------------------------------------------- storage: one database just for the dictionaries
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('frogity-dict', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('shards');
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbp = null;
      rej(r.error);
    };
  });
  return dbp;
}
async function getShard<T>(key: string): Promise<T | undefined> {
  const d = await open();
  return new Promise((res, rej) => {
    const q = d.transaction('shards').objectStore('shards').get(key);
    q.onsuccess = () => res(q.result as T | undefined);
    q.onerror = () => rej(q.error);
  });
}
async function putShards(entries: [string, unknown][]) {
  const d = await open();
  for (let i = 0; i < entries.length; i += 200) {
    const part = entries.slice(i, i + 200);
    await new Promise<void>((res, rej) => {
      const tx = d.transaction('shards', 'readwrite');
      const st = tx.objectStore('shards');
      for (const [k, v] of part) st.put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  }
}
async function dropShards(prefix: string) {
  const d = await open();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction('shards', 'readwrite');
    tx.objectStore('shards').delete(IDBKeyRange.bound(prefix, prefix + '￿'));
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}

// ---------------------------------------------------------------- what is installed
type Installed = Record<string, { words: number; bytes: number; at: number }>;
const bus = new EventTarget();
export const onDictChange = (f: () => void) => {
  bus.addEventListener('ch', f);
  return () => bus.removeEventListener('ch', f);
};
export const installedPacks = async (): Promise<Installed> => (await db.get<Installed>('kv', 'dict:installed').catch(() => undefined)) ?? {};
export const hasPack = async (id: string) => !!(await installedPacks())[id];

let indexP: Promise<PackInfo[]> | null = null;
/** The list of packs and their sizes (cached on the phone so Settings can show it offline). */
export function packIndex(): Promise<PackInfo[]> {
  indexP ??= (async () => {
    for (const b of BASES) {
      try {
        const r = await fetch(b + 'index.json', { cache: 'no-cache' });
        if (!r.ok) continue;
        const j = (await r.json()) as { packs: PackInfo[] };
        if (j.packs?.length) {
          db.put('kv', 'dict:index', j.packs).catch(() => {});
          return j.packs;
        }
      } catch {
        /* next */
      }
    }
    indexP = null;
    return (await db.get<PackInfo[]>('kv', 'dict:index').catch(() => undefined)) ?? [];
  })();
  return indexP;
}

const busy = new Map<string, Promise<void>>();
export const installing = () => [...busy.keys()];

/** Download a pack and store it in pieces. `onProgress` gets 0…1 (download) */
export function installPack(id: string, onProgress?: (f: number) => void): Promise<void> {
  const running = busy.get(id);
  if (running) return running;
  const p = (async () => {
    const info = (await packIndex()).find((x) => x.id === id);
    let res: Response | null = null;
    for (const b of BASES) {
      try {
        const r = await fetch(b + id + '.ndjson.gz');
        if (r.ok && r.body) {
          res = r;
          break;
        }
      } catch {
        /* next */
      }
    }
    if (!res?.body) throw new Error('The dictionary could not be downloaded. Check the connection and try again.');
    const total = info?.bytes || Number(res.headers.get('content-length')) || 0;
    let got = 0;
    const counted = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, c) {
          got += chunk.length;
          if (total) onProgress?.(Math.min(0.97, got / total));
          c.enqueue(chunk);
        },
      }),
    );
    // one line of facts, then one line per piece: each piece is stored as it arrives, so the phone never holds the whole dictionary
    const lines = counted.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>).pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
    await dropShards(id + ':');
    let buf = '';
    let meta: { words: number } | null = null;
    let batch: [string, unknown][] = [];
    const take = async (line: string) => {
      if (!line.trim()) return;
      const o = JSON.parse(line);
      if (!meta) {
        meta = o;
        return;
      }
      batch.push([`${id}:${o.k}`, o.v]);
      if (batch.length >= 40) {
        await putShards(batch);
        batch = [];
      }
    };
    for (;;) {
      const { done, value } = await lines.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        await take(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    await take(buf);
    if (batch.length) await putShards(batch);
    if (!meta) throw new Error('The dictionary could not be downloaded. Check the connection and try again.');
    const pack = { meta: meta as { words: number } };
    const bytes = { length: got };
    const ins = await installedPacks();
    ins[id] = { words: pack.meta.words, bytes: bytes.length, at: Date.now() };
    await db.put('kv', 'dict:installed', ins);
    onProgress?.(1);
    bus.dispatchEvent(new Event('ch'));
  })().finally(() => busy.delete(id));
  busy.set(id, p);
  bus.dispatchEvent(new Event('ch'));
  return p;
}

export async function removePack(id: string) {
  await dropShards(id + ':');
  const ins = await installedPacks();
  delete ins[id];
  await db.put('kv', 'dict:installed', ins);
  bus.dispatchEvent(new Event('ch'));
}

// ---------------------------------------------------------------- lookups
const fold = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const shardCache = new Map<string, Record<string, unknown> | null>();
async function shardFor(id: string, word: string) {
  const key = `${id}:${fold(word).slice(0, 2) || '_'}`;
  if (shardCache.has(key)) return shardCache.get(key)!;
  const s = (await getShard<Record<string, unknown>>(key).catch(() => undefined)) ?? null;
  if (shardCache.size > 40) shardCache.clear();
  shardCache.set(key, s);
  return s;
}
onDictChange(() => shardCache.clear());

/** The word as written, then in lower case, then capitalised (German nouns), then the spellings `variants` suggests. */
async function find<T>(id: string, forms: string[]): Promise<{ word: string; v: T } | null> {
  for (const f of forms) {
    for (const w of [f, f.toLowerCase(), f.charAt(0).toUpperCase() + f.slice(1).toLowerCase()]) {
      const s = await shardFor(id, w);
      if (s && w in s) return { word: w, v: s[w] as T };
    }
  }
  return null;
}

export async function offlineDefine(forms: string[], lang: string): Promise<{ word: string; entries: DictEntry[] } | null> {
  if (!isDictLang(lang) || !(await hasPack(lang))) return null;
  const hit = await find<DictEntry[] | string>(lang, forms);
  if (!hit) return null;
  // an inflected form is kept as "=base[,base]|what form it is"
  if (typeof hit.v === 'string') {
    const [l, g] = hit.v.slice(1).split('|');
    return { word: hit.word, entries: [['form', g ? [g] : [], 0, 0, l.split(',')]] };
  }
  return { word: hit.word, entries: hit.v };
}

export async function offlineTranslate(forms: string[], from: string, to: string): Promise<{ word: string; words: string[] } | null> {
  const id = `${from}_${to}`;
  if (from === to || !(await hasPack(id))) return null;
  const hit = await find<string[]>(id, forms);
  return hit ? { word: hit.word, words: hit.v } : null;
}

// ---------------------------------------------------------------- which packs a reader needs
export const userLang = (): DictLang => {
  const l = getLang();
  return isDictLang(l) ? l : 'en';
};
/** English and the reader's own language, with the translations between them. */
export function basePacks(): string[] {
  const u = userLang();
  return u === 'en' ? ['en'] : ['en', u, `en_${u}`, `${u}_en`];
}
/** What a book in `lang` adds: its own dictionary and its words in the reader's language. */
export function packsForBook(lang: string): string[] {
  if (!isDictLang(lang)) return [];
  const u = userLang();
  return [lang, ...(lang !== u ? [`${lang}_${u}`] : []), ...(lang !== 'en' && u !== 'en' ? [`${lang}_en`] : [])];
}

export const LANG_NAME: Record<string, string> = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português' };

/** Once: English and the reader's language download quietly in the background (they are small; a reader can remove them in Settings). */
export async function ensureBasePacks() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const ins = await installedPacks();
  const declined = (await db.get<string[]>('kv', 'dict:removed').catch(() => undefined)) ?? [];
  const idx = await packIndex();
  for (const id of basePacks()) {
    if (ins[id] || declined.includes(id) || !idx.some((p) => p.id === id)) continue;
    await installPack(id).catch(() => {});
  }
}
/** Removing a pack by hand means "don't download it again by yourself". */
export async function forgetPack(id: string) {
  await removePack(id);
  const declined = (await db.get<string[]>('kv', 'dict:removed').catch(() => undefined)) ?? [];
  if (!declined.includes(id)) await db.put('kv', 'dict:removed', [...declined, id]);
}
export async function unforget(id: string) {
  const declined = (await db.get<string[]>('kv', 'dict:removed').catch(() => undefined)) ?? [];
  await db.put('kv', 'dict:removed', declined.filter((x) => x !== id));
}
