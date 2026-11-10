"use client";

import AppShell from "@/components/AppShell";
import ModuleCard from "@/components/ModuleCard";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/context/AppContext";
import { modules } from "@/data/modules";
import { getModuleProgress, orderedModules } from "@/lib/progress";

export default function LearnPage() {
  const { userProgress, userPreferences } = useApp();

  const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const completedLessons = userProgress.completedLessons.length;
  const overallProgress = (completedLessons / totalLessons) * 100;
  const allDone = completedLessons >= totalLessons;

  return (
    <AppShell title="Learning Modules" subtitle="Choose what to learn next" backHref="/dashboard">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">Overall Progress</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {completedLessons} of {totalLessons} lessons completed
            </p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-3xl font-bold text-transparent">
            {Math.round(overallProgress)}%
          </div>
        </div>
        <ProgressBar value={overallProgress} label="Overall course progress" />
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orderedModules(userPreferences.topicPreferences).map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            progress={getModuleProgress(userProgress, module)}
            recommended={userPreferences.topicPreferences.includes(module.id)}
          />
        ))}
      </div>

      <section className="mt-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-center text-white shadow-xl">
        <div className="mb-2 text-4xl" aria-hidden="true">
          {allDone ? "👑" : "🚀"}
        </div>
        <h3 className="mb-1 text-xl font-bold">{allDone ? "Course complete!" : "Keep going!"}</h3>
        <p className="mx-auto max-w-md text-sm text-white/90">
          {allDone
            ? "You've finished every lesson. Reviewing them keeps the knowledge fresh."
            : "Every lesson brings you closer to financial confidence. You're building skills that will benefit you for life!"}
        </p>
      </section>
    </AppShell>
  );
}
