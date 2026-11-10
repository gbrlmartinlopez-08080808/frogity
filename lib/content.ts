import { dayKey, parseDayKey } from "./dates";

const TIPS = [
  "The 50/30/20 rule: 50% of income to needs, 30% to wants, 20% to savings. Simple but powerful!",
  "The 24-hour rule: wait a day before any non-essential purchase. Often the urge passes.",
  "Pay yourself first: move money to savings before you spend anything.",
  "Track every dollar for 30 days to see where your money really goes.",
  "Starting to invest at 16 instead of 25 can make a huge difference, thanks to compound growth.",
  "Credit card golden rule: only charge what you can pay off in full each month.",
  "A grown-up emergency fund covers 3 to 6 months of expenses. Start with $200.",
  "Index funds give you instant diversification with very low fees.",
  "If you need 'buy now, pay later' for a want, you probably can't afford it yet.",
  "Compound interest rewards patience: time matters more than the amount you start with.",
  "Cost per use beats sticker price: a $60 backpack that lasts 4 years is cheaper than a $20 one that lasts 1.",
  "Audit your subscriptions every few months. Three $10 subscriptions cost $360 a year.",
  "Budget with your take-home pay, not the number before taxes.",
  "A sale is only a deal if you were going to buy the item anyway.",
];

/** One tip per calendar day, the same all day long. */
export function tipOfTheDay(day: string = dayKey()): string {
  const index = Math.floor(parseDayKey(day).getTime() / 86_400_000);
  return TIPS[((index % TIPS.length) + TIPS.length) % TIPS.length];
}

export function getGreeting(name: string, hour: number = new Date().getHours()): string {
  const greeting =
    hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${greeting}, ${name}!` : `${greeting}!`;
}

interface MessageInput {
  streak: number;
  streakAtRisk: boolean;
  doneToday: number;
  dailyGoal: number;
  lessonsCompleted: number;
  allDone: boolean;
}

export function getMotivationalMessage(input: MessageInput): string {
  const { streak, streakAtRisk, doneToday, dailyGoal, lessonsCompleted, allDone } = input;
  const left = dailyGoal - doneToday;
  if (allDone) return "You've finished every lesson. Review any module to keep your streak going!";
  if (lessonsCompleted === 0) return "Ready for your first lesson? It takes about 3 minutes.";
  if (left <= 0) return "Daily goal crushed! Come back tomorrow to keep the streak going.";
  if (streakAtRisk) return `Do one lesson today to keep your ${streak}-day streak alive!`;
  if (doneToday > 0) return `So close! Just ${left} more lesson${left === 1 ? "" : "s"} to hit today's goal.`;
  if (streak >= 3) return `${streak} days strong. You're building a real habit!`;
  return "Every lesson brings you closer to financial confidence.";
}

/** Splits a leading emoji off lesson copy so it can be shown as the card's icon. */
export function splitLeadingEmoji(text: string): { emoji: string | null; rest: string } {
  const match = text.match(/^((?:\p{Extended_Pictographic}[\u{FE0F}\u{200D}]*)+)\s*/u);
  if (!match) return { emoji: null, rest: text };
  return { emoji: match[1], rest: text.slice(match[0].length) };
}
