import { tr } from '../lib/i18n';
import { useRef, useState } from 'react';
import { exportBackup, readBackup } from '../lib/backup';
import { shareFile } from '../lib/native';
import { toast } from '../ui/kit';
import * as db from '../lib/db';
export function StorageTools() {
  const [remote, setRemote] = useState(() => {
    try {
      return localStorage.getItem('frogity:remote-images') === 'yes';
    } catch {
      return false;
    }
  });
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast((e as Error).message || 'Storage operation failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="storage-tools">
      <h3>{tr('Library backup & storage')}</h3>
      <p>
        {tr(
          'Backups include your documents, annotations, history, saved form details and settings. Linked originals must remain accessible separately. Use a password to protect private data; a forgotten password cannot be recovered.',
        )}
      </p>
      <input
        className="field"
        type="password"
        aria-label={tr('Backup password')}
        placeholder={tr('Optional password (10+ characters)')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={remote}
          onChange={(e) => {
            localStorage.setItem(
              'frogity:remote-images',
              e.target.checked ? 'yes' : 'no',
            );
            setRemote(e.target.checked);
          }}
        />
        {tr(
          'Allow external images in documents (contacts the image host). Reopen the document to apply.',
        )}
      </label>
      <div className="backup-actions">
        <button
          className="pill"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const blob = await exportBackup(password);
              await shareFile(
                blob,
                `Frogity-${new Date().toISOString().slice(0, 10)}.${password ? 'frogbackup' : 'zip'}`,
              );
            })
          }
        >
          {tr('Export backup')}
        </button>
        <button
          className="pill ghost"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          {tr('Restore backup')}
        </button>
        <button
          className="pill ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const ok = await navigator.storage?.persist?.();
              toast(
                ok
                  ? 'Persistent storage enabled'
                  : 'Your browser manages storage automatically. Keep a backup.',
              );
            })
          }
        >
          {tr('Protect local storage')}
        </button>
        <button
          className="pill ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await db.batch(['cache'], (tx) => {
                tx.objectStore('cache').clear();
              });
              toast('Rebuildable cache cleared');
            })
          }
        >
          {tr('Clear derived cache')}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        accept=".zip,.frogbackup"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f)
            void run(async () => {
              const backup = await readBackup(f, password);
              if (
                !window.confirm(
                  `Replace your current library with ${backup.count} documents from this backup? Export your current library first. This cannot be undone.`,
                )
              )
                return;
              await backup.restore();
              location.reload();
            });
        }}
      />
      {busy && <p role="status">{tr('Working… keep Frogity open.')}</p>}
    </section>
  );
}
