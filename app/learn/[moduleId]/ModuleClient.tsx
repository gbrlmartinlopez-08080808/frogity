"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/context/AppContext";
import { modules } from "@/data/modules";
import { getModuleProgress, isLessonUnlocked } from "@/lib/progress";

export default function ModuleClient({ moduleId }: { moduleId: string }) {
  const { userProgress, notify, feedback } = useApp();
  const currentModule = modules.find((m) => m.id === moduleId);

  if (!currentModule) {
    return (
      <AppShell title="Module not found" backHref="/learn">
        <p className="text-center text-gray-600 dark:text-gray-400">
          This module doesn&apos;t exist.{" "}
          <Link href="/learn" className="font-semibold text-purple-600 underline dark:text-purple-400">
            Browse all modules
          </Link>
        </p>
      </AppShell>
    );
  }

  const progress = getModuleProgress(userProgress, currentModule);
  const nextUp = currentModule.lessons.find((l) => !userProgress.completedLessons.includes(l.id));

  return (
    <AppShell
      title={
        <>
          <span aria-hidden="true">{currentModule.icon}</span> {currentModule.title}
        </>
      }
      subtitle={currentModule.description}
      backHref="/learn"
      width="narrow"
    >
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800 sm:text-xl dark:text-gray-100">Your Progress</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {progress.completedLessons} of {progress.totalLessons} lessons completed
            </p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-3xl font-bold text-transparent">
            {Math.round(progress.percentComplete)}%
          </div>
        </div>
        <ProgressBar value={progress.percentComplete} label={`${currentModule.title} progress`} />
      </section>

      <ol className="space-y-3">
        {currentModule.lessons.map((lesson, index) => {
          const isCompleted = userProgress.completedLessons.includes(lesson.id);
          const isLocked = !isLessonUnlocked(userProgress, currentModule, lesson);
          const isNext = lesson.id === nextUp?.id;

          const card = (
            <div
              className={`rounded-xl border-2 bg-white p-4 shadow-md transition-colors sm:p-5 dark:bg-gray-800 ${
                isCompleted
                  ? "border-green-500"
                  : isNext
                    ? "border-purple-400 dark:border-purple-500"
                    : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  aria-hidden="true"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                    isCompleted
                      ? "bg-green-500 text-white"
                      : isLocked
                        ? "bg-gray-200 text-gray-500 dark:bg-gray-700"
                        : "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300"
                  }`}
                >
                  {isCompleted ? "✓" : isLocked ? "🔒" : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-gray-800 sm:text-lg dark:text-gray-100">{lesson.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                    {lesson.estimatedMinutes} min • {lesson.quiz.length} quiz questions
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                    {isCompleted && (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        Completed • tap to review
                      </span>
                    )}
                    {isNext && !isLocked && (
                      <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        Up next
                      </span>
                    )}
                    {isLocked && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        Complete the previous lesson to unlock
                      </span>
                    )}
                    {!isCompleted && !isLocked && (
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        +{lesson.xpReward} XP
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );

          return (
            <li key={lesson.id}>
              {isLocked ? (
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label={`${lesson.title}, locked. Complete the previous lesson to unlock.`}
                  onClick={() => {
                    feedback("wrong", "error");
                    notify("Complete the previous lesson to unlock this one.");
                  }}
                  className="block w-full cursor-not-allowed rounded-xl text-left opacity-60"
                >
                  {card}
                </button>
              ) : (
                <Link
                  href={`/learn/${moduleId}/${lesson.id}`}
                  className="block rounded-xl transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  {card}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
