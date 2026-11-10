import ProgressBar from "./ProgressBar";

interface DailyGoalBarProps {
  current: number;
  target: number;
}

export default function DailyGoalBar({ current, target }: DailyGoalBarProps) {
  const isComplete = current >= target;
  const remaining = Math.max(0, target - current);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            {isComplete ? "✅" : "🎯"}
          </span>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Daily Goal</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isComplete
                ? `Goal complete! ${current} lesson${current === 1 ? "" : "s"} today 🎉`
                : `${current} / ${target} lesson${target === 1 ? "" : "s"} today`}
            </p>
          </div>
        </div>
        {isComplete && (
          <div className="animate-pop rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
            DONE!
          </div>
        )}
      </div>
      <ProgressBar
        value={(current / target) * 100}
        label="Daily goal progress"
        barClassName={
          isComplete
            ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-blue-500 to-cyan-500"
        }
      />
      {!isComplete && current > 0 && (
        <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {remaining} more lesson{remaining === 1 ? "" : "s"} to reach your goal!
        </p>
      )}
    </div>
  );
}
