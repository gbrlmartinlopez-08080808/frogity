"use client";

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  emoji?: string;
  /** "row" puts text beside the emoji; "tile" stacks and centres it. */
  layout?: "row" | "tile";
}

/** A selectable option used for single- and multi-choice settings. */
export default function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  emoji,
  layout = "row",
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-xl border-2 p-4 transition-all active:scale-[0.98] ${
        layout === "tile" ? "text-center" : "flex items-center gap-3 text-left"
      } ${
        selected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
          : "border-gray-200 hover:border-purple-300 dark:border-gray-700 dark:hover:border-purple-600"
      }`}
    >
      {emoji && (
        <span className={layout === "tile" ? "mb-1 block text-2xl" : "text-2xl"} aria-hidden="true">
          {emoji}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-800 sm:text-base dark:text-gray-100">
          {title}
        </span>
        {description && (
          <span className="block text-sm text-gray-600 dark:text-gray-400">{description}</span>
        )}
      </span>
      {layout === "row" && (
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            selected ? "bg-purple-500 text-white" : "border-2 border-gray-300 dark:border-gray-600"
          }`}
        >
          {selected ? "✓" : ""}
        </span>
      )}
    </button>
  );
}
