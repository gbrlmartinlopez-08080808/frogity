"use client";

import AchievementBadge from "@/components/AchievementBadge";
import AppShell from "@/components/AppShell";
import LevelBar from "@/components/LevelBar";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/context/AppContext";
import { achievements } from "@/data/achievements";
import { modules } from "@/data/modules";
import { addDays } from "@/lib/dates";
import { getModuleProgress, levelFromXp } from "@/lib/progress";

const card = "rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800";

export default function ProgressPage() {
  const { userProgress, today, streak } = useApp();

  const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const completed = userProgress.completedLessons.length;
  const overallProgress = (completed / totalLessons) * 100;
  const modulesStarted = modules.filter((m) => getModuleProgress(userProgress, m).completedLessons > 0).length;
  const hasQuizData = userProgress.quizAttempts > 0;

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const [y, m, d] = day.split("-").map(Number);
    return {
      day,
      label: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      active: userProgress.activeDays.includes(day),
      isToday: day === today,
    };
  });

  const stats = [
    { icon: "🔥", value: streak, label: "Current streak" },
    { icon: "⚡", value: userProgress.longestStreak, label: "Longest streak" },
    { icon: "🎯", value: hasQuizData ? `${Math.round(userProgress.averageAccuracy)}%` : "—", label: "Quiz accuracy" },
    { icon: "📈", value: levelFromXp(userProgress.xp), label: "Current level" },
  ];

  const totals = [
    { value: completed, label: "Lessons done" },
    { value: userProgress.quizzesPassed, label: "Quizzes passed" },
    { value: userProgress.xp.toLocaleString(), label: "Total XP" },
    { value: modulesStarted, label: "Modules started" },
  ];

  // Unlocked badges first, each group in its original order.
  const sortedAchievements = [...achievements].sort(
    (a, b) =>
      Number(userProgress.unlockedBadges.includes(b.id)) - Number(userProgress.unlockedBadges.includes(a.id))
  );

  return (
    <AppShell title="Your Progress" subtitle="Track your journey" backHref="/dashboard">
      <section aria-label="Key stats" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`${card} p-4`}>
            <div className="mb-1 text-3xl" aria-hidden="true">
              {stat.icon}
            </div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stat.value}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">{stat.label}</div>
          </div>
        ))}
      </section>

      <section className={`${card} mb-6 p-5`}>
        <h2 className="mb-4 text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">This week</h2>
        <ol className="flex justify-between gap-1">
          {week.map((d) => (
            <li key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <span
                aria-label={`${d.day}: ${d.active ? "lesson completed" : "no lesson"}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
                  d.active
                    ? "bg-gradient-to-br from-orange-400 to-red-500 text-white shadow"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-700"
                } ${d.isToday ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800" : ""}`}
              >
                <span aria-hidden="true">{d.active ? "🔥" : "·"}</span>
              </span>
              <span
                aria-hidden="true"
                className={`text-xs ${d.isToday ? "font-bold text-purple-600 dark:text-purple-400" : "text-gray-500 dark:text-gray-400"}`}
              >
                {d.label}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${card} mb-6 p-5`}>
        <LevelBar xp={userProgress.xp} />
      </section>

      <section className={`${card} mb-6 p-5`}>
        <h2 className="mb-4 text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">Overall Progress</h2>
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {completed} / {totalLessons} lessons
          </span>
          <span className="font-bold text-gray-800 dark:text-gray-100">{Math.round(overallProgress)}%</span>
        </div>
        <ProgressBar value={overallProgress} label="Overall course progress" />
        <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {totals.map((item) => (
            <div key={item.label} className="flex flex-col-reverse text-center">
              <dt className="text-xs text-gray-600 dark:text-gray-400">{item.label}</dt>
              <dd className="text-2xl font-bold text-gray-800 dark:text-gray-100">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${card} mb-6 p-5`}>
        <h2 className="mb-4 text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">Module Breakdown</h2>
        <ul className="space-y-4">
          {modules.map((module) => {
            const progress = getModuleProgress(userProgress, module);
            return (
              <li key={module.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-2xl" aria-hidden="true">
                      {module.icon}
                    </span>
                    <span className="truncate font-semibold text-gray-800 dark:text-gray-100">{module.title}</span>
                  </div>
                  <div className="shrink-0 text-sm text-gray-600 dark:text-gray-400">
                    {progress.completedLessons} / {progress.totalLessons}
                  </div>
                </div>
                <ProgressBar
                  value={progress.percentComplete}
                  label={`${module.title} progress`}
                  height="h-2"
                  barClassName={module.color}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${card} p-5`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">Achievements</h2>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {userProgress.unlockedBadges.length} / {achievements.length} unlocked
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-6 md:grid-cols-5 lg:grid-cols-6">
          {sortedAchievements.map((achievement) => (
            <li key={achievement.id}>
              <AchievementBadge
                achievement={achievement}
                isUnlocked={userProgress.unlockedBadges.includes(achievement.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-center text-white shadow-xl">
        <div className="mb-2 text-4xl" aria-hidden="true">
          {completed === 0 ? "🌱" : "🎊"}
        </div>
        <h3 className="mb-1 text-xl font-bold">
          {completed === 0 ? "Your journey starts here" : "Keep up the great work!"}
        </h3>
        <p className="mx-auto max-w-md text-sm text-white/90">
          {completed === 0
            ? "Finish your first lesson to start filling this page with progress."
            : `You've completed ${completed} lesson${completed === 1 ? "" : "s"} and earned ${userProgress.xp.toLocaleString()} XP. You're building real financial skills!`}
        </p>
      </section>
    </AppShell>
  );
}
