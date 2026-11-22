// Languages: English, Spanish and French. The interface text is translated by phrase: the English text in the code is the key, and the
// translations are looked up as the screens are drawn (and re-looked-up when they change). Anything not in the dictionary stays in
// English — never a blank or a key. Books, news and anything the reader or an outlet wrote are never touched.
import { useEffect, useState } from 'react';
import { EXTRA } from './i18n-extra';
import { MORE } from './i18n-more';
import { NEW } from './i18n-new';
import { ES } from './i18n-es';
import { FR } from './i18n-fr';

export type Lang = 'en' | 'es' | 'fr';
export type LangPref = 'auto' | Lang;
const KEY = 'ui:lang';
const bus = new EventTarget();

const systemLang = (): Lang => {
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return l === 'es' || l === 'fr' ? l : 'en';
};
export const getPref = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'es' || v === 'fr' ? v : 'auto';
  } catch {
    return 'auto';
  }
};
export const getLang = (): Lang => {
  const p = getPref();
  return p === 'auto' ? systemLang() : p;
};
export function setPref(p: LangPref) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = getLang();
  bus.dispatchEvent(new Event('lang'));
  retranslate();
}
/** the locale for dates and times: the app's language if the reader picked one, otherwise the phone's own */
export const loc = (): string | undefined => (getPref() === 'auto' ? undefined : getLang());
export function useLang(): [Lang, LangPref, (p: LangPref) => void] {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    bus.addEventListener('lang', f);
    return () => bus.removeEventListener('lang', f);
  }, []);
  return [getLang(), getPref(), setPref];
}

const TABLES: Record<Lang, Map<string, string>> = {
  en: new Map(),
  es: new Map([...ES, ...[...EXTRA, ...MORE, ...NEW].map((e): [string, string] => [e[0], e[1]])]),
  fr: new Map([...FR, ...[...EXTRA, ...MORE, ...NEW].map((e): [string, string] => [e[0], e[2]])]),
};
/** phrases with a number or a name in them: "12 min left", "level 3" */
const PATTERNS: { re: RegExp; es: string; fr: string }[] = [
  { re: /^(\d+) min left$/, es: '$1 min restantes', fr: '$1 min restantes' },
  { re: /^(\d+)m left$/, es: '$1 min restantes', fr: '$1 min restantes' },
  { re: /^(\d+) of (\d+) free questions left today$/, es: '$1 de $2 preguntas gratis hoy', fr: '$1 questions gratuites sur $2 aujourd’hui' },
  { re: /^level (\d+)$/, es: 'nivel $1', fr: 'niveau $1' },
  { re: /^sling level (\d+) · deep cuts level (\d+)$/, es: 'honda nivel $1 · joyas ocultas nivel $2', fr: 'fronde niveau $1 · pépites niveau $2' },
  { re: /^(\d+) min to today’s goal$/, es: '$1 min para la meta de hoy', fr: '$1 min pour l’objectif du jour' },
  { re: /^from (\d+) days? ago · waiting for a fresh copy$/, es: 'de hace $1 d · esperando una copia nueva', fr: 'd’il y a $1 j · en attente d’une copie à jour' },
  { re: /^offline · from (\d+) days? ago · waiting for a fresh copy$/, es: 'sin conexión · de hace $1 d · esperando una copia nueva', fr: 'hors ligne · d’il y a $1 j · en attente d’une copie à jour' },
  { re: /^updated today (.+)$/, es: 'actualizado hoy $1', fr: 'mis à jour aujourd’hui $1' },
  { re: /^offline · updated today (.+)$/, es: 'sin conexión · actualizado hoy $1', fr: 'hors ligne · mis à jour aujourd’hui $1' },
  { re: /^updated today (.+) · refreshes through the day$/, es: 'actualizado hoy $1 · se renueva durante el día', fr: 'mis à jour aujourd’hui $1 · se renouvelle dans la journée' },
  { re: /^updated yesterday (.+) · refreshes through the day$/, es: 'actualizado ayer $1 · se renueva durante el día', fr: 'mis à jour hier $1 · se renouvelle dans la journée' },
  { re: /^offline · updated today (.+) · refreshes through the day$/, es: 'sin conexión · actualizado hoy $1 · se renueva durante el día', fr: 'hors ligne · mis à jour aujourd’hui $1 · se renouvelle dans la journée' },
  { re: /^offline · updated yesterday (.+) · refreshes through the day$/, es: 'sin conexión · actualizado ayer $1 · se renueva durante el día', fr: 'hors ligne · mis à jour hier $1 · se renouvelle dans la journée' },
  { re: /^(\d+) of 5 blocks toward a freeze day$/, es: '$1 de 5 bloques hacia un día de congelación', fr: '$1 bloc(s) sur 5 vers un jour de gel' },
  { re: /^(\d+)\/5 · a block comes only when Froggy reaches the top$/, es: '$1/5 · solo se gana un bloque cuando Froggy llega arriba', fr: '$1/5 · un bloc ne vient que lorsque Froggy arrive en haut' },
  { re: /^Preparing Liquid mode, (\d+)%$/, es: 'Preparando el modo Líquido, $1 %', fr: 'Préparation du mode Liquide, $1 %' },
  { re: /^Reading the pictures, (\d+)%$/, es: 'Leyendo las imágenes, $1 %', fr: 'Lecture des images, $1 %' },
  { re: /^Open (.+)$/, es: 'Abrir $1', fr: 'Ouvrir $1' },
  { re: /^Last (\d+) days$/, es: 'Últimos $1 días', fr: '$1 derniers jours' },
  { re: /^(\d+) days?$/, es: '$1 días', fr: '$1 jours' },
  { re: /^(\d+) of (\d+)$/, es: '$1 de $2', fr: '$1 sur $2' },
  { re: /^shelf · (\d+)$/, es: 'estantería · $1', fr: 'étagère · $1' },
  { re: /^(\d+) outlets?$/, es: '$1 medios', fr: '$1 médias' },
  { re: /^(\d+) stor(?:y|ies)$/, es: '$1 noticias', fr: '$1 articles' },
  { re: /^(\d+)\/5 · a block comes only when Froggy reaches the top$/, es: '$1/5 · solo hay bloque cuando Froggy llega arriba', fr: '$1/5 · un bloc seulement quand Froggy arrive en haut' },
  { re: /^updated today (.+)$/, es: 'actualizado hoy $1', fr: 'mis à jour aujourd’hui $1' },
  { re: /^(\d+) questions so far$/, es: '$1 preguntas hasta ahora', fr: '$1 questions jusqu’ici' },
  { re: /^in (\d+) days$/, es: 'en $1 días', fr: 'dans $1 jours' },
  { re: /^in (\d+) weeks$/, es: 'en $1 semanas', fr: 'dans $1 semaines' },
  { re: /^in (\d+) months$/, es: 'en $1 meses', fr: 'dans $1 mois' },
  { re: /^tomorrow$/, es: 'mañana', fr: 'demain' },
  { re: /^Welcome, step (\d+) of (\d+)$/, es: 'Bienvenida, paso $1 de $2', fr: 'Bienvenue, étape $1 sur $2' },
  { re: /^Daily goal: (\d+) of (\d+) minutes$/, es: 'Meta diaria: $1 de $2 minutos', fr: 'Objectif du jour : $1 sur $2 minutes' },
  { re: /^Books finished: (\d+)$/, es: 'Libros terminados: $1', fr: 'Livres terminés : $1' },
  { re: /^Froggy, looking (\w+)$/, es: 'Froggy, con cara de $1', fr: 'Froggy, l’air $1' },
  { re: /^today$/, es: 'hoy', fr: 'aujourd’hui' },
  { re: /^now$/, es: 'ahora', fr: 'maintenant' },
  { re: /^yesterday$/, es: 'ayer', fr: 'hier' },
  { re: /^on now · (\d+) days? left$/, es: 'en curso · quedan $1 d', fr: 'en cours · encore $1 j' },
  { re: /^ended (\d+) days ago$/, es: 'terminó hace $1 días', fr: 'terminé il y a $1 jours' },
  { re: /^in ([\d.]+) years$/, es: 'en $1 años', fr: 'dans $1 ans' },
  { re: /^(\d+)\s?m ago$/, es: 'hace $1 min', fr: 'il y a $1 min' },
  { re: /^(\d+)\s?min ago$/, es: 'hace $1 min', fr: 'il y a $1 min' },
  { re: /^(\d+)\s?h ago$/, es: 'hace $1 h', fr: 'il y a $1 h' },
  { re: /^(\d+)\s?d ago$/, es: 'hace $1 d', fr: 'il y a $1 j' },
  { re: /^(\d+)\s?w ago$/, es: 'hace $1 sem', fr: 'il y a $1 sem' },
  { re: /^(\d+) fields filled$/, es: '$1 campos rellenados', fr: '$1 champs remplis' },
  { re: /^(\d+) on today$/, es: '$1 hoy', fr: '$1 aujourd’hui' },
  { re: /^updated (\d{1,2}:\d{2})$/, es: 'actualizado $1', fr: 'mis à jour $1' },
  { re: /^Show all (\d+)$/, es: 'Ver los $1', fr: 'Afficher les $1' },
  { re: /^nothing on your shelf matches “(.+)”$/, es: 'nada en tu estantería coincide con “$1”', fr: 'rien sur votre étagère ne correspond à « $1 »' },
];

export function tr(s: string, lang: Lang = getLang()): string {
  if (lang === 'en') return s;
  const lead = s.match(/^\s*/)![0];
  const trail = s.match(/\s*$/)![0];
  const core = s.trim();
  if (!core) return s;
  const hit = TABLES[lang].get(core);
  if (hit) return lead + hit + trail;
  for (const p of PATTERNS) if (p.re.test(core)) return lead + core.replace(p.re, p[lang]) + trail;
  const place = countryName(core, lang);
  if (place) return lead + place + trail;
  const dated = monthWords(core, lang);
  if (dated !== core) return lead + dated + trail;
  return s;
}

// ------------------------------------------------------------------ names of countries and months, from the phone's own locale data
let byName: Map<string, string> | null = null;
const regionNames = (lang: Lang) => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' });
  } catch {
    return null;
  }
};
/** "Spain" → "España" / "Espagne": any country the phone knows, with no list to keep */
function countryName(core: string, lang: Lang): string | null {
  if (core.length < 4 || core.length > 40 || !/^[A-ZÀ-Ý]/.test(core)) return null;
  if (!byName) {
    byName = new Map([
      ['The Gambia', 'GM'],
      ['Czech Republic', 'CZ'],
      ['Ivory Coast', 'CI'],
      ['Turkey', 'TR'],
      ['Eswatini', 'SZ'],
    ]);
    const en = regionNames('en');
    if (en) for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const cc = String.fromCharCode(a, b);
      const n = en.of(cc);
      if (n && n !== cc) byName.set(n, cc);
    }
  }
  const cc = byName.get(core);
  if (!cc) return null;
  const out = regionNames(lang)?.of(cc);
  return out && out !== cc ? out : null;
}
const MONTHS: Record<'es' | 'fr', { long: string[]; short: string[] }> = {
  es: { long: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], short: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] },
  fr: { long: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], short: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] },
};
const EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_SHORT: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Sept: 8, Oct: 9, Nov: 10, Dec: 11 };
const MONTH_RE = new RegExp(`\\b(${[...EN_LONG, ...Object.keys(EN_SHORT)].join('|')})\\b`, 'g');
/** a short date or range ("13 Dec 2026 – 14 Dec 2026", "August–May", "around 8 February 2027") in the app's language */
function monthWords(core: string, lang: Lang): string {
  if (lang === 'en' || core.length > 48 || !/^[\d\sA-Za-z–\-.,·]+$/.test(core)) return core;
  const names = core.match(MONTH_RE);
  if (!names) return core;
  // a date has a number in it; otherwise only month names and the signs between them ("August–May")
  if (!/\d/.test(core) && core.replace(MONTH_RE, '').replace(/[\s–\-.,·]|to|and/g, '').length) return core;
  const t = MONTHS[lang];
  let out = core.replace(MONTH_RE, (m) => {
    const i = EN_LONG.indexOf(m);
    return i >= 0 ? t.long[i] : t.short[EN_SHORT[m]];
  });
  out = out.replace(/^around /, lang === 'es' ? 'hacia el ' : 'vers le ').replace(/^from /, lang === 'es' ? 'desde ' : 'à partir de ');
  // Spanish writes "8 de febrero de 2027"
  if (lang === 'es') out = out.replace(new RegExp(`(\\d+) (${t.long.join('|')})`, 'g'), '$1 de $2').replace(new RegExp(`(${t.long.join('|')}) (\\d{4})`, 'g'), '$1 de $2');
  return out;
}
/** for code that builds a string itself */
export const t = (s: string) => tr(s);

// ------------------------------------------------------------------ the screen: every text node and label is translated in place
const SKIP = 'script, style, textarea, input, pre, code, .flow, .wk-body, .ask-msg, .lk-body, .no-i18n, [contenteditable], .reel-title, .reel-sum, .story-title';
const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
/** what we last wrote into a node, and the English it came from (so a language switch can start from the English) */
const orig = new WeakMap<Node, { base: string; shown: string }>();
const origAttr = new WeakMap<Element, Record<string, { base: string; shown: string }>>();
let busy = false;

function textNode(n: Text, lang: Lang) {
  const el = n.parentElement;
  if (!el || el.closest(SKIP)) return;
  const cur = n.nodeValue ?? '';
  const rec = orig.get(n);
  // React may have put new English text in since we translated it: then what is there now is the English
  const base = rec && cur === rec.shown ? rec.base : cur;
  const out = tr(base, lang);
  if (out !== base || rec) orig.set(n, { base, shown: out });
  if (cur !== out) n.nodeValue = out;
}
function attrs(el: Element, lang: Lang) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v === null) continue;
    const all = origAttr.get(el) ?? {};
    const rec = all[a];
    const base = rec && v === rec.shown ? rec.base : v;
    const out = tr(base, lang);
    if (out !== base || rec) {
      all[a] = { base, shown: out };
      origAttr.set(el, all);
    }
    if (v !== out) el.setAttribute(a, out);
  }
}
function walk(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) return textNode(root as Text, lang);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest(SKIP) && el !== document.body) return;
  attrs(el, lang);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) textNode(n as Text, lang);
    else attrs(n as Element, lang);
  }
}
export function retranslate() {
  if (busy || typeof document === 'undefined') return;
  busy = true;
  try {
    walk(document.body, getLang());
  } finally {
    busy = false;
  }
}

let started = false;
export function startI18n() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.documentElement.lang = getLang();
  let raf = 0;
  const pending = new Set<Node>();
  const flush = () => {
    raf = 0;
    const lang = getLang();
    busy = true;
    try {
      pending.forEach((n) => n.isConnected && walk(n, lang));
    } finally {
      pending.clear();
      busy = false;
    }
  };
  new MutationObserver((muts) => {
    if (busy) return;
    if (getLang() === 'en') return;
    for (const m of muts) pending.add(m.type === 'childList' ? (m.target as Node) : m.type === 'characterData' ? m.target.parentNode ?? m.target : m.target);
    if (!raf) raf = requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  retranslate();
}
