// The end of a book. Reaching the last page does nothing and shows nothing. Pulling past it (finger up on a scrolling page,
// finger left on a turning page, or the wheel on a computer) drags the whole page up (with some resistance, like a rubber band),
// and in the space that opens below it a small message appears; hold the pull far enough and letting go finishes the book and
// takes it off the shelf. Nothing happens by accident, and the removal has an Undo.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { tr } from '../lib/i18n';

const NEED = 190; // px of pull, past the end, that count as "yes"
const SHOW = 14; // px of pull before the message starts to appear
const HOLD = 1100; // ms the pull must be kept past the line before letting go counts: nothing about the end is swift
const rubber = (d: number) => 150 * (1 - Math.exp(-d / 190)); // how far the page follows the finger: it gives, then resists
const WHEEL_NEED = 700; // the wheel (a computer) needs a longer, deliberate push

// The pull is kept outside React: every touch move updates the page's transform and this tiny store, and only the message
// (a few lines) renders again. The reader itself, a very large component, is never re-rendered by a pull.
const store = { raw: 0, pull: 0, held: 0 };
const subs = new Set<() => void>();
const put = (raw: number, held = 0) => {
  store.held = held;
  store.raw = raw;
  store.pull = Math.min(1, raw / NEED);
  subs.forEach((f) => f());
};
let snap = { ...store };
const getSnap = () => {
  if (snap.raw !== store.raw || snap.pull !== store.pull || snap.held !== store.held) snap = { raw: store.raw, pull: store.pull, held: store.held };
  return snap;
};
const sub = (f: () => void) => (subs.add(f), () => void subs.delete(f));

export function useEndPull(scroller: HTMLElement | null, opts: { paged: boolean; enabled: boolean; onTrigger: () => void }) {
  const cb = useRef(opts.onTrigger);
  cb.current = opts.onTrigger;
  const { paged, enabled } = opts;

  useEffect(() => {
    const el = scroller;
    if (!el || !enabled) {
      put(0);
      return;
    }
    const born = performance.now();
    let end = false;
    let origin: { x: number; y: number } | null = null;
    let amount = 0;
    let fired = false;
    let wheel = 0;
    let wheelT = 0;
    const horizontal = paged;
    // the page itself moves with the pull; this is set on the scroller directly, so there is no re-render for every pixel
    let frame = 0;
    let want = 0;
    let wantSettle = false;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--ev', rubber(want).toFixed(1));
      el.classList.toggle('endpulling', want > 0);
      el.classList.toggle('endsettle', wantSettle);
      el.dataset.endAxis = horizontal ? 'x' : 'y';
      put(want, held);
    };
    // the line is not enough: the pull has to be kept there for a moment, and the bar below fills while it is
    let held = 0;
    let heldAt = 0;
    let holdTick = 0;
    const holdLoop = () => {
      holdTick = 0;
      if (want < NEED || fired) {
        heldAt = 0;
        held = 0;
        return;
      }
      if (!heldAt) heldAt = performance.now();
      held = Math.min(1, (performance.now() - heldAt) / HOLD);
      apply();
      if (held < 1) holdTick = requestAnimationFrame(holdLoop);
    };
    // one update per screen frame, however many touch events arrive
    const drive = (raw: number, settle = false) => {
      want = raw;
      wantSettle = settle;
      if (settle || raw === 0) {
        cancelAnimationFrame(frame);
        apply();
      } else if (!frame) frame = requestAnimationFrame(apply);
      if (raw >= NEED && !holdTick && !fired) holdTick = requestAnimationFrame(holdLoop);
      if (raw < NEED) {
        heldAt = 0;
        held = 0;
      }
    };
    const measure = () => {
      const left = paged ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollHeight - el.clientHeight - el.scrollTop;
      const now = left <= 4;
      if (now !== end) {
        end = now;
        if (!now) {
          origin = null;
          amount = 0;
          drive(0);
        }
      }
      return now;
    };
    const t0 = window.setTimeout(measure, 200);
    const onScroll = () => measure();
    const down = () => {
      origin = null;
      amount = 0;
    };
    const move = (e: TouchEvent) => {
      if (fired || e.touches.length !== 1) return;
      if (!measure()) return;
      const t = e.touches[0];
      // the pull is counted from the moment the end was reached, so a drag that carries on from the middle of the book works too
      if (!origin) origin = { x: t.clientX, y: t.clientY };
      const dy = origin.y - t.clientY;
      const dx = origin.x - t.clientX;
      amount = Math.max(0, paged ? Math.max(dx, dy * 0.8) : dy);
      drive(amount);
    };
    const up = () => {
      const hit = amount >= NEED && held >= 1 && end && !fired && performance.now() - born > 1200;
      origin = null;
      amount = 0;
      cancelAnimationFrame(holdTick);
      holdTick = 0;
      held = 0;
      heldAt = 0;
      drive(0, true); // the page springs back
      if (hit) {
        fired = true;
        cb.current();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (fired || e.ctrlKey || !measure()) return;
      const d = paged ? e.deltaX || e.deltaY : e.deltaY;
      if (d <= 0) {
        wheel = 0;
        drive(0, true);
        return;
      }
      wheel += d;
      drive((wheel / WHEEL_NEED) * NEED);
      clearTimeout(wheelT);
      wheelT = window.setTimeout(() => {
        wheel = 0;
        drive(0, true);
      }, 700);
      if (wheel >= WHEEL_NEED && performance.now() - born > 1200) {
        fired = true;
        cb.current();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', up, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(holdTick);
      put(0);
      el.style.removeProperty('--ev');
      el.classList.remove('endpulling', 'endsettle');
      clearTimeout(t0);
      clearTimeout(wheelT);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onScroll);
    };
  }, [scroller, paged, enabled]);

}

/** The small message in the space the pulled page leaves behind. It is only there while the page is being pulled. */
export function EndNote({ uri }: { uri: boolean }) {
  const { pull, raw, held } = useSyncExternalStore(sub, getSnap);
  if (raw < SHOW) return null;
  const ready = pull >= 1 && held >= 1;
  const k = Math.min(1, (raw - SHOW) / 40);
  return (
    <div className={`endpull${ready ? ' ready' : ''}`} style={{ ['--pull' as string]: pull >= 1 ? 0.5 + held * 0.5 : pull * 0.5, opacity: k }} role="status" aria-live="polite">
      <b>{ready ? tr("let go to finish") : pull >= 1 ? tr("hold it there…") : tr("The end")}</b>
      <small className="mono">{ready ? (uri ? tr("it leaves your shelf") : tr("it is removed, with an Undo")) : uri ? tr("keep pulling to finish and take it off your shelf") : tr("keep pulling to finish and remove it")}</small>
      <i className="ep-bar" aria-hidden>
        <u />
      </i>
    </div>
  );
}
