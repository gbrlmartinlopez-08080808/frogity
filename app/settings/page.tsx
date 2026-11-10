"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import AppShell from "@/components/AppShell";
import ChoiceCard from "@/components/ChoiceCard";
import Modal from "@/components/Modal";
import Switch from "@/components/Switch";
import { useApp } from "@/context/AppContext";
import { modules } from "@/data/modules";
import {
  MAX_AGE,
  MAX_DAILY_GOAL,
  MAX_NAME_LENGTH,
  MIN_AGE,
  PACE_GOALS,
  isValidTime,
  requiredCorrect,
} from "@/lib/progress";
import {
  checkReminderPermission,
  formatReminderTime,
  remindersSupported,
  requestReminderPermission,
} from "@/lib/reminders";
import { isSpeechAvailable, speak } from "@/lib/speech";
import type { DifficultyLevel, LearningPace, SpeechRate, TextSize, ThemePreference } from "@/types";

const noSubscription = () => () => {};

const card = "mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800";
const sectionTitle = "mb-4 text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100";
const fieldLabel = "mb-3 block text-sm font-semibold text-gray-700 dark:text-gray-300";
const textInput =
  "w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

const PACES: { value: LearningPace; emoji: string; label: string }[] = [
  { value: "slow", emoji: "🐢", label: "Steady" },
  { value: "normal", emoji: "🚶", label: "Normal" },
  { value: "fast", emoji: "🚀", label: "Fast" },
];

const DIFFICULTIES: { value: DifficultyLevel; emoji: string; label: string }[] = [
  { value: "easy", emoji: "😊", label: "Easy" },
  { value: "medium", emoji: "🤔", label: "Medium" },
  { value: "hard", emoji: "💪", label: "Hard" },
];

const THEMES: { value: ThemePreference; emoji: string; label: string }[] = [
  { value: "light", emoji: "☀️", label: "Light" },
  { value: "dark", emoji: "🌙", label: "Dark" },
  { value: "system", emoji: "📱", label: "Auto" },
];

const TEXT_SIZES: { value: TextSize; label: string; sample: string }[] = [
  { value: "small", label: "Small", sample: "text-sm" },
  { value: "medium", label: "Medium", sample: "text-base" },
  { value: "large", label: "Large", sample: "text-xl" },
];

const SPEECH_RATES: { value: SpeechRate; emoji: string; label: string }[] = [
  { value: "slow", emoji: "🐢", label: "Slow" },
  { value: "normal", emoji: "🗣️", label: "Normal" },
  { value: "fast", emoji: "⚡", label: "Fast" },
];

const QUIZ_LENGTH = 3;

export default function SettingsPage() {
  const {
    userProfile,
    userPreferences: prefs,
    updatePreference,
    updatePreferences,
    updateProfile,
    resetEverything,
    feedback,
    notify,
  } = useApp();
  const router = useRouter();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);

  const canRemind = useSyncExternalStore(noSubscription, remindersSupported, () => false);
  const canSpeak = useSyncExternalStore(noSubscription, isSpeechAvailable, () => false);

  // The permission can be revoked in system settings while the toggle still says "on".
  useEffect(() => {
    if (!canRemind || !prefs.notificationsEnabled) return;
    let cancelled = false;
    void checkReminderPermission().then((status) => {
      if (!cancelled) setNotificationsBlocked(status === "denied");
    });
    return () => {
      cancelled = true;
    };
  }, [canRemind, prefs.notificationsEnabled]);

  const toggleReminders = async (on: boolean) => {
    if (!on) {
      updatePreference("notificationsEnabled", false);
      setNotificationsBlocked(false);
      return;
    }
    const permission = await requestReminderPermission();
    if (permission === "granted") {
      updatePreference("notificationsEnabled", true);
      setNotificationsBlocked(false);
      notify(`Daily reminder set for ${formatReminderTime(prefs.dailyReminderTime)}.`, "success");
    } else {
      notify("Notifications are blocked. Allow them for Financedly in your phone's settings.", "error");
    }
  };

  const saveName = () => {
    if (nameDraft === null) return;
    updateProfile({ name: nameDraft });
    setNameDraft(null);
  };

  const setAge = (age: number) => updateProfile({ age: Math.min(MAX_AGE, Math.max(MIN_AGE, age)) });

  const setDailyGoal = (goal: number) => {
    const pace = (Object.keys(PACE_GOALS) as LearningPace[]).find((p) => PACE_GOALS[p] === goal);
    updatePreferences({ dailyGoalLessons: goal, ...(pace ? { learningPace: pace } : {}) });
  };

  const toggleTopic = (id: string) =>
    updatePreference(
      "topicPreferences",
      prefs.topicPreferences.includes(id)
        ? prefs.topicPreferences.filter((t) => t !== id)
        : [...prefs.topicPreferences, id]
    );

  const handleReset = () => {
    setShowResetConfirm(false);
    resetEverything();
    router.replace("/onboarding");
  };

  const age = userProfile?.age ?? MIN_AGE;
  const stepper =
    "h-10 w-10 rounded-full border-2 border-gray-300 text-xl font-bold text-gray-700 disabled:opacity-30 dark:border-gray-600 dark:text-gray-200";

  return (
    <AppShell title="Settings" subtitle="Customize your experience" backHref="/dashboard" width="narrow">
      {/* Profile */}
      <section className={card}>
        <h2 className={sectionTitle}>Profile</h2>
        <div className="mb-5">
          <label htmlFor="name" className={fieldLabel}>
            Name
          </label>
          <input
            id="name"
            type="text"
            value={nameDraft ?? userProfile?.name ?? ""}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Add your first name"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="done"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={textInput}
          />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Age</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Decrease age" disabled={age <= MIN_AGE} onClick={() => setAge(age - 1)} className={stepper}>
              −
            </button>
            <span className="w-8 text-center text-lg font-bold text-gray-800 dark:text-gray-100" aria-live="polite">
              {age}
            </span>
            <button type="button" aria-label="Increase age" disabled={age >= MAX_AGE} onClick={() => setAge(age + 1)} className={stepper}>
              +
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Member since</span>
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {userProfile
              ? new Date(userProfile.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : ""}
          </span>
        </div>
      </section>

      {/* Learning */}
      <section className={card}>
        <h2 className={sectionTitle}>Learning</h2>

        <div className="mb-6">
          <label htmlFor="daily-goal" className={fieldLabel}>
            Daily goal: {prefs.dailyGoalLessons} lesson{prefs.dailyGoalLessons === 1 ? "" : "s"} a day
          </label>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {PACES.map((option) => (
              <ChoiceCard
                key={option.value}
                layout="tile"
                selected={prefs.dailyGoalLessons === PACE_GOALS[option.value]}
                onSelect={() => setDailyGoal(PACE_GOALS[option.value])}
                emoji={option.emoji}
                title={option.label}
                description={`${PACE_GOALS[option.value]} / day`}
              />
            ))}
          </div>
          <input
            id="daily-goal"
            type="range"
            min={1}
            max={MAX_DAILY_GOAL}
            value={prefs.dailyGoalLessons}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="h-3 w-full cursor-pointer"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
            <span>1</span>
            <span>{MAX_DAILY_GOAL}</span>
          </div>
        </div>

        <div className="mb-6">
          <span className={fieldLabel} id="difficulty-label">
            Quiz difficulty
          </span>
          <div className="grid grid-cols-3 gap-3" role="group" aria-labelledby="difficulty-label">
            {DIFFICULTIES.map((option) => {
              const needed = requiredCorrect(option.value, QUIZ_LENGTH);
              return (
                <ChoiceCard
                  key={option.value}
                  layout="tile"
                  selected={prefs.difficultyLevel === option.value}
                  onSelect={() => updatePreference("difficultyLevel", option.value)}
                  emoji={option.emoji}
                  title={option.label}
                  description={`${needed} of ${QUIZ_LENGTH} to pass`}
                />
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {prefs.difficultyLevel === "hard"
              ? "Hard also shuffles the order of the questions."
              : "How many quiz answers you need right to complete a lesson."}
          </p>
        </div>

        <div>
          <span className={fieldLabel} id="topics-label">
            Favourite topics <span className="font-normal text-gray-500">(shown first)</span>
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="topics-label">
            {modules.map((module) => {
              const selected = prefs.topicPreferences.includes(module.id);
              return (
                <button
                  key={module.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTopic(module.id)}
                  className={`rounded-full border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
                      : "border-gray-200 text-gray-700 hover:border-purple-300 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span aria-hidden="true">{module.icon}</span> {module.title}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sound & voice */}
      <section className={card}>
        <h2 className={sectionTitle}>Sound &amp; voice</h2>
        <div className="space-y-4">
          <Switch
            checked={prefs.soundEnabled}
            onChange={(on) => {
              updatePreference("soundEnabled", on);
              if (on) feedback("correct");
            }}
            label="Sound effects"
            description="Chimes for answers, completed lessons and achievements"
          />
          <Switch
            checked={prefs.hapticsEnabled}
            onChange={(on) => updatePreference("hapticsEnabled", on)}
            label="Vibration"
            description="A short buzz when you answer"
          />
          {canSpeak ? (
            <>
              <Switch
                checked={prefs.autoReadAloud}
                onChange={(on) => updatePreference("autoReadAloud", on)}
                label="Read lessons aloud automatically"
                description="Or tap Listen on any card to hear it"
              />
              <div>
                <span className={fieldLabel} id="rate-label">
                  Voice speed
                </span>
                <div className="grid grid-cols-3 gap-3" role="group" aria-labelledby="rate-label">
                  {SPEECH_RATES.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      layout="tile"
                      selected={prefs.speechRate === option.value}
                      onSelect={() => {
                        updatePreference("speechRate", option.value);
                        void speak("This is how lessons will sound.", option.value);
                      }}
                      emoji={option.emoji}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Read-aloud isn&apos;t available on this device because no text-to-speech voice was found.
            </p>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section className={card}>
        <h2 className={sectionTitle}>Appearance</h2>

        <div className="mb-6">
          <span className={fieldLabel} id="theme-label">
            Theme
          </span>
          <div className="grid grid-cols-3 gap-3" role="group" aria-labelledby="theme-label">
            {THEMES.map((option) => (
              <ChoiceCard
                key={option.value}
                layout="tile"
                selected={prefs.theme === option.value}
                onSelect={() => updatePreference("theme", option.value)}
                emoji={option.emoji}
                title={option.label}
              />
            ))}
          </div>
        </div>

        <div className="mb-6">
          <span className={fieldLabel} id="text-size-label">
            Text size
          </span>
          <div className="grid grid-cols-3 gap-3" role="group" aria-labelledby="text-size-label">
            {TEXT_SIZES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={prefs.textSize === option.value}
                onClick={() => updatePreference("textSize", option.value)}
                className={`rounded-xl border-2 p-3 transition-all ${
                  prefs.textSize === option.value
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                    : "border-gray-200 hover:border-purple-300 dark:border-gray-700"
                }`}
              >
                <span className={`block font-bold text-gray-800 dark:text-gray-100 ${option.sample}`} aria-hidden="true">
                  Aa
                </span>
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Switch
          checked={prefs.animationsEnabled}
          onChange={(on) => updatePreference("animationsEnabled", on)}
          label="Animations"
          description="Transitions, confetti and other motion effects"
        />
      </section>

      {/* Notifications */}
      <section className={card}>
        <h2 className={sectionTitle}>Notifications</h2>
        {canRemind ? (
          <>
            <Switch
              checked={prefs.notificationsEnabled}
              onChange={(on) => void toggleReminders(on)}
              label="Daily reminder"
              description="One nudge a day, skipped once you've hit your goal"
            />
            {prefs.notificationsEnabled && (
              <div className="mt-4 animate-fade-in">
                <label htmlFor="reminder-time" className={fieldLabel}>
                  Remind me at
                </label>
                <input
                  id="reminder-time"
                  type="time"
                  value={prefs.dailyReminderTime}
                  onChange={(e) => isValidTime(e.target.value) && updatePreference("dailyReminderTime", e.target.value)}
                  className={textInput}
                />
              </div>
            )}
            {prefs.notificationsEnabled && notificationsBlocked && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300" role="alert">
                Notifications are turned off for Financedly in your phone&apos;s settings, so reminders can&apos;t be
                shown. Allow them there to get your daily nudge.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Daily reminders are available in the Financedly Android app. In a browser, we can&apos;t notify you while the
            page is closed.
          </p>
        )}
      </section>

      {/* About */}
      <section className={card}>
        <h2 className={sectionTitle}>About</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Financedly teaches general money skills for educational purposes. It isn&apos;t personal financial advice.
          Figures such as fees, tax thresholds and interest rates are typical US examples and change over time.
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Your progress is stored only on this device. Nothing is uploaded.
        </p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">Version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border-2 border-red-200 bg-red-50 p-5 shadow-md dark:border-red-800 dark:bg-red-900/20">
        <h2 className="mb-4 text-lg font-bold text-red-700 sm:text-xl dark:text-red-400">Danger Zone</h2>
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          className="w-full rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-red-600"
        >
          Reset everything
        </button>
        <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">
          Deletes your profile, settings and all progress, and starts over
        </p>
      </section>

      {showResetConfirm && (
        <Modal title="Reset everything?" icon="⚠️" onClose={() => setShowResetConfirm(false)}>
          <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
            This permanently deletes your profile, lessons, XP, streaks and achievements from this device. This can&apos;t
            be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 rounded-xl border-2 border-gray-300 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded-xl bg-red-500 py-3 font-semibold text-white transition-colors hover:bg-red-600"
            >
              Delete all
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
