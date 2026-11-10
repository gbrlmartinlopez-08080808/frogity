import type { Achievement } from "@/types";

interface AchievementBadgeProps {
  achievement: Achievement;
  isUnlocked: boolean;
}

export default function AchievementBadge({ achievement, isUnlocked }: AchievementBadgeProps) {
  return (
    <div
      className="flex flex-col items-center"
      aria-label={`${achievement.title}: ${achievement.description}. ${isUnlocked ? "Unlocked" : "Locked"}.`}
    >
      <div
        aria-hidden="true"
        className={`mb-2 flex h-16 w-16 items-center justify-center rounded-full text-3xl transition-transform duration-300 sm:h-20 sm:w-20 ${
          isUnlocked
            ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg hover:scale-110"
            : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <span className={isUnlocked ? "" : "opacity-30 grayscale"}>{achievement.icon}</span>
      </div>
      <h3
        className={`text-center text-xs font-semibold sm:text-sm ${
          isUnlocked ? "text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {achievement.title}
      </h3>
      <p className="mt-0.5 text-center text-xs text-gray-500 dark:text-gray-400">
        {isUnlocked ? `+${achievement.xpReward} XP earned` : achievement.requirement}
      </p>
    </div>
  );
}
