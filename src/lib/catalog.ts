// Free catalogues: public-domain and open-access books and papers, found and fetched straight from their own
// open APIs (no account, no key). "Shop" results only describe a book and send you to the web.
import * as db from './db';
import { FEATURED } from './featured';

export type SourceId = 'books' | 'textbooks' | 'papers' | 'archive' | 'shop';

export interface Item {
  id: string;
  source: SourceId;
  title: string;
  author?: string;
  blurb?: string;
  cover?: string;
  year?: number;
  /** a file Frogity can fetch for you (always free) */
  get?: { url: string; name: string; alt?: string[]; as?: 'jats' };
  /** where to read more / buy / borrow (opens the web) */
  web?: string;
  tag?: string; // e.g. "epub", "pdf", "free preview", "for sale"
}

export interface Page {
  items: Item[];
  next?: number;
}

export const SOURCES: { id: SourceId; label: string; sub: string; topics: { label: string; q: string }[] }[] = [
  {
    id: 'books',
    label: 'Classics',
    sub: 'Project Gutenberg · free books, many from the 20th century',
    topics: [
      { label: 'Featured', q: 'featured' },
      { label: 'Popular', q: '' },
      { label: 'Sci-fi', q: 's.science fiction' },
      { label: 'Mystery', q: 's.detective' },
      { label: 'Adventure', q: 's.adventure' },
      { label: 'Philosophy', q: 's.philosophy' },
      { label: 'Science', q: 's.science' },
      { label: 'History', q: 's.history' },
      { label: 'Poetry', q: 's.poetry' },
      { label: 'Children', q: 's.juvenile' },
    ],
  },
  {
    id: 'textbooks',
    label: 'Textbooks',
    sub: 'OpenStax · modern university textbooks, free (CC BY)',
    topics: [
      { label: 'All', q: '' },
      { label: 'Maths', q: 'algebra|calculus|statistics|mathematics|trigonometry' },
      { label: 'Physics', q: 'physics|astronomy' },
      { label: 'Chemistry', q: 'chemistry' },
      { label: 'Biology', q: 'biology|anatomy|microbiology|nutrition|nursing' },
      { label: 'Business', q: 'business|accounting|economics|entrepreneurship|management|finance|marketing' },
      { label: 'Humanities', q: 'history|philosophy|psychology|sociology|government|writing|literature|american' },
    ],
  },
  {
    id: 'papers',
    label: 'Papers',
    sub: 'arXiv + Europe PMC · recent open research',
    topics: [
      { label: 'AI', q: 'cat:cs.AI' },
      { label: 'Language', q: 'cat:cs.CL' },
      { label: 'Vision', q: 'cat:cs.CV' },
      { label: 'Maths', q: 'cat:math.HO OR cat:math.GM' },
      { label: 'Physics', q: 'cat:physics.pop-ph OR cat:quant-ph' },
      { label: 'Health', q: 'epmc:health' },
      { label: 'Brain', q: 'epmc:neuroscience' },
      { label: 'Psychology', q: 'epmc:psychology' },
      { label: 'Economics', q: 'cat:econ.GN' },
    ],
  },
  {
    id: 'archive',
    label: 'Archive',
    sub: 'Internet Archive · free PDFs',
    topics: [
      { label: 'Popular', q: '' },
      { label: 'Mathematics', q: 'subject:mathematics' },
      { label: 'Physics', q: 'subject:physics' },
      { label: 'Biology', q: 'subject:biology' },
      { label: 'Economics', q: 'subject:economics' },
      { label: 'Art', q: 'subject:art' },
      { label: 'Law', q: 'subject:law' },
    ],
  },
  {
    id: 'shop',
    label: 'Shop & borrow',
    sub: 'Google Books · Open Library · opens the web',
    topics: [],
  },
];

// ------------------------------------------------------------------ plumbing
/** A fetch that gives up (and says so) instead of leaving you staring at a spinner. */
async function get(url: string, ms = 12000, accept?: string): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: accept ? { Accept: accept } : undefined });
    if (r.status === 429) throw new Error('That catalogue is busy right now — try again in a minute.');
    if (!r.ok) throw new Error(`The catalogue answered ${r.status}.`);
    return r;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('That catalogue is slow right now — try again, or pick another tab.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
const J = async (url: string) => (await get(url, 12000, 'application/json')).json();
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const safeName = (t: string, ext: string) => `${clean(t).replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'book'}.${ext}`;
const decode = (s: string) => new DOMParser().parseFromString(s, 'text/html').documentElement.textContent ?? s;
const interleave = <T,>(a: T[], b: T[]) => {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
};

// ------------------------------------------------------------------ Project Gutenberg
const pgCover = (id: number | string) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;
const pgGet = (id: number | string, title: string) => ({
  url: `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
  name: safeName(title, 'epub'),
  // the redirecting addresses first, then the files themselves (some networks and apps are answered differently by the redirect)
  alt: [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images-3.epub`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.epub`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`,
  ],
});

export function featuredNow(): Page {
  return {
    items: FEATURED.map(([id, title, author, year]) => ({
      id: `g${id}`,
      source: 'books' as const,
      title,
      author,
      year,
      cover: pgCover(id),
      get: pgGet(id, title),
      web: `https://www.gutenberg.org/ebooks/${id}`,
      tag: 'epub',
    })),
  };
}

/** Gutenberg's own catalogue feed: quick, and no key. */
async function gutenberg(q: string, page: number): Promise<Page> {
  if (q === 'featured') return featuredNow();
  const per = 25;
  const query = [q.includes('.') ? 'l.en' : 'l.en', q].filter(Boolean).join(' ');
  const url = `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(query)}&sort_order=downloads&start_index=${(page - 1) * per + 1}`;
  const xml = new DOMParser().parseFromString(await (await get(url, 10000)).text(), 'application/xml');
  const items: Item[] = [];
  for (const e of Array.from(xml.querySelectorAll('entry'))) {
    const id = (e.querySelector('id')?.textContent ?? '').match(/ebooks\/(\d+)/)?.[1];
    if (!id) continue;
    const title = clean(decode(e.querySelector('title')?.textContent ?? '')).split(':')[0];
    const author = clean(decode(e.querySelector('content')?.textContent ?? ''));
    // the catalogue names the cover itself; the usual address is the fallback
    const img = Array.from(e.querySelectorAll('link')).find((l) => /image/.test(l.getAttribute('rel') ?? '') && l.getAttribute('href'))?.getAttribute('href');
    const cover = img ? new URL(img, 'https://www.gutenberg.org/').href : pgCover(id);
    items.push({ id: `g${id}`, source: 'books', title, author: author || undefined, cover, get: pgGet(id, title), web: `https://www.gutenberg.org/ebooks/${id}`, tag: 'epub' });
  }
  return { items, next: items.length >= per ? page + 1 : undefined };
}

// ------------------------------------------------------------------ OpenStax textbooks
let stax: Item[] | null = null;
async function openstax(q: string): Promise<Page> {
  if (!stax) {
    const j = (await J('https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&fields=title,cover_url,high_resolution_pdf_url,pdf_url,book_state,publish_date,description&limit=200')) as {
      items: { id: number; title: string; cover_url?: string; high_resolution_pdf_url?: string; pdf_url?: string; book_state?: string; publish_date?: string; description?: string; meta?: { html_url?: string } }[];
    };
    stax = j.items
      .filter((b) => b.book_state === 'live' && (b.high_resolution_pdf_url || b.pdf_url))
      .map((b) => ({
        id: `o${b.id}`,
        source: 'textbooks' as const,
        title: clean(b.title),
        author: 'OpenStax · CC BY',
        year: b.publish_date ? Number(b.publish_date.slice(0, 4)) : undefined,
        blurb: b.description ? clean(b.description.replace(/<[^>]+>/g, ' ')).slice(0, 140) : undefined,
        cover: b.cover_url,
        get: { url: (b.pdf_url ?? b.high_resolution_pdf_url)!, name: safeName(b.title, 'pdf'), alt: b.pdf_url && b.high_resolution_pdf_url && b.pdf_url !== b.high_resolution_pdf_url ? [b.high_resolution_pdf_url] : undefined },
        web: b.meta?.html_url,
        tag: 'large pdf',
      }));
  }
  const words = q.split('|').filter(Boolean);
  const list = words.length ? stax.filter((b) => words.some((w) => b.title.toLowerCase().includes(w) || (b.blurb ?? '').toLowerCase().includes(w))) : stax;
  return { items: [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) };
}

// ------------------------------------------------------------------ Internet Archive
async function archive(q: string, page: number): Promise<Page> {
  const subj = q.match(/^subject:(.+)$/)?.[1];
  const terms = subj ? `subject:(${subj})` : q ? `(title:(${q}) OR creator:(${q}) OR subject:(${q}))` : 'collection:(americana OR prelinger_library OR gutenberg)';
  const query = `${terms} AND mediatype:texts AND format:(Text PDF) AND -access-restricted-item:true`;
  const qs = new URLSearchParams({ q: query, rows: '20', page: String(page), output: 'json', sort: 'downloads desc' });
  ['identifier', 'title', 'creator', 'year', 'description'].forEach((f) => qs.append('fl[]', f));
  const j = (await J(`https://archive.org/advancedsearch.php?${qs}`)) as {
    response: { numFound: number; docs: { identifier: string; title?: string; creator?: string | string[]; year?: string | number; description?: string | string[] }[] };
  };
  const per = 20;
  return {
    items: j.response.docs.map((d) => {
      const creator = Array.isArray(d.creator) ? d.creator[0] : d.creator;
      const desc = Array.isArray(d.description) ? d.description[0] : d.description;
      return {
        id: `a${d.identifier}`,
        source: 'archive' as const,
        title: clean(d.title ?? d.identifier),
        author: [creator, d.year].filter(Boolean).join(' · ') || undefined,
        year: d.year ? Number(d.year) : undefined,
        blurb: desc ? clean(desc.replace(/<[^>]+>/g, ' ')).slice(0, 140) : undefined,
        cover: `https://archive.org/services/img/${d.identifier}`,
        web: `https://archive.org/details/${d.identifier}`,
        tag: 'pdf',
      };
    }),
    next: page * per < j.response.numFound ? page + 1 : undefined,
  };
}

/** The Archive keeps the actual PDF name in the item's metadata. */
export async function archivePdf(identifier: string): Promise<{ url: string; name: string }> {
  const j = (await J(`https://archive.org/metadata/${identifier}`)) as { files?: { name: string; format?: string; size?: string }[]; metadata?: { title?: string } };
  const pdfs = (j.files ?? []).filter((f) => /\.pdf$/i.test(f.name) && !/_text\.pdf$/i.test(f.name));
  if (!pdfs.length) throw new Error('This item has no downloadable PDF.');
  pdfs.sort((a, b) => Number(a.size ?? 0) - Number(b.size ?? 0));
  const best = pdfs.find((f) => Number(f.size ?? 0) > 20_000) ?? pdfs[0];
  return { url: `https://archive.org/download/${identifier}/${encodeURIComponent(best.name)}`, name: safeName(j.metadata?.title ?? identifier, 'pdf') };
}

// ------------------------------------------------------------------ arXiv + Europe PMC
async function arxiv(q: string, page: number): Promise<Page> {
  const per = 20;
  const search = /^(cat|all|ti|au):/.test(q) || / OR /.test(q) ? q : `all:${q.trim().replace(/\s+/g, '+AND+all:')}`;
  const url = `https://export.arxiv.org/api/query?search_query=${search}&start=${(page - 1) * per}&max_results=${per}&sortBy=${q.startsWith('cat:') ? 'submittedDate' : 'relevance'}&sortOrder=descending`;
  const xml = new DOMParser().parseFromString(await (await get(url, 14000)).text(), 'application/xml');
  const total = Number(xml.querySelector('totalResults')?.textContent ?? 0);
  const items: Item[] = Array.from(xml.querySelectorAll('entry')).map((e) => {
    const id = (e.querySelector('id')?.textContent ?? '').replace(/^https?:\/\/arxiv\.org\/abs\//, '');
    const title = clean(e.querySelector('title')?.textContent ?? id);
    const authors = Array.from(e.querySelectorAll('author > name')).map((n) => n.textContent ?? '');
    return {
      id: `x${id}`,
      source: 'papers' as const,
      title,
      author: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
      year: Number((e.querySelector('published')?.textContent ?? '').slice(0, 4)) || undefined,
      blurb: clean(e.querySelector('summary')?.textContent ?? '').slice(0, 160),
      get: { url: `https://arxiv.org/pdf/${id}`, name: safeName(title, 'pdf') },
      web: `https://arxiv.org/abs/${id}`,
      tag: 'pdf',
    };
  });
  return { items, next: page * per < total ? page + 1 : undefined };
}

const EPMC_TOPICS: Record<string, string> = { health: 'medicine OR health', neuroscience: 'neuroscience OR brain', psychology: 'psychology OR behaviour' };
async function europepmc(q: string, page: number): Promise<Page> {
  const term = EPMC_TOPICS[q] ?? q;
  const per = 20;
  const qs = new URLSearchParams({ query: `(${term}) AND OPEN_ACCESS:y AND HAS_FT:y AND SRC:MED AND PUB_YEAR:[2018 TO 2030]`, format: 'json', resultType: 'lite', pageSize: String(per), page: String(page), sort: 'CITED desc' });
  const j = (await J(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${qs}`)) as {
    hitCount: number;
    resultList: { result: { pmcid?: string; title?: string; authorString?: string; journalTitle?: string; pubYear?: string }[] };
  };
  const items: Item[] = j.resultList.result
    .filter((r) => r.pmcid)
    .map((r) => {
      const title = clean(decode(r.title ?? '')).replace(/\.$/, '');
      return {
        id: `p${r.pmcid}`,
        source: 'papers' as const,
        title,
        author: clean(r.authorString ?? '').replace(/\.$/, '').split(', ').slice(0, 3).join(', '),
        year: Number(r.pubYear) || undefined,
        blurb: [r.journalTitle, r.pubYear].filter(Boolean).join(' · '),
        get: { url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${r.pmcid}/fullTextXML`, name: safeName(title, 'html'), as: 'jats' as const },
        web: `https://europepmc.org/article/PMC/${r.pmcid}`,
        tag: 'article',
      };
    });
  return { items, next: page * per < j.hitCount ? page + 1 : undefined };
}

async function papers(q: string, page: number): Promise<Page> {
  if (q.startsWith('epmc:')) return europepmc(q.slice(5), page);
  if (q.startsWith('cat:') || / OR /.test(q)) return arxiv(q, page);
  // free text: both, side by side; one failing doesn't spoil the other
  const [a, e] = await Promise.allSettled([arxiv(q || 'cat:cs.AI', page), europepmc(q, page)]);
  const A = a.status === 'fulfilled' ? a.value : { items: [] as Item[] };
  const E = e.status === 'fulfilled' ? e.value : { items: [] as Item[] };
  if (a.status === 'rejected' && e.status === 'rejected') throw a.reason;
  return { items: interleave(A.items, E.items), next: (A as Page).next ?? (E as Page).next };
}

/** JATS (the XML of open-access articles) → a clean readable page. */
export function jatsToHtml(xml: string): string {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const text = (el: Element) => {
    const c = el.cloneNode(true) as Element;
    c.querySelectorAll('xref, sup[class], ext-link').forEach((x) => (x.tagName === 'ext-link' ? x.replaceWith(d.createTextNode(x.textContent ?? '')) : x.remove()));
    return clean(c.textContent ?? '');
  };
  const out: string[] = [];
  const title = d.querySelector('article-meta title-group article-title');
  if (title) out.push(`<h1>${esc(text(title))}</h1>`);
  const authors = Array.from(d.querySelectorAll('article-meta contrib[contrib-type="author"] name')).map((n) => clean(`${n.querySelector('given-names')?.textContent ?? ''} ${n.querySelector('surname')?.textContent ?? ''}`));
  if (authors.length) out.push(`<p><em>${esc(authors.slice(0, 12).join(', '))}${authors.length > 12 ? ' et al.' : ''}</em></p>`);
  const abs = d.querySelector('article-meta abstract');
  if (abs) {
    out.push('<h2>Abstract</h2>');
    abs.querySelectorAll('p').forEach((p) => out.push(`<p>${esc(text(p))}</p>`));
  }
  const walk = (sec: Element, depth: number) => {
    for (const ch of Array.from(sec.children)) {
      if (ch.tagName === 'title') out.push(`<h${Math.min(4, depth + 1)}>${esc(text(ch))}</h${Math.min(4, depth + 1)}>`);
      else if (ch.tagName === 'p') {
        const t = text(ch);
        if (t) out.push(`<p>${esc(t)}</p>`);
      } else if (ch.tagName === 'sec') walk(ch, depth + 1);
      else if (ch.tagName === 'list') ch.querySelectorAll('list-item').forEach((li) => out.push(`<p>• ${esc(text(li))}</p>`));
    }
  };
  const body = d.querySelector('body');
  if (body) walk(body, 1);
  const lic = d.querySelector('article-meta license license-p');
  if (lic) out.push(`<hr><p><small>${esc(text(lic))}</small></p>`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(title ? text(title) : 'Article')}</title><body>${out.join('\n')}</body>`;
}

// ------------------------------------------------------------------ Google Books + Open Library (descriptions only)
async function shop(q: string, page: number): Promise<Page> {
  if (!q.trim()) return { items: [] };
  const per = 20;
  const items: Item[] = [];
  const g = (await J(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${per}&startIndex=${(page - 1) * per}&printType=books`).catch(() => null)) as {
    totalItems?: number;
    items?: {
      id: string;
      volumeInfo: { title?: string; authors?: string[]; description?: string; imageLinks?: { thumbnail?: string }; infoLink?: string; previewLink?: string; publishedDate?: string };
      saleInfo?: { saleability?: string; buyLink?: string };
      accessInfo?: { viewability?: string; pdf?: { isAvailable?: boolean; downloadLink?: string } };
    }[];
  } | null;
  for (const v of g?.items ?? []) {
    const vi = v.volumeInfo;
    const free = v.accessInfo?.pdf?.isAvailable && v.accessInfo.pdf.downloadLink;
    items.push({
      id: `s${v.id}`,
      source: 'shop',
      title: clean(vi.title ?? 'Untitled'),
      author: vi.authors?.slice(0, 2).join(', '),
      year: Number(vi.publishedDate?.slice(0, 4)) || undefined,
      blurb: vi.description ? clean(vi.description).slice(0, 140) : undefined,
      cover: vi.imageLinks?.thumbnail?.replace(/^http:/, 'https:'),
      get: free ? { url: v.accessInfo!.pdf!.downloadLink!, name: safeName(vi.title ?? 'book', 'pdf') } : undefined,
      web: v.saleInfo?.buyLink ?? vi.infoLink ?? vi.previewLink,
      tag: free ? 'free pdf' : v.saleInfo?.saleability === 'FOR_SALE' ? 'for sale' : v.accessInfo?.viewability === 'PARTIAL' ? 'preview' : 'info',
    });
  }
  if (page === 1) {
    const o = (await J(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,author_name,cover_i,ebook_access,first_publish_year`).catch(() => null)) as {
      docs?: { key: string; title: string; author_name?: string[]; cover_i?: number; ebook_access?: string; first_publish_year?: number }[];
    } | null;
    for (const d of o?.docs ?? []) {
      items.push({
        id: `o${d.key}`,
        source: 'shop',
        title: clean(d.title),
        author: d.author_name?.slice(0, 2).join(', '),
        year: d.first_publish_year,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        web: `https://openlibrary.org${d.key}`,
        tag: d.ebook_access === 'borrowable' ? 'borrow free' : d.ebook_access === 'public' ? 'free to read' : 'info',
      });
    }
  }
  if (!items.length && !g) throw new Error('The book catalogues are busy right now — try again in a minute.');
  return { items, next: g?.totalItems && page * per < g.totalItems ? page + 1 : undefined };
}

function fetchPage(source: SourceId, q: string, page: number): Promise<Page> {
  switch (source) {
    case 'books':
      return gutenberg(q, page);
    case 'textbooks':
      return openstax(q);
    case 'archive':
      return archive(q, page);
    case 'papers':
      return papers(q || 'cat:cs.AI', page);
    default:
      return shop(q, page);
  }
}

// ------------------------------------------------------------------ remembered pages: opening is instant, refreshing is quiet
const mem = new Map<string, { t: number; page: Page }>();
const key = (s: SourceId, q: string, p: number) => `cat:${s}:${q}:${p}`;
const FRESH = 60 * 60 * 1000;

/** What we already know for this search (memory, then the phone's storage), however old. */
export async function peek(source: SourceId, q: string, page = 1): Promise<{ page: Page; fresh: boolean } | null> {
  const k = key(source, q, page);
  let hit = mem.get(k);
  if (!hit) {
    const stored = await db.get<{ t: number; page: Page }>('cache', k).catch(() => undefined);
    if (stored) {
      hit = stored;
      mem.set(k, stored);
    }
  }
  return hit ? { page: hit.page, fresh: Date.now() - hit.t < FRESH } : null;
}

export async function search(source: SourceId, q: string, page = 1): Promise<Page> {
  const r = await fetchPage(source, q, page);
  if (r.items.length) {
    const rec = { t: Date.now(), page: r };
    mem.set(key(source, q, page), rec);
    db.put('cache', key(source, q, page), rec).catch(() => {});
  }
  return r;
}

/** Warm the first screens in the background so opening "Find free books" shows something at once. */
export function prefetch() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const jobs: [SourceId, string][] = [
    ['books', ''],
    ['textbooks', ''],
    ['papers', 'cat:cs.AI'],
  ];
  jobs.forEach(([s, q], i) =>
    setTimeout(async () => {
      const have = await peek(s, q);
      if (!have?.fresh) search(s, q).catch(() => {});
    }, 2500 * (i + 1)),
  );
}

// A browser-like identity: some of these sites turn away the bare "okhttp" / "Dalvik" one the phone's own network stack sends.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  Accept: 'application/epub+zip,application/pdf,application/xml,image/*,*/*;q=0.8',
};

/** Is this really the book (a PDF or an EPUB), not a web page that says "blocked" or "not found"? */
async function looksRight(b: Blob, g: NonNullable<Item['get']>): Promise<boolean> {
  if (b.size < 800) return false;
  if (g.as === 'jats') return true;
  const h = new Uint8Array(await b.slice(0, 8).arrayBuffer());
  const text = String.fromCharCode(...h);
  if (/\.pdf$/i.test(g.name)) return text.startsWith('%PDF');
  if (/\.epub$/i.test(g.name)) return text.startsWith('PK');
  return !/^\s*</.test(text); // anything else: at least not HTML
}

const b64Blob = (data: string, type: string) => {
  const bin = atob(data);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
};

/** The phone's own HTTP stack (no browser rules, a browser identity, redirects followed): a file, or why not. */
async function nativeGet(url: string, ms = 45000): Promise<{ blob?: Blob; status: number }> {
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return { status: 0 };
  const r = await CapacitorHttp.get({ url, headers: BROWSER_HEADERS, responseType: 'blob', connectTimeout: 15000, readTimeout: ms });
  if (r.status < 200 || r.status >= 300) return { status: r.status };
  const type = String(r.headers?.['Content-Type'] ?? r.headers?.['content-type'] ?? '').split(';')[0];
  return { status: r.status, blob: typeof r.data === 'string' ? b64Blob(r.data, type) : undefined };
}

/**
 * Download a file (free). On the phone the download is done by Android itself, straight to a temporary file, and then
 * read back through the WebView: much faster for big PDFs than carrying the whole file across the JavaScript bridge.
 */
async function nativeDownload(url: string, onProgress?: (f: number) => void): Promise<Blob | null> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = `dl/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let sub: { remove: () => Promise<void> } | undefined;
  try {
    if (onProgress) sub = await Filesystem.addListener('progress', (p: { bytes: number; contentLength: number }) => p.contentLength > 0 && onProgress(Math.min(1, p.bytes / p.contentLength)));
    const r = await Filesystem.downloadFile({ url, path, directory: Directory.Cache, recursive: true, progress: !!onProgress, headers: BROWSER_HEADERS, connectTimeout: 20000, readTimeout: 180000 } as never);
    const res = await fetch(Capacitor.convertFileSrc(r.path ?? ''));
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  } finally {
    void sub?.remove();
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}

export async function fetchFile(g: NonNullable<Item['get']>, onProgress?: (fraction: number) => void): Promise<Blob> {
  const urls = [g.url, ...(g.alt ?? [])];
  let why = 'Download failed.';
  for (const url of urls) {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // three ways, quickest first; each one is checked to be the book itself before it is accepted
    const big = /\.pdf$/i.test(g.name); // a textbook or a paper: tens of megabytes, which must never be carried over the page's bridge as text
    const ways: [string, () => Promise<Blob | null>][] = [
      ['phone', async () => {
        if (big) return null;
        const r = await nativeGet(url).catch((e) => (why = `${host}: ${(e as Error).message}`, { status: -1 } as { blob?: Blob; status: number }));
        if (r.status > 0 && !r.blob) why = `${host} answered ${r.status}.`;
        return r.blob ?? null;
      }],
      ['download', () => (g.as === 'jats' ? Promise.resolve(null) : nativeDownload(url, onProgress))],
      ['web', async () => {
        const r = await fetch(url, { redirect: 'follow' });
        if (!r.ok) {
          why = `${host} answered ${r.status}.`;
          return null;
        }
        if (g.as === 'jats') {
          const html = jatsToHtml(await r.text());
          if (html.length < 600) {
            why = 'This article has no readable full text.';
            return null;
          }
          return new Blob([html], { type: 'text/html' });
        }
        return r.blob();
      }],
    ];
    if (big) ways.unshift(ways.splice(1, 1)[0]); // the download to a file goes first for big ones
    for (const [, run] of ways) {
      try {
        const b = await run();
        if (b && (await looksRight(b, g))) return b;
        if (b) why = `${host} sent something that is not the book.`;
      } catch (e) {
        why = `${host}: ${(e as Error).message || 'no answer'}`;
      }
    }
  }
  throw new Error(why);
}

const thumbs = new Map<string, Promise<Blob | undefined>>();
/** A small copy of the catalogue's own thumbnail (the phone's own network stack first: pictures blocked in the page often load there). */
export function fetchThumb(url?: string): Promise<Blob | undefined> {
  if (!url) return Promise.resolve(undefined);
  let p = thumbs.get(url);
  if (!p) {
    p = (async () => {
      const ok = (b?: Blob) => (b && b.size > 1500 && b.size < 1_500_000 && /^image\//.test(b.type) ? b : undefined);
      try {
        const r = await nativeGet(url, 15000);
        if (ok(r.blob)) return r.blob;
      } catch {
        /* try the page's own way */
      }
      try {
        const r = await fetch(url);
        return r.ok ? ok(await r.blob()) : undefined;
      } catch {
        return undefined;
      }
    })();
    thumbs.set(url, p);
    if (thumbs.size > 400) thumbs.delete(thumbs.keys().next().value as string);
  }
  return p;
}

const found = new Map<string, Promise<string | undefined>>();
/**
 * A real cover for a title when the catalogue's own picture is missing or will not load: Google Books and Open Library both
 * know most books (OpenStax's textbooks included). Only the title (and author) is sent, and the answer is remembered.
 */
export function lookupCover(title: string, author?: string): Promise<string | undefined> {
  const k = `${title}|${author ?? ''}`;
  let p = found.get(k);
  if (!p) {
    p = (async () => {
      const t = title.replace(/["“”]/g, '').slice(0, 90);
      const who = author && !/openstax|arxiv|^\s*$/i.test(author) ? author.split(/[,·]/)[0].trim() : /openstax/i.test(author ?? '') ? 'OpenStax' : '';
      try {
        const q = `intitle:"${t}"${who ? ` ${/openstax/i.test(who) ? 'inpublisher' : 'inauthor'}:"${who}"` : ''}`;
        const j = (await J(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=4&fields=items(volumeInfo(title,imageLinks))`)) as { items?: { volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[] };
        const hit = j.items?.find((i) => i.volumeInfo?.imageLinks?.thumbnail);
        const u = hit?.volumeInfo?.imageLinks?.thumbnail;
        if (u) return u.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/zoom=\d/, 'zoom=1');
      } catch {
        /* the next one */
      }
      try {
        const j = (await J(`https://openlibrary.org/search.json?title=${encodeURIComponent(t)}&limit=3&fields=cover_i`)) as { docs?: { cover_i?: number }[] };
        const c = j.docs?.find((d) => d.cover_i)?.cover_i;
        if (c) return `https://covers.openlibrary.org/b/id/${c}-M.jpg`;
      } catch {
        /* none */
      }
      return undefined;
    })();
    found.set(k, p);
  }
  return p;
}
