"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { PAGE_BACKGROUND } from "@/lib/ui";
import { BottomNav, TopNav } from "./BottomNav";
import LoadingScreen from "./LoadingScreen";

interface AppShellProps {
  title: ReactNode;
  subtitle?: string;
  /** Where the header's back arrow leads. Omit on root screens. */
  backHref?: string;
  /** Intercepts the back arrow (e.g. to confirm leaving a quiz). */
  onBack?: () => void;
  headerExtra?: ReactNode;
  headerBelow?: ReactNode;
  width?: "wide" | "narrow";
  /** Lessons hide the tab bar so the focus stays on the content. */
  showNav?: boolean;
  children: ReactNode;
}

/**
 * Frame for every signed-in screen: waits for saved data, sends new users to
 * onboarding, and renders the header and navigation.
 */
export default function AppShell({
  title,
  subtitle,
  backHref,
  onBack,
  headerExtra,
  headerBelow,
  width = "wide",
  showNav = true,
  children,
}: AppShellProps) {
  const { isLoaded, userProfile } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !userProfile) router.replace("/onboarding");
  }, [isLoaded, userProfile, router]);

  if (!isLoaded || !userProfile) return <LoadingScreen />;

  const maxWidth = width === "wide" ? "max-w-6xl" : "max-w-3xl";
  const backClass =
    "-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700";

  return (
    <div className={`min-h-dvh ${PAGE_BACKGROUND}`}>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        <div className={`${maxWidth} mx-auto px-4 py-3`}>
          <div className="flex items-center gap-3">
            {backHref &&
              (onBack ? (
                <button type="button" onClick={onBack} aria-label="Back" className={backClass}>
                  <span aria-hidden="true">←</span>
                </button>
              ) : (
                <Link href={backHref} aria-label="Back" className={backClass}>
                  <span aria-hidden="true">←</span>
                </Link>
              ))}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-100">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-xs text-gray-500 sm:text-sm dark:text-gray-400">{subtitle}</p>
              )}
            </div>
            {headerExtra}
            {showNav && <TopNav />}
          </div>
          {headerBelow}
        </div>
      </header>

      <main className={`${maxWidth} mx-auto px-4 py-6 ${showNav ? "pb-28 md:pb-10" : "pb-10"}`}>
        {children}
      </main>

      {showNav && <BottomNav />}
    </div>
  );
}
