// The small celebration when a book is finished: "THE END" typed out in block letters, confetti falling around it, and Froggy
// hopping with joy: all drawn in ASCII, like the rest of the app. It plays for about three and a half seconds, and a tap skips it.
import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';

const GLYPH: Record<string, string[]> = {
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
  H: ['#   #', '#   #', '#####', '#   #', '#   #'],
  E: ['#####', '#    ', '###  ', '#    ', '#####'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #'],
  D: ['#### ', '#   #', '#   #', '#   #', '#### '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
};
const TITLE = 'THE END';
const ART = (() => {
  const rows = ['', '', '', '', ''];
  for (const ch of TITLE) GLYPH[ch].forEach((r, i) => (rows[i] += r + ' '));
  return rows.map((r) => r.trimEnd());
})();
const W = 42;
const H = 15;
const CONFETTI = "*+o.'`~^";
const TOTAL = 3500;
const STEP = 90;

// fixed, repeatable "random" so every finish looks the same and nothing needs a generator
const bits = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;
const pieces = Array.from({ length: 34 }, (_, i) => ({ x: Math.floor(bits(i + 1) * W), y0: bits(i + 50) * H, v: 0.25 + bits(i + 90) * 0.6, c: CONFETTI[Math.floor(bits(i + 7) * CONFETTI.length)], d: bits(i + 31) * 6 }));

function frame(f: number): string {
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
  // confetti, falling and drifting
  for (const p of pieces) {
    if (f < p.d) continue;
    const y = Math.floor((p.y0 + (f - p.d) * p.v) % H);
    const x = Math.floor(p.x + Math.sin((f + p.x) / 3) * 1.4 + W) % W;
    grid[y][x] = p.c;
  }
  // the title, letter by letter
  const shown = Math.min(ART[0].length, Math.max(0, Math.floor((f - 3) * 2.6)));
  const left = Math.floor((W - ART[0].length) / 2);
  ART.forEach((row, i) => {
    for (let x = 0; x < shown && x < row.length; x++) if (row[x] !== ' ') grid[3 + i][left + x] = row[x];
    // a bright edge while the letters arrive
    if (shown < row.length && shown > 0) grid[3 + i][left + shown] = i % 2 ? ':' : '.';
  });
  // Froggy: waits, then hops, with arms up at the top of each hop
  const hopAt = f - 14;
  const up = hopAt > 0 ? Math.abs(Math.sin(hopAt / 2.2)) > 0.55 : false;
  const frog = f < 10 ? ['  (-_-)  '] : up ? ['\\(^o^)/'] : ['  (^o^)  '];
  const fy = up ? H - 3 : H - 2;
  const fx = Math.floor((W - 7) / 2);
  const face = frog[0].trim().padStart(frog[0].trim().length, ' ');
  for (let i = 0; i < face.length; i++) grid[fy][fx + i] = face[i];
  const feet = up ? '  / \\  ' : ' _/ \\_ ';
  for (let i = 0; i < feet.length; i++) if (feet[i] !== ' ') grid[fy + 1][fx + i - 0] = feet[i];
  return grid.map((r) => r.join('')).join('\n');
}

export function Finale({ title, onDone }: { title: string; onDone: () => void }) {
  const [f, setF] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const el = performance.now() - t0;
      setF(Math.floor(calm ? 40 : el / STEP));
      if (el >= (calm ? 1500 : TOTAL)) {
        clearInterval(id);
        finish();
      }
    }, STEP);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const late = f > 26;
  return (
    <div className="finale" role="status" aria-live="polite" onClick={() => f > 12 && finish()}>
      <pre className="finale-art mono" aria-hidden>
        {frame(f)}
      </pre>
      <div className="finale-text" style={{ opacity: late ? 1 : 0 }}>
        <b>{tr("You finished it")}</b>
        <small>{title}</small>
      </div>
    </div>
  );
}
