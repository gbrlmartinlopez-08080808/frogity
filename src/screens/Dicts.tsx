// Settings → Dictionaries: what is on the phone, what can be added, and how big each one is.
import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { DICT_LANGS, LANG_NAME, forgetPack, installPack, installedPacks, installing, onDictChange, packIndex, unforget, userLang, type PackInfo } from '../lib/dicts';
import { Sheet, toast } from '../ui/kit';
import { Icon } from '../ui/Icon';

const mb = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;

export function DictsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [idx, setIdx] = useState<PackInfo[] | null>(null);
  const [ins, setIns] = useState<Record<string, { words: number }>>({});
  const [prog, setProg] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => onDictChange(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    if (!open) return;
    packIndex().then(setIdx);
    installedPacks().then(setIns);
  }, [open, tick]);
  const u = userLang();
  // one row per language: its dictionary, plus its words in the reader's language (and English)
  const group = (l: string) => [l, ...(l !== u ? [`${l}_${u}`] : []), ...(l !== 'en' && u !== 'en' && l !== u ? [`${l}_en`] : []), ...(l === u && u !== 'en' ? [`${u}_en`] : [])];
  const order = [u, ...(u !== 'en' ? ['en'] : []), ...DICT_LANGS.filter((l) => l !== u && l !== 'en')];
  const get = async (ids: string[]) => {
    try {
      for (let i = 0; i < ids.length; i++) {
        await unforget(ids[i]);
        await installPack(ids[i], (f) => setProg((p) => ({ ...p, [ids[0]]: (i + f) / ids.length })));
      }
      toast(tr('Dictionary ready'));
    } catch (e) {
      toast(tr((e as Error).message));
    }
    setProg((p) => {
      const n = { ...p };
      delete n[ids[0]];
      return n;
    });
  };
  const drop = async (ids: string[]) => {
    for (const id of ids) await forgetPack(id);
  };
  return (
    <Sheet open={open} onClose={onClose} title={tr('Dictionaries')}>
      <p className="row-sub" style={{ padding: '0 4px 10px' }}>
        {tr('Look words up without a connection. Each language comes with its own definitions and its words in ')}
        {LANG_NAME[u]}
        {tr('. From Wiktionary (CC BY-SA).')}
      </p>
      {!idx ? (
        <p className="row-sub" style={{ padding: 8 }}>{tr('Loading…')}</p>
      ) : idx.length === 0 ? (
        <p className="row-sub" style={{ padding: 8 }}>{tr('The list of dictionaries could not be loaded. Check the connection and try again.')}</p>
      ) : (
        order.map((l) => {
          const ids = group(l).filter((id) => idx.some((p) => p.id === id));
          if (!ids.length) return null;
          const size = ids.reduce((n, id) => n + (idx.find((p) => p.id === id)?.bytes ?? 0), 0);
          const have = ids.filter((id) => ins[id]);
          const words = ins[l]?.words ?? idx.find((p) => p.id === l)?.words ?? 0;
          const p = prog[ids[0]] ?? (installing().some((x) => ids.includes(x)) ? 0 : undefined);
          return (
            <div className="row" key={l}>
              <Icon name="book" />
              <div className="grow">
                <div className="row-label">
                  {LANG_NAME[l]}
                  {(l === u || l === 'en') && <small className="mono" style={{ marginLeft: 8, opacity: 0.55 }}>{tr('yours')}</small>}
                </div>
                <div className="row-sub">
                  {Math.round(words / 1000)}k {tr('words')} · {mb(size)}
                  {have.length > 0 && have.length < ids.length ? ` · ${tr('partly downloaded')}` : ''}
                </div>
              </div>
              {p !== undefined ? (
                <span className="mono" style={{ fontSize: 13 }}>{Math.round(p * 100)}%</span>
              ) : have.length === ids.length ? (
                <button className="chip" onClick={() => void drop(ids)}>{tr('Remove')}</button>
              ) : (
                <button className="chip on" onClick={() => void get(ids.filter((id) => !ins[id]))}>{tr('Download')}</button>
              )}
            </div>
          );
        })
      )}
    </Sheet>
  );
}
