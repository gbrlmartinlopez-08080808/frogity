import { Capacitor } from "@capacitor/core";

/** True inside the Android app, false in a browser. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export type HapticKind = "light" | "success" | "error";

const WEB_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 12,
  success: [18, 40, 28],
  error: [40, 60, 40],
};

export async function haptic(kind: HapticKind): Promise<void> {
  try {
    if (isNativeApp()) {
      const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
      if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
      else
        await Haptics.notification({
          type: kind === "success" ? NotificationType.Success : NotificationType.Error,
        });
    } else if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(WEB_PATTERNS[kind]);
    }
  } catch {
    // Haptics are a nicety; never let them break a flow.
  }
}

/** Registers the Android hardware back button. Returns an unsubscribe function. */
export function onHardwareBack(handler: () => void): () => void {
  if (!isNativeApp()) return () => {};
  let remove: (() => void) | null = null;
  let cancelled = false;
  void import("@capacitor/app").then(async ({ App }) => {
    const handle = await App.addListener("backButton", handler);
    if (cancelled) void handle.remove();
    else remove = () => void handle.remove();
  });
  return () => {
    cancelled = true;
    remove?.();
  };
}

/** Sends the app to the background (what back does on a root screen). */
export async function leaveApp(): Promise<void> {
  if (!isNativeApp()) return;
  const { App } = await import("@capacitor/app");
  await App.minimizeApp();
}

/** Fires when the app returns to the foreground (native) or the tab becomes visible (web). */
export function onAppResume(handler: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") handler();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", handler);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", handler);
  };
}
