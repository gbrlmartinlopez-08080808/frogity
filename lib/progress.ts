import { achievements } from "@/data/achievements";
import { modules } from "@/data/modules";
import type {
  DifficultyLevel,
  Lesson,
  LessonOutcome,
  Module,
  ModuleProgress,
  UserPreferences,
  UserProfile,
  UserProgress,
} from "@/types";
import { dayKey, daysBetween, isDayKey } from "./dates";

export const XP_PER_LEVEL = 100;
export const MIN_AGE = 13;
export const MAX_AGE = 19;
export const MAX_DAILY_GOAL = 10;
export const MAX_NAME_LENGTH = 20;
const MAX_ACTIVE_DAYS = 400;

export const PACE_GOALS = { slow: 1, normal: 3, fast: 5 } as const;

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  learningPace: "normal",
  difficultyLevel: "medium",
  topicPreferences: [],
  dailyGoalLessons: PACE_GOALS.normal,
  notificationsEnabled: false,
  dailyReminderTime: "18:00",
  textSize: "medium",
  animationsEnabled: true,
  soundEnabled: true,
  hapticsEnabled: true,
  autoReadAloud: false,
  speechRate: "normal",
};

export function createInitialProgress(): UserProgress {
  return {
    xp: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDay: "",
    activeDays: [],
    completedLessons: [],
    unlockedBadges: [],
    dailyGoalDay: "",
    lessonsToday: [],
    goalStreak: 0,
    lastGoalMetDay: "",
    quizXp: {},
    quizzesPassed: 0,
    quizAttempts: 0,
    averageAccuracy: 0,
    perfectQuizStreak: 0,
  };
}

/* ---------- Reading stored data defensively ---------- */

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const int = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const uniqueStrings = (value: unknown, allowed?: Set<string>): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string"))].filter(
        (v) => !allowed || allowed.has(v)
      )
    : [];

const allLessonIds = new Set(modules.flatMap((m) => m.lessons.map((l) => l.id)));
const allBadgeIds = new Set(achievements.map((a) => a.id));
const allModuleIds = new Set(modules.map((m) => m.id));

export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function sanitizeProfile(raw: unknown): UserProfile | null {
  if (!isDict(raw)) return null;
  const createdAt =
    typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt))
      ? raw.createdAt
      : new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `user_${Date.now()}`,
    name: cleanName(raw.name),
    age: int(raw.age, 16, MIN_AGE, MAX_AGE),
    onboardingCompleted: true,
    createdAt,
  };
}

export function sanitizePreferences(raw: unknown): UserPreferences {
  const d = DEFAULT_PREFERENCES;
  if (!isDict(raw)) return { ...d };
  return {
    theme: oneOf(raw.theme, ["light", "dark", "system"] as const, d.theme),
    learningPace: oneOf(raw.learningPace, ["slow", "normal", "fast"] as const, d.learningPace),
    difficultyLevel: oneOf(raw.difficultyLevel, ["easy", "medium", "hard"] as const, d.difficultyLevel),
    topicPreferences: uniqueStrings(raw.topicPreferences, allModuleIds),
    dailyGoalLessons: int(raw.dailyGoalLessons, d.dailyGoalLessons, 1, MAX_DAILY_GOAL),
    notificationsEnabled: bool(raw.notificationsEnabled, d.notificationsEnabled),
    dailyReminderTime: isValidTime(raw.dailyReminderTime) ? raw.dailyReminderTime : d.dailyReminderTime,
    textSize: oneOf(raw.textSize, ["small", "medium", "large"] as const, d.textSize),
    animationsEnabled: bool(raw.animationsEnabled, d.animationsEnabled),
    soundEnabled: bool(raw.soundEnabled, d.soundEnabled),
    hapticsEnabled: bool(raw.hapticsEnabled, d.hapticsEnabled),
    autoReadAloud: bool(raw.autoReadAloud, d.autoReadAloud),
    speechRate: oneOf(raw.speechRate, ["slow", "normal", "fast"] as const, d.speechRate),
  };
}

/** Accepts anything from storage (including the pre-1.0 shape) and returns usable progress. */
export function sanitizeProgress(raw: unknown): UserProgress {
  const base = createInitialProgress();
  if (!isDict(raw)) return base;

  const completedLessons = uniqueStrings(raw.completedLessons, allLessonIds);

  // Pre-1.0 saves stored an ISO timestamp in lastActivityDate instead of a day key.
  let lastActiveDay = isDayKey(raw.lastActiveDay) ? raw.lastActiveDay : "";
  if (!lastActiveDay && completedLessons.length > 0 && typeof raw.lastActivityDate === "string") {
    const legacy = new Date(raw.lastActivityDate);
    if (!Number.isNaN(legacy.getTime())) lastActiveDay = dayKey(legacy);
  }

  const activeDays = uniqueStrings(raw.activeDays).filter(isDayKey).sort().slice(-MAX_ACTIVE_DAYS);
  if (lastActiveDay && !activeDays.includes(lastActiveDay)) activeDays.push(lastActiveDay);

  const quizXp: Record<string, number> = {};
  if (isDict(raw.quizXp)) {
    for (const [id, value] of Object.entries(raw.quizXp)) {
      if (allLessonIds.has(id)) quizXp[id] = int(value, 0, 0, 1000);
    }
  }

  const currentStreak = lastActiveDay ? int(raw.currentStreak, 1, 1) : 0;
  const quizzesPassed = int(raw.quizzesPassed ?? raw.totalQuizzesCompleted, 0);

  return {
    xp: int(raw.xp, 0),
    currentStreak,
    longestStreak: Math.max(currentStreak, int(raw.longestStreak, 0)),
    lastActiveDay,
    activeDays,
    completedLessons,
    unlockedBadges: uniqueStrings(raw.unlockedBadges, allBadgeIds),
    dailyGoalDay: isDayKey(raw.dailyGoalDay) ? raw.dailyGoalDay : "",
    lessonsToday: uniqueStrings(raw.lessonsToday, allLessonIds),
    goalStreak: int(raw.goalStreak, 0),
    lastGoalMetDay: isDayKey(raw.lastGoalMetDay) ? raw.lastGoalMetDay : "",
    quizXp,
    quizzesPassed,
    quizAttempts: Math.max(quizzesPassed, int(raw.quizAttempts, 0)),
    averageAccuracy:
      typeof raw.averageAccuracy === "number" && Number.isFinite(raw.averageAccuracy)
        ? Math.min(100, Math.max(0, raw.averageAccuracy))
        : 0,
    perfectQuizStreak: int(raw.perfectQuizStreak, 0),
  };
}

/* ---------- Derived values ---------- */

export const levelFromXp = (xp: number) => Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
export const xpIntoLevel = (xp: number) => Math.max(0, xp) % XP_PER_LEVEL;

/** The streak as it stands today: it lapses once a full calendar day is missed. */
export function effectiveStreak(progress: UserProgress, today: string = dayKey()): number {
  if (!progress.lastActiveDay) return 0;
  return daysBetween(progress.lastActiveDay, today) <= 1 ? progress.currentStreak : 0;
}

/** True when the streak is alive but no lesson has been done yet today. */
export function streakAtRisk(progress: UserProgress, today: string = dayKey()): boolean {
  return effectiveStreak(progress, today) > 0 && progress.lastActiveDay !== today;
}

export function lessonsDoneToday(progress: UserProgress, today: string = dayKey()): number {
  return progress.dailyGoalDay === today ? progress.lessonsToday.length : 0;
}

export function getModuleProgress(progress: UserProgress, module: Module): ModuleProgress {
  const done = module.lessons.filter((l) => progress.completedLessons.includes(l.id)).length;
  const total = module.lessons.length;
  return {
    moduleId: module.id,
    completedLessons: done,
    totalLessons: total,
    percentComplete: total === 0 ? 0 : (done / total) * 100,
  };
}

export function isLessonUnlocked(progress: UserProgress, module: Module, lesson: Lesson): boolean {
  if (progress.completedLessons.includes(lesson.id)) return true;
  const index = module.lessons.findIndex((l) => l.id === lesson.id);
  if (index <= 0) return index === 0;
  return progress.completedLessons.includes(module.lessons[index - 1].id);
}

/** Modules with the learner's chosen topics first, otherwise in course order. */
export function orderedModules(topicPreferences: string[]): Module[] {
  const preferred = modules.filter((m) => topicPreferences.includes(m.id));
  const rest = modules.filter((m) => !topicPreferences.includes(m.id));
  return [...preferred, ...rest];
}

/** The lesson to suggest next: finish what's started, then follow topic preferences. */
export function findNextLesson(
  progress: UserProgress,
  topicPreferences: string[]
): { module: Module; lesson: Lesson } | null {
  const candidates = orderedModules(topicPreferences);
  const incomplete = (m: Module) => m.lessons.find((l) => !progress.completedLessons.includes(l.id));
  const started = candidates.find((m) => {
    const p = getModuleProgress(progress, m);
    return p.completedLessons > 0 && p.completedLessons < p.totalLessons;
  });
  for (const m of started ? [started, ...candidates] : candidates) {
    const lesson = incomplete(m);
    if (lesson) return { module: m, lesson };
  }
  return null;
}

const PASS_RATIO: Record<DifficultyLevel, number> = { easy: 1 / 3, medium: 2 / 3, hard: 1 };

/** How many answers must be right to pass a quiz of `total` questions. */
export function requiredCorrect(difficulty: DifficultyLevel, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(1, Math.ceil(PASS_RATIO[difficulty] * total - 1e-9)));
}

/* ---------- Achievements ---------- */

interface BadgeContext {
  today: string;
  hour: number;
  comeback: boolean;
  lessonJustCompleted: boolean;
}

function badgeEarned(id: string, p: UserProgress, ctx: BadgeContext): boolean {
  const level = levelFromXp(p.xp);
  const streak = effectiveStreak(p, ctx.today);
  switch (id) {
    case "first-lesson":
      return p.completedLessons.length >= 1;
    case "streak-7":
      return streak >= 7;
    case "streak-30":
      return streak >= 30;
    case "xp-100":
      return p.xp >= 100;
    case "xp-500":
      return p.xp >= 500;
    case "xp-1000":
      return p.xp >= 1000;
    case "module-complete":
      return modules.some((m) => getModuleProgress(p, m).percentComplete === 100);
    case "all-modules":
      return modules.every((m) => getModuleProgress(p, m).percentComplete === 100);
    case "perfect-week":
      return p.goalStreak >= 7;
    case "quiz-ace":
      return p.perfectQuizStreak >= 10;
    case "early-bird":
      return ctx.lessonJustCompleted && ctx.hour >= 4 && ctx.hour < 8;
    case "night-owl":
      return ctx.lessonJustCompleted && (ctx.hour >= 22 || ctx.hour < 4);
    case "speed-demon":
      return lessonsDoneToday(p, ctx.today) >= 5;
    case "level-5":
      return level >= 5;
    case "level-10":
      return level >= 10;
    case "level-20":
      return level >= 20;
    case "comeback":
      return ctx.comeback;
    case "consistency":
      return p.activeDays.length >= 30;
    default:
      return false;
  }
}

/** Unlocks every badge now earned, adding its XP (which can in turn unlock level badges). */
function awardBadges(progress: UserProgress, ctx: BadgeContext) {
  let next = progress;
  const newBadges: string[] = [];
  let bonusXp = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const badge of achievements) {
      if (next.unlockedBadges.includes(badge.id) || !badgeEarned(badge.id, next, ctx)) continue;
      next = { ...next, unlockedBadges: [...next.unlockedBadges, badge.id], xp: next.xp + badge.xpReward };
      newBadges.push(badge.id);
      bonusXp += badge.xpReward;
      changed = true;
    }
  }
  return { progress: next, newBadges, bonusXp };
}

/* ---------- Finishing a quiz ---------- */

interface QuizResultInput {
  lesson: Lesson;
  /** IDs of the questions answered correctly. */
  correctQuestionIds: string[];
  difficulty: DifficultyLevel;
  dailyGoal: number;
  now?: Date;
}

/**
 * Applies one finished quiz attempt. Pure: returns the new progress plus a summary of
 * everything that changed, so the UI can celebrate exactly what happened.
 */
export function applyQuizResult(
  progress: UserProgress,
  { lesson, correctQuestionIds, difficulty, dailyGoal, now = new Date() }: QuizResultInput
): { progress: UserProgress; outcome: LessonOutcome } {
  const today = dayKey(now);
  const total = lesson.quiz.length;
  const correctQuestions = lesson.quiz.filter((q) => correctQuestionIds.includes(q.id));
  const correct = correctQuestions.length;
  const accuracy = total === 0 ? 100 : (correct / total) * 100;
  const needed = requiredCorrect(difficulty, total);
  const passed = correct >= needed;
  const levelBefore = levelFromXp(progress.xp);

  let next: UserProgress = {
    ...progress,
    quizAttempts: progress.quizAttempts + 1,
    averageAccuracy:
      (progress.averageAccuracy * progress.quizAttempts + accuracy) / (progress.quizAttempts + 1),
    perfectQuizStreak: total > 0 && correct === total ? progress.perfectQuizStreak + 1 : 0,
  };

  const baseOutcome = {
    passed,
    correct,
    total,
    accuracy,
    requiredCorrect: needed,
    newLevel: levelBefore,
  };

  if (!passed) {
    return {
      progress: next,
      outcome: {
        ...baseOutcome,
        xpEarned: 0,
        bonusXp: 0,
        firstCompletion: false,
        leveledUp: false,
        streak: effectiveStreak(next, today),
        streakExtended: false,
        dailyGoalJustMet: false,
        newBadges: [],
      },
    };
  }

  const firstCompletion = !progress.completedLessons.includes(lesson.id);
  const quizXpNow = correctQuestions.reduce((sum, q) => sum + q.xpReward, 0);
  const quizXpBefore = progress.quizXp[lesson.id] ?? 0;
  const xpEarned = (firstCompletion ? lesson.xpReward : 0) + Math.max(0, quizXpNow - quizXpBefore);

  // Streak: one step per calendar day. A clock that moved backwards never breaks it.
  const gap = progress.lastActiveDay ? daysBetween(progress.lastActiveDay, today) : null;
  let streak: number;
  if (gap === null || gap > 1) streak = 1;
  else if (gap === 1) streak = progress.currentStreak + 1;
  else streak = Math.max(1, progress.currentStreak);
  const streakExtended = gap === null || gap >= 1;

  // Daily goal: each lesson counts once per day, reviews included.
  const doneBefore = progress.dailyGoalDay === today ? progress.lessonsToday : [];
  const lessonsToday = doneBefore.includes(lesson.id) ? doneBefore : [...doneBefore, lesson.id];
  const dailyGoalJustMet =
    progress.lastGoalMetDay !== today && doneBefore.length < dailyGoal && lessonsToday.length >= dailyGoal;
  const goalStreak = dailyGoalJustMet
    ? progress.lastGoalMetDay && daysBetween(progress.lastGoalMetDay, today) === 1
      ? progress.goalStreak + 1
      : 1
    : progress.goalStreak;

  next = {
    ...next,
    xp: next.xp + xpEarned,
    completedLessons: firstCompletion ? [...progress.completedLessons, lesson.id] : progress.completedLessons,
    quizXp: { ...progress.quizXp, [lesson.id]: Math.max(quizXpBefore, quizXpNow) },
    quizzesPassed: progress.quizzesPassed + 1,
    currentStreak: streak,
    longestStreak: Math.max(progress.longestStreak, streak),
    lastActiveDay: today,
    activeDays: progress.activeDays.includes(today)
      ? progress.activeDays
      : [...progress.activeDays, today].slice(-MAX_ACTIVE_DAYS),
    dailyGoalDay: today,
    lessonsToday,
    goalStreak,
    lastGoalMetDay: dailyGoalJustMet ? today : progress.lastGoalMetDay,
  };

  const awarded = awardBadges(next, {
    today,
    hour: now.getHours(),
    comeback: gap !== null && gap >= 7,
    lessonJustCompleted: true,
  });
  const newLevel = levelFromXp(awarded.progress.xp);

  return {
    progress: awarded.progress,
    outcome: {
      ...baseOutcome,
      xpEarned,
      bonusXp: awarded.bonusXp,
      firstCompletion,
      leveledUp: newLevel > levelBefore,
      newLevel,
      streak,
      streakExtended,
      dailyGoalJustMet,
      newBadges: awarded.newBadges,
    },
  };
}
