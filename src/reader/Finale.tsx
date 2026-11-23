// The small celebration when a book is finished, drawn in ASCII with Froggy's own face (the one used everywhere else in the app):
// a book falls out of the sky, Froggy looks up, opens its mouth, catches it and swallows it whole; then "THE END" is typed out and a
// light burst of coloured sparks goes up. About six seconds (no rush: it is the end of a book); a tap after the first moments skips it.
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
const ROWS: string[] = (() => {
  const rows = ['', '', '', '', ''];
  for (const ch of 'THE END') GLYPH[ch].forEach((r, i) => (rows[i] += r + ' '));
  return rows.map((r) => r.trimEnd());
})();

// colour numbers (see .fc0 … in reader.css): 0 ink, 1 faint ink, 2 gold, 3 coral, 4 blue, 5 green
const BOOK = ['.---.', '|[=]|', "'---'"];
const W = 40;
const H = 19;
const STEP = 90;
const TOTAL = 6400;
const bits = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;
const SPARKS = Array.from({ length: 26 }, (_, i) => ({
  vx: (bits(i + 3) - 0.5) * 1.9,
  vy: -(0.7 + bits(i + 41) * 1.3),
  c: "*+.'`~"[Math.floor(bits(i + 7) * 6)],
  k: 2 + Math.floor(bits(i + 19) * 4),
  t0: 46 + Math.floor(bits(i + 61) * 6),
}));

type Cell = { c: string; k: number };

/** Froggy's face as everywhere in the app, on its three lines, with a pair of legs; the eyes look up while a book falls */
function frog(mood: 'idle' | 'up' | 'open' | 'chew' | 'gulp' | 'glad' | 'leap', f: number) {
  const blink = mood === 'idle' && f % 34 > 31;
  const eyes = blink ? '(-) (-)' : mood === 'glad' || mood === 'leap' ? '(^) (^)' : '(@) (@)';
  const mouth = { idle: '-', up: 'o', open: 'O', chew: f % 4 < 2 ? '~' : '-', gulp: 'v', glad: '\\_/', leap: '\\_/' }[mood];
  const m = mouth.length > 1 ? `(  ${mouth}  )` : `(   ${mouth}   )`;
  const legs = mood === 'leap' ? ' /|     |\\ ' : ' _/     \\_ ';
  return ['  _   _  ', ` ${eyes} `, m, legs];
}

function frame(f: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ c: ' ', k: 0 })));
  const put = (x: number, y: number, c: string, k: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H && c !== ' ') grid[y][x] = { c, k };
  };
  const fx = Math.floor((W - 9) / 2);
  const baseY = H - 6; // the top of Froggy's face
  const mouthY = baseY + 2;
  // sparks first (drawn under everything else)
  for (const p of SPARKS) {
    if (f < p.t0) continue;
    const t = f - p.t0;
    put(Math.round(fx + 4 + p.vx * t), Math.round(baseY + p.vy * t * 1.1 + 0.08 * t * t), p.c, p.k);
  }
  // the title types itself in once the book is gone
  const left = Math.floor((W - ROWS[0].length) / 2);
  const shown = Math.min(ROWS[0].length, Math.max(0, Math.floor((f - 40) * 2.6)));
  ROWS.forEach((row, i) => {
    for (let x = 0; x < shown && x < row.length; x++) put(left + x, 2 + i, row[x], 0);
    if (shown > 0 && shown < row.length) put(left + shown, 2 + i, ':', 1);
  });
  // the book falls from above the top of the screen toward Froggy's mouth (faster as it goes), and is gone once it is inside
  const fall0 = 6;
  const fall1 = 30;
  let mood: Parameters<typeof frog>[0] = 'idle';
  if (f >= fall0 && f < fall1) {
    const t = (f - fall0) / (fall1 - fall0);
    const y = Math.round(-4 + (mouthY - 1 + 4) * t * t);
    BOOK.forEach((row, i) => {
      // the part below the mouth is already inside
      if (y + i < mouthY) for (let x = 0; x < row.length; x++) put(fx + 2 + x, y + i, row[x], 1);
    });
    // a few motion marks above it
    if (t > 0.15 && t < 0.9) {
      put(fx + 4, y - 1, '|', 1);
      put(fx + 4, y - 2, ':', 1);
    }
    mood = t < 0.45 ? 'up' : 'open';
  } else if (f >= fall1 && f < fall1 + 8) mood = 'chew';
  else if (f >= fall1 + 8 && f < fall1 + 11) mood = 'gulp';
  else if (f >= fall1 + 11) mood = 'glad';
  let lift = 0;
  if (f >= 52) {
    lift = Math.max(0, Math.round(Math.abs(Math.sin((f - 52) / 3.4)) * 2 * Math.exp(-(f - 52) / 40)));
    if (lift > 0) mood = 'leap';
  }
  frog(mood, f).forEach((row, i) => {
    for (let x = 0; x < row.length; x++) put(fx + x, baseY - lift + i, row[x], 0);
  });
  if (f >= fall1 + 8 && f < fall1 + 12) {
    const m = tr('gulp!');
    for (let i = 0; i < m.length; i++) put(fx + 10 + i, mouthY - lift, m[i], 1);
  }
  if (f >= fall1 && f < fall1 + 8) for (let i = 0; i < 3; i++) put(fx - 1 - i, mouthY - 1 - (f % 2), '~', 1);
  // a shadow
  const sh = lift > 0 ? '- - -' : '-------';
  for (let x = 0; x < sh.length; x++) put(fx + 2 + x + (lift > 0 ? 1 : 0), baseY + 4, sh[x], 1);
  return grid;
}

function Rows({ grid }: { grid: Cell[][] }) {
  return (
    <>
      {grid.map((row, y) => {
        const runs: { k: number; s: string }[] = [];
        for (const cell of row) {
          const last = runs[runs.length - 1];
          if (last && last.k === cell.k) last.s += cell.c;
          else runs.push({ k: cell.k, s: cell.c });
        }
        return (
          <div key={y} className="fl-row">
            {runs.map((r, i) => (
              <span key={i} className={`fc${r.k}`}>
                {r.s}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
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
      setF(calm ? 66 : Math.floor(el / STEP));
      if (el >= (calm ? 1800 : TOTAL)) {
        clearInterval(id);
        finish();
      }
    }, STEP);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="finale" role="status" aria-live="polite" onClick={() => f > 16 && finish()}>
      <pre className="finale-art mono" aria-hidden>
        <Rows grid={frame(f)} />
      </pre>
      <div className="finale-text" style={{ opacity: f > 50 ? 1 : 0 }}>
        <b>{tr("You finished it")}</b>
        <small>{title}</small>
      </div>
    </div>
  );
}
