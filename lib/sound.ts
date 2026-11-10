/** Short synthesized sound effects. No audio files, so they work offline and add no weight. */

export type SoundName = "tap" | "correct" | "wrong" | "complete" | "achievement" | "fail";

type Note = { freq: number; start: number; duration: number; type?: OscillatorType; gain?: number };

const SOUNDS: Record<SoundName, Note[]> = {
  tap: [{ freq: 520, start: 0, duration: 0.05, gain: 0.08 }],
  correct: [
    { freq: 659.25, start: 0, duration: 0.12 },
    { freq: 987.77, start: 0.1, duration: 0.2 },
  ],
  wrong: [
    { freq: 233.08, start: 0, duration: 0.14, type: "triangle" },
    { freq: 174.61, start: 0.13, duration: 0.24, type: "triangle" },
  ],
  fail: [
    { freq: 392, start: 0, duration: 0.16, type: "triangle" },
    { freq: 329.63, start: 0.16, duration: 0.16, type: "triangle" },
    { freq: 261.63, start: 0.32, duration: 0.3, type: "triangle" },
  ],
  complete: [
    { freq: 523.25, start: 0, duration: 0.12 },
    { freq: 659.25, start: 0.11, duration: 0.12 },
    { freq: 783.99, start: 0.22, duration: 0.12 },
    { freq: 1046.5, start: 0.33, duration: 0.35 },
  ],
  achievement: [
    { freq: 783.99, start: 0, duration: 0.1 },
    { freq: 1046.5, start: 0.09, duration: 0.1 },
    { freq: 1318.51, start: 0.18, duration: 0.1 },
    { freq: 1567.98, start: 0.27, duration: 0.4 },
  ],
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

export function playSound(name: SoundName): void {
  const ctx = getContext();
  if (!ctx) return;
  // Browsers start the context suspended until a user gesture; sounds here always follow one.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const now = ctx.currentTime + 0.01;
  for (const note of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = note.gain ?? 0.14;
    const startAt = now + note.start;
    osc.type = note.type ?? "sine";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + note.duration + 0.03);
  }
}
