// A small split-flap counter: when the number goes up, the digits that change flip over like the cards of an old station board.
// It remembers (per place it is shown) the number it last showed, so a count that grew while the reader was elsewhere flips when it
// comes back into view, a moment after it does.
import { useEffect, useRef, useState } from 'react';

const seenKey = (id: string) => `flap:${id}`;
const lastShown = (id: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(seenKey(id)));
    return Number.isFinite(v) && localStorage.getItem(seenKey(id)) !== null ? v : fallback;
  } catch {
    return fallback;
  }
};

export function FlapCount({ id, value, label, className = '' }: { id: string; value: number; label: string; className?: string }) {
  const [shown, setShown] = useState(() => Math.min(value, lastShown(id, value)));
  const [flipping, setFlipping] = useState(0); // counts up on every flip: restarts the animation
  const prev = useRef(shown);
  useEffect(() => {
    if (value === shown) return;
    const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // a moment after it comes into view (a screen that has just opened is still sliding in); while a book is open on top of it, it waits
    let t = 0;
    const go = () => {
      if (document.body.dataset.reading) {
        t = window.setTimeout(go, 200);
        return;
      }
      t = window.setTimeout(() => {
        prev.current = shown;
        setShown(value);
        setFlipping((n) => n + 1);
        try {
          localStorage.setItem(seenKey(id), String(value));
        } catch {
          /* optional */
        }
      }, calm ? 0 : 700);
    };
    go();
    return () => clearTimeout(t);
  }, [value, shown, id]);
  useEffect(() => {
    // nothing to flip: remember what is on show
    if (value === shown)
      try {
        localStorage.setItem(seenKey(id), String(value));
      } catch {
        /* optional */
      }
  }, [value, shown, id]);
  const now = String(shown);
  const was = String(prev.current).padStart(now.length, ' ');
  return (
    <span className={`flap ${className}`} role="img" aria-label={`${label}: ${shown}`}>
      {now.split('').map((d, i) => {
        const changed = flipping > 0 && was[i] !== d;
        return (
          <span key={`${now.length}-${i}-${changed ? flipping : 0}`} className={`flap-d${changed ? ' go' : ''}`} style={{ ['--d' as string]: `${(now.length - 1 - i) * 90}ms` }} aria-hidden>
            <i className="fl-back">{d}</i>
            {changed && <i className="fl-old">{was[i] === ' ' ? ' ' : was[i]}</i>}
            <i className="fl-new">{d}</i>
          </span>
        );
      })}
    </span>
  );
}
