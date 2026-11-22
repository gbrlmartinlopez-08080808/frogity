// The small celebration when a book is finished, drawn in ASCII like the rest of the app: Froggy hops in, "THE END" is typed
// out in colourful block letters, Froggy leaps for joy and a burst of confetti goes up and comes down. It plays for about five
// seconds (no rush: this is the end of a book), and a tap after the first moments skips it.
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
// colour numbers 0‥7 (see .fc0 … in reader.css): green, gold, coral, blue, violet, teal, pink, ink
const LETTER_COLOUR: Record<string, number> = { T: 2, H: 1, E: 0, N: 3, D: 4 };
const ROWS: string[] = (() => {
  const rows = ['', '', '', '', ''];
  for (const ch of TITLE) GLYPH[ch].forEach((r, i) => (rows[i] += r + ' '));
  return rows.map((r) => r.trimEnd());
})();
/** which colour each column of the title is (every letter has its own) */
const COLS: number[] = (() => {
  const out: number[] = [];
  for (const ch of TITLE) for (let i = 0; i < GLYPH[ch][0].length + 1; i++) out.push(LETTER_COLOUR[ch] ?? 7);
  return out;
})();

const FROG_SIT = ['  _             _  ', ' (o)___________(o) ', '(      \\___/      )', ' \\_______________/ ', '  /_/         \\_\\  '];
const FROG_JUMP = [' \\  _         _  / ', ' (^)___________(^) ', '(      \\___/      )', ' \\_______________/ ', "  /|           |\\  "];
const FROG_WIN = ['  _             _  ', ' (^)___________(^) ', '(      \\___/      )', ' \\_______________/ ', '  /_/         \\_\\  '];

const W = 44;
const H = 19;
const CONFETTI = "*+o.'`~^x";
const STEP = 90;
const TOTAL = 5400;
const bits = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;
// confetti: thrown up from Froggy once the title is in, falls with gravity; a gentle rain from above follows
const BURST = Array.from({ length: 46 }, (_, i) => ({
  vx: (bits(i + 3) - 0.5) * 2.1,
  vy: -(0.9 + bits(i + 41) * 1.6),
  c: CONFETTI[Math.floor(bits(i + 7) * CONFETTI.length)],
  k: Math.floor(bits(i + 19) * 7),
  t0: 34 + Math.floor(bits(i + 61) * 6),
}));
const RAIN = Array.from({ length: 22 }, (_, i) => ({ x: Math.floor(bits(i + 5) * W), y0: bits(i + 23) * H, v: 0.22 + bits(i + 77) * 0.3, c: CONFETTI[Math.floor(bits(i + 9) * CONFETTI.length)], k: Math.floor(bits(i + 29) * 7), d: 36 + bits(i + 13) * 10 }));

type Cell = { c: string; k: number };

function frame(f: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ c: ' ', k: 7 })));
  const put = (x: number, y: number, c: string, k: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H && c !== ' ') grid[y][x] = { c, k };
  };
  const fw = FROG_SIT[0].length;
  const homeX = Math.floor((W - fw) / 2);
  const baseY = H - 6;
  // confetti first (thrown from Froggy, falling back): the title and Froggy are drawn over it, never hidden by it
  for (const p of BURST) {
    if (f < p.t0) continue;
    const t = f - p.t0;
    const x = Math.round(homeX + fw / 2 + p.vx * t);
    const y = Math.round(baseY + p.vy * t * 1.1 + 0.09 * t * t);
    put(x, y, p.c, p.k);
  }
  for (const p of RAIN) {
    if (f < p.d) continue;
    const y = Math.floor((p.y0 + (f - p.d) * p.v) % H);
    const x = Math.floor(p.x + Math.sin((f + p.x) / 3) * 1.4 + W) % W;
    put(x, y, p.c, p.k);
  }
  // the title: its letters appear one column at a time, each in its own colour, with a spark on the edge
  const left = Math.floor((W - ROWS[0].length) / 2);
  const shown = Math.min(ROWS[0].length, Math.max(0, Math.floor((f - 12) * 1.15)));
  ROWS.forEach((row, i) => {
    for (let x = 0; x < shown && x < row.length; x++) put(left + x, 2 + i, row[x], COLS[x]);
    if (shown > 0 && shown < row.length) put(left + shown, 2 + i, i % 2 ? '+' : '*', 1);
  });
  // when it is complete a shimmer runs across it
  if (f > 34 && f < 46) {
    const sx = Math.floor((f - 34) * 3.4);
    for (let i = 0; i < 5; i++) if (ROWS[i][sx] && ROWS[i][sx] !== ' ') put(left + sx, 2 + i, ROWS[i][sx], 7);
  }
  // Froggy: hops in from the left, sits, then leaps for joy as the title lands
  let fx = homeX;
  let lift = 0;
  let art = FROG_SIT;
  if (f < 14) {
    const p = f / 14;
    fx = Math.round(-fw + (homeX + fw) * (1 - (1 - p) * (1 - p)));
    lift = Math.round(Math.abs(Math.sin(f * 0.9)) * 2.4);
    art = lift > 1 ? FROG_JUMP : FROG_SIT;
  } else if (f >= 34) {
    const t = (f - 34) / 5.5;
    lift = Math.max(0, Math.round(Math.sin(t * Math.PI) * 3.2 * Math.exp(-Math.max(0, f - 34) / 60)));
    art = lift > 0 ? FROG_JUMP : FROG_WIN;
    if (f > 70) art = f % 12 < 6 ? FROG_JUMP : FROG_WIN;
  }
  art.forEach((row, i) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      // eyes gold, the smile coral, the rest Froggy green
      const k = ch === 'o' || ch === '^' ? 1 : ch === '-' ? 5 : 0;
      put(fx + x, baseY - lift + i, ch, i === 2 && x >= 7 && x <= 11 ? 2 : k);
    }
  });
  // a shadow, smaller the higher Froggy is
  const sh = lift > 1 ? '- - -' : '-------';
  for (let x = 0; x < sh.length; x++) put(homeX + 4 + x + (lift > 1 ? 1 : 0), baseY + 5, sh[x], 7);
  // a little speech bubble once Froggy is happy
  if (f >= 46) {
    const msg = tr('well read!');
    const n = Math.min(msg.length, Math.floor((f - 46) / 1.2));
    const bx = homeX + fw + 1;
    const by = baseY - 1;
    put(bx, by, '<', 7);
    for (let i = 0; i < n; i++) put(bx + 2 + i, by, msg[i], 1);
  }
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
      setF(calm ? 60 : Math.floor(el / STEP));
      if (el >= (calm ? 1800 : TOTAL)) {
        clearInterval(id);
        finish();
      }
    }, STEP);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const late = f > 40;
  return (
    <div className="finale" role="status" aria-live="polite" onClick={() => f > 16 && finish()}>
      <pre className="finale-art mono" aria-hidden>
        <Rows grid={frame(f)} />
      </pre>
      <div className="finale-text" style={{ opacity: late ? 1 : 0 }}>
        <b>{tr("You finished it")}</b>
        <small>{title}</small>
      </div>
    </div>
  );
}
