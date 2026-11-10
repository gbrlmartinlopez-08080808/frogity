"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { parentPath, runBackInterceptors } from "@/lib/back";
import { leaveApp, onHardwareBack } from "@/lib/native";

/** Makes the Android back button move up one screen, and leave the app from a root screen. */
export default function BackButtonHandler() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(
    () =>
      onHardwareBack(() => {
        if (runBackInterceptors()) return;
        const parent = parentPath(pathname);
        if (parent) router.replace(parent);
        else void leaveApp();
      }),
    [pathname, router]
  );

  return null;
}
