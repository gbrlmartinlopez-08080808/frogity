"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/learn", label: "Learn", icon: "📚" },
  { href: "/progress", label: "Progress", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function useActiveHref() {
  const pathname = usePathname();
  return ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
}

/** Tab bar pinned to the bottom of the screen on phones. */
export function BottomNav() {
  const active = useActiveHref();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur md:hidden dark:border-gray-700 dark:bg-gray-800/95"
    >
      <ul className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const isActive = item.href === active;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  isActive
                    ? "text-purple-600 dark:text-purple-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`text-2xl transition-transform ${isActive ? "scale-110" : "opacity-70 grayscale"}`}
                >
                  {item.icon}
                </span>
                <span className={`text-xs ${isActive ? "font-bold" : "font-medium"}`}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same destinations as text links in the header on tablets and desktops. */
export function TopNav() {
  const active = useActiveHref();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {ITEMS.map((item) => {
          const isActive = item.href === active;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
