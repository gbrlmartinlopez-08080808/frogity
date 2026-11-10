"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import DailyGoalBar from "@/components/DailyGoalBar";
import LevelBar from "@/components/LevelBar";
import ModuleCard from "@/components/ModuleCard";
import StreakCounter from "@/components/StreakCounter";
import { useApp } from "@/context/AppContext";
import { modules } from "@/data/modules";
import { getGreeting, getMotivationalMessage, tipOfTheDay } from "@/lib/content";
import { findNextLesson, getModuleProgress, orderedModules, streakAtRisk } from "@/lib/progress";

export default function DashboardPage() {
  const { userProfile, userProgress, userPreferences, today, streak, doneToday } = useApp();

  const next = findNextLesson(userProgress, userPreferences.topicPreferences);
  const atRisk = streakAtRisk(userProgress, today);
  const message = getMotivationalMessage({
    streak,
    streakAtRisk: atRisk,
    doneToday,
    dailyGoal: userPreferences.dailyGoalLessons,
    lessonsCompleted: userProgress.completedLessons.length,
    allDone: next === null,
  });
  // Unfinished modules first, so the home screen always shows something to do.
  const featured = orderedModules(userPreferences.topicPreferences)
    .map((module) => ({ module, progress: getModuleProgress(userProgress, module) }))
    .sort((a, b) => Number(a.progress.percentComplete === 100) - Number(b.progress.percentComplete === 100))
    .slice(0, 3);

  const stat = "flex flex-col justify-center rounded-2xl p-4 shadow-lg";

  return (
    <AppShell
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden="true">💰</span>
          <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
            Financedly
          </span>
        </span>
      }
      subtitle="Master money skills"
    >
      <section className="mb-6 animate-fade-in">
        <h2 className="mb-1 text-2xl font-bold text-gray-800 sm:text-3xl dark:text-gray-100">
          {getGreeting(userProfile?.name ?? "")}
        </h2>
        <p className="text-gray-600 sm:text-lg dark:text-gray-400">{message}</p>
      </section>

      {next ? (
        <section className="mb-6 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 p-5 shadow-xl sm:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="mb-1 text-xs font-bold tracking-wide text-white/80">
                {userProgress.completedLessons.length === 0 ? "START HERE" : "CONTINUE LEARNING"}
              </div>
              <h3 className="mb-1 text-xl font-bold text-white sm:text-2xl">{next.lesson.title}</h3>
              <p className="text-sm text-white/90">
                {next.module.title} • {next.lesson.estimatedMinutes} min • +{next.lesson.xpReward} XP
              </p>
            </div>
            <Link
              href={`/learn/${next.module.id}/${next.lesson.id}`}
              className="rounded-xl bg-white px-8 py-3 text-center font-bold whitespace-nowrap text-purple-600 shadow-lg transition-transform hover:bg-gray-50 active:scale-[0.97]"
            >
              Start Lesson →
            </Link>
          </div>
        </section>
      ) : (
        <section className="mb-6 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-center shadow-xl">
          <div className="mb-2 text-4xl" aria-hidden="true">
            👑
          </div>
          <h3 className="mb-1 text-2xl font-bold text-white">You finished every lesson!</h3>
          <p className="mb-4 text-sm text-white/90">Review any module to sharpen your skills and keep your streak.</p>
          <Link
            href="/learn"
            className="inline-block rounded-xl bg-white px-8 py-3 font-bold text-green-700 shadow-lg"
          >
            Review lessons →
          </Link>
        </section>
      )}

      <section aria-label="Your stats" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StreakCounter streak={streak} atRisk={atRisk} />
        <div className={`${stat} bg-gradient-to-br from-purple-500 to-pink-500`}>
          <div className="text-3xl font-bold text-white sm:text-4xl">{userProgress.xp.toLocaleString()}</div>
          <div className="mt-1 text-sm font-medium text-white">Total XP</div>
        </div>
        <div className={`${stat} bg-gradient-to-br from-green-500 to-emerald-500`}>
          <div className="text-3xl font-bold text-white sm:text-4xl">{userProgress.completedLessons.length}</div>
          <div className="mt-1 text-sm font-medium text-white">Lessons completed</div>
        </div>
        <Link
          href="/progress"
          className={`${stat} bg-gradient-to-br from-yellow-500 to-orange-500 transition-transform active:scale-[0.97]`}
        >
          <div className="text-3xl font-bold text-white sm:text-4xl">{userProgress.unlockedBadges.length}</div>
          <div className="mt-1 text-sm font-medium text-white">Achievements →</div>
        </Link>
      </section>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <LevelBar xp={userProgress.xp} />
      </section>

      <section className="mb-8">
        <DailyGoalBar current={doneToday} target={userPreferences.dailyGoalLessons} />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-100">Learning Modules</h3>
          <Link href="/learn" className="text-sm font-semibold text-purple-600 hover:underline dark:text-purple-400">
            View all {modules.length} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featured.map(({ module, progress }) => (
            <ModuleCard
              key={module.id}
              module={module}
              progress={progress}
              recommended={userPreferences.topicPreferences.includes(module.id)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex items-start gap-4">
          <span className="text-3xl" aria-hidden="true">
            💡
          </span>
          <div>
            <h3 className="mb-1 font-bold text-gray-800 dark:text-gray-100">Tip of the day</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">{tipOfTheDay(today)}</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
