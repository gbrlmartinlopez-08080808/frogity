import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { tr } from '../lib/i18n';
import { createPortal } from 'react-dom';
import { pixelRects, type PixelName } from '../lib/pixels';
import { onBack, tap } from '../lib/native';
import { Icon } from './Icon';

// ------------------------------------------------------------------ pixel icon
export function Pixel({ name, size = 18, className, style }: { name: PixelName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" fill="currentColor" aria-hidden dangerouslySetInnerHTML={{ __html: pixelRects(name) }} />
  );
}

// ------------------------------------------------------------------ pixel loader (snake through a 3×3 / 4×4 grid)
const SNAKE3 = [0, 1, 2, 5, 8, 7, 6, 3, 4];
export function PixelLoader({ size = 6, grid = 3, gap = 3, label }: { size?: number; grid?: 3 | 4; gap?: number; label?: string }) {
  const n = grid * grid;
  const order = grid === 3 ? SNAKE3 : [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4, 5, 6, 10, 9];
  const delay = (i: number) => (order.indexOf(i) / n) * 1.2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="pixload" style={{ gridTemplateColumns: `repeat(${grid}, ${size}px)`, gap }} role="progressbar" aria-label={label ?? 'Loading'}>
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={{ width: size, height: size, animationDelay: `${delay(i)}s` }} />
        ))}
      </span>
      {label && <span className="mono" style={{ fontSize: 12 }}>{label}</span>}
    </span>
  );
}

/** A determinate pixel bar: ▮▮▮▮▯▯▯ */
export function PixelBar({ value, cells = 16 }: { value: number; cells?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} role="progressbar" aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} style={{ width: 6, height: 10, background: 'currentColor', opacity: i < on ? 1 : 0.14, transition: 'opacity .2s' }} />
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ bottom sheet
// Only one sheet shows at a time: a sheet opened from inside another slides the one below out of sight, and it comes back when
// the top one closes. A sheet that opens while another is still closing waits for it, so two never cross on the screen.
const sheetStack: number[] = [];
const sheetBus = new EventTarget();
let sheetSeq = 0;
let lastSheetClose = 0;
const stackChanged = () => sheetBus.dispatchEvent(new Event('ch'));
function useIsTop(id: number, open: boolean) {
  const [top, setTop] = useState(true);
  useLayoutEffect(() => {
    if (!open) return;
    sheetStack.push(id);
    stackChanged();
    return () => {
      const i = sheetStack.lastIndexOf(id);
      if (i >= 0) sheetStack.splice(i, 1);
      stackChanged();
    };
  }, [open, id]);
  useEffect(() => {
    const f = () => setTop(sheetStack.length === 0 || sheetStack.at(-1) === id || !sheetStack.includes(id));
    f();
    sheetBus.addEventListener('ch', f);
    return () => sheetBus.removeEventListener('ch', f);
  }, [id]);
  return top;
}

/** the scrollable element between the touched one and the sheet (if any) */
function scrollerOf(target: EventTarget | null, sheet: HTMLElement): HTMLElement | null {
  for (let el = target as HTMLElement | null; el && el !== sheet; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
  }
  return null;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  onBackBtn,
  className,
  dark,
  noGrip,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  onBackBtn?: () => void;
  className?: string;
  dark?: boolean;
  noGrip?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dragged, setDragged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const id = useRef(0);
  if (!id.current) id.current = ++sheetSeq;
  const top = useIsTop(id.current, open && mounted);
  const close = useRef(onClose);
  close.current = onClose;
  // opened right after another sheet started closing: wait until it is out of the way
  const [delay, setDelay] = useState(0);

  useLayoutEffect(() => {
    if (open) {
      const since = performance.now() - lastSheetClose;
      setDelay(since < 230 ? Math.round(230 - since) : 0);
      setMounted(true);
      setClosing(false);
      setDragged(false);
    } else if (mounted) {
      lastSheetClose = performance.now();
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 240);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !top) return;
    return onBack(() => {
      onClose();
      return true;
    });
  }, [open, onClose, top]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    if (!panel) return;
    const frame = requestAnimationFrame(() => (panel.querySelector<HTMLElement>('input, button, [tabindex="0"]') ?? panel).focus({ preventScroll: true }));
    const key = (e: KeyboardEvent) => {
      const panels = Array.from(document.querySelectorAll('.sheet[role="dialog"]'));
      if (panels.at(-1) !== panel || e.key !== 'Tab') return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex="0"]')).filter(n => n.getClientRects().length);
      if (!nodes.length) { e.preventDefault(); panel.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, mounted]);

  // Pull the sheet down to close it. The sheet follows the finger frame by frame (and the shade behind it lightens); a short
  // flick is enough, and a sheet let go early springs back. Inside a list that is scrolled, the list scrolls first.
  useEffect(() => {
    const el = ref.current;
    if (!mounted || !el) return;
    type D = { x: number; y: number; dy: number; on: boolean; sc: HTMLElement | null; ly: number; lt: number; v: number; h: number };
    let d: D | null = null;
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (!d) return;
      const y = d.dy > 0 ? d.dy : -Math.min(28, Math.sqrt(-d.dy) * 3);
      el.style.transform = `translate3d(0,${y}px,0)`;
      if (scrim.current) scrim.current.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / d.h));
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || el.classList.contains('under') || el.classList.contains('out')) return;
      const t = e.touches[0];
      const sc = scrollerOf(e.target, el);
      // a list scrolled down scrolls; only at its top does pulling down move the sheet
      if (sc && sc.scrollTop > 2) return (d = null);
      if ((e.target as HTMLElement).closest('input[type="range"], .ruler, .no-drag, textarea, [contenteditable="true"]')) return (d = null);
      d = { x: t.clientX, y: t.clientY, dy: 0, on: false, sc, ly: t.clientY, lt: e.timeStamp, v: 0, h: el.offsetHeight || 600 };
    };
    const move = (e: TouchEvent) => {
      if (!d) return;
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (!d.on) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        // sideways (a row of chips), or upwards inside a list: not a pull
        if (Math.abs(dx) > Math.abs(dy) || (dy < 0 && d.sc)) return (d = null);
        d.on = true;
        d.y = t.clientY;
        el.style.transition = 'none';
        if (scrim.current) scrim.current.style.transition = 'none';
      }
      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - d.lt);
      d.v = 0.7 * d.v + 0.3 * ((t.clientY - d.ly) / dt);
      d.ly = t.clientY;
      d.lt = e.timeStamp;
      d.dy = t.clientY - d.y;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const end = () => {
      const g = d;
      d = null;
      if (!g?.on) return;
      cancelAnimationFrame(raf);
      raf = 0;
      const away = g.dy > Math.min(150, g.h * 0.3) || (g.v > 0.55 && g.dy > 24);
      if (away) {
        const ms = Math.round(Math.max(140, Math.min(260, (g.h - g.dy) / Math.max(1.4, g.v))));
        el.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.4,1)`;
        el.style.transform = 'translate3d(0,100%,0)';
        if (scrim.current) {
          scrim.current.style.transition = `opacity ${ms}ms linear`;
          scrim.current.style.opacity = '0';
        }
        tap('light');
        setTimeout(() => {
          setDragged(true);
          close.current();
        }, ms - 20);
      } else {
        el.style.transition = 'transform .42s cubic-bezier(.2,1.1,.3,1)';
        el.style.transform = '';
        if (scrim.current) {
          scrim.current.style.transition = 'opacity .3s ease';
          scrim.current.style.opacity = '';
        }
        setTimeout(() => {
          el.style.transition = '';
          if (scrim.current) scrim.current.style.transition = '';
        }, 440);
      }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [mounted]);

  if (!mounted) return null;
  const st = delay && !closing ? ({ animationDelay: `${delay}ms` } as React.CSSProperties) : undefined;
  const cls = `${closing ? ' out' : ''}${dragged ? ' dragged' : ''}${!top && !closing ? ' under' : ''}`;
  return createPortal(
    <>
      <div ref={scrim} className={`scrim${cls}${className?.split(/\s+/).includes('over') ? ' over' : ''}`} style={st} onClick={onClose} />
      <div ref={ref} className={`sheet${cls} ${className ?? ''}`} style={st} data-dark={dark ? '1' : undefined} role="dialog" tabIndex={-1} aria-modal="true" aria-hidden={!top || undefined} aria-label={typeof title === 'string' ? title : 'Frogity options'}>
        {!noGrip && <div className="sheet-grip" />}
        {title !== undefined && (
          <div className="sheet-head">
            {onBackBtn ? (
              <button className="sheet-back" onClick={onBackBtn} aria-label={tr("Back")}>
                <Icon name="back" size={22} />
              </button>
            ) : (
              <span />
            )}
            <h3>{title}</h3>
            <span />
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------------------------ segmented control
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  light,
  className,
  onHold,
}: {
  value: T;
  options: { value: T; label: ReactNode; aria?: string }[];
  onChange: (v: T) => void;
  light?: boolean;
  className?: string;
  /** a long press on a tab (the tap that follows it is ignored) */
  onHold?: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hold = useRef({ t: 0, fired: false });
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const idx = options.findIndex((o) => o.value === value);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelectorAll('button')[idx] as HTMLElement | undefined;
      if (el) setThumb((t) => (t && t.x === el.offsetLeft - 4 && t.w === el.offsetWidth ? t : { x: el.offsetLeft - 4, w: el.offsetWidth }));
    };
    measure();
    // a font that arrives late, or a label that changes, must not leave the thumb half a button off
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    root.querySelectorAll('button').forEach((b) => ro?.observe(b));
    return () => ro?.disconnect();
  }, [idx, options.length]);
  return (
    <div ref={ref} className={`seg${light ? ' light' : ''} ${className ?? ''}`} role="tablist">
      {thumb && <span className="seg-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          aria-label={o.aria}
          className={o.value === value ? 'on' : ''}
          onPointerDown={() => {
            if (!onHold) return;
            hold.current.fired = false;
            clearTimeout(hold.current.t);
            hold.current.t = window.setTimeout(() => {
              hold.current.fired = true;
              tap('medium');
              onHold(o.value);
            }, 480);
          }}
          onPointerUp={() => clearTimeout(hold.current.t)}
          onPointerLeave={() => clearTimeout(hold.current.t)}
          onPointerCancel={() => clearTimeout(hold.current.t)}
          onContextMenu={(e) => onHold && e.preventDefault()}
          onClick={() => {
            if (hold.current.fired) {
              hold.current.fired = false;
              return;
            }
            if (o.value !== value) tap('select');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ toggle
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        tap('select');
        onChange(!on);
      }}
    />
  );
}

// ------------------------------------------------------------------ tick ruler slider (reference: "6s" duration picker)
export function Ruler({
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Math.round((max - min) / step) + 1;
  const SPACING = 14;
  const idx = Math.round((value - min) / step);
  const drag = useRef<{ x: number; idx: number } | null>(null);
  const last = useRef(idx);
  const set = useCallback(
    (i: number) => {
      const c = Math.max(0, Math.min(count - 1, i));
      if (c !== last.current) {
        last.current = c;
        tap('select');
        onChange(+(min + c * step).toFixed(4));
      }
    },
    [count, min, step, onChange],
  );
  const start = (x: number) => (drag.current = { x, idx });
  const move = (x: number) => {
    if (!drag.current) return;
    set(drag.current.idx - Math.round((x - drag.current.x) / SPACING));
  };
  return (
    <div className="ruler" aria-label={label}>
      <div
        ref={ref}
        className="ruler-track"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start(e.clientX);
        }}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => set(idx + (e.deltaY > 0 ? 1 : -1))}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') set(idx - 1);
          if (e.key === 'ArrowRight') set(idx + 1);
        }}
      >
        <div className="ruler-ticks" style={{ transform: `translateX(${-idx * SPACING}px)` }}>
          {Array.from({ length: count }, (_, i) => {
            const d = Math.abs(i - idx);
            return <i key={i} className={i === idx ? 'cur' : ''} style={{ opacity: i === idx ? 1 : Math.max(0.12, 0.55 - d * 0.07), height: i === idx ? 26 : d === 1 ? 16 : 12 }} />;
          })}
        </div>
      </div>
      <span className="ruler-value mono">{format ? format(value) : value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ toasts
let toastMsg: { text: string; id: number; kind?: 'award' | 'ice'; onClick?: () => void } | null = null;
const toastSubs = new Set<() => void>();
let toastSeq = 0;
export function toast(text: string, kind?: 'award' | 'ice', onClick?: () => void) {
  // a message that can be tapped gets its arrow from the toast itself: never two
  if (onClick) text = text.replace(/\s*→\s*$/, '');
  toastMsg = { text, id: ++toastSeq, kind, onClick };
  toastSubs.forEach((s) => s());
  const id = toastMsg.id;
  setTimeout(() => {
    if (toastMsg?.id === id) {
      toastMsg = null;
      toastSubs.forEach((s) => s());
    }
  }, onClick ? 5200 : kind ? 3200 : 2000); // short: long enough to read (and to tap Undo), never lingering
}
export function Toasts() {
  const msg = useSyncExternalStore(
    (l) => {
      toastSubs.add(l);
      return () => toastSubs.delete(l);
    },
    () => toastMsg,
  );
  return msg ? createPortal(
    <div
      className={`frogity-toast${msg.kind ? ' ' + msg.kind : ''}${msg.onClick ? ' tappable' : ''}`}
      key={msg.id}
      role={msg.onClick ? 'button' : 'status'}
      tabIndex={msg.onClick ? 0 : undefined}
      aria-live="polite"
      onKeyDown={e => { if (msg.onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); msg.onClick(); } }}
      onClick={() => {
        const f = msg.onClick;
        if (!f) return;
        toastMsg = null;
        toastSubs.forEach((x) => x());
        f();
      }}
    >
      <span>{tr(msg.text)}</span>
      {msg.onClick && <span aria-hidden>→</span>}
    </div>, document.body
  ) : null;
}

// ------------------------------------------------------------------ misc hooks
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: unknown; loading: boolean } {
  const [s, setS] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setS({ loading: true });
    fn().then(
      (data) => alive && setS({ data, loading: false }),
      (error) => alive && setS({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

/** Four little screws for the translucent acrylic pockets. */
export function Screws() {
  return (
    <>
      {['tl', 'tr', 'bl', 'br'].map((p) => (
        <span key={p} className={`screw ${p}`} aria-hidden>
          <i />
        </span>
      ))}
    </>
  );
}
