"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/context/AppContext";
import { isSpeechAvailable, speak, stopSpeaking } from "@/lib/speech";

const noSubscription = () => () => {};

interface ListenButtonProps {
  /** What to read aloud. Give the button a `key` tied to the text so it resets when it changes. */
  text: string;
  /** Start reading as soon as the button appears (when the user enabled auto read-aloud). */
  autoPlay?: boolean;
}

/** Reads lesson text aloud with the device's voice; tap again to stop. */
export default function ListenButton({ text, autoPlay = false }: ListenButtonProps) {
  const { userPreferences } = useApp();
  const available = useSyncExternalStore(noSubscription, isSpeechAvailable, () => false);
  const [speaking, setSpeaking] = useState(false);
  const session = useRef(0);
  const rate = userPreferences.speechRate;

  const start = useCallback(async () => {
    const mine = ++session.current;
    setSpeaking(true);
    await speak(text, rate);
    if (session.current === mine) setSpeaking(false);
  }, [text, rate]);

  const stop = useCallback(() => {
    session.current++;
    stopSpeaking();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    if (!autoPlay || !available) return;
    // Wait for the card's entrance animation so speech and visuals start together.
    const timer = window.setTimeout(() => void start(), 350);
    return () => window.clearTimeout(timer);
    // Only when the button mounts for a new piece of text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never keep talking after the text has left the screen.
  useEffect(
    () => () => {
      session.current++;
      stopSpeaking();
    },
    []
  );

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={speaking ? stop : start}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop reading aloud" : "Listen to this"}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold transition-colors ${
        speaking
          ? "border-purple-500 bg-purple-500 text-white"
          : "border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
      }`}
    >
      {speaking ? (
        <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="speaking-bar h-4 w-1 rounded-full bg-white"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      ) : (
        <span aria-hidden="true">🔊</span>
      )}
      <span>{speaking ? "Stop" : "Listen"}</span>
    </button>
  );
}
