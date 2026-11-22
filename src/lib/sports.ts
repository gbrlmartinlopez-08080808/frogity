// Live standings and fixtures from TheSportsDB (a free, open sports database; the public test key). Everything is optional: if the
// phone is offline or the service is busy, the panel simply says so. Answers are kept for a few minutes.
import type { WorldEvent } from './world';
import * as db from './db';

const BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const cache = new Map<string, { at: number; v: unknown }>();
const flying = new Map<string, Promise<unknown>>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** one request at a time per address, a second try if the first fails, and the last good answer (however old) if both do */
async function get<T>(path: string, ttl = 5 * 60e3): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const again = flying.get(path);
  if (again) return again as Promise<T>;
  const run = (async () => {
    let last: unknown;
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(9000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const v = (await r.json()) as T;
        cache.set(path, { at: Date.now(), v });
        return v;
      } catch (e) {
        last = e;
        await wait(700);
      }
    }
    if (hit) return hit.v as T;
    throw last;
  })();
  flying.set(path, run);
  try {
    return await run;
  } finally {
    flying.delete(path);
  }
}

export interface Row {
  rank: number;
  team: string;
  badge: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  pts: number;
  form: string;
}
export interface Match {
  id: string;
  at: number; // ms
  home: string;
  away: string;
  hb: string;
  ab: string;
  hs: number | null;
  as: number | null;
  name: string;
  status: string;
}
export interface Live {
  table: Row[];
  next: Match[];
  last: Match[];
  clasico: Match[];
}

type Raw = Record<string, string | null>;
const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
const badge = (u: string | null | undefined) => (u ? (/\/(tiny|small|medium)$/.test(u) ? u : `${u}/tiny`) : '');
const match = (e: Raw): Match => ({
  id: String(e.idEvent),
  at: e.strTimestamp ? Date.parse(`${e.strTimestamp}Z`) : e.dateEvent ? Date.parse(`${e.dateEvent}T12:00:00Z`) : 0,
  home: e.strHomeTeam ?? '',
  away: e.strAwayTeam ?? '',
  hb: badge(e.strHomeTeamBadge),
  ab: badge(e.strAwayTeamBadge),
  hs: num(e.intHomeScore),
  as: num(e.intAwayScore),
  name: e.strEvent ?? '',
  status: e.strStatus ?? '',
});

/** the season name the database uses for today's date */
export function seasonOf(kind: 'split' | 'year', d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  if (kind === 'year') return String(m >= 2 ? y : y - 1);
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export async function loadLive(e: WorldEvent): Promise<Live> {
  const l = e.live!;
  const season = l.sport === 'f1' ? String(new Date().getFullYear()) : seasonOf(l.season);
  const [t, n, p] = await Promise.all([
    l.sport === 'football' || l.sport === 'nba' ? get<{ table?: Raw[] }>(`lookuptable.php?l=${l.league}&s=${season}`).catch(() => ({ table: [] })) : Promise.resolve({ table: [] as Raw[] }),
    get<{ events?: Raw[] }>(`eventsnextleague.php?id=${l.league}`, 2 * 60e3).catch(() => ({ events: [] })),
    get<{ events?: Raw[] }>(`eventspastleague.php?id=${l.league}`, 2 * 60e3).catch(() => ({ events: [] })),
  ]);
  const rows0 = t.table ?? [];
  // several groups (conferences) in one table: order them by points so "the top" means something
  const dup = new Set(rows0.map((r) => r.intRank)).size < rows0.length;
  const table: Row[] = (dup ? [...rows0].sort((a, b) => Number(b.intPoints) - Number(a.intPoints)) : rows0).map((r, i) => ({
    rank: dup ? i + 1 : Number(r.intRank),
    team: r.strTeam ?? '',
    badge: badge(r.strBadge),
    played: Number(r.intPlayed),
    win: Number(r.intWin),
    draw: Number(r.intDraw),
    loss: Number(r.intLoss),
    gf: Number(r.intGoalsFor),
    ga: Number(r.intGoalsAgainst),
    pts: Number(r.intPoints),
    form: r.strForm ?? '',
  }));
  let clasico: Match[] = [];
  if (l.h2h) {
    const [a, b] = l.h2h;
    const q = (x: string, y: string) => get<{ event?: Raw[] }>(`searchevents.php?e=${encodeURIComponent(`${x} vs ${y}`.replace(/ /g, '_'))}&s=${season}`, 30 * 60e3).catch(() => ({ event: [] as Raw[] }));
    const [r1, r2] = await Promise.all([q(a, b), q(b, a)]);
    clasico = [...(r1.event ?? []), ...(r2.event ?? [])].filter((x) => x.idLeague === String(l.league) || /spanish|supercopa|copa/i.test(x.strLeague ?? '')).map(match).sort((x, y) => x.at - y.at);
  }
  return { table, next: (n.events ?? []).map(match).slice(0, 6), last: (p.events ?? []).map(match).reverse().slice(0, 6), clasico };
}

export interface LeagueInfo {
  badge: string;
  name: string;
}
const infoMem = new Map<number, LeagueInfo>();
/** a league's logo, if it is already known (so a card can draw it on its first frame) */
export const peekLeague = (id: number) => infoMem.get(id);
const infoFlying = new Map<number, Promise<LeagueInfo>>();
/** a league's logo and name: kept on the phone for a month, so the cards show their logos at once from the second visit on */
export function leagueInfo(id: number): Promise<LeagueInfo> {
  const mem = infoMem.get(id);
  if (mem) return Promise.resolve(mem);
  const going = infoFlying.get(id);
  if (going) return going;
  const p = (async () => {
    const key = `lgi:${id}`;
    const saved = await db.get<{ at: number; v: LeagueInfo }>('kv', key).catch(() => undefined);
    if (saved?.v?.badge) infoMem.set(id, saved.v);
    if (saved && Date.now() - saved.at < 30 * 864e5 && saved.v.badge) return saved.v;
    try {
      const r = await get<{ leagues?: Raw[] }>(`lookupleague.php?id=${id}`, 24 * 3600e3);
      const l = r.leagues?.[0];
      const v = { badge: l?.strBadge ? `${l.strBadge}/small` : '', name: l?.strLeague ?? '' };
      if (v.badge) {
        infoMem.set(id, v);
        db.put('kv', key, { at: Date.now(), v }).catch(() => {});
      }
      return v;
    } catch (e) {
      if (saved) return saved.v;
      throw e;
    }
  })();
  infoFlying.set(id, p);
  p.finally(() => infoFlying.delete(id)).catch(() => {});
  return p;
}
