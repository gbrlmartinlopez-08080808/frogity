"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Lesson, LessonOutcome, UserPreferences, UserProfile, UserProgress } from "@/types";
import { dayKey } from "@/lib/dates";
import { haptic, onAppResume, type HapticKind } from "@/lib/native";
import {
  applyQuizResult,
  cleanName,
  effectiveStreak,
  lessonsDoneToday,
  sanitizePreferences,
} from "@/lib/progress";
import { cancelReminders, scheduleReminders } from "@/lib/reminders";
import { playSound, type SoundName } from "@/lib/sound";
import { stopSpeaking } from "@/lib/speech";
import * as store from "@/lib/store";

export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppContextType {
  /** False until saved data has been read; pages must not redirect before this is true. */
  isLoaded: boolean;
  userProfile: UserProfile | null;
  userPreferences: UserPreferences;
  userProgress: UserProgress;
  /** Today's local calendar day; updates at midnight and when the app is reopened. */
  today: string;
  /** Live streak (0 once a day has been missed). */
  streak: number;
  /** Lessons counted toward today's goal. */
  doneToday: number;

  completeOnboarding: (profile: UserProfile, preferences: UserPreferences) => void;
  updateProfile: (changes: Partial<Pick<UserProfile, "name" | "age">>) => void;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  updatePreferences: (changes: Partial<UserPreferences>) => void;
  /** Records a finished quiz and reports what it earned. */
  submitQuiz: (lesson: Lesson, correctQuestionIds: string[]) => LessonOutcome;
  resetEverything: () => void;

  /** Plays a sound and/or vibration, honouring the user's settings. */
  feedback: (sound?: SoundName, vibration?: HapticKind) => void;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const TOAST_MS = 4000;

export function AppProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { loaded, profile, preferences, progress, storageOk } = state;

  /* ----- Today (drives streaks and the daily goal) ----- */
  const [today, setToday] = useState(() => dayKey());
  useEffect(() => {
    const refresh = () => setToday(dayKey());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = window.setTimeout(refresh, midnight.getTime() - now.getTime());
    const stopListening = onAppResume(refresh);
    return () => {
      window.clearTimeout(timer);
      stopListening();
    };
  }, [today]);

  /* ----- Toasts ----- */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextToastId.current++;
      // Repeating the same message replaces it instead of stacking.
      setToasts((list) => [...list.filter((t) => t.message !== message).slice(-2), { id, message, tone }]);
      timers.current.set(id, window.setTimeout(() => dismissToast(id), TOAST_MS));
    },
    [dismissToast]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!storageOk) {
      notify("Couldn't save your progress on this device. Check storage or private mode.", "error");
    }
  }, [storageOk, notify]);

  /* ----- Appearance ----- */
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preferences.theme === "dark" || (preferences.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#111827" : "#ffffff");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);

  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize;
  }, [preferences.textSize]);

  useEffect(() => {
    document.documentElement.classList.toggle("no-motion", !preferences.animationsEnabled);
  }, [preferences.animationsEnabled]);

  /* ----- Derived values ----- */
  const streak = effectiveStreak(progress, today);
  const doneToday = lessonsDoneToday(progress, today);

  /* ----- Daily reminders ----- */
  const remindersOn = loaded && profile !== null && preferences.notificationsEnabled;
  const goalMetToday = doneToday >= preferences.dailyGoalLessons;
  const reminderTime = preferences.dailyReminderTime;
  const name = profile?.name ?? "";
  useEffect(() => {
    if (!loaded) return;
    if (remindersOn) void scheduleReminders({ time: reminderTime, streak, goalMetToday, name });
    else void cancelReminders();
  }, [loaded, remindersOn, reminderTime, streak, goalMetToday, name, today]);

  /* ----- Actions ----- */
  const completeOnboarding = useCallback((newProfile: UserProfile, newPreferences: UserPreferences) => {
    store.update(() => ({ profile: newProfile, preferences: sanitizePreferences(newPreferences) }));
  }, []);

  const updateProfile = useCallback((changes: Partial<Pick<UserProfile, "name" | "age">>) => {
    store.update((current) =>
      current.profile
        ? {
            profile: {
              ...current.profile,
              ...changes,
              name: changes.name !== undefined ? cleanName(changes.name) : current.profile.name,
            },
          }
        : {}
    );
  }, []);

  const updatePreferences = useCallback((changes: Partial<UserPreferences>) => {
    store.update((current) => ({
      preferences: sanitizePreferences({ ...current.preferences, ...changes }),
    }));
  }, []);

  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) =>
      updatePreferences({ [key]: value } as Partial<UserPreferences>),
    [updatePreferences]
  );

  const submitQuiz = useCallback((lesson: Lesson, correctQuestionIds: string[]): LessonOutcome => {
    const current = store.getSnapshot();
    const result = applyQuizResult(current.progress, {
      lesson,
      correctQuestionIds,
      difficulty: current.preferences.difficultyLevel,
      dailyGoal: current.preferences.dailyGoalLessons,
    });
    store.update(() => ({ progress: result.progress }));
    setToday(dayKey());
    return result.outcome;
  }, []);

  const resetEverything = useCallback(() => {
    stopSpeaking();
    void cancelReminders();
    store.reset();
  }, []);

  const { soundEnabled, hapticsEnabled } = preferences;
  const feedback = useCallback(
    (sound?: SoundName, vibration?: HapticKind) => {
      if (sound && soundEnabled) playSound(sound);
      if (vibration && hapticsEnabled) void haptic(vibration);
    },
    [soundEnabled, hapticsEnabled]
  );

  const value = useMemo<AppContextType>(
    () => ({
      isLoaded: loaded,
      userProfile: profile,
      userPreferences: preferences,
      userProgress: progress,
      today,
      streak,
      doneToday,
      completeOnboarding,
      updateProfile,
      updatePreference,
      updatePreferences,
      submitQuiz,
      resetEverything,
      feedback,
      toasts,
      notify,
      dismissToast,
    }),
    [
      loaded,
      profile,
      preferences,
      progress,
      today,
      streak,
      doneToday,
      completeOnboarding,
      updateProfile,
      updatePreference,
      updatePreferences,
      submitQuiz,
      resetEverything,
      feedback,
      toasts,
      notify,
      dismissToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
