import type { UserPreferences, UserProfile, UserProgress } from "@/types";
import { DEFAULT_PREFERENCES, createInitialProgress } from "./progress";
import { STORAGE_KEYS, clearState, loadState, saveState } from "./storage";

/**
 * The app's persisted state, kept outside React so that it can be read synchronously
 * (a quiz result needs the progress it was applied to), survives route changes, and
 * stays in sync between browser tabs.
 */
export interface AppState {
  /** False while prerendering and during hydration, before localStorage has been read. */
  loaded: boolean;
  /** False when the browser refused the last save (private mode, storage full). */
  storageOk: boolean;
  profile: UserProfile | null;
  preferences: UserPreferences;
  progress: UserProgress;
}

const UNLOADED: AppState = {
  loaded: false,
  storageOk: true,
  profile: null,
  preferences: DEFAULT_PREFERENCES,
  progress: createInitialProgress(),
};

let state: AppState = UNLOADED;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readFromStorage() {
  state = { ...loadState(), loaded: true, storageOk: state.storageOk };
}

function onStorageEvent(event: StorageEvent) {
  // Another tab changed (or cleared) our data: adopt it instead of overwriting it later.
  const ours: (string | null)[] = Object.values(STORAGE_KEYS);
  if (event.key === null || ours.includes(event.key)) {
    readFromStorage();
    emit();
  }
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorageEvent);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorageEvent);
  };
}

export function getSnapshot(): AppState {
  if (!state.loaded) readFromStorage();
  return state;
}

export const getServerSnapshot = (): AppState => UNLOADED;

type Persisted = Pick<AppState, "profile" | "preferences" | "progress">;

export function update(change: (current: AppState) => Partial<Persisted>): AppState {
  const current = getSnapshot();
  const next = { ...current, ...change(current) };
  state = { ...next, storageOk: saveState(next) };
  emit();
  return state;
}

export function reset(): void {
  clearState();
  state = { ...UNLOADED, loaded: true, preferences: { ...DEFAULT_PREFERENCES } };
  emit();
}
