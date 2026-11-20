// One game, two ways up. Froggy sits on a lily pad in the water and has to climb to the blossom at the top:
//   • sling — pull the thumb back and let go: the big tongue flies the other way, sticks to a passing fly, and Froggy swings
//     from fly to fly (a missed grab means falling — into the water, if nothing catches it);
//   • word climb — a five-letter word game: every letter placed in the right spot is a hop up to the next lily, and the whole
//     word is the leap to the blossom (six guesses; running out drops Froggy in the water).
// Only reaching the top counts: that is the block. Unlimited tries (a block is still earned once a day). Everything is made on the phone.
import * as db from './db';

export type Variant = 'sling' | 'deep';
export type Levels = Record<Variant, number>;

export async function getLevels(): Promise<Levels> {
  const l = await db.get<Partial<Levels>>('kv', 'games2').catch(() => undefined);
  const level = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.min(1000, Math.floor(n))) : 1;
  return { sling: level(l?.sling), deep: level(l?.deep) };
}
export const setLevels = (l: Levels) => db.put('kv', 'games2', l);

/** a small seeded random generator: the same level on the same day is the same game, a different level is a different one */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SlingCfg {
  goal: number; // height of the blossom, in pixels of the playing field
  hold: number; // seconds a fly stays caught before it wriggles free
  bees: number; // 0–1: how many of the flies are bees (a bee is a fall)
  drift: number; // how far the flies wander
  gap: number; // the usual distance between flies
}
export const slingLevel = (n: number): SlingCfg => ({
  goal: Math.min(8500, 2200 + (n - 1) * 280),
  hold: Math.max(1.9, 4.1 - Math.min(n, 20) * 0.1),
  bees: Math.min(0.4, 0.02 + 0.04 * n),
  drift: 20 + Math.min(n, 30) * 4,
  gap: Math.min(220, 142 + n * 7),
});

export interface WordCfg {
  guesses: number; // how many tries before Froggy falls
}
export const wordLevel = (_n: number, _practice = false): WordCfg => ({ guesses: 6 });

/**
 * The word for this climb. Every day owns three slots of one long, fixed, shuffled list, so a word comes back only after
 * the list has gone round (more than a year of days). A log of the words already played, kept on the device, covers the
 * rest: a word seen in the last 365 days is skipped, so even someone who plays a lot gets a new one each time until the
 * list is truly used up (then the oldest is reused).
 */
export function pickWord(answers: string[], now = Date.now()): string {
  const day = Math.floor(now / 864e5);
  const N = answers.length;
  let log: Record<string, number> = {};
  let plays = 0;
  const key = 'word:plays:' + day;
  try {
    log = JSON.parse(localStorage.getItem('word:log') || '{}') || {};
    plays = Number(localStorage.getItem(key) || 0) || 0;
  } catch {
    /* private mode: no memory, still a fine word */
  }
  for (const w of Object.keys(log)) if (day - log[w] >= 365) delete log[w];
  const slots = Math.max(1, Math.floor(N / 3));
  const start = ((day % slots) * 3 + plays) % N;
  let pick = '';
  for (let j = 0; j < N; j++) {
    const w = answers[(start + j) % N];
    if (!(w in log)) {
      pick = w;
      break;
    }
  }
  if (!pick) pick = Object.keys(log).sort((a, b) => log[a] - log[b])[0] ?? answers[start];
  log[pick] = day;
  try {
    localStorage.setItem('word:log', JSON.stringify(log));
    localStorage.setItem(key, String(plays + 1));
    if (plays === 0) for (let i = 1; i < 8; i++) localStorage.removeItem('word:plays:' + (day - i));
  } catch {
    /* ignore */
  }
  return pick;
}
