// Big books, kept light. A Liquid view of a long book is thousands of paragraphs; even when the ones off screen are skipped, the
// browser still walks all of them every time one of them changes size (and when it scrolls). So the book is cut into pieces of a
// few dozen paragraphs, and the pieces far from the screen are switched off (`data-off`: they keep their place with an estimated
// height, and nothing in them is laid out or painted) while the ones around the screen are switched on a little before they
// arrive. Moving a long way, in either direction, only lays out the few screens it lands on.
//
// The pieces are plain wrappers (`div.chunk`) added around the book's own blocks and taken away again when this stops (turning
// pages, a different book): everything else sees the same text in the same order, and `flowKids` gives the blocks as if flat.
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,table,figure';
/** books with fewer blocks than this are fine as they are (the stylesheet's own `content-visibility: auto` handles them) */
export const WINDOW_FROM = 500;
let quietUntil = 0;
/** true for a moment after the book moved itself (a correction that keeps the reader's place): not the reader scrolling */
export const windowMoved = () => performance.now() < quietUntil;
const PIECE = 24; // children of the book per piece

/** The book's own blocks, in order, whether or not it is currently cut into pieces. */
export function flowKids(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const c of Array.from(root.children) as HTMLElement[]) {
    if (c.classList.contains('chunk')) out.push(...(Array.from(c.children) as HTMLElement[]));
    else out.push(c);
  }
  return out;
}

export interface Windowed {
  /** the number of the block at the top of the screen, counted through the whole book */
  topIndex(): number;
  /** goes to a block by its number (and stays on it while the layout settles) */
  goTo(i: number): void;
  /** switch the pieces around an element on at once (before scrolling to it) */
  reveal(el: Element | null): void;
  /** look again (after the layout changed) */
  refresh(): void;
  destroy(): void;
}

export function windowFlow(root: HTMLElement, scroller: HTMLElement, memoKey = ''): Windowed | null {
  if (root.querySelector('.chunk') || root.querySelectorAll(BLOCKS).length < WINDOW_FROM) return null;
  const kids = Array.from(root.children) as HTMLElement[];
  // the child at the top of the screen is the one that must stay put when the book is cut up and the far pieces are switched off
  const t0 = scroller.getBoundingClientRect().top;
  const anchor = kids.find((b) => b.getBoundingClientRect().bottom > t0 + 1) ?? null;
  const anchorDy = anchor ? anchor.getBoundingClientRect().top - t0 : 0;

  const pieces: HTMLElement[] = [];
  const chars: number[] = [];
  const starts: number[] = []; // the number of the first block of each piece, counted through the whole book
  for (let i = 0; i < kids.length; i += PIECE) {
    const d = document.createElement('div');
    d.className = 'chunk';
    starts.push(i);
    kids[i].before(d);
    let n = 0;
    for (const k of kids.slice(i, i + PIECE)) {
      d.appendChild(k);
      n += k.tagName === 'FIGURE' || k.tagName === 'TABLE' ? 380 : Math.max(40, (k.textContent ?? '').length);
    }
    d.style.setProperty('--n', String(n));
    d.setAttribute('data-off', '');
    pieces.push(d);
    chars.push(n);
  }
  root.classList.add('win');
  // the browser's own scroll anchoring would fight the corrections made here
  const oldAnchor = scroller.style.overflowAnchor;
  scroller.style.overflowAnchor = 'none';
  const at = anchor ? pieces.findIndex((p) => p.contains(anchor)) : 0;

  let lo = 0; // the pieces lo..hi are switched on
  let hi = -1;
  let raf = 0;
  let dead = false;
  const top = () => scroller.getBoundingClientRect().top;
  const on = (i: number, v: boolean) => {
    if (v) pieces[i].removeAttribute('data-off');
    else pieces[i].setAttribute('data-off', '');
  };
  const show = (a: number, z: number) => {
    a = Math.max(0, a);
    z = Math.min(pieces.length - 1, z);
    if (z < a) return;
    if (hi < lo || a > hi || z < lo) {
      for (let i = lo; i <= hi; i++) on(i, false);
      for (let i = a; i <= z; i++) on(i, true);
    } else {
      for (let i = lo; i < a; i++) on(i, false);
      for (let i = z + 1; i <= hi; i++) on(i, false);
      for (let i = a; i < lo; i++) on(i, true);
      for (let i = hi + 1; i <= z; i++) on(i, true);
    }
    lo = a;
    hi = z;
  };
  /** a change in the estimates of the pieces above the screen must not move the reader: the piece on screen stays where it is */
  let mute = 0; // scrolling done by the book itself is not the reader moving
  const keepPlace = (change: () => void) => {
    const t = top();
    let ref: HTMLElement | null = null;
    for (let i = Math.max(0, lo); i <= hi; i++) {
      if (pieces[i].getBoundingClientRect().bottom > t + 1) {
        ref = pieces[i];
        break;
      }
    }
    const before = ref ? ref.getBoundingClientRect().top : 0;
    change();
    if (ref) {
      const d = ref.getBoundingClientRect().top - before;
      if (Math.abs(d) > 0.5) {
        quietUntil = performance.now() + 120;
        mute = quietUntil;
        scroller.scrollTop += d;
      }
    }
  };
  // Heights. A piece that is off keeps the height it last had when it was on; one never drawn is estimated from how tall a character
  // of text is on this page. Pieces are drawn once, off screen, while the reader pauses, until every height is the real one (and the
  // heights are remembered for the next time the book is opened), so that "40% of the book" is the same place however it is reached.
  const sigNow = () => {
    const cs = getComputedStyle(root);
    return [Math.round(root.clientWidth), cs.fontSize, cs.lineHeight, cs.fontFamily, cs.textAlign, pieces.length].join('|');
  };
  let sig = sigNow();
  const seen = new Map<number, number>();
  let sumH = 0;
  let sumN = 0;
  let calibrated = 0;
  const learn = (i: number, h: number) => {
    if (h <= 0 || seen.has(i)) return;
    seen.set(i, h);
    sumH += h;
    sumN += chars[i];
    pieces[i].style.setProperty('--h', `${h}px`);
  };
  const settle = () => {
    if (sumN > 1500) {
      const v = sumH / sumN;
      if (!calibrated || Math.abs(v - calibrated) / calibrated > 0.01) {
        calibrated = v;
        keepPlace(() => root.style.setProperty('--ppc', `${v.toFixed(4)}px`));
      }
    }
  };
  const memoKeyFull = () => (memoKey ? `win:${memoKey}` : '');
  let saveT = 0;
  const save = () => {
    clearTimeout(saveT);
    saveT = window.setTimeout(() => {
      const k = memoKeyFull();
      if (!k) return;
      try {
        localStorage.setItem(k, JSON.stringify({ sig, h: pieces.map((_, i) => Math.round(seen.get(i) ?? 0)) }));
      } catch {
        /* storage full or off: the heights are simply learnt again */
      }
    }, 1500);
  };
  // heights learnt on an earlier visit (only while the page is laid out the same way)
  try {
    const k = memoKeyFull();
    const m = k ? JSON.parse(localStorage.getItem(k) ?? 'null') : null;
    if (m && m.sig === sig && Array.isArray(m.h) && m.h.length === pieces.length) m.h.forEach((h: number, i: number) => h > 0 && learn(i, h));
  } catch {
    /* none */
  }
  settle();
  const calibrate = () => {
    for (let i = lo; i <= hi; i++) if (!seen.has(i)) learn(i, pieces[i].getBoundingClientRect().height);
    settle();
    save();
  };
  let idle = 0;
  const sweep = () => {
    if (dead) return;
    // the page was laid out differently (text size, width): what was learnt is stale, so learn it all again
    const now = sigNow();
    if (now !== sig) {
      sig = now;
      seen.clear();
      sumH = 0;
      sumN = 0;
      calibrated = 0;
      for (const p of pieces) p.style.removeProperty('--h');
      calibrate();
      update();
    }
    // the unseen pieces nearest to the reader first; those above the screen would push it down, so it is moved back by the same
    let did = 0;
    const order: number[] = [];
    for (let d = 1; d < pieces.length && order.length < 2; d++) {
      for (const i of [hi + d, lo - d]) if (i >= 0 && i < pieces.length && !seen.has(i) && order.length < 2) order.push(i);
    }
    for (const i of order) {
      const p = pieces[i];
      const before = p.getBoundingClientRect().height;
      p.removeAttribute('data-off');
      const h = p.getBoundingClientRect().height;
      p.setAttribute('data-off', '');
      learn(i, h);
      if (i < lo && h !== before) {
        mute = performance.now() + 120;
        quietUntil = mute;
        scroller.scrollTop += h - before;
      }
      did++;
    }
    if (did) {
      settle();
      save();
    }
    if (seen.size < pieces.length) idle = window.setTimeout(sweep, 90);
  };
  const update = () => {
    raf = 0;
    if (dead) return;
    const H = scroller.clientHeight || 800;
    const t = top();
    // the first piece that ends below 2 screens above, and the last that starts above 3 screens below
    let a = 0;
    let z = pieces.length - 1;
    while (a < z) {
      const m = (a + z) >> 1;
      if (pieces[m].getBoundingClientRect().bottom > t - H * 2) z = m;
      else a = m + 1;
    }
    const first = a;
    let s = first;
    let e = pieces.length - 1;
    while (s < e) {
      const m = (s + e + 1) >> 1;
      if (pieces[m].getBoundingClientRect().top < t + H * 3) s = m;
      else e = m - 1;
    }
    if (first !== lo || s !== hi) {
      show(first, s);
      calibrate();
      // what was drawn may be taller or shorter than its estimate: look again until the window sits right on the screen
      if (again++ < 4) update();
    } else again = 0;
  };
  let again = 0;
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(() => ((again = 0), update()));
    if (performance.now() < mute) return;
    clearTimeout(idle);
    idle = window.setTimeout(sweep, 450);
  };
  scroller.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  root.style.setProperty('--ppc', '0.62px');
  show(at - 1, at + 2);
  const pin = (n: number) => {
    if (dead || !anchor) return;
    const off = anchor.getBoundingClientRect().top - top() - anchorDy;
    if (Math.abs(off) > 1) scroller.scrollTop += off;
    if (n > 0) requestAnimationFrame(() => pin(n - 1));
  };
  if (at > 0) pin(6);
  update();
  idle = window.setTimeout(sweep, 700);
  const pieceOf = (n: number) => {
    let a = 0;
    let z = pieces.length - 1;
    while (a < z) {
      const m = (a + z + 1) >> 1;
      if (starts[m] <= n) a = m;
      else z = m - 1;
    }
    return a;
  };
  return {
    topIndex() {
      const t = top();
      let a = 0;
      let z = pieces.length - 1;
      while (a < z) {
        const m = (a + z) >> 1;
        if (pieces[m].getBoundingClientRect().bottom > t + 1) z = m;
        else a = m + 1;
      }
      const kidsOf = Array.from(pieces[a].children);
      const j = kidsOf.findIndex((k) => k.getBoundingClientRect().bottom > t + 1);
      return starts[a] + Math.max(0, j);
    },
    goTo(n) {
      const p = pieceOf(n);
      show(p - 2, p + 3);
      const el = pieces[p].children[n - starts[p]] as HTMLElement | undefined;
      if (!el) return;
      let tries = 8;
      const step = () => {
        if (dead) return;
        const off = el.getBoundingClientRect().top - top() - 70;
        if (Math.abs(off) > 1) scroller.scrollTop += off;
        if (tries-- > 0) requestAnimationFrame(step);
        else update();
      };
      step();
    },
    reveal(el) {
      if (!el) return;
      const i = pieces.findIndex((p) => p.contains(el));
      if (i >= 0) show(i - 2, i + 3);
    },
    refresh: kick,
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      clearTimeout(saveT);
      scroller.style.overflowAnchor = oldAnchor;
      scroller.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      // back to the plain book: every block where it was, the wrappers gone (the block at the top of the screen stays put)
      const keep = Array.from(root.children).length ? flowKids(root).find((b) => b.getBoundingClientRect().bottom > top() + 1) : null;
      const dy = keep ? keep.getBoundingClientRect().top - top() : 0;
      for (const p of pieces) {
        p.removeAttribute('data-off');
        while (p.firstChild) p.before(p.firstChild);
        p.remove();
      }
      root.classList.remove('win');
      root.style.removeProperty('--ppc');
      if (keep) scroller.scrollTop += keep.getBoundingClientRect().top - top() - dy;
    },
  };
}
