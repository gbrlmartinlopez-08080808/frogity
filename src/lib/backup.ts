import JSZip from 'jszip';
import * as db from './db';
const stores: db.StoreName[] = [
  'docs',
  'files',
  'blobs',
  'kv',
  'marks',
  'days',
  'cache',
];
type Row = {
  store: db.StoreName;
  key: string;
  value?: unknown;
  blob?: string;
  mime?: string;
};
const keyFor = async (password: string, salt: Uint8Array<ArrayBuffer>) => {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};
export async function exportBackup(password = ''): Promise<Blob> {
  const zip = new JSZip();
  const rows: Row[] = [];
  for (const store of stores) {
    if (store === 'cache') continue; // derived data can be rebuilt
    for (const [key, value] of await db.entries<unknown>(store)) {
      if (value instanceof Blob) {
        const blob = `files/${rows.length}`;
        zip.file(blob, value);
        rows.push({ store, key, blob, mime: value.type });
      } else rows.push({ store, key, value });
    }
  }
  zip.file(
    'manifest.json',
    JSON.stringify({ frogityBackup: 1, date: new Date().toISOString(), rows }),
  );
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'STORE',
  });
  if (!password)
    return new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: 'application/zip',
    });
  if (password.length < 10)
    throw new Error('Use a password with at least 10 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFor(password, salt),
    bytes as Uint8Array<ArrayBuffer>,
  );
  return new Blob(['FROGITY1', salt, iv, encrypted], {
    type: 'application/octet-stream',
  });
}
export async function readBackup(file: Blob, password = '') {
  if (file.size > 250_000_000)
    throw new Error('Backup exceeds the 250 MB restore limit.');
  let data = await file.arrayBuffer();
  if (new TextDecoder().decode(data.slice(0, 8)) === 'FROGITY1') {
    try {
      data = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(data.slice(24, 36)) },
        await keyFor(password, new Uint8Array(data.slice(8, 24))),
        data.slice(36),
      );
    } catch {
      throw new Error('Wrong password or damaged backup.');
    }
  }
  const zip = await JSZip.loadAsync(data);
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total +=
      (entry as unknown as { _data?: { uncompressedSize: number } })._data
        ?.uncompressedSize ?? 0;
  }
  if (total > 500_000_000) throw new Error('Expanded backup is too large.');
  const manifest = await zip.file('manifest.json')?.async('string');
  if (!manifest || manifest.length > 20_000_000)
    throw new Error('Missing or oversized backup manifest.');
  const parsed = JSON.parse(manifest) as {
    frogityBackup?: number;
    rows?: Row[];
  };
  if (
    parsed.frogityBackup !== 1 ||
    !Array.isArray(parsed.rows) ||
    parsed.rows.length > 100000
  )
    throw new Error('Unsupported backup.');
  const rows = parsed.rows;
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      !stores.includes(row.store) ||
      typeof row.key !== 'string' ||
      seen.has(row.store + ':' + row.key)
    )
      throw new Error('Invalid backup record.');
    seen.add(row.store + ':' + row.key);
    if (row.blob) {
      const f = zip.file(row.blob);
      if (!f) throw new Error('Backup is missing a file.');
      row.value = new Blob(
        [(await f.async('uint8array')) as Uint8Array<ArrayBuffer>],
        { type: row.mime },
      );
    }
    if (
      row.store === 'docs' &&
      (!row.value ||
        typeof row.value !== 'object' ||
        (row.value as { id?: string }).id !== row.key ||
        typeof (row.value as { name?: unknown }).name !== 'string')
    )
      throw new Error('Invalid document record.');
  }
  return {
    count: rows.filter((r) => r.store === 'docs').length,
    restore: () =>
      db.batch(stores, (tx) => {
        for (const s of stores) tx.objectStore(s).clear();
        for (const row of rows)
          tx.objectStore(row.store).put(row.value, row.key);
      }),
  };
}
