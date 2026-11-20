import { tr } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { SOURCES, archivePdf, featuredNow, fetchFile, fetchThumb, lookupCover, peek, search, type Item, type SourceId } from '../lib/catalog';
import { generatedCover, importFile } from '../lib/library';
import { onBack, openExternal, tap } from '../lib/native';
import { Icon } from '../ui/Icon';
import { PixelLoader, toast } from '../ui/kit';

export function Discover({ onClose, onOpen, initial }: { onClose: () => void; onOpen: (id: string) => void; initial?: string }) {
  const [source, setSource] = useState<SourceId>('books');
  const [topic, setTopic] = useState(0);
  const [text, setText] = useState(initial ?? '');
  const [q, setQ] = useState(initial ?? '');
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set()); // several books can be on their way at once
  const [added, setAdded] = useState<Record<string, string>>({}); // item id → doc id
  const [pct, setPct] = useState<Record<string, number>>({}); // how far each download has come
  const seq = useRef(0);
  const src = SOURCES.find((s) => s.id === source)!;
  const query = q || src.topics[topic]?.q || '';

  useEffect(() => onBack(() => (onClose(), true)), [onClose]);

  const load = async (page: number) => {
    const my = ++seq.current;
    setErr(null);
    // the featured shelf is built in: nothing to wait for
    if (source === 'books' && query === 'featured') {
      setItems(featuredNow().items);
      setNext(undefined);
      setLoading(false);
      return;
    }
    // 1. what we already know: shown at once
    const known = await peek(source, query, page);
    if (my !== seq.current) return;
    if (known) {
      setItems((old) => (page === 1 ? known.page.items : [...old, ...known.page.items]));
      setNext(known.page.next);
      setLoading(false);
      if (known.fresh) return;
    } else setLoading(true);
    // 2. ask the catalogue (quietly, if there was something to show)
    try {
      const r = await search(source, query, page);
      if (my !== seq.current) return;
      setItems((old) => (page === 1 ? r.items : [...old.slice(0, (page - 1) * (r.items.length || 20)), ...r.items]));
      setNext(r.next);
    } catch (e) {
      if (my !== seq.current) return;
      if (!known) {
        if (page === 1) setItems([]);
        setErr((e as Error).message || 'Couldn’t reach the catalogue. Are you online?');
      }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };
  useEffect(() => {
    setItems([]);
    setNext(undefined);
    load(1);
  }, [source, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (it: Item) => {
    if (adding.has(it.id)) return;
    setAdding((a) => new Set(a).add(it.id));
    tap('medium');
    try {
      // the cover is found while the file's address is being worked out and while it downloads: the catalogue's own picture first,
      // then a real one looked up by title (never a made-up one when a real one exists)
      const thumb = fetchThumb(it.cover).then(async (b) => b ?? (await lookupCover(it.title, it.author).then(fetchThumb)));
      let g = it.get;
      if (!g && it.source === 'archive') g = await archivePdf(it.id.slice(1));
      if (!g) throw new Error('No free file for this one.');
      const [blob, found] = await Promise.all([fetchFile(g, (f) => setPct((x) => ({ ...x, [it.id]: f }))), thumb]);
      // a big book is never opened just to draw its cover while it is being added: a made-up one stands in for a moment and the real one is drawn in the background
      const cover = found ?? (await generatedCover(it.title, /\.epub$/i.test(g.name) ? 'epub' : 'pdf', it.author));
      const meta = await importFile(blob, g.name, { title: it.title, author: it.author, cover });
      setAdded((a) => ({ ...a, [it.id]: meta.id }));
      toast('Added to your shelf');
    } catch (e) {
      toast(`Couldn’t download that — ${(e as Error).message || 'no answer'}`);
    } finally {
      setAdding((a) => {
        const n = new Set(a);
        n.delete(it.id);
        return n;
      });
      setPct((x) => {
        const { [it.id]: _gone, ...rest } = x;
        return rest;
      });
    }
  };

  return (
    <div className="disc" role="dialog" aria-label={tr("Find free books")}>
      <div className="disc-top">
        <button className="r-ibtn" onClick={onClose} aria-label={tr("Back")}>
          <Icon name="back" size={24} />
        </button>
        <h2>{tr("Find free books")}</h2>
      </div>
      <form
        className="disc-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}
      >
        <Icon name="search" size={18} />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value) setQ('');
          }}
          placeholder={source === 'papers' ? 'search research papers' : source === 'shop' ? 'a title or author' : 'a title, author or subject'}
          enterKeyHint="search"
        />
      </form>
      <div className="disc-src">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            className={s.id === source ? 'on' : ''}
            onClick={() => {
              setSource(s.id);
              setTopic(0);
              setQ('');
              setText('');
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {src.topics.length > 0 && (
        <div className="disc-topics">
          {src.topics.map((t, i) => (
            <button
              key={t.label}
              className={!q && i === topic ? 'on' : ''}
              onClick={() => {
                setTopic(i);
                setQ('');
                setText('');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <p className="disc-note mono">
        {src.sub}
        {source === 'shop' ? ' · only descriptions are shown here; buying or borrowing happens on their site' : ' · free to download'}
      </p>

      <div className="disc-list">
        {items.map((it) => {
          const have = added[it.id];
          const canGet = !!it.get || it.source === 'archive';
          return (
            <div className="disc-row" key={it.id}>
              <ItemCover item={it} />
              <div className="disc-info">
                <div className="name">{it.title}</div>
                {(it.author || it.year) && <div className="by">{[it.author, it.year && !it.author?.includes(String(it.year)) ? it.year : null].filter(Boolean).join(' · ')}</div>}
                {it.blurb && <div className="blurb">{it.blurb}</div>}
                <div className="acts">
                  {it.tag && <span className={`tag mono ${/sale|preview|info/.test(it.tag) ? 'web' : ''}`}>{it.tag}</span>}
                  {canGet ? (
                    have ? (
                      <button className="get done" onClick={() => (onClose(), onOpen(have))}>{tr("Open")}</button>
                    ) : (
                      <button className="get" disabled={adding.has(it.id)} onClick={() => add(it)}>
                        {adding.has(it.id) ? (pct[it.id] ? `${Math.round(pct[it.id] * 100)}%` : <PixelLoader size={3} gap={2} />) : 'Add'}
                      </button>
                    )
                  ) : null}
                  {it.web && (
                    <button className="web-link" onClick={() => openExternal(it.web!)} aria-label={tr("Open on the web")}>
                      <Icon name="globe" size={17} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {loading &&
          !items.length &&
          Array.from({ length: 6 }, (_, k) => (
            <div className="disc-row skel" key={k} aria-hidden>
              <div className="disc-cover" />
              <div className="disc-info">
                <div className="bar w70" />
                <div className="bar w40" />
                <div className="bar w90" />
              </div>
            </div>
          ))}
        {loading && !!items.length && (
          <div className="disc-load">
            <PixelLoader grid={4} size={6} />
          </div>
        )}
        {err && (
          <div className="disc-err">
            {err}
            <button onClick={() => load(1)}>{tr("Try again")}</button>
          </div>
        )}
        {!loading && !err && !items.length && <div className="disc-load mono muted">{source === 'shop' && !q ? 'search for a title or an author' : 'nothing found — try another word'}</div>}
        {!loading && next && (
          <button className="pill ghost" style={{ margin: '14px auto 30px', display: 'flex' }} onClick={() => load(next)}>{tr("More")}</button>
        )}
        <p className="disc-fine mono">{tr("Frogity only fetches files these sites offer for free (public-domain and open-access works). Rights and licences are the sites’ own — check the page behind the globe icon if you plan to share anything.")}</p>
      </div>
    </div>
  );
}

const hue = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
};

/** The cover from the catalogue when there is a real one; otherwise a clean cover made from the title. */
function ItemCover({ item }: { item: Item }) {
  const [bad, setBad] = useState(!item.cover);
  const [src, setSrc] = useState(item.cover);
  const rescued = useRef(false);
  useEffect(() => {
    setBad(!item.cover);
    setSrc(item.cover);
    rescued.current = false;
  }, [item.cover]);
  // the page could not show it: ask the phone's own network stack, which is not bound by the page's rules
  const rescue = async () => {
    if (rescued.current) return setBad(true);
    rescued.current = true;
    // 1. the same picture through the phone's own network stack; 2. a real cover looked up by title; 3. only then a made-up one
    const b = item.cover ? await fetchThumb(item.cover) : undefined;
    if (b) {
      setSrc(URL.createObjectURL(b));
      return setBad(false);
    }
    if (item.source === 'papers') return setBad(true);
    const u = await lookupCover(item.title, item.author);
    const lb = u ? await fetchThumb(u) : undefined;
    if (lb) {
      setSrc(URL.createObjectURL(lb));
      setBad(false);
    } else setBad(true);
  };
  useEffect(() => {
    if (!item.cover && item.source !== 'papers') void rescue(); // no picture at all in the catalogue: look one up straight away
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`disc-cover${bad ? ' gen' : ''}${item.source === 'papers' ? ' paper' : ''}`} style={bad ? ({ ['--h' as string]: hue(item.title) } as React.CSSProperties) : undefined}>
      {src && !bad && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const i = e.currentTarget;
            // catalogues sometimes answer with a blank or tiny placeholder: that is not a cover
            if (i.naturalWidth < 60 || i.naturalHeight < 80 || i.naturalWidth / i.naturalHeight > 1.8) void rescue();
          }}
          onError={() => void rescue()}
        />
      )}
      {bad && (item.source === 'papers' ? (
        <div className="paper-page" aria-hidden>
          <b>{item.title.length > 70 ? item.title.slice(0, 68) + '…' : item.title}</b>
          <i>{item.author}</i>
          <u /><u /><u /><u /><u className="s" />
        </div>
      ) : (
        <div className="gen-book" aria-hidden>
          <b>{item.title.length > 44 ? item.title.slice(0, 42) + '…' : item.title}</b>
          {item.author && <i>{item.author}</i>}
        </div>
      ))}
    </div>
  );
}
