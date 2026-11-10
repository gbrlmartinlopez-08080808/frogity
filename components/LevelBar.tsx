import { XP_PER_LEVEL, levelFromXp, xpIntoLevel } from "@/lib/progress";
import ProgressBar from "./ProgressBar";

export default function LevelBar({ xp }: { xp: number }) {
  const level = levelFromXp(xp);
  const into = xpIntoLevel(xp);

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-sm font-bold text-white">
            Level {level}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {into} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {XP_PER_LEVEL - into} XP to level {level + 1}
        </span>
      </div>
      <ProgressBar value={(into / XP_PER_LEVEL) * 100} label={`Progress to level ${level + 1}`} height="h-4" />
    </div>
  );
}
