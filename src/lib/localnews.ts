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

/** The picture an article page announces for sharing (og:image), when its feed gave none. */
async function ogImage(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const h = (await r.text()).slice(0, 200_000);
    return /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(h)?.[1] ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i.exec(h)?.[1];
  } catch {
    return undefined;
  }
}

export const hasOutlets = (cc: string) => OUTLETS.some((o) => o.cc === cc);

/** Up to 24 stories from the country's outlets, taking turns so one outlet does not fill the list. */
export async function fetchLocal(cc: string): Promise<{ stories: Story[]; sources: Record<string, Outlet> }> {
  const key = `localnews:${cc}`;
  const hit = await db.get<{ at: number; stories: Story[]; sources: Record<string, Outlet> }>('kv', key).catch(() => undefined);
  if (hit && Date.now() - hit.at < 90 * 60_000 && hit.stories.length) return hit;
  const outlets = OUTLETS.filter((o) => o.cc === cc);
  const now = Date.now();
  const lists = await Promise.all(
    outlets.map(async (o) => {
      const got: Item[] = [];
      for (const url of o.feeds) {
        try {
          const r = await fetch(url);
          if (r.ok) got.push(...parse(await r.text(), o).filter((x) => now - x.time < 48 * 3600e3 && x.summary.length >= 40));
        } catch {
          /* an outlet that is down is skipped */
        }
      }
      return got;
    }),
  );
  const picked: Item[] = [];
  const seen = new Set<string>();
  for (let i = 0; picked.length < 24 && i < 16; i++)
    for (const l of lists) {
      const it = l[i];
      if (!it || picked.length >= 24) continue;
      const k = it.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) continue;
      seen.add(k);
      picked.push(it);
    }
  // a few stories without a picture get the one their article page names
  let og = 0;
  for (const it of picked) if (!it.image && og++ < 8) it.image = await ogImage(it.link);
  const stories: Story[] = picked
    .filter((it) => it.image)
    .sort((a, b) => b.time - a.time)
    .map((it) => ({
      id: 'l' + hash(it.link),
      title: it.title,
      summary: cleanSummary(it.summary.length > 420 ? it.summary.slice(0, 420) : it.summary),
      image: it.image!,
      imageFrom: it.o.name,
      time: it.time,
      topic: 'world',
      local: true,
      sources: [{ id: it.o.id, title: it.title, url: it.link }],
    }));
  const sources: Record<string, Outlet> = {};
  for (const o of outlets) sources[o.id] = { name: o.name, region: o.region, domain: o.domain, kind: o.kind, lean: null, about: o.about };
  if (stories.length) await db.put('kv', key, { at: Date.now(), stories, sources }).catch(() => {});
  return { stories, sources };
}

/** The day's file, with the reader's country's stories added when the file has none for it. */
export function useWithLocal(d: Daily, home: string): Daily {
  const [extra, setExtra] = useState<{ cc: string; stories: Story[]; sources: Record<string, Outlet> } | null>(null);
  const missing = !(d.local?.[home]?.length) && hasOutlets(home);
  useEffect(() => {
    if (!missing) return;
    let live = true;
    fetchLocal(home).then((r) => live && setExtra({ cc: home, ...r }), () => {});
    return () => {
      live = false;
    };
  }, [missing, home]);
  if (!missing || !extra || extra.cc !== home || !extra.stories.length) return d;
  return { ...d, local: { ...(d.local ?? {}), [home]: extra.stories }, sources: { ...extra.sources, ...(d.sources ?? {}) } };
}
