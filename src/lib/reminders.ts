// A gentle evening notification, made on the phone itself (no server, no account).
// Android can't make a repeating notification depend on what you've read, so the next one is planned again every
// time the app opens or you read: if today's goal is already met, the next one is tomorrow's.
import { isNative } from './native';
import { dayKey, getState, streakInfo } from './store';
import { displayName } from './cheer';
import { getLang } from './i18n';
import { reminderBody } from './reminderWords';

type LN = typeof import('@capacitor/local-notifications');
let mod: LN | null = null;
const lib = async () => (mod ??= await import('@capacitor/local-notifications'));
const ID = 7101;

export async function notifyPermission(ask: boolean): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { LocalNotifications } = await lib();
    let p = await LocalNotifications.checkPermissions();
    if (p.display === 'prompt' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}

function words(at: Date): { title: string; body: string } {
  const s = getState();
  const goal = s.settings.dailyGoal;
  const info = streakInfo(s.days);
  const left = Math.max(1, Math.ceil((goal * 60_000 - (s.days[dayKey()] ?? 0)) / 60_000));
  const tomorrow = at.toDateString() !== new Date().toDateString();
  // the book in progress: the last one opened in the past two weeks and not finished
  const doc = [...s.docs].filter((d) => !d.finished && d.progress > 0.01 && d.progress < 0.97 && Date.now() - d.openedAt < 14 * 864e5).sort((x, y) => y.openedAt - x.openedAt)[0];
  const book = doc ? (doc.name.length > 34 ? doc.name.slice(0, 33).replace(/\s+\S*$/, '') + '…' : doc.name) : undefined;
  const body = reminderBody({
    lang: getLang(),
    age: s.settings.age,
    name: displayName(s.settings.name),
    streak: info.current,
    left,
    goal,
    total: info.total,
    book,
    hour: at.getHours(),
    day: Math.floor(at.getTime() / 864e5),
    tomorrow,
  });
  return { title: 'Frogity', body };
}

/** Plan (or cancel) the next reminder from the current settings and what you've read today. */
export async function refreshReminder() {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await lib();
    const s = getState().settings;
    await LocalNotifications.cancel({ notifications: [{ id: ID }] }).catch(() => {});
    if (!s.reminders || !(await notifyPermission(false))) return;
    const [h, m] = s.reminderTime.split(':').map(Number);
    const at = new Date();
    at.setHours(h, m || 0, 0, 0);
    const metToday = (getState().days[dayKey()] ?? 0) >= s.dailyGoal * 60_000;
    if (at.getTime() <= Date.now() + 30_000 || metToday) at.setDate(at.getDate() + 1);
    const w = words(at);
    // no picture beside a reminder: the app's small icon in the status bar says who it is from
    await LocalNotifications.schedule({ notifications: [{ id: ID, title: w.title, body: w.body, largeBody: w.body, schedule: { at, allowWhileIdle: true }, isExactNotification: false, smallIcon: 'ic_stat_frogity', iconColor: '#111111' }] });
  } catch (e) {
    console.warn('reminder not planned', e);
  }
}
