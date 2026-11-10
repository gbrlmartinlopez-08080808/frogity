import type { SpeechRate } from "@/types";
import { isNativeApp } from "./native";

/**
 * Read-aloud. The Android WebView has no Web Speech API, so the app uses the device's
 * text-to-speech engine through a native plugin; browsers use speechSynthesis.
 */

const RATES: Record<SpeechRate, number> = { slow: 0.8, normal: 1, fast: 1.25 };

/** Bumped on every speak/stop so a superseded utterance can't report itself as finished. */
let generation = 0;

/** Turns lesson text into something that sounds natural when spoken. */
export function toSpokenText(text: string): string {
  return (
    text
      // Emoji, pictographs, variation selectors and keycap marks are visual only.
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
      .replace(/[✓✔]/g, " ")
      .replace(/→/g, ", which leads to ")
      .replace(/≤/g, " at most ")
      .replace(/≥/g, " at least ")
      .replace(/~\s*(?=\$|\d)/g, "about ")
      .replace(/×/g, " times ")
      .replace(/÷/g, " divided by ")
      .replace(/(\d)\s*-\s*(\$?\d)/g, "$1 to $2")
      .replace(/(\d[\d,.]*[KkMm]?\+?)\s*\/\s*(?:hr|hour)\b/gi, "$1 per hour")
      .replace(/(\d[\d,.]*[KkMm]?\+?)\s*\/\s*([a-z]+)/gi, "$1 per $2")
      .replace(/\b24\/7\b/g, "24 7")
      .replace(/\/\s*(week|month|year|day|hour)\b/gi, " per $1")
      .replace(/https?:\/\//gi, "https ")
      .replace(/([)%])\s*\/\s*(\d)/g, "$1 divided by $2")
      .replace(/(\d+)\/(\d+)\/(\d+)/g, "$1 $2 $3")
      .replace(/\bvs\.?(?=\s)/gi, "versus")
      .replace(/\bP2P\b/g, "peer to peer")
      .replace(/\bBNPL\b/g, "buy now pay later")
      .replace(/\bw\//g, "with ")
      .replace(/\s*\/\s*/g, " or ")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/[*_#]/g, "")
      .replace(/([^.!?:;,\s])\s*\n+/g, "$1. ")
      .replace(/\n+/g, " ")
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

export function isSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeApp() || "speechSynthesis" in window;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return (
    english.find((v) => v.lang.toLowerCase() === "en-us" && v.localService) ??
    english.find((v) => v.lang.toLowerCase() === "en-us") ??
    english[0]
  );
}

/** Chrome cuts off long utterances, so speak one sentence-sized chunk at a time. */
function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + sentence).length > 180) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function speakOnWeb(text: string, rate: number, id: number): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const parts = chunk(text);
    const voice = pickVoice();
    parts.forEach((part, index) => {
      const utterance = new SpeechSynthesisUtterance(part);
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      const finish = () => {
        if (index === parts.length - 1 || id !== generation) resolve();
      };
      utterance.onend = finish;
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  });
}

/**
 * Speaks `text`, replacing anything already being read. Resolves with true when it
 * finished naturally and false when it was interrupted or speech isn't available.
 */
export async function speak(text: string, rate: SpeechRate = "normal"): Promise<boolean> {
  const spoken = toSpokenText(text);
  const id = ++generation;
  if (!spoken || !isSpeechAvailable()) return false;
  try {
    if (isNativeApp()) {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.stop().catch(() => {});
      if (id !== generation) return false;
      await TextToSpeech.speak({
        text: spoken,
        lang: "en-US",
        rate: RATES[rate],
        pitch: 1,
        volume: 1,
        category: "playback",
      });
    } else {
      await speakOnWeb(spoken, RATES[rate], id);
    }
    return id === generation;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  generation++;
  if (typeof window === "undefined") return;
  try {
    if (isNativeApp()) {
      void import("@capacitor-community/text-to-speech").then(({ TextToSpeech }) =>
        TextToSpeech.stop().catch(() => {})
      );
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Already silent.
  }
}
