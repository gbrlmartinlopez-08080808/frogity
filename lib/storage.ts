import type { UserPreferences, UserProfile, UserProgress } from "@/types";
import { sanitizePreferences, sanitizeProfile, sanitizeProgress } from "./progress";

export const STORAGE_KEYS = {
  profile: "financedly_user_profile",
  preferences: "financedly_user_preferences",
  progress: "financedly_user_progress",
} as const;

/** Keys written by older builds that are no longer used. */
const LEGACY_KEYS = ["financedly_onboarding"];

export interface StoredState {
  profile: UserProfile | null;
  preferences: UserPreferences;
  progress: UserProgress;
}

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // Corrupt JSON or blocked storage: fall back to defaults rather than crash.
    return null;
  }
}

export function loadState(): StoredState {
  return {
    profile: sanitizeProfile(read(STORAGE_KEYS.profile)),
    preferences: sanitizePreferences(read(STORAGE_KEYS.preferences)),
    progress: sanitizeProgress(read(STORAGE_KEYS.progress)),
  };
}

/** Returns false when the browser refused the write (private mode, quota full). */
export function saveState(state: StoredState): boolean {
  try {
    if (state.profile) {
      window.localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(state.profile));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.profile);
    }
    window.localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(state.preferences));
    window.localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress));
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    for (const key of [...Object.values(STORAGE_KEYS), ...LEGACY_KEYS]) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
