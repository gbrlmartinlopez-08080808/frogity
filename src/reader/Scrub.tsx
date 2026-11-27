import { useRef, useState } from 'react';
import { tap } from '../lib/native';

/**
 * A bar to move through the whole book (or track) with a finger, like a music player's. While it is held, a label
 * above the thumb says where it would land; `onChange` is called as it moves (`final` when the finger lifts).
 */
export interface ScrubSection {
  title: string;
  at: number; // 0…1 along the bar
}
/**
 * The position bar. With `sections` (the book's chapters and parts): while it is held their places are marked on it, the finger
 * snaps to a section's start and the label names the section; held still for a moment, it opens the list of sections to jump to.
 */
export function Scrub({
  value,
  label,
  onChange,
  className = '',
  ariaLabel,
  sections,
  onSection,
}: {
  value: number;
  label: (v: number) => string;
  onChange: (v: number, final: boolean) => void;
  className?: string;
  ariaLabel: string;
  sections?: () => ScrubSection[];
  onSection?: (i: number) => void;
}) {
  const [secs, setSecs] = useState<ScrubSection[]>([]);
  const [list, setList] = useState(false);
  const holdT = useRef(0);
  const down = useRef({ x: 0, moved: false });
  const snapped = useRef(-1);
  const snap = (x: number) => {
    const w = track.current?.getBoundingClientRect().width ?? 300;
    const near = secs.findIndex((s) => Math.abs(s.at - x) * w < 10);
    if (near >= 0) {
      if (snapped.current !== near) tap('select');
      snapped.current = near;
      return secs[near].at;
    }
    snapped.current = -1;
    return x;
  };
  const secAt = (x: number) => {
    let i = -1;
    secs.forEach((s, k) => s.at <= x + 0.0005 && (i = k));
    return i;
  };
  const track = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  // after the finger lifts the bar stays where it was let go until the book has caught up, so it never snaps back and forth
  const [rest, setRest] = useState<number | null>(null);
  const restT = useRef(0);
  const settle = (x: number) => {
    setRest(x);
    clearTimeout(restT.current);
    restT.current = window.setTimeout(() => setRest(null), 600);
  };
  const v = held ?? rest ?? value;
  const at = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const last = useRef(0);
  return (
    <div
      className={`scrub ${className}${held !== null ? ' held' : ''}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={label(v)}
      tabIndex={0}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0;
        if (d) onChange(Math.max(0, Math.min(1, value + d)), true);
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        clearTimeout(restT.current);
        setRest(null);
        setList(false);
        const found = sections?.() ?? [];
        setSecs(found);
        down.current = { x: e.clientX, moved: false };
        clearTimeout(holdT.current);
        // held still: the list of sections opens
        if (found.length > 1)
          holdT.current = window.setTimeout(() => {
            if (!down.current.moved) {
              tap('medium');
              setList(true);
            }
          }, 520);
        const x = at(e.clientX);
        window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: true }));
        setHeld(x);
        tap('select');
        onChange(x, false);
      }}
      onPointerMove={(e) => {
        if (held === null) return;
        if (Math.abs(e.clientX - down.current.x) > 6) down.current.moved = true;
        const x = snap(at(e.clientX));
        setHeld(x);
        // the content follows the finger, a few times a second (smooth on slow phones too)
        const now = performance.now();
        if (now - last.current > 90) {
          last.current = now;
          onChange(x, false);
        }
      }}
      onPointerUp={(e) => {
        clearTimeout(holdT.current);
        if (held === null) return;
        const x = down.current.moved ? snap(at(e.clientX)) : at(e.clientX);
        settle(x);
        setHeld(null);
        window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: false }));
        onChange(x, true);
      }}
      onPointerCancel={() => {
        clearTimeout(holdT.current);
        setHeld(null);
        window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: false }));
      }}
    >
      <div className="scrub-track" ref={track}>
        <i className="scrub-fill" style={{ width: `${v * 100}%` }} />
        <i className="scrub-thumb" style={{ left: `${v * 100}%` }} />
        {(held !== null || list) &&
          secs.map((s, i) => <i key={i} className="scrub-sec" style={{ left: `${s.at * 100}%` }} />)}
        {held !== null && !list && (
          <span className="scrub-tip mono" style={{ left: `clamp(76px, ${v * 100}%, calc(100% - 76px))` }}>
            {secAt(v) >= 0 && <b className="scrub-sname">{secs[secAt(v)].title}</b>}
            {label(v)}
          </span>
        )}
      </div>
      {list && (
        <>
          <div className="scrub-scrim" onPointerDown={(e) => (e.stopPropagation(), setList(false))} />
          <div className="scrub-list" role="listbox" aria-label="Sections" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            {secs.map((s, i) => (
              <button
                key={i}
                role="option"
                aria-selected={secAt(value) === i}
                className={secAt(value) === i ? 'on' : ''}
                onClick={() => {
                  tap('select');
                  setList(false);
                  onSection?.(i);
                }}
              >
                <span>{s.title}</span>
                <small className="mono">{Math.round(s.at * 100)}%</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The same bar, for when the controls are tucked away: a slim rail on the right edge while scrolling, along the bottom
 * while turning pages. It is only grabbed where the handle is (so scrolling and swiping are never in its way), and a label
 * says where the finger would land. `value` follows the page through the CSS variable `--p` (set on the reader), so it
 * never makes the reader redraw.
 */
export function EdgeScrub({ vertical, label, onChange, ariaLabel }: { vertical: boolean; label: (v: number) => string; onChange: (v: number, final: boolean) => void; ariaLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  const last = useRef(0);
  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const t = 52;
    return vertical ? Math.max(0, Math.min(1, (e.clientY - r.top - t / 2) / Math.max(1, r.height - t))) : Math.max(0, Math.min(1, (e.clientX - r.left - 22 - t / 2) / Math.max(1, r.width - 44 - t)));
  };
  const style = held !== null ? ({ ['--p' as string]: held } as React.CSSProperties) : undefined;
  return (
    <div ref={box} className={`edge ${vertical ? 'v' : 'h'}${held !== null ? ' held' : ''}`} style={style}>
      <i className="edge-line" />
      <b className="edge-thumb" />
      <div
        className="edge-hit"
        role="slider"
        aria-label={ariaLabel}
        aria-valuetext={label(held ?? 0)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const x = at(e);
          setHeld(x);
          tap('select');
          window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: true }));
          onChange(x, false);
        }}
        onPointerMove={(e) => {
          if (held === null) return;
          const x = at(e);
          setHeld(x);
          const now = performance.now();
          if (now - last.current > 90) {
            last.current = now;
            onChange(x, false);
          }
        }}
        onPointerUp={(e) => {
          if (held === null) return;
          const x = at(e);
          setHeld(null);
          window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: false }));
          onChange(x, true);
        }}
        onPointerCancel={() => {
          setHeld(null);
          window.dispatchEvent(new CustomEvent('frogity:scrub', { detail: false }));
        }}
      />
      {held !== null && <span className="scrub-tip mono">{label(held)}</span>}
    </div>
  );
}
