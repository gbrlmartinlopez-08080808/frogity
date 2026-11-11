import { tr } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { Pixel, PixelLoader, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { Art } from '../ui/Art';
import { isNative } from '../lib/native';
import { looksLikeUrl } from '../lib/links';

type Mode = 'menu' | 'link' | 'paste';

export function AddSheet({
  open,
  onClose,
  onFiles,
  onFolder,
  onScan,
  onDiscover,
  onLink,
  onPaste,
  onNote,
  onCancel,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onFiles: () => void;
  onFolder?: () => void;
  onScan: () => void;
  onDiscover: () => void;
  onLink: (url: string) => void;
  onPaste: (text: string, title: string) => void;
  onNote: () => void;
  onCancel?: () => void;
  busy: string | null;
  error: string | null;
}) {
  const [mode, setMode] = useState<Mode>('menu');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (open) {
      setMode('menu');
      setUrl('');
      setText('');
      setTitle('');
      // peek at the clipboard: a copied link is the most likely thing to add
      navigator.clipboard
        ?.readText?.()
        .then((c) => {
          if (c && looksLikeUrl(c.trim())) setUrl(c.trim());
        })
        .catch(() => {});
    }
  }, [open]);

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={mode === 'menu' ? 'Add' : mode === 'link' ? 'Save a link' : 'Paste text'} onBackBtn={mode !== 'menu' && !busy ? () => setMode('menu') : undefined}>
      <div className="sheet-body" style={{ paddingBottom: 16 }}>
        {mode === 'menu' && <Art name="froggy:wink" className="slim" />}
        {mode === 'menu' && (
          <div className="actions">
            <button className="action" onClick={() => (onClose(), onFiles())}>
              <span className="ic">
                <Pixel name="page" size={16} />
              </span>
              {isNative ? 'Files from your phone' : 'Choose files'}
              <span className="r">{isNative ? 'opened in place' : 'saved in this browser'}</span>
            </button>
            {onFolder && (
              <button className="action" onClick={() => (onClose(), onFolder())}>
                <span className="ic">
                  <Pixel name="stack" size={16} />
                </span>{tr("Link a folder")}<span className="r">{tr("stays up to date")}</span>
              </button>
            )}
            <button className="action" onClick={() => (onClose(), onDiscover())}>
              <span className="ic">
                <Pixel name="book" size={16} />
              </span>{tr("Find free books")}<span className="r">{tr("classics · papers · pdfs")}</span>
            </button>
            <button className="action" onClick={() => setMode('link')}>
              <span className="ic">
                <Icon name="globe" size={20} />
              </span>{tr("Web page or link")}<span className="r">{url ? 'link copied' : ''}</span>
            </button>
            <button className="action" onClick={() => (onClose(), onScan())}>
              <span className="ic">
                <Pixel name="scan" size={16} />
              </span>{tr("Scan paper")}<span className="r">{tr("camera · ocr")}</span>
            </button>
            <button className="action" onClick={() => (onClose(), onNote())}>
              <span className="ic">
                <Pixel name="note" size={16} />
              </span>{tr("New note")}<span className="r">{tr("write · edit anywhere")}</span>
            </button>
            <button className="action" onClick={() => setMode('paste')}>
              <span className="ic">
                <Pixel name="type" size={16} />
              </span>{tr("Paste text or notes")}</button>
          </div>
        )}
        {mode === 'link' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim() && !busy) onLink(url.trim());
            }}
          >
            {busy && <button type="button" className="pill ghost" onClick={onCancel}>{tr("Cancel download")}</button>}
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>{tr("Articles are saved as clean, readable pages with their images. Links to PDFs, books or images are saved as the file itself.")}</p>
            <input className="field" autoFocus placeholder={tr("https://…")} inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} />
            {error && <p className="field-err">{error}</p>}
            <button className="pill" style={{ width: '100%', marginTop: 10 }} disabled={!url.trim() || !!busy}>
              {busy ? <PixelLoader size={4} gap={2} label={busy} /> : 'Save to library'}
            </button>
          </form>
        )}
        {mode === 'paste' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) onPaste(text, title);
            }}
          >
            <input className="field" placeholder={tr("Title (optional)")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="field" style={{ marginTop: 8, height: 180, padding: 12, resize: 'none' }} placeholder={tr("Paste anything — Markdown and $maths$ work")} value={text} onChange={(e) => setText(e.target.value)} />
            <button className="pill" style={{ width: '100%', marginTop: 10 }} disabled={!text.trim()}>{tr("Save to library")}</button>
          </form>
        )}
      </div>
    </Sheet>
  );
}
