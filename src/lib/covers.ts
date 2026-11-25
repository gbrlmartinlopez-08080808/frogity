// Other covers for a book, all from open sources and all large enough to stay sharp on a phone:
//   · the covers of its printed editions, from Open Library (the large size; tiny or blank ones are dropped)
//   · openly licensed pictures that fit the book — its title and the subjects librarians filed it under — from Openverse and
//     Wikimedia Commons, with mature content excluded. Such a picture becomes a cover with the book's title set over it.
// The reader picks one in the book's menu; it replaces the cover read from the file until they pick again.
import * as db from './db';
import type { DocMeta } from './types';
import { patchDoc } from './store';
import { COVER_V, generatedCover } from './library';

export interface CoverChoice {
  url: string; // the full-size picture (downloaded when picked)
  thumb: string; // a smaller one to show in the picker
  from: string; // where it came from
  kind: 'edition' | 'art'; // a real cover of the book, or a fitting picture the title is set over
  credit?: string; // who made it and under which licence (art)
}

/** Pictures need at least this many pixels on their longer side. */
const MIN_LONG = 1000;
/** Words that keep a picture out of the list, whatever its licence. */
const UNFIT = /\b(nude|nudity|naked|nsfw|erotic|porn|sex|topless|lingerie|gore|corpse|autopsy|wound|blood|execution|swastika|logo|icon|map|diagram|chart|graph|screenshot|flag of|coat of arms|signature|pdf|scan of page)\b/i;

const J = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/** "the_little_prince (1).pdf" → "the little prince"; strips what file names and scans add to a title */
export function searchTitle(doc: DocMeta) {
  return doc.name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\((\d+|copy|z-lib.*?|libgen.*?)\)|\[.*?\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- the book's own editions
async function openLibrary(title: string, author?: string): Promise<{ covers: CoverChoice[]; subjects: string[] }> {
  const q = new URLSearchParams({ title, limit: '6', fields: 'key,cover_i,subject,title' });
  if (author) q.set('author', author);
  const j = (await J(`https://openlibrary.org/search.json?${q}`)) as { docs?: { key?: string; cover_i?: number; subject?: string[] }[] };
  const ids: number[] = [];
  for (const d of j.docs ?? []) if (d.cover_i) ids.push(d.cover_i);
  // the editions of the best match: many printings, many covers
  const work = j.docs?.[0]?.key;
  if (work) {
    const e = (await J(`https://openlibrary.org${work}/editions.json?limit=80`).catch(() => null)) as { entries?: { covers?: number[] }[] } | null;
    for (const x of e?.entries ?? []) for (const c of x.covers ?? []) if (c > 0) ids.push(c);
  }
  // what the book is about, in plain words: "Whales", "Sea stories" (not "Fiction" or catalogue codes)
  const subjects = (j.docs?.[0]?.subject ?? [])
    .filter((s) => s.length < 28 && !/fiction|literature|novel|accessible|protected|lending|large type|nyt:|reading level|translations|juvenile|open library|in library|staff picks|classic|english|american|history and criticism|\d/i.test(s))
    .slice(0, 3);
  const covers = [...new Set(ids)].slice(0, 24).map((id) => ({
    url: `https://covers.openlibrary.org/b/id/${id}-L.jpg`,
    thumb: `https://covers.openlibrary.org/b/id/${id}-M.jpg`,
    from: 'Open Library',
    kind: 'edition' as const,
  }));
  return { covers, subjects };
}

// ---------------------------------------------------------------- openly licensed pictures that fit
interface OvImage {
  url?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  title?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  mature?: boolean;
  tags?: { name: string }[];
}
async function openverse(query: string): Promise<CoverChoice[]> {
  const q = new URLSearchParams({ q: query, page_size: '20', size: 'large', mature: 'false', category: 'photograph,illustration,digitized_artwork' });
  const j = (await J(`https://api.openverse.org/v1/images/?${q}`)) as { results?: OvImage[] };
  return (j.results ?? [])
    .filter((i) => i.url && !i.mature && Math.max(i.width ?? 0, i.height ?? 0) >= MIN_LONG && !UNFIT.test(`${i.title ?? ''} ${(i.tags ?? []).map((t) => t.name).join(' ')}`))
    .map((i) => ({
      url: i.url!.replace(/^http:/, 'https:'),
      thumb: (i.thumbnail ?? i.url!).replace(/^http:/, 'https:'),
      from: 'Openverse',
      kind: 'art' as const,
      credit: [i.creator, i.license ? `CC ${i.license.toUpperCase()} ${i.license_version ?? ''}`.trim() : ''].filter(Boolean).join(' · '),
    }));
}

interface CmInfo {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
}
const stripTags = (h = '') => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
async function commons(query: string): Promise<CoverChoice[]> {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '16',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist|Restrictions',
    iiurlwidth: '1200',
  });
  const j = (await J(`https://commons.wikimedia.org/w/api.php?${qs}`)) as { query?: { pages?: Record<string, { title?: string; imageinfo?: CmInfo[] }> } };
  return Object.values(j.query?.pages ?? {})
    .map((p) => ({ title: p.title ?? '', i: p.imageinfo?.[0] }))
    .filter(({ title, i }) => !!i?.thumburl && /jpe?g|png|webp/.test(i.mime ?? '') && Math.max(i.width ?? 0, i.height ?? 0) >= MIN_LONG && !UNFIT.test(title))
    .map(({ i }) => ({
      url: i!.thumburl!,
      thumb: i!.thumburl!.replace(/\/1200px-/, '/400px-'),
      from: 'Wikimedia Commons',
      kind: 'art' as const,
      credit: [stripTags(i!.extmetadata?.Artist?.value).slice(0, 40), i!.extmetadata?.LicenseShortName?.value].filter(Boolean).join(' · '),
    }));
}

/** Every cover that fits: the book's own editions first, then pictures for its title and its subjects; no repeats. A source that
 * fails is simply left out. */
export async function coverChoices(doc: DocMeta): Promise<CoverChoice[]> {
  const title = searchTitle(doc);
  const author = doc.author?.split(/[,;&]| and /)[0]?.trim() || undefined;
  let ol = await openLibrary(title, author).catch(() => ({ covers: [] as CoverChoice[], subjects: [] as string[] }));
  // when the author narrowed the search to nothing, the title alone
  if (!ol.covers.length && author) ol = await openLibrary(title).catch(() => ol);
  const topics = [...new Set([title, ...ol.subjects])];
  const art = await Promise.all(topics.flatMap((t) => [openverse(t).catch(() => []), commons(t).catch(() => [])]));
  // take turns between the topics and the two libraries, so the first rows are varied
  const mixed: CoverChoice[] = [];
  for (let i = 0; mixed.length < 36 && art.some((l) => l[i]); i++) for (const l of art) if (l[i]) mixed.push(l[i]);
  const seen = new Set<string>();
  return [...ol.covers, ...mixed].filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

// ---------------------------------------------------------------- making the cover
/** Covers are kept at 720 × 1040 — sharp on any phone, small on disk. */
const W = 720;
const H = 1040;

async function loadBitmap(src: string | Blob) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob);
}
const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob | undefined>((r) => c.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.88));

/** A real cover: scaled to fit the cover's shape (filled, centred), never stretched. */
function drawFilled(ctx: CanvasRenderingContext2D, bmp: ImageBitmap) {
  const s = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * s;
  const h = bmp.height * s;
  ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      out.push(cur);
      cur = w;
      if (out.length === maxLines) break;
    } else cur = t;
  }
  if (cur && out.length < maxLines) out.push(cur);
  return out;
}

/** A fitting picture made into a cover: the picture fills it, darkened at the foot, with the title and the author set over it. */
export async function artCover(bmp: ImageBitmap, title: string, author?: string) {
  await document.fonts.ready;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  drawFilled(ctx, bmp);
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const pad = 56;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  let size = 76;
  let lines: string[] = [];
  for (; size >= 44; size -= 6) {
    ctx.font = `700 ${size}px Literata, Georgia, serif`;
    lines = wrapLines(ctx, title, W - pad * 2, 4);
    if (lines.join(' ').length >= title.length - 1) break;
  }
  const lh = size * 1.12;
  let y = H - pad - (author ? 58 : 0) - (lines.length - 1) * lh;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12;
  for (const l of lines) {
    ctx.fillText(l, pad, y);
    y += lh;
  }
  if (author) {
    ctx.font = '500 30px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(author.slice(0, 36), pad, H - pad);
  }
  return toJpeg(c);
}

async function plainCover(bmp: ImageBitmap) {
  const c = document.createElement('canvas');
  // a real cover keeps its own shape, only made smaller when it is bigger than a cover needs
  const s = Math.min(1, 1100 / Math.max(bmp.width, bmp.height));
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return toJpeg(c);
}

async function save(doc: DocMeta, cover: Blob) {
  const coverId = `${doc.id}:cover-${Date.now()}`;
  await db.put('blobs', coverId, cover);
  if (doc.coverId) await db.del('blobs', doc.coverId).catch(() => {});
  await patchDoc(doc.id, { coverId, coverV: COVER_V, coverPicked: true });
}

/** Use this cover (or this picture, with the title set over it). Open Library answers a missing cover with a 1-pixel picture:
 * that counts as a failure. */
export async function useCover(doc: DocMeta, src: CoverChoice | Blob): Promise<boolean> {
  try {
    const bmp = await loadBitmap(src instanceof Blob ? src : src.url);
    const ok = bmp.width > 120 && bmp.height > 120;
    if (!ok) {
      bmp.close();
      return false;
    }
    const art = !(src instanceof Blob) && src.kind === 'art';
    const cover = art ? await artCover(bmp, searchTitle(doc), doc.author) : await plainCover(bmp);
    bmp.close();
    if (!cover) return false;
    await save(doc, cover);
    return true;
  } catch {
    return false;
  }
}

/** Back to a plain typeset cover with the title. */
export async function useTypesetCover(doc: DocMeta) {
  await save(doc, await generatedCover(doc.name, doc.kind, doc.author));
}
