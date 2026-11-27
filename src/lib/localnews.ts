// The reader's own country's news, read by the phone itself from the outlets' feeds when the day's file has none for that country
// (the shared file is built elsewhere a few times a day and may not carry every country). Cached for an hour and a half.
import { useEffect, useState } from 'react';
import * as db from './db';
import { cleanSummary, type Daily, type Outlet, type Story } from './interesting';

type O = { cc: string; region: string; id: string; name: string; domain: string; kind: string; about: string; feeds: string[] };
// National outlets by country, in the country's own language (the same list the shared file uses).
const OUTLETS: O[] = [
  { cc: 'es', region: 'Spain', id: 'rtv', name: 'RTVE', domain: 'rtve.es', kind: 'public', about: 'Spain’s public broadcaster.', feeds: ['https://www.rtve.es/api/noticias.rss'] },
  { cc: 'es', region: 'Spain', id: 'epe', name: 'EL PAÍS', domain: 'elpais.com', kind: 'commercial', about: 'Spanish national daily.', feeds: ['https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'] },
  { cc: 'es', region: 'Spain', id: 'emu', name: 'El Mundo', domain: 'elmundo.es', kind: 'commercial', about: 'Spanish national daily.', feeds: ['https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml'] },
  { cc: 'es', region: 'Spain', id: 'v20', name: '20minutos', domain: '20minutos.es', kind: 'commercial', about: 'Spanish free daily and news site.', feeds: ['https://www.20minutos.es/rss/'] },
  { cc: 'es', region: 'Spain', id: 'lva', name: 'La Vanguardia', domain: 'lavanguardia.com', kind: 'commercial', about: 'Barcelona daily.', feeds: ['https://www.lavanguardia.com/rss/home.xml'] },
  { cc: 'es', region: 'Spain', id: 'edi', name: 'elDiario.es', domain: 'eldiario.es', kind: 'commercial', about: 'Spanish online daily.', feeds: ['https://www.eldiario.es/rss/'] },
  { cc: 'es', region: 'Spain', id: 'abc', name: 'ABC', domain: 'abc.es', kind: 'commercial', about: 'Madrid daily, centre-right.', feeds: ['https://www.abc.es/rss/2.0/portada/'] },
  { cc: 'mx', region: 'Mexico', id: 'meu', name: 'El Universal', domain: 'eluniversal.com.mx', kind: 'commercial', about: 'Mexico City daily.', feeds: ['https://www.eluniversal.com.mx/rss.xml'] },
  { cc: 'mx', region: 'Mexico', id: 'jor', name: 'La Jornada', domain: 'jornada.com.mx', kind: 'commercial', about: 'Mexican daily.', feeds: ['https://www.jornada.com.mx/rss/edicion.xml'] },
  { cc: 'ar', region: 'Argentina', id: 'cla', name: 'Clarín', domain: 'clarin.com', kind: 'commercial', about: 'Argentina’s largest daily.', feeds: ['https://www.clarin.com/rss/lo-ultimo/'] },
  { cc: 'ar', region: 'Argentina', id: 'ibf', name: 'Infobae', domain: 'infobae.com', kind: 'commercial', about: 'Argentine news site.', feeds: ['https://www.infobae.com/arc/outboundfeeds/rss/'] },
  { cc: 'co', region: 'Colombia', id: 'etm', name: 'El Tiempo', domain: 'eltiempo.com', kind: 'commercial', about: 'Colombia’s largest daily.', feeds: ['https://www.eltiempo.com/rss/colombia.xml'] },
  { cc: 'cl', region: 'Chile', id: 'coo', name: 'Cooperativa', domain: 'cooperativa.cl', kind: 'commercial', about: 'Chilean radio and news site.', feeds: ['https://www.cooperativa.cl/noticias/rss/'] },
  { cc: 'pe', region: 'Peru', id: 'rpp', name: 'RPP', domain: 'rpp.pe', kind: 'commercial', about: 'Peruvian radio and news site.', feeds: ['https://rpp.pe/feed'] },
  { cc: 'fr', region: 'France', id: 'fti', name: 'franceinfo', domain: 'francetvinfo.fr', kind: 'public', about: 'French public broadcaster’s news service.', feeds: ['https://www.francetvinfo.fr/titres.rss'] },
  { cc: 'fr', region: 'France', id: 'lmf', name: 'Le Monde', domain: 'lemonde.fr', kind: 'commercial', about: 'French newspaper of record.', feeds: ['https://www.lemonde.fr/rss/une.xml'] },
  { cc: 'de', region: 'Germany', id: 'tag', name: 'tagesschau', domain: 'tagesschau.de', kind: 'public', about: 'German public broadcaster’s news.', feeds: ['https://www.tagesschau.de/index~rss2.xml'] },
  { cc: 'it', region: 'Italy', id: 'ans', name: 'ANSA', domain: 'ansa.it', kind: 'agency', about: 'Italy’s main news agency.', feeds: ['https://www.ansa.it/sito/ansait_rss.xml'] },
  { cc: 'pt', region: 'Portugal', id: 'rtp', name: 'RTP Notícias', domain: 'rtp.pt', kind: 'public', about: 'Portugal’s public broadcaster.', feeds: ['https://www.rtp.pt/noticias/rss'] },
  { cc: 'br', region: 'Brazil', id: 'g1', name: 'g1', domain: 'g1.globo.com', kind: 'commercial', about: 'Brazil’s largest news portal.', feeds: ['https://g1.globo.com/rss/g1/'] },
];

const clean = (h: string) => {
  const d = new DOMParser().parseFromString(`<body>${h}</body>`, 'text/html');
  return (d.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};
/** "Lee también…", "Seguir leyendo", a trailing "[…]": what feeds add after the summary */
const trimSummary = (s: string) =>
  s
    .replace(/\s*(Seguir leyendo|Leer más|Lire la suite|Weiterlesen|Leia mais|Continua a leggere|Read more)\b.*$/i, '')
    .replace(/\s*\[…\]|\s*\[\.\.\.\]$/, '')
    .replace(/\s*…$/, '…')
    .trim();
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

interface Item {
  title: string;
  link: string;
  summary: string;
  image?: string;
  time: number;
  o: O;
}
function parse(xml: string, o: O): Item[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const out: Item[] = [];
  for (const it of Array.from(doc.querySelectorAll('item, entry')).slice(0, 16)) {
    const pick = (sel: string) => it.getElementsByTagName(sel)[0]?.textContent?.trim() ?? '';
    const title = clean(pick('title'));
    const link = pick('link') || it.querySelector('link')?.getAttribute('href') || '';
    const raw = pick('description') || pick('summary') || pick('content:encoded') || pick('content');
    let image =
      it.getElementsByTagName('media:content')[0]?.getAttribute('url') ||
      it.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url') ||
      Array.from(it.getElementsByTagName('enclosure')).find((e) => /^image\//.test(e.getAttribute('type') ?? '') || /\.(jpe?g|png|webp)/i.test(e.getAttribute('url') ?? ''))?.getAttribute('url') ||
      undefined;
    if (!image) image = /<img[^>]+src=["']([^"']+)["']/i.exec(raw)?.[1];
    const when = Date.parse(pick('pubDate') || pick('dc:date') || pick('published') || pick('updated'));
    const summary = trimSummary(clean(raw));
    if (!title || !link) continue;
    out.push({ title, link, summary, image: image?.replace(/^http:/, 'https:'), time: Number.isFinite(when) ? when : Date.now(), o });
  }
  return out;
}

/** A request that gives up after `ms`: one outlet that never answers must not hold up the others. */
async function timed(url: string, ms = 9000): Promise<Response | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let t = 0;
  try {
    return await Promise.race([
      fetch(url, ctl ? { signal: ctl.signal } : undefined),
      new Promise<null>((r) => {
        t = window.setTimeout(() => {
          ctl?.abort();
          r(null);
        }, ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** The picture an article page announces for sharing (og:image), when its feed gave none. */
async function ogImage(url: string): Promise<string | undefined> {
  try {
    const r = await timed(url, 6000);
    if (!r?.ok) return;
    const h = (await r.text()).slice(0, 200_000);
    const u = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(h)?.[1] ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i.exec(h)?.[1];
    return u?.replace(/&amp;/g, '&').replace(/^http:/, 'https:');
  } catch {
    return undefined;
  }
}

export const hasOutlets = (cc: string) => OUTLETS.some((o) => o.cc === cc);

/** Google News for the country: the last resort when the outlets' own feeds give nothing (headlines and outlet names only). */
const GN: Record<string, [string, string]> = { es: ['es', 'ES'], mx: ['es-419', 'MX'], ar: ['es-419', 'AR'], co: ['es-419', 'CO'], cl: ['es-419', 'CL'], pe: ['es-419', 'PE'], fr: ['fr', 'FR'], de: ['de', 'DE'], it: ['it', 'IT'], pt: ['pt-PT', 'PT'], br: ['pt-BR', 'BR'] };
async function googleNews(cc: string): Promise<Item[]> {
  const g = GN[cc];
  if (!g) return [];
  const r = await timed(`https://news.google.com/rss?hl=${g[0]}&gl=${g[1]}&ceid=${g[1]}:${g[0].split('-')[0]}`);
  if (!r?.ok) return [];
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml');
  const region = OUTLETS.find((o) => o.cc === cc)?.region ?? cc.toUpperCase();
  const out: Item[] = [];
  for (const it of Array.from(doc.querySelectorAll('item')).slice(0, 24)) {
    const src = it.getElementsByTagName('source')[0];
    const outlet = src?.textContent?.trim() || 'Google News';
    const title = clean(it.getElementsByTagName('title')[0]?.textContent ?? '').replace(new RegExp(`\\s+-\\s+${outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
    const link = it.getElementsByTagName('link')[0]?.textContent?.trim() ?? '';
    const when = Date.parse(it.getElementsByTagName('pubDate')[0]?.textContent ?? '');
    if (!title || !link) continue;
    let domain = '';
    try {
      domain = new URL(src?.getAttribute('url') ?? '').hostname.replace(/^www\./, '');
    } catch {
      /* no address */
    }
    const o: O = { cc, region, id: 'gn' + hash(outlet), name: outlet, domain, kind: 'commercial', about: `${region} news outlet.`, feeds: [] };
    out.push({ title, link, summary: '', time: Number.isFinite(when) ? when : Date.now(), o });
  }
  return out;
}

type Local = { at: number; stories: Story[]; sources: Record<string, Outlet> };
/** Up to 24 stories from the country's outlets, taking turns so one outlet does not fill the list. */
export async function fetchLocal(cc: string, force = false): Promise<{ stories: Story[]; sources: Record<string, Outlet> }> {
  const key = `localnews:${cc}`;
  const hit = await db.get<Local>('kv', key).catch(() => undefined);
  if (!force && hit && Date.now() - hit.at < 90 * 60_000 && hit.stories.length) return hit;
  const outlets = OUTLETS.filter((o) => o.cc === cc);
  const now = Date.now();
  const lists = await Promise.all(
    outlets.map(async (o) => {
      const got: Item[] = [];
      for (const url of o.feeds) {
        const r = await timed(url);
        if (!r?.ok) continue;
        try {
          got.push(...parse(await r.text(), o).filter((x) => now - x.time < 72 * 3600e3));
        } catch {
          /* a feed that is not readable is skipped */
        }
      }
      return got;
    }),
  );
  // nothing from the outlets themselves (blocked, down, or changed address): the country's headlines from Google News
  if (lists.every((l) => !l.length)) lists.push(await googleNews(cc).catch(() => []));
  const picked: Item[] = [];
  const seen = new Set<string>();
  for (let i = 0; picked.length < 24 && i < 24; i++)
    for (const l of lists) {
      const it = l[i];
      if (!it || picked.length >= 24) continue;
      const k = it.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) continue;
      seen.add(k);
      picked.push(it);
    }
  // stories without a picture get the one their article page names (a few at a time, never waiting long)
  const need = picked.filter((it) => !it.image && !/news\.google\.com/.test(it.link)).slice(0, 12);
  for (let i = 0; i < need.length; i += 4) await Promise.all(need.slice(i, i + 4).map(async (it) => (it.image = await ogImage(it.link))));
  const stories: Story[] = picked
    .sort((a, b) => b.time - a.time)
    .map((it) => ({
      id: 'l' + hash(it.link),
      title: it.title,
      summary: cleanSummary(it.summary.length > 420 ? it.summary.slice(0, 420) : it.summary),
      image: it.image ?? '',
      imageFrom: it.image ? it.o.name : '',
      time: it.time,
      topic: 'world',
      local: true,
      sources: [{ id: it.o.id, title: it.title, url: it.link }],
    }));
  const sources: Record<string, Outlet> = {};
  for (const it of picked) sources[it.o.id] = { name: it.o.name, region: it.o.region, domain: it.o.domain, kind: it.o.kind, lean: null, about: it.o.about };
  if (stories.length) {
    await db.put('kv', key, { at: Date.now(), stories, sources }).catch(() => {});
    return { stories, sources };
  }
  // offline or every source failed: yesterday's list is better than none
  if (hit?.stories.length && Date.now() - hit.at < 36 * 3600e3) return hit;
  return { stories, sources };
}

export type LocalState = 'idle' | 'loading' | 'done' | 'failed';
/** The day's file, with the reader's country's stories added when the file has none for it; `state` says how fetching went. */
export function useWithLocal(d: Daily, home: string): { d: Daily; state: LocalState; retry: () => void } {
  const [extra, setExtra] = useState<{ cc: string; stories: Story[]; sources: Record<string, Outlet> } | null>(null);
  const [state, setState] = useState<LocalState>('idle');
  const [n, setN] = useState(0);
  const missing = !d.local?.[home]?.length && hasOutlets(home);
  useEffect(() => {
    if (!missing) return;
    let live = true;
    setState('loading');
    fetchLocal(home, n > 0).then(
      (r) => {
        if (!live) return;
        setExtra({ cc: home, ...r });
        setState(r.stories.length ? 'done' : 'failed');
      },
      () => live && setState('failed'),
    );
    return () => {
      live = false;
    };
  }, [missing, home, n]);
  const retry = () => setN((x) => x + 1);
  if (!missing) return { d, state: 'done', retry };
  if (!extra || extra.cc !== home || !extra.stories.length) return { d, state, retry };
  return { d: { ...d, local: { ...(d.local ?? {}), [home]: extra.stories }, sources: { ...extra.sources, ...(d.sources ?? {}) } }, state, retry };
}
