// The end of a book. When the last line is on screen a quiet note says so; pulling the page further (finger up on a scrolling
// page, finger left on a turning page, or the wheel on a computer) fills a bar, and letting go past the mark finishes the book
// and takes it off the shelf. Nothing happens by accident: reaching the end alone does nothing, and the removal has an Undo.
import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';

const NEED = 130; // px of pull, past the end, that count as "yes"
const WHEEL_NEED = 420; // the wheel (a computer) needs a longer, deliberate push

export function useEndPull(scroller: HTMLElement | null, opts: { paged: boolean; enabled: boolean; onTrigger: () => void }) {
  const [atEnd, setAtEnd] = useState(false);
  const [pull, setPull] = useState(0); // 0..1
  const cb = useRef(opts.onTrigger);
  cb.current = opts.onTrigger;
  const { paged, enabled } = opts;

  useEffect(() => {
    const el = scroller;
    if (!el || !enabled) {
      setAtEnd(false);
      setPull(0);
      return;
    }
    const born = performance.now();
    let end = false;
    let origin: { x: number; y: number } | null = null;
    let amount = 0;
    let fired = false;
    let wheel = 0;
    let wheelT = 0;
    const measure = () => {
      const left = paged ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollHeight - el.clientHeight - el.scrollTop;
      const now = left <= 4;
      if (now !== end) {
        end = now;
        setAtEnd(now);
        if (!now) {
          origin = null;
          amount = 0;
          setPull(0);
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
      setPull(Math.min(1, amount / NEED));
    };
    const up = () => {
      const hit = amount >= NEED && end && !fired && performance.now() - born > 1200;
      origin = null;
      amount = 0;
      setPull(0);
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
        setPull(0);
        return;
      }
      wheel += d;
      setPull(Math.min(1, wheel / WHEEL_NEED));
      clearTimeout(wheelT);
      wheelT = window.setTimeout(() => {
        wheel = 0;
        setPull(0);
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

  return { atEnd, pull };
}

export function EndNote({ atEnd, pull, uri }: { atEnd: boolean; pull: number; uri: boolean }) {
  if (!atEnd) return null;
  const ready = pull >= 1;
  return (
    <div className={`endpull${pull > 0 ? ' pulling' : ''}${ready ? ' ready' : ''}`} style={{ ['--pull' as string]: pull }} role="status" aria-live="polite">
      <span className="ep-dots mono" aria-hidden>
        · · ·
      </span>
      <b>{tr("The end")}</b>
      <small className="mono">{ready ? tr("let go to finish") : uri ? tr("pull up to finish and take it off your shelf") : tr("pull up to finish and remove it")}</small>
      <i className="ep-bar" aria-hidden>
        <u />
      </i>
    </div>
  );
}
