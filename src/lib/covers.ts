// Other covers for a book: the editions Open Library and Google Books know for its title (and author), and pictures from Wikimedia
// Commons. The reader picks one in the book's menu; it replaces the cover read from the file until they pick again.
import * as db from './db';
import type { DocMeta } from './types';
import { patchDoc } from './store';
import { COVER_V, generatedCover, imageCoverOf } from './library';

export interface CoverChoice {
  url: string; // a picture to show (and download when picked)
  from: string; // where it came from
}

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

async function openLibrary(title: string, author?: string): Promise<CoverChoice[]> {
  const q = new URLSearchParams({ title, limit: '6', fields: 'key,cover_i' });
  if (author) q.set('author', author);
  const j = (await J(`https://openlibrary.org/search.json?${q}`)) as { docs?: { key?: string; cover_i?: number }[] };
  const ids: number[] = [];
  for (const d of j.docs ?? []) if (d.cover_i) ids.push(d.cover_i);
  // the editions of the best match: many printings, many covers
  const work = j.docs?.[0]?.key;
  if (work) {
    const e = (await J(`https://openlibrary.org${work}/editions.json?limit=60`).catch(() => null)) as { entries?: { covers?: number[] }[] } | null;
    for (const x of e?.entries ?? []) for (const c of x.covers ?? []) if (c > 0) ids.push(c);
  }
  return [...new Set(ids)].slice(0, 18).map((id) => ({ url: `https://covers.openlibrary.org/b/id/${id}-L.jpg`, from: 'Open Library' }));
}

async function googleBooks(title: string, author?: string): Promise<CoverChoice[]> {
  const q = `intitle:${title}${author ? ` inauthor:${author}` : ''}`;
  const j = (await J(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&fields=items(volumeInfo(imageLinks))`)) as {
    items?: { volumeInfo?: { imageLinks?: { thumbnail?: string; small?: string; medium?: string } } }[];
  };
  const out: CoverChoice[] = [];
  for (const it of j.items ?? []) {
    const l = it.volumeInfo?.imageLinks;
    const u = l?.medium ?? l?.small ?? l?.thumbnail;
    if (u) out.push({ url: u.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/zoom=\d/, 'zoom=1'), from: 'Google Books' });
  }
  return out;
}

async function commons(title: string): Promise<CoverChoice[]> {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${title} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '500',
  });
  const j = (await J(`https://commons.wikimedia.org/w/api.php?${qs}`)) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; width?: number; height?: number }[] }> } };
  return Object.values(j.query?.pages ?? {})
    .map((p) => p.imageinfo?.[0])
    .filter((i): i is { thumburl: string; width: number; height: number } => !!i?.thumburl && (i.height ?? 0) > (i.width ?? 0) * 0.9)
    .map((i) => ({ url: i.thumburl, from: 'Wikimedia Commons' }));
}

/** Every cover that fits, best sources first, without repeats. A source that fails is simply left out. */
export async function coverChoices(doc: DocMeta): Promise<CoverChoice[]> {
  const title = searchTitle(doc);
  const author = doc.author?.split(/[,;&]| and /)[0]?.trim() || undefined;
  const lists = await Promise.all([openLibrary(title, author).catch(() => []), googleBooks(title, author).catch(() => []), commons(title).catch(() => [])]);
  // when the author narrowed the search to nothing, the title alone
  if (!lists[0].length && !lists[1].length && author) lists.push(...(await Promise.all([openLibrary(title).catch(() => []), googleBooks(title).catch(() => [])])));
  const seen = new Set<string>();
  return lists.flat().filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

async function save(doc: DocMeta, cover: Blob) {
  const coverId = `${doc.id}:cover-${Date.now()}`;
  await db.put('blobs', coverId, cover);
  if (doc.coverId) await db.del('blobs', doc.coverId).catch(() => {});
  await patchDoc(doc.id, { coverId, coverV: COVER_V, coverPicked: true });
}

/** Use this picture as the book's cover. Open Library answers a missing cover with a 1-pixel picture: that counts as a failure. */
export async function useCover(doc: DocMeta, src: string | Blob): Promise<boolean> {
  try {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    const bmp = await createImageBitmap(blob);
    const ok = bmp.width > 40 && bmp.height > 40;
    bmp.close();
    if (!ok) return false;
    const cover = await imageCoverOf(blob);
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
