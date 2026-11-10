"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PAGE_BACKGROUND } from "@/lib/ui";
import ChoiceCard from "@/components/ChoiceCard";
import LoadingScreen from "@/components/LoadingScreen";
import ProgressBar from "@/components/ProgressBar";
import Switch from "@/components/Switch";
import { useApp } from "@/context/AppContext";
import { modules } from "@/data/modules";
import { pushBackInterceptor } from "@/lib/back";
import {
  DEFAULT_PREFERENCES,
  MAX_AGE,
  MAX_NAME_LENGTH,
  MIN_AGE,
  PACE_GOALS,
  cleanName,
  isValidTime,
} from "@/lib/progress";
import { formatReminderTime, remindersSupported, requestReminderPermission } from "@/lib/reminders";
import type { LearningPace, ThemePreference, UserProfile } from "@/types";

type StepId = "welcome" | "about" | "pace" | "topics" | "theme" | "reminder" | "ready";

const PACES: { value: LearningPace; emoji: string; title: string }[] = [
  { value: "slow", emoji: "🐢", title: "Slow & Steady" },
  { value: "normal", emoji: "🚶", title: "Normal Pace" },
  { value: "fast", emoji: "🚀", title: "Fast Track" },
];

const THEMES: { value: ThemePreference; emoji: string; title: string; description: string }[] = [
  { value: "light", emoji: "☀️", title: "Light Mode", description: "Bright and energetic" },
  { value: "dark", emoji: "🌙", title: "Dark Mode", description: "Easy on the eyes" },
  { value: "system", emoji: "📱", title: "Auto", description: "Match your device" },
];

const noSubscription = () => () => {};

export default function OnboardingPage() {
  const { isLoaded, userProfile, userPreferences, updatePreference, completeOnboarding, feedback, notify } =
    useApp();
  const router = useRouter();
  const canRemind = useSyncExternalStore(noSubscription, remindersSupported, () => false);

  const steps: StepId[] = canRemind
    ? ["welcome", "about", "pace", "topics", "theme", "reminder", "ready"]
    : ["welcome", "about", "pace", "topics", "theme", "ready"];

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState(16);
  const [pace, setPace] = useState<LearningPace>(DEFAULT_PREFERENCES.learningPace);
  const [topics, setTopics] = useState<string[]>([]);
  const [remind, setRemind] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_PREFERENCES.dailyReminderTime);
  const finishing = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const theme = userPreferences.theme;

  // Anyone with a profile belongs on the dashboard: returning users and those who just finished.
  useEffect(() => {
    if (isLoaded && userProfile) router.replace("/dashboard");
  }, [isLoaded, userProfile, router]);

  // Android back button steps backwards through the flow before leaving the app.
  useEffect(() => {
    if (stepIndex === 0) return;
    return pushBackInterceptor(() => {
      setStepIndex((i) => Math.max(0, i - 1));
      return true;
    });
  }, [stepIndex]);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.focus();
  }, [stepIndex]);

  if (!isLoaded || userProfile) return <LoadingScreen />;

  const goTo = (index: number) => {
    feedback("tap", "light");
    setStepIndex(index);
    window.scrollTo({ top: 0 });
  };

  const toggleReminder = async (on: boolean) => {
    if (!on) return setRemind(false);
    const permission = await requestReminderPermission();
    if (permission === "granted") {
      setRemind(true);
    } else {
      setRemind(false);
      notify("Notifications are blocked. You can allow them later in your phone's settings.", "error");
    }
  };

  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    const profile: UserProfile = {
      id: `user_${Date.now()}`,
      name: cleanName(name),
      age,
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
    };
    completeOnboarding(profile, {
      ...userPreferences,
      learningPace: pace,
      dailyGoalLessons: PACE_GOALS[pace],
      topicPreferences: topics,
      notificationsEnabled: remind,
      dailyReminderTime: reminderTime,
    });
    feedback("complete", "success");
  };

  const heading = (emoji: string, title: string, subtitle: string, emojiClass = "") => (
    <>
      <div className={`mb-5 text-center text-6xl ${emojiClass}`} aria-hidden="true">
        {emoji}
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 text-center text-2xl font-bold text-gray-800 outline-none sm:text-3xl dark:text-gray-100"
      >
        {title}
      </h1>
      <p className="mx-auto mb-7 max-w-md text-center text-gray-600 dark:text-gray-400">{subtitle}</p>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case "welcome":
        return (
          <>
            {heading(
              "👋",
              "Welcome to Financedly!",
              "Master money skills through fun, bite-sized lessons. Learn at your own pace and build financial confidence!",
              "animate-bounce"
            )}
            <ul className="flex flex-col gap-3">
              {[
                ["🎮", "Gamified Learning", "Earn XP, level up, and unlock achievements", "bg-blue-50 dark:bg-blue-900/20"],
                ["🔥", "Build Streaks", "Stay consistent and watch your progress soar", "bg-purple-50 dark:bg-purple-900/20"],
                ["🔊", "Read or Listen", "Every lesson can be read aloud to you", "bg-pink-50 dark:bg-pink-900/20"],
                ["📚", "Real Skills", "Learn practical money skills for real life", "bg-green-50 dark:bg-green-900/20"],
              ].map(([emoji, title, text, color]) => (
                <li key={title} className={`flex items-center gap-3 rounded-lg p-4 ${color}`}>
                  <span className="text-2xl" aria-hidden="true">
                    {emoji}
                  </span>
                  <div>
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        );

      case "about":
        return (
          <>
            {heading("🎂", "Tell us about you", "We'll use this to greet you and tailor your experience")}
            <div className="mx-auto max-w-sm space-y-8">
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  What should we call you? <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="done"
                  placeholder="Your first name"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-lg text-gray-800 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label
                  htmlFor="age"
                  className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  How old are you?
                </label>
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    aria-label="Decrease age"
                    disabled={age <= MIN_AGE}
                    onClick={() => setAge((a) => Math.max(MIN_AGE, a - 1))}
                    className="h-12 w-12 rounded-full border-2 border-gray-300 text-2xl font-bold text-gray-700 disabled:opacity-30 dark:border-gray-600 dark:text-gray-200"
                  >
                    −
                  </button>
                  <div className="w-24 text-center">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-6xl font-bold text-transparent">
                      {age}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">years old</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Increase age"
                    disabled={age >= MAX_AGE}
                    onClick={() => setAge((a) => Math.min(MAX_AGE, a + 1))}
                    className="h-12 w-12 rounded-full border-2 border-gray-300 text-2xl font-bold text-gray-700 disabled:opacity-30 dark:border-gray-600 dark:text-gray-200"
                  >
                    +
                  </button>
                </div>
                <input
                  id="age"
                  type="range"
                  min={MIN_AGE}
                  max={MAX_AGE}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="mt-4 h-3 w-full cursor-pointer"
                />
              </div>
            </div>
          </>
        );

      case "pace":
        return (
          <>
            {heading("⚡", "Choose your pace", "How many lessons do you want to do each day?")}
            <div className="mx-auto max-w-md space-y-3">
              {PACES.map((option) => (
                <ChoiceCard
                  key={option.value}
                  selected={pace === option.value}
                  onSelect={() => setPace(option.value)}
                  emoji={option.emoji}
                  title={option.title}
                  description={`${PACE_GOALS[option.value]} lesson${PACE_GOALS[option.value] === 1 ? "" : "s"} per day`}
                />
              ))}
            </div>
            <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
              You can change your daily goal any time in Settings.
            </p>
          </>
        );

      case "topics":
        return (
          <>
            {heading("📚", "What interests you most?", "Pick any topics to see first (optional)")}
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
              {modules.map((module) => (
                <ChoiceCard
                  key={module.id}
                  layout="tile"
                  selected={topics.includes(module.id)}
                  onSelect={() =>
                    setTopics((list) =>
                      list.includes(module.id) ? list.filter((id) => id !== module.id) : [...list, module.id]
                    )
                  }
                  emoji={module.icon}
                  title={module.title}
                />
              ))}
            </div>
            <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
              Don&apos;t worry, every topic stays available!
            </p>
          </>
        );

      case "theme":
        return (
          <>
            {heading("🎨", "Choose your theme", "Pick the look that suits you best")}
            <div className="mx-auto max-w-md space-y-3">
              {THEMES.map((option) => (
                <ChoiceCard
                  key={option.value}
                  selected={theme === option.value}
                  onSelect={() => updatePreference("theme", option.value)}
                  emoji={option.emoji}
                  title={option.title}
                  description={option.description}
                />
              ))}
            </div>
          </>
        );

      case "reminder":
        return (
          <>
            {heading("🔔", "Stay on track", "A daily reminder makes it much easier to keep your streak")}
            <div className="mx-auto max-w-md space-y-5">
              <div className="rounded-xl border-2 border-gray-200 p-4 dark:border-gray-700">
                <Switch
                  checked={remind}
                  onChange={(on) => void toggleReminder(on)}
                  label="Daily reminder"
                  description="One notification a day, only if you haven't hit your goal"
                />
              </div>
              {remind && (
                <div className="animate-fade-in">
                  <label
                    htmlFor="reminder-time"
                    className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Remind me at
                  </label>
                  <input
                    id="reminder-time"
                    type="time"
                    value={reminderTime}
                    onChange={(e) => isValidTime(e.target.value) && setReminderTime(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-lg text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
            </div>
          </>
        );

      case "ready": {
        const topicNames = modules.filter((m) => topics.includes(m.id)).map((m) => m.title);
        const rows: [string, string][] = [
          ...(cleanName(name) ? ([["Name", cleanName(name)]] as [string, string][]) : []),
          ["Age", `${age} years`],
          ["Daily goal", `${PACE_GOALS[pace]} lesson${PACE_GOALS[pace] === 1 ? "" : "s"}`],
          ["Topics first", topicNames.length ? topicNames.join(", ") : "All topics"],
          ["Theme", THEMES.find((t) => t.value === theme)?.title ?? "Auto"],
          ...(canRemind
            ? ([["Reminder", remind ? formatReminderTime(reminderTime) : "Off"]] as [string, string][])
            : []),
        ];
        return (
          <>
            {heading(
              "🚀",
              cleanName(name) ? `You're all set, ${cleanName(name)}!` : "You're all set!",
              "Ready to start your financial literacy journey? Let's make money skills fun!",
              "animate-pulse-scale"
            )}
            <div className="mx-auto max-w-md rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 p-6 dark:from-purple-900/20 dark:to-pink-900/20">
              <h2 className="mb-4 font-bold text-gray-800 dark:text-gray-100">Your settings</h2>
              <dl className="space-y-2 text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="shrink-0 text-gray-600 dark:text-gray-400">{label}</dt>
                    <dd className="text-right font-semibold text-gray-800 dark:text-gray-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div className={`min-h-dvh px-4 py-6 ${PAGE_BACKGROUND}`}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-2xl font-bold text-transparent">
              Financedly
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Step {stepIndex + 1} of {steps.length}
            </div>
          </div>
          <ProgressBar value={((stepIndex + 1) / steps.length) * 100} label="Setup progress" height="h-2" />
        </div>

        <div key={step} className="mb-6 animate-slide-in rounded-2xl bg-white p-6 shadow-xl sm:p-8 dark:bg-gray-800">
          {renderStep()}
        </div>

        <div className="flex gap-4">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => goTo(stepIndex - 1)}
              className="flex-1 rounded-xl border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? finish() : goTo(stepIndex + 1))}
            className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-purple-600 hover:to-pink-600 active:scale-[0.98]"
          >
            {isLast ? "Let's Start! 🚀" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
