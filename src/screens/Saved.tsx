// Saved: every highlight from every book, one lean card each. Tap a card to open it up (the whole passage, the book, when it was
// saved, a note), and from there go back to the place in the book, copy, share or remove it.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as db from '../lib/db';
import { tr, loc } from '../lib/i18n';
import { useStore } from '../lib/store';
import type { DocMeta, Highlight } from '../lib/types';
import { coverUrl } from '../lib/library';
import { onBack, shareText, tap } from '../lib/native';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/kit';
import { define, looksDrawn, normalizeWord, sameSubject, wiki, type Definition, type WikiImage } from '../lib/lookup';
import { getLang } from '../lib/i18n';

type Kind = 'word' | 'sentence' | 'passage';
type Layout = 'cards' | 'grid' | 'books';
type Sort = 'new' | 'old' | 'book';
export const kindOf = (text: string): Kind => {
  const n = text.trim().split(/\s+/).length;
  return n <= 3 ? 'word' : n <= 40 && !/\n/.test(text.trim()) ? 'sentence' : 'passage';
};
const KIND_LABEL: Record<Kind, string> = { word: 'Words', sentence: 'Sentences', passage: 'Paragraphs' };

export const SAVES_EVENT = 'frogity:saves';
/** another screen saved or removed something: the list reloads */
export const savesChanged = () => window.dispatchEvent(new Event(SAVES_EVENT));
/** open a book at a saved passage (App listens, the reader finds it) */
export const OPEN_SAVE_EVENT = 'frogity:open-save';

export async function allSaves(): Promise<Highlight[]> {
  const all = await db.entries<Highlight>('marks').catch(() => [] as [string, Highlight][]);
  return all.filter(([k, v]) => k.includes(':h:') && v && 'text' in v).map(([, v]) => v);
}

/**
 * A saved word, opened: the same picture and meaning the word sheet shows in the book (the article's lead picture from
 * Wikipedia / Wikimedia Commons, and the dictionary's first senses), so a word reads the same here as on the page.
 */
function WordPeek({ text, lang }: { text: string; lang?: string }) {
  const w = normalizeWord(text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  const [def, setDef] = useState<Definition | null | undefined>();
  const [pics, setPics] = useState<WikiImage[] | null | undefined>();
  const [k, setK] = useState(0);
  const img = pics === undefined ? undefined : pics?.[k] ?? null;
  const bad = false;
  const setBad = (_: boolean) => setK((x) => x + 1); // a picture that will not do: the next one
  useEffect(() => {
    let live = true;
    setDef(undefined);
    setPics(undefined);
    setK(0);
    // the book's language when it was saved with one; otherwise English, then the reader's own
    const langs = [...new Set([lang, 'en', getLang()].filter((l): l is string => !!l))];
    (async () => {
      for (const l of langs) {
        const d = await define(w, l).catch(() => null);
        if (d?.meanings.length) return d;
      }
      return null;
    })().then((d) => live && setDef(d));
    wiki(w)
      .then((card) => {
        if (!live) return;
        // only a picture of this very thing (not of a namesake article)
        const ok = card && (sameSubject(w, card) || /\s/.test(w)) ? [...card.images].sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0)) : [];
        setPics(ok.length ? ok : null);
      })
      .catch(() => live && setPics(null));
    return () => {
      live = false;
    };
  }, [w, lang]);
  const senses = def?.meanings.flatMap((m) => m.defs.slice(0, 2).map((d) => ({ pos: m.pos, d: d.d }))).slice(0, 3) ?? [];
  if (def === null && img === null) return null;
  return (
    <div className="sv-peek">
      {img === undefined ? (
        <div className="sv-pic wait" aria-hidden />
      ) : (
        img &&
        !bad && (
          <figure className="sv-pic">
            <img src={img.src} alt={img.title} loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setBad(true)} onLoad={(e) => looksDrawn(e.currentTarget) && setBad(true)} draggable={false} />
            {img.credit && <figcaption className="mono">{img.credit}</figcaption>}
          </figure>
        )
      )}
      <div className="sv-def">
        {def?.phonetic && <span className="sv-ph mono">{def.phonetic}</span>}
        {def === undefined ? (
          <span className="sv-def-wait" />
        ) : (
          senses.map((s, i) => (
            <p key={i}>
              <i className="mono">{s.pos}</i> {s.d}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function Cover({ doc }: { doc?: DocMeta }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    if (doc) coverUrl(doc).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [doc?.coverId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className="sv-cover">{url ? <img src={url} alt="" draggable={false} /> : <Icon name="book" size={14} />}</span>;
}

export function Saved({ open, onClose }: { open: boolean; onClose: () => void }) {
  const docs = useStore((s) => s.docs);
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [layout, setLayout] = useState<Layout>(() => (localStorage.getItem('saves:layout') as Layout) || 'cards');
  const [sort, setSort] = useState<Sort>('new');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [book, setBook] = useState<string | 'all'>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = () => allSaves().then(setItems);
    load();
    window.addEventListener(SAVES_EVENT, load);
    return () => window.removeEventListener(SAVES_EVENT, load);
  }, [open]);
  const close = () => {
    setClosing(true);
    setTimeout(() => (setClosing(false), onClose()), 220);
  };
  useEffect(() => {
    if (!open) return;
    return onBack(() => {
      if (openId) setOpenId(null);
      else close();
      return true;
    });
  }, [open, openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      localStorage.setItem('saves:layout', layout);
    } catch {
      /* private mode */
    }
  }, [layout]);

  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const books = useMemo(() => {
    const n = new Map<string, number>();
    for (const h of items ?? []) n.set(h.docId, (n.get(h.docId) ?? 0) + 1);
    return [...n].filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]);
  }, [items, byId]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const l = (items ?? []).filter(
      (h) =>
        byId.has(h.docId) &&
        (kind === 'all' || kindOf(h.text) === kind) &&
        (book === 'all' || h.docId === book) &&
        (!ql || h.text.toLowerCase().includes(ql) || (h.note ?? '').toLowerCase().includes(ql) || (byId.get(h.docId)?.name ?? '').toLowerCase().includes(ql)),
    );
    if (sort === 'new') l.sort((a, b) => b.at - a.at);
    else if (sort === 'old') l.sort((a, b) => a.at - b.at);
    else l.sort((a, b) => (byId.get(a.docId)?.name ?? '').localeCompare(byId.get(b.docId)?.name ?? '') || (a.progress ?? 0) - (b.progress ?? 0));
    return l;
  }, [items, kind, book, q, sort, byId]);

  const remove = async (h: Highlight) => {
    await db.del('marks', `${h.docId}:h:${h.id}`);
    setItems((l) => (l ?? []).filter((x) => x.id !== h.id));
    setOpenId(null);
    toast(tr('Removed from Saved'));
  };
  const saveNote = async (h: Highlight, note: string) => {
    const n = { ...h, note: note.trim() || undefined };
    await db.put('marks', `${h.docId}:h:${h.id}`, n);
    setItems((l) => (l ?? []).map((x) => (x.id === h.id ? n : x)));
  };
  const goTo = (h: Highlight) => {
    window.dispatchEvent(new CustomEvent(OPEN_SAVE_EVENT, { detail: { docId: h.docId, id: h.id } }));
    close();
  };

  if (!open) return null;
  const counts: Record<Kind, number> = { word: 0, sentence: 0, passage: 0 };
  for (const h of items ?? []) if (byId.has(h.docId)) counts[kindOf(h.text)]++;
  const card = (h: Highlight) => {
    const d = byId.get(h.docId);
    const isOpen = openId === h.id;
    const k = kindOf(h.text);
    return (
      <div key={h.id} className={`sv-card k-${k}${isOpen ? ' open' : ''}`}>
        <button className="sv-face" onClick={() => (tap('select'), setOpenId(isOpen ? null : h.id))} aria-expanded={isOpen}>
          <span className="sv-text">{k === 'word' ? h.text.trim() : `“${h.text.trim()}”`}</span>
          <span className="sv-meta">
            {layout !== 'books' && <Cover doc={d} />}
            {layout !== 'books' && <span className="sv-book">{d?.name}</span>}
            <span className="sv-date mono">{new Date(h.at).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}</span>
            {h.note && <Icon name="pen" size={12} />}
          </span>
        </button>
        {isOpen && (
          <div className="sv-more">
            {k === 'word' ? <WordPeek text={h.text} lang={h.lang} /> : <div className="sv-full">{h.text.trim()}</div>}
            <div className="sv-info mono">
              {d?.name}
              {d?.author ? ` · ${d.author}` : ''}
              {h.progress != null ? ` · ${Math.round(h.progress * 100)}%` : ''}
              {' · '}
              {new Date(h.at).toLocaleString(loc(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <textarea className="sv-note" placeholder={tr('Add a note…')} defaultValue={h.note ?? ''} rows={2} onBlur={(e) => void saveNote(h, e.target.value)} />
            <div className="sv-acts">
              <button onClick={() => goTo(h)}>
                <Icon name="book" size={16} />
                {tr('Open in book')}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(h.text.trim()).then(() => toast(tr('Copied')), () => {});
                }}
              >
                <Icon name="copy" size={16} />
                {tr('Copy')}
              </button>
              <button onClick={() => void shareText(`“${h.text.trim()}”\n— ${d?.name ?? ''}${d?.author ? `, ${d.author}` : ''}`)}>
                <Icon name="share" size={16} />
                {tr('Share')}
              </button>
              <button className="danger" onClick={() => void remove(h)}>
                <Icon name="trash" size={16} />
                {tr('Remove')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className={`saved${closing ? ' out' : ''}`} role="dialog" aria-label={tr('Saved')}>
      <div className="sv-top">
        <button className="sv-x" onClick={close} aria-label={tr('Close')}>
          <Icon name="back" size={22} />
        </button>
        <h2>{tr('Saved')}</h2>
        <span className="sv-n mono">{items ? list.length : ''}</span>
        <div className="sv-layouts" role="radiogroup" aria-label={tr('Layout')}>
          {(['cards', 'grid', 'books'] as Layout[]).map((l) => (
            <button key={l} className={layout === l ? 'on' : ''} aria-label={tr(l === 'cards' ? 'List' : l === 'grid' ? 'Grid' : 'By book')} onClick={() => (tap('select'), setLayout(l))}>
              <Icon name={l === 'cards' ? 'list' : l === 'grid' ? 'grid' : 'book'} size={17} />
            </button>
          ))}
        </div>
      </div>
      <div className="sv-filters">
        <label className="sv-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search your saves')} />
        </label>
        <div className="sv-chips">
          <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
            {tr('All')}
          </button>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) =>
            counts[k] ? (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? 'all' : k)}>
                {tr(KIND_LABEL[k])} <small className="mono">{counts[k]}</small>
              </button>
            ) : null,
          )}
          <span className="sv-sep" />
          {(['new', 'old', 'book'] as Sort[]).map((s) => (
            <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
              {tr(s === 'new' ? 'Newest' : s === 'old' ? 'Oldest' : 'By title')}
            </button>
          ))}
        </div>
        {books.length > 1 && (
          <div className="sv-chips">
            <button className={book === 'all' ? 'on' : ''} onClick={() => setBook('all')}>
              {tr('Every book')}
            </button>
            {books.map(([id, n]) => (
              <button key={id} className={book === id ? 'on' : ''} onClick={() => setBook(book === id ? 'all' : id)}>
                <Cover doc={byId.get(id)} />
                <span className="sv-chip-t">{byId.get(id)?.name}</span> <small className="mono">{n}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`sv-list l-${layout}`}>
        {items && !list.length ? (
          <div className="sv-empty">
            <Icon name="bookmark" size={28} />
            <p>
              {items.length
                ? tr('Nothing matches these filters.')
                : tr('Nothing saved yet. Select words, a sentence or a paragraph in a book and tap Highlight: it is saved here, with every other one from all your books.')}
            </p>
          </div>
        ) : layout === 'books' ? (
          [...new Set(list.map((h) => h.docId))].map((id) => (
            <section key={id} className="sv-group">
              <div className="sv-ghead">
                <Cover doc={byId.get(id)} />
                <b>{byId.get(id)?.name}</b>
                <small className="mono">{list.filter((h) => h.docId === id).length}</small>
              </div>
              {list.filter((h) => h.docId === id).map(card)}
            </section>
          ))
        ) : (
          list.map(card)
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The first highlight ever: where all of them go. */
export function SavesIntro({ open, onClose, onShow }: { open: boolean; onClose: () => void; onShow: () => void }) {
  useEffect(() => {
    if (!open) return;
    return onBack(() => (onClose(), true));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sv-intro" role="dialog" aria-label={tr('Highlights are saved')}>
        <div className="sv-intro-cards" aria-hidden>
          <span>“…</span>
          <span>“…</span>
          <span>“…</span>
        </div>
        <h3>{tr('Every highlight is saved')}</h3>
        <p>{tr('Words, sentences and paragraphs you highlight are kept in Saved, from all your books, each on its own card. Open it from the bookmark button above your shelf on Home, or from Settings.')}</p>
        <div className="sv-intro-acts">
          <button className="pill ghost" onClick={onClose}>
            {tr('Got it')}
          </button>
          <button className="pill" onClick={onShow}>
            {tr('Show me')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
