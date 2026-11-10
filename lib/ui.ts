/**
 * Shared page backdrop. Lives outside any "use client" file so server components can use it too.
 * Clips sideways overflow so slide-in animations can never make the page scroll horizontally.
 */
export const PAGE_BACKGROUND =
  "overflow-x-clip bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-purple-950";
