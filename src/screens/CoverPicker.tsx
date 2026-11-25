// The book's menu → Change cover: covers of the book's editions and fitting pictures, the cover from the file, a typeset one, or a photo.
import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import type { DocMeta } from '../lib/types';
import { coverChoices, useCover, useTypesetCover, type CoverChoice } from '../lib/covers';
import { refreshCover } from '../lib/library';
import { Sheet, toast, PixelLoader } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { tap } from '../lib/native';

export function CoverPicker({ doc, onClose }: { doc: DocMeta | null; onClose: () => void }) {
  const [list, setList] = useState<CoverChoice[] | null>(null);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!doc) return;
    setList(null);
    setBad(new Set());
    coverChoices(doc).then(setList, () => setList([]));
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!doc) return null;
  const pick = async (key: string, run: () => Promise<boolean | void>) => {
    tap('select');
    setBusy(key);
    const ok = await run().catch(() => false);
    setBusy(null);
    if (ok === false) toast(tr('That picture could not be used — try another'));
    else {
      toast(tr('Cover changed'));
      onClose();
    }
  };
  const shown = (list ?? []).filter((c) => !bad.has(c.url));
  return (
    <Sheet open={!!doc} onClose={onClose} title={tr('Change cover')} className="cover-pick">
      <div className="cp-grid">
        <button className="cp-own" onClick={() => void pick('file', () => refreshCover(doc))} disabled={!!busy}>
          <Icon name="page" size={22} />
          <span>{tr('From the file')}</span>
        </button>
        <button className="cp-own" onClick={() => void pick('type', () => useTypesetCover(doc))} disabled={!!busy}>
          <Icon name="text" size={22} />
          <span>{tr('Title only')}</span>
        </button>
        <button className="cp-own" onClick={() => file.current?.click()} disabled={!!busy}>
          <Icon name="image" size={22} />
          <span>{tr('A photo')}</span>
        </button>
      </div>
      {(['edition', 'art'] as const).map((k) => {
        const group = shown.filter((c) => c.kind === k);
        if (!group.length) return null;
        return (
          <div key={k}>
            <div className="cp-head">{k === 'edition' ? tr('Covers of this book') : tr('Open pictures that fit — the title is set over them')}</div>
            <div className="cp-grid">
              {group.map((c) => (
                <button key={c.url} className={`cp-item${busy === c.url ? ' busy' : ''}`} onClick={() => void pick(c.url, () => useCover(doc, c))} disabled={!!busy} aria-label={`${tr('Cover from')} ${c.from}`}>
                  <img
                    src={c.thumb}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      const im = e.currentTarget;
                      // a missing cover comes back as a tiny blank picture
                      if (im.naturalWidth < 40 || im.naturalHeight < 40) setBad((b) => new Set(b).add(c.url));
                    }}
                    onError={() => setBad((b) => new Set(b).add(c.url))}
                  />
                  <small className="no-i18n">{c.credit ? `${c.from} · ${c.credit}` : c.from}</small>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!list && (
        <div style={{ padding: '18px 0' }}>
          <PixelLoader size={5} label={tr('finding covers')} />
        </div>
      )}
      {list && !shown.length && <p className="row-sub" style={{ padding: '8px 4px' }}>{tr('No other covers found for this title. You can still use a photo, the file’s own first page, or a cover with the title.')}</p>}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick('photo', () => useCover(doc, f));
        }}
      />
    </Sheet>
  );
}
