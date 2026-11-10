"use client";

import { useApp } from "@/context/AppContext";

const TONES = {
  info: { icon: "💬", className: "border-purple-200 dark:border-purple-700" },
  success: { icon: "✅", className: "border-green-300 dark:border-green-700" },
  error: { icon: "⚠️", className: "border-red-300 dark:border-red-700" },
} as const;

export default function Toaster() {
  const { toasts, dismissToast } = useApp();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border-2 bg-white p-3 shadow-xl dark:bg-gray-800 ${TONES[toast.tone].className}`}
        >
          <span className="text-xl" aria-hidden="true">
            {TONES[toast.tone].icon}
          </span>
          <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="-m-1 rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
