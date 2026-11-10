export type LearningPace = "slow" | "normal" | "fast";
export type ThemePreference = "light" | "dark" | "system";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type TextSize = "small" | "medium" | "large";
export type SpeechRate = "slow" | "normal" | "fast";

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface UserPreferences {
  theme: ThemePreference;
  learningPace: LearningPace;
  difficultyLevel: DifficultyLevel;
  topicPreferences: string[];
  dailyGoalLessons: number;
  notificationsEnabled: boolean;
  /** Local time of the daily reminder, "HH:MM" (24h). */
  dailyReminderTime: string;
  textSize: TextSize;
  animationsEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  /** Read each lesson card aloud automatically. */
  autoReadAloud: boolean;
  speechRate: SpeechRate;
}

export interface UserProgress {
  xp: number;
  /** Consecutive days with at least one completed lesson, as of lastActiveDay. */
  currentStreak: number;
  longestStreak: number;
  /** Local calendar day ("YYYY-MM-DD") of the last completed lesson, or "". */
  lastActiveDay: string;
  /** Every local calendar day on which a lesson was completed (most recent last). */
  activeDays: string[];
  completedLessons: string[];
  unlockedBadges: string[];
  /** Local calendar day the lessonsToday list belongs to. */
  dailyGoalDay: string;
  /** Lessons finished on dailyGoalDay (reviews count once per lesson). */
  lessonsToday: string[];
  /** Consecutive days on which the daily goal was reached. */
  goalStreak: number;
  lastGoalMetDay: string;
  /** Best quiz XP earned so far per lesson, so replays only pay the difference. */
  quizXp: Record<string, number>;
  quizzesPassed: number;
  quizAttempts: number;
  /** Mean accuracy (0-100) over all quiz attempts. */
  averageAccuracy: number;
  perfectQuizStreak: number;
}

export interface ModuleProgress {
  moduleId: string;
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  xpReward: number;
}

export interface Lesson {
  id: string;
  title: string;
  moduleId: string;
  order: number;
  content: LessonContent[];
  quiz: Question[];
  xpReward: number;
  estimatedMinutes: number;
}

export interface LessonContent {
  type: "text" | "example" | "tip" | "scenario";
  content: string;
  emphasis?: boolean;
}

export interface Module {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  order: number;
  lessons: Lesson[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: string;
  xpReward: number;
}

/** What happened as a result of finishing a quiz; drives the results screen. */
export interface LessonOutcome {
  passed: boolean;
  correct: number;
  total: number;
  accuracy: number;
  requiredCorrect: number;
  xpEarned: number;
  bonusXp: number;
  firstCompletion: boolean;
  leveledUp: boolean;
  newLevel: number;
  streak: number;
  streakExtended: boolean;
  dailyGoalJustMet: boolean;
  newBadges: string[];
}
