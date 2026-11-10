import Link from "next/link";
import { PAGE_BACKGROUND } from "@/lib/ui";

export default function NotFound() {
  return (
    <div className={`flex min-h-dvh items-center justify-center p-6 ${PAGE_BACKGROUND}`}>
      <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-gray-800">
        <div className="mb-4 text-6xl" aria-hidden="true">
          🧭
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800 dark:text-gray-100">Page not found</h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          That page doesn&apos;t exist. Let&apos;s get you back to your lessons.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white shadow-lg"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
