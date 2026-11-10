interface StreakCounterProps {
  streak: number;
  /** The streak is alive but nothing has been completed yet today. */
  atRisk?: boolean;
}

export default function StreakCounter({ streak, atRisk = false }: StreakCounterProps) {
  return (
    <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 p-4 shadow-lg">
      <div className="flex items-center gap-2 text-3xl font-bold text-white sm:text-4xl">
        <span
          aria-hidden="true"
          className={streak > 0 ? (atRisk ? "animate-pulse-scale" : "") : "opacity-60 grayscale"}
        >
          🔥
        </span>
        <span>{streak}</span>
      </div>
      <div className="mt-1 text-sm font-medium text-white">
        Day streak{atRisk && <span className="block text-xs text-white/90">Learn today to keep it!</span>}
      </div>
    </div>
  );
}
