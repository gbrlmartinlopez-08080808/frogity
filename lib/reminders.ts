import { addDays, dayKey, parseDayKey } from "./dates";
import { isNativeApp } from "./native";

/**
 * Daily study reminders, delivered as local notifications in the Android app.
 * Browsers can't schedule a notification for later without a server, so there
 * reminders are reported as unsupported and the setting explains why.
 */

const FIRST_ID = 4100;
const DAYS_AHEAD = 7;
const CHANNEL_ID = "daily-reminder";

export const remindersSupported = (): boolean => isNativeApp();

export type ReminderPermission = "granted" | "denied" | "unsupported";

async function plugin() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

export async function checkReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported()) return "unsupported";
  try {
    const status = await (await plugin()).checkPermissions();
    return status.display === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported()) return "unsupported";
  try {
    const notifications = await plugin();
    let status = await notifications.checkPermissions();
    if (status.display !== "granted") status = await notifications.requestPermissions();
    return status.display === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export async function cancelReminders(): Promise<void> {
  if (!remindersSupported()) return;
  try {
    const ids = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => ({ id: FIRST_ID + i }));
    await (await plugin()).cancel({ notifications: ids });
  } catch {
    // Nothing scheduled.
  }
}

export interface ReminderPlan {
  /** "HH:MM", 24-hour local time. */
  time: string;
  streak: number;
  goalMetToday: boolean;
  name: string;
}

function message(dayOffset: number, { streak, name }: ReminderPlan): { title: string; body: string } {
  const who = name ? `, ${name}` : "";
  if (dayOffset >= DAYS_AHEAD) {
    return {
      title: "Your money skills miss you 👋",
      body: "Jump back in with a 3-minute lesson whenever you're ready.",
    };
  }
  // Tomorrow's streak is only at stake if it is still alive by then.
  if (streak > 0 && dayOffset <= 1) {
    return {
      title: `Keep your ${streak}-day streak alive 🔥`,
      body: `One quick lesson today keeps it going${who}.`,
    };
  }
  const bodies = [
    `Time for today's money lesson${who}! It only takes a few minutes.`,
    "A few minutes today, smarter money decisions for life.",
    "Your daily goal is waiting. Ready for a quick lesson?",
  ];
  return { title: "Time to level up 💰", body: bodies[dayOffset % bodies.length] };
}

/**
 * Replaces all scheduled reminders with one per day for the coming week. Rescheduling
 * each time the app is used keeps the wording current, skips days already finished,
 * and stops nagging someone who has been away for more than a week.
 */
export async function scheduleReminders(plan: ReminderPlan, now: Date = new Date()): Promise<boolean> {
  if (!remindersSupported()) return false;
  try {
    const notifications = await plugin();
    await cancelReminders();
    await notifications.createChannel({
      id: CHANNEL_ID,
      name: "Daily reminders",
      description: "A nudge to complete your daily lesson goal",
      importance: 3,
      visibility: 1,
    });

    const [hour, minute] = plan.time.split(":").map(Number);
    const today = dayKey(now);
    const pending = [];
    for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
      const at = parseDayKey(addDays(today, offset));
      at.setHours(hour, minute, 0, 0);
      if (at.getTime() <= now.getTime() + 60_000) continue;
      if (offset === 0 && plan.goalMetToday) continue;
      const { title, body } = message(offset, plan);
      pending.push({
        id: FIRST_ID + offset,
        title,
        body,
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: true },
      });
    }
    if (pending.length > 0) await notifications.schedule({ notifications: pending });
    return true;
  } catch {
    return false;
  }
}

export function formatReminderTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
