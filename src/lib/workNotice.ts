// A notification for the reading that happens in the background (scans, Liquid mode, pictures in documents): you
// can see from the notification shade how far it has got and what is still waiting, and it says when it is ready.
import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';
import { notifyPermission } from './reminders';
import { runningJobs, subscribeJobs, type ScanJob } from './scan';
import { toast } from '../ui/kit';

interface WorkPlugin {
  show(o: { title: string; text: string; progress: number; max: number; idle?: boolean }): Promise<void>;
  /** `cover`: the book's cover (JPEG, base64) for the notification's picture; without it the app's own icon is shown */
  done(o: { title: string; text: string; cover?: string }): Promise<void>;
  clear(): Promise<void>;
  battery(): Promise<{ free: boolean }>;
  askBattery(): Promise<void>;
}
const Work = registerPlugin<WorkPlugin>('Work');

/** Is Frogity left out of the phone's battery saving (so it can keep reading with the app closed)? */
export const workFree = async () => (isNative ? (await Work.battery().catch(() => ({ free: true }))).free : true);
/** Opens the phone's own question: may Frogity keep working in the background? */
export const askWorkFree = () => (isNative ? Work.askBattery().catch(() => {}) : Promise.resolve());

export const kindLabel = (k: ScanJob['kind']) => (k === 'scan' ? 'Reading the scan' : k === 'liquid' ? 'Preparing Liquid mode' : k === 'voice' ? 'Downloading your voice' : 'Reading the pictures');
export const left = (j: ScanJob) => (j.total ? `${Math.max(0, j.total - j.done)} left` : '…');

let started = false;
/** Starts watching the background work. Call once. */
export function initWorkNotice() {
  if (started || !isNative) return;
  started = true;
  let t = 0;
  let had = false;
  let asked = false;
  const finished: string[] = [];
  const liquid = new Set<string>();
  window.addEventListener('frogity:scan', (e) => {
    const { title, liquid: lq } = (e as CustomEvent<{ title: string; liquid?: boolean }>).detail;
    if (!finished.includes(title)) finished.push(title);
    if (lq) liquid.add(title);
  });
  const sync = async () => {
    const r = runningJobs();
    if (r.length) {
      if (!asked) {
        asked = true;
        // the notification is asked for once; the work goes on in the background either way (the service runs
        // even when its notification may not be shown)
        await notifyPermission(true);
      }
      had = true;
      const j = r[0];
      const more = r.length - 1;
      const title = j.title.length > 30 ? j.title.slice(0, 30) + '…' : j.title;
      Work.show({
        title: `${kindLabel(j.kind)} · ${title}`,
        text: `${j.total ? `${j.done} of ${j.total}` : 'working'} · ${left(j)}${more ? ` · ${more} more waiting` : ''}`,
        progress: Math.round(j.progress * 100),
        max: 100,
      }).catch(() => {});
    } else if (had) {
      had = false;
      const names = finished.splice(0);
      if (names.length) {
        // the book's cover only when one book's Liquid mode is ready; otherwise no picture at all
        const one = names.length === 1 && liquid.has(names[0]);
        const cover = one ? await coverOf(names[0]) : undefined;
        const allLiquid = names.every((n) => liquid.has(n));
        names.forEach((n) => liquid.delete(n));
        Work.done({
          title: names.length === 1 ? `“${names[0]}” is ready to read` : `${names.length} books are ready to read`,
          text: allLiquid ? 'Liquid mode, Listen and search are ready.' : 'Its text can now be selected, searched and read aloud.',
          cover,
        }).catch(() => {});
      }
      else Work.clear().catch(() => {});
    }
  };
  subscribeJobs(() => {
    clearTimeout(t);
    t = window.setTimeout(sync, 900);
  });
}

/** The book's cover, small, as base64 JPEG (for the notification's picture). */
async function coverOf(title: string): Promise<string | undefined> {
  try {
    const { getState } = await import('./store');
    const db = await import('./db');
    const d = getState().docs.find((x) => x.name === title);
    const blob = d?.coverId ? await db.get<Blob>('blobs', d.coverId) : undefined;
    if (!blob) return undefined;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } catch {
    return undefined;
  }
}

/** Liquid mode has just become ready after a long wait: say so in the app, and in the notification shade when the app is not on screen. */
export function liquidReady(title: string) {
  const name = title.length > 34 ? title.slice(0, 34) + '…' : title;
  if (!isNative || !document.hidden) toast(`Liquid mode is ready · ${name}`);
  if (isNative && document.hidden) void coverOf(title).then((cover) => Work.done({ title: `Liquid mode is ready · ${name}`, text: 'Open it to read with text that reflows.', cover }).catch(() => {}));
}
