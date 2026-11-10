import Link from "next/link";
import type { Module, ModuleProgress } from "@/types";

interface ModuleCardProps {
  module: Module;
  progress: ModuleProgress;
  /** One of the topics the learner picked as a priority. */
  recommended?: boolean;
}

export default function ModuleCard({ module, progress, recommended = false }: ModuleCardProps) {
  const { percentComplete, completedLessons, totalLessons } = progress;
  const isComplete = totalLessons > 0 && completedLessons === totalLessons;
  const action = isComplete ? "Review" : completedLessons > 0 ? "Continue" : "Start learning";

  return (
    <Link
      href={`/learn/${module.id}`}
      className="group block h-full rounded-2xl transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className={`${module.color} flex h-full flex-col rounded-2xl p-5 shadow-lg`}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="text-4xl sm:text-5xl" aria-hidden="true">
            {module.icon}
          </div>
          {isComplete ? (
            <div className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold text-white">✓ COMPLETE</div>
          ) : (
            recommended && (
              <div className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold text-white">★ FOR YOU</div>
            )
          )}
        </div>

        <h3 className="mb-1 text-xl font-bold text-white">{module.title}</h3>
        <p className="mb-4 flex-1 text-sm text-white/90">{module.description}</p>

        <div className="mb-1 flex justify-between text-xs text-white">
          <span>
            {completedLessons} / {totalLessons} lessons
          </span>
          <span>{Math.round(percentComplete)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        <div className="mt-3 text-xs font-semibold text-white/90">
          {action} <span aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}
