import { tr } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { getFile } from '../lib/library';
import { patchDoc } from '../lib/store';
import * as db from '../lib/db';
import { cleanPaste, makeFr, parseFr } from '../lib/fr';
import type { DocMeta } from '../lib/types';
import { Icon } from '../ui/Icon';
import { onBack } from '../lib/native';
import { toast } from '../ui/kit';

/** Writing in a Frogity note: a clean page, a small toolbar, saved as you type (and sent to the computer by sync). */
export function FrEditor({ doc, onClose }: { doc: DocMeta; onClose: (changed: boolean) => void }) {
  const ed = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(doc.name);
  const [state, setState] = useState<'' | 'unsaved' | 'saved'>('');
  const changed = useRef(false);
  const timer = useRef(0);
  const saving = useRef(Promise.resolve());
  const revision = useRef(0);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    let alive = true;
    (async () => {
      const f = await getFile(doc.id);
      const html = f ? parseFr(await f.text()).html : '';
      if (!alive || !ed.current) return;
      let recovered: { name: string; html: string } | null = null;
      try { recovered = JSON.parse(localStorage.getItem('draft:' + doc.id) || 'null'); } catch { /* no draft */ }
      ed.current.innerHTML = recovered ? parseFr(JSON.stringify({ html: recovered.html })).html : html;
      if (recovered) { setTitle(recovered.name); titleRef.current = recovered.name; setState('unsaved'); toast('Recovered your unsaved draft'); }
      if (!html.replace(/<[^>]+>/g, '').trim()) setTimeout(() => ed.current?.focus(), 150);
    })();
    return () => {
      alive = false;
    };
  }, [doc.id]);

  const save = async () => {
    if (!ed.current) return;
    const html = ed.current.innerHTML, name = titleRef.current, token = ++revision.current;
    const blob = makeFr(name, html);
    try { localStorage.setItem('draft:' + doc.id, JSON.stringify({ name, html })); } catch { /* storage may be full */ }
    saving.current = saving.current.catch(() => {}).then(async () => {
      await db.put('files', doc.id, blob);
      await patchDoc(doc.id, { name: name || 'Untitled note', size: blob.size, modified: Date.now() });
      changed.current = true;
      if (token === revision.current) { setState('saved'); try { localStorage.removeItem('draft:' + doc.id); } catch { /* optional recovery */ } }
    });
    await saving.current;
  };
  const edit = () => {
    setState('unsaved');
    clearTimeout(timer.current);
    void save().catch(() => { setState('unsaved'); toast('Couldn’t save. Free storage and try again.'); });
  };
  const close = async () => {
    await save();
    onClose(changed.current);
  };
  useEffect(() => onBack(() => { void close().catch(() => toast('Couldn’t save. Free storage and try again.')); return true; }));
  useEffect(() => { const flush = () => { if (ed.current) void save().catch(() => toast('Couldn’t save your note')); }; document.addEventListener('visibilitychange', flush); return () => { clearTimeout(timer.current); document.removeEventListener('visibilitychange', flush); }; }, []);

  const cmd = (c: string, v?: string) => {
    ed.current?.focus();
    document.execCommand(c, false, v);
    edit();
  };
  const link = () => {
    const url = window.prompt('Link to', 'https://');
    if (url) cmd('createLink', url);
  };
  return (
    <div className="fr-ed" role="dialog" aria-label={tr("Edit note")}>
      <div className="fr-top">
        <button className="r-ibtn" onClick={close} aria-label={tr("Done")}>
          <Icon name="check" size={22} />
        </button>
        <input
          className="fr-title"
          value={title}
          placeholder={tr("Title")}
          onChange={(e) => {
            titleRef.current = e.target.value;
            setTitle(e.target.value);
            edit();
          }}
        />
        <span className="mono fr-state">{state === 'unsaved' ? 'saving…' : state === 'saved' ? 'saved' : ''}</span>
      </div>
      <div
        ref={ed}
        className="fr-page flow"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={edit}
        onPaste={(e) => {
          const h = e.clipboardData.getData('text/html');
          if (!h) return;
          e.preventDefault();
          document.execCommand('insertHTML', false, cleanPaste(h));
          edit();
        }}
        onBlur={() => state === 'unsaved' && void save()}
      />
      <div className="fr-bar" onMouseDown={(e) => e.preventDefault()}>
        <button onClick={() => cmd('formatBlock', 'H2')} aria-label={tr("Heading")}>
          <b>{tr("H")}</b>
        </button>
        <button onClick={() => cmd('formatBlock', 'P')} aria-label={tr("Paragraph")}>{tr("¶")}</button>
        <button onClick={() => cmd('bold')} aria-label={tr("Bold")}>
          <b>{tr("B")}</b>
        </button>
        <button onClick={() => cmd('italic')} aria-label={tr("Italic")}>
          <i>{tr("I")}</i>
        </button>
        <button onClick={() => cmd('underline')} aria-label={tr("Underline")}>
          <u>{tr("U")}</u>
        </button>
        <button onClick={() => cmd('insertUnorderedList')} aria-label={tr("List")}>
          <Icon name="list" size={18} />
        </button>
        <button onClick={() => cmd('formatBlock', 'BLOCKQUOTE')} aria-label={tr("Quote")}>{tr("❝")}</button>
        <button onClick={link} aria-label={tr("Link")}>
          <Icon name="globe" size={18} />
        </button>
        <button onClick={() => cmd('undo')} aria-label={tr("Undo")}>
          <Icon name="undo" size={18} />
        </button>
        <button onClick={() => cmd('redo')} aria-label={tr("Redo")} style={{ transform: 'scaleX(-1)' }}>
          <Icon name="undo" size={18} />
        </button>
      </div>
    </div>
  );
}
