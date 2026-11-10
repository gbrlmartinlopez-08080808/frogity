interface ProgressBarProps {
  /** 0-100 */
  value: number;
  label: string;
  height?: string;
  barClassName?: string;
  trackClassName?: string;
}

export default function ProgressBar({
  value,
  label,
  height = "h-3",
  barClassName = "bg-gradient-to-r from-purple-500 to-pink-500",
  trackClassName = "bg-gray-200 dark:bg-gray-700",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={`w-full overflow-hidden rounded-full ${height} ${trackClassName}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
