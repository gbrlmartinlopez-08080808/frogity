/**
 * Screens can intercept "back" (the Android hardware button or Escape-like flows)
 * to close a dialog or step backwards before the app navigates away.
 */
type Interceptor = () => boolean;

const interceptors: Interceptor[] = [];

/** Registers an interceptor; the most recently added one is asked first. */
export function pushBackInterceptor(interceptor: Interceptor): () => void {
  interceptors.push(interceptor);
  return () => {
    const index = interceptors.lastIndexOf(interceptor);
    if (index >= 0) interceptors.splice(index, 1);
  };
}

/** Returns true if a screen handled the back press itself. */
export function runBackInterceptors(): boolean {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    if (interceptors[i]()) return true;
  }
  return false;
}

/** The screen one level up from `pathname`, or null for a root screen. */
export function parentPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "learn") {
    if (parts.length >= 3) return `/learn/${parts[1]}`;
    if (parts.length === 2) return "/learn";
    return "/dashboard";
  }
  if (parts[0] === "progress" || parts[0] === "settings") return "/dashboard";
  return null;
}
