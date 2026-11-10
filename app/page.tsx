"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import { useApp } from "@/context/AppContext";

/** Entry point: wait for saved data, then send the user to the right place. */
export default function Home() {
  const { isLoaded, userProfile } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    router.replace(userProfile ? "/dashboard" : "/onboarding");
  }, [isLoaded, userProfile, router]);

  return <LoadingScreen />;
}
