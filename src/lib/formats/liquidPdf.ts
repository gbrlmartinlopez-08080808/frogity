// Liquid mode for PDFs: turns fixed pages into a single reflowable column without destroying math.
//
// Strategy per page:
//  1. Render the page to a canvas and read its text items with real font names.
//  2. Build an "ink grid" of everything drawn that is NOT text: images, plots, rules, fraction bars, radicals.
//  3. Group text into rows → segments, detect a column gutter and produce reading order.
//  4. Classify rows: prose, heading, list item, display math. Display math (and any complex, stacked line) is
//     cropped from the rendered page and later shown as a CSS mask sized in `em`, so it scales with the reader's
//     font size and is drawn in the current text colour (works in dark mode). Nothing is re-typeset, so the
//     structure of equations is preserved exactly.
//  5. Figures and ruled tables become image blocks; their internal labels are removed from the text flow.
//  6. Lines are joined into paragraphs (de-hyphenated), with sub/superscripts and italics kept inline.

import { openPdf, openPdfBlob, renderPage, pdfjs, type PDFDocumentProxy, type PDFPageProxy } from './pdf';
import { recognize, slice } from '../ocr';
import { escapeHtml } from '../sanitize';

export type LBlock =
  | { t: 'h'; level: number; html: string; page: number; sec?: boolean; toc?: boolean }
  | { t: 'p'; html: string; page: number; cont?: boolean; sec?: boolean; cap?: boolean; toc?: boolean; code?: boolean; lvl?: number }
  | { t: 'li'; html: string; page: number }
  | { t: 'img'; blob: Blob; w: number; h: number; em: number; mask: boolean; kind: 'math' | 'figure' | 'table' | 'line' | 'scan'; page: number; alt?: string; num?: string; ref?: boolean; unread?: boolean }
  | { t: 'page'; page: number }
  | { t: 'inl'; id: string; blob: Blob; em: number; hem: number; dem: number };

interface Item {
  str: string;
  x0: number;
  x1: number;
  base: number; // baseline y (canvas px, down)
  top: number;
  bot: number;
  fh: number; // font height px
  font: string;
  math: boolean;
  bold: boolean;
  italic: boolean;
  big: boolean; // big operator font (cmex)
  frag?: boolean; // stacked piece of inline math (numerator, limit, radical sign)
  body?: boolean; // set in the document's main text font
}

interface Row {
  items: Item[];
  x0: number;
  x1: number;
  top: number;
  bot: number;
  base: number;
  fh: number;
}

type Elem =
  | { k: 'line'; row: Row; col: number }
  | { k: 'img'; x0: number; x1: number; top: number; bot: number; kind: 'figure' | 'table'; col: number };

const MATH_FONT = /(\w*Math(?!ematica)\w*|CMMI|CMSY|CMEX|MSAM|MSBM|EUFM|EUSM|EURM|EUEX|RSFS|STIXMath|STIXGeneral|STIXSize|LMMath|LatinModernMath|XITSMath|Cambria\s*Math|CambriaMath|Asana|esint|wasy|stmary|txsy|txmi|pxsy|pxmi|MTSY|MTMI|MathematicalPi|Symbol|TeXGyre\w*Math|NewCMMath|Euclid|rtxmi|zxmi|ntxmi|ntxsy|cmmib|cmbsy)/i;
const BIG_FONT = /(CMEX|EUEX|STIXSize|esint|txex|pxex)/i;
const BOLD_FONT = /(Bold|CMBX|CMB\d|Black|Heavy|Semibold|SemiBold|Demi|Medi\b|,B\b|-B$|\.B$)/i;
const MONO_FONT = /(Courier|Mono|CMTT|Consol|Inconsolata|Menlo|Typewriter|SFTT|LMMono|SourceCodePro|FiraCode|Lucida ?Console|Monaco|NimbusMon|TeXGyreCursor)/i;
/** "Figure 3:", "Fig. 2.", "TABLE 1.", "Abbildung 1.4:", "Tabla 2 –" … at the start of a line */
const CAPTION = /^(fig(ure)?s?\.?|tables?|tab\.|abbildung|abb\.|tabelle|figura|tabla|gr[aá]fico|cuadro|tableau|chart|exhibit|plate|l[aá]mina|scheme|algorithm|listing)\s*([0-9]+|[IVXLC]+)([.:\-–]\d+)*[a-z]?\s*([.:–—|-]|\s[A-Z(])/i;
const CONTENTS_TITLE = /^(contents|table of contents|index|[ií]ndice( general)?|sumario|contenidos?|inhalt|inhaltsverzeichnis|table des mati[eè]res|sommaire|indice generale|sommario|conte[uú]do|sum[aá]rio)$/i;
/** an entry of a list of contents: its words, then dot leaders or space, then a page number (arabic or roman) */
const TOC_ROW = /^(.{2,140}?)(?:\s*(?:\.\s?){3,}|\s*[·…]{2,}\s*|\s+)(\d{1,4}|[ivxlc]{1,6})$/i;
const allBoldRow = (r: Row) => r.items.every((it) => it.bold || !/[A-Za-z]/.test(it.str));
const ITALIC_FONT = /(Italic|Oblique|CMTI|CMSL|-It\b|-Ital|,I\b)/i;
const MATH_CHARS = /[∑∏∫∮√∞≤≥≠≈≡∈∉⊂⊃⊆⊇∪∩∀∃∂∇±∓×÷→←↔⇒⇐⇔↦∝∼≃≅⊕⊗⊥∥∠⟨⟩‖αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΥΦΨΩϵϑϕϱ∘·⋅∗†‡ℓℝℕℤℚℂ𝔼\u{1D400}-\u{1D7FF}]/u;

export interface LiquidProgress {
  page: number;
  pages: number;
}

export interface LiquidOpts {
  /** pages already done in an earlier run (skipped) */
  have?: Set<number>;
  /** called with each finished page; when given, pages are not collected in memory (long books) */
  onPage?: (page: number, blocks: LBlock[], scanned: boolean) => Promise<void> | void;
}

export async function pdfToLiquid(
  data: ArrayBuffer | Blob,
  onBlocks: (blocks: LBlock[], p: LiquidProgress) => void,
  signal?: AbortSignal,
  opts: LiquidOpts = {},
): Promise<{ blocks: LBlock[]; scannedPages: number[] }> {
  const pdf = data instanceof Blob ? await openPdfBlob(data) : await openPdf(data);
  const all: LBlock[] = [];
  const scanned: number[] = [];
  const ctx: DocCtx = { fontHist: new Map(), sizeHist: new Map(), seenMargins: new Map(), bodyFh: 0 };
  try {
    // Prime body size from a couple of pages so page 1 (title page) does not skew it.
    await primeBodySize(pdf, ctx);
    let prevEnd: number | undefined;
    let prevOpen = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (opts.have?.has(i)) {
        onBlocks([], { page: i, pages: pdf.numPages });
        continue;
      }
      // one strange page (a broken font, a drawing that never ends) must not stop the book: after a while, or on an
      // error, the page is handed to the reader that works from its picture instead
      let res: { blocks: LBlock[]; scanned: boolean; top?: number; end?: number };
      try {
        const page = await pdf.getPage(i);
        res = await Promise.race([
          processPage(page, i, ctx).finally(() => page.cleanup()),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('page took too long')), 45_000)),
        ]);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        console.warn('page handed to the reader', i, e);
        res = { blocks: [await placeholder(i)], scanned: true };
      }
      if (res.scanned) scanned.push(i);
      // a new chapter: the page before ended well short of its foot, or this one starts well below its head; its first paragraph or
      // heading opens a section (space above it, and a place in the book's list of sections)
      const lead = res.blocks.find((b) => b.t === 'p' || b.t === 'h' || b.t === 'li' || b.t === 'img');
      // a sentence left open at the foot of the last page goes on here, even when this page starts with a capital ("Lockheed /
      // Lightning")
      if (lead && lead.t === 'p' && prevOpen && (prevEnd ?? 0) >= 0.68 && !(res.top !== undefined && res.top > 0.26)) lead.cont = true;
      if (i > 1 && lead && (lead.t === 'p' || lead.t === 'h') && !(lead.t === 'p' && lead.cont) && ((prevEnd !== undefined && prevEnd < 0.68) || (res.top !== undefined && res.top > 0.26))) lead.sec = true;
      prevEnd = res.end;
 const lastText = [...res.blocks].reverse().find((b) => (b.t === 'p' && !/^<small/.test(b.html)) || b.t === 'h' || b.t === 'li' || b.t === 'img');
      prevOpen = !!lastText && lastText.t === 'p' && !/[.!?:"”»)\]]\s*$/.test(lastText.html.replace(/<[^>]+>/g, ''));
      const blocks: LBlock[] = [{ t: 'page', page: i }, ...res.blocks];
      if (opts.onPage) await opts.onPage(i, blocks, res.scanned);
      else all.push(...blocks);
      onBlocks(blocks, { page: i, pages: pdf.numPages });
      await slice(0); // a turn for the screen between pages (without timers: those crawl in the background)
    }
  } finally {
    pdf.loadingTask.destroy();
  }
  return { blocks: all, scannedPages: scanned };
}

/** Stands in for a page the converter gave up on, until its reading takes its place. */
async function placeholder(page: number): Promise<LBlock> {
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, 2, 2);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  return { t: 'img', blob, w: 2, h: 2, em: 0, mask: false, kind: 'scan', page, alt: `Page ${page}` };
}

interface DocCtx {
  fontHist: Map<string, number>; // font name -> chars (to find the prose font)
  sizeHist: Map<number, number>; // font size (pt, rounded to .5) -> chars
  seenMargins: Map<string, number>;
  bodyFh: number; // pt
}

async function primeBodySize(pdf: PDFDocumentProxy, ctx: DocCtx) {
  const n = Math.min(pdf.numPages, 4);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const fh = Math.hypot(it.transform[2], it.transform[3]);
      const k = Math.round(fh * 2) / 2;
      ctx.sizeHist.set(k, (ctx.sizeHist.get(k) ?? 0) + it.str.length);
    }
  }
  ctx.bodyFh = modeOf(ctx.sizeHist) || 10;
}

const modeOf = (m: Map<number, number>) => {
  let best = 0;
  let bk = 0;
  m.forEach((v, k) => {
    if (v > best) {
      best = v;
      bk = k;
    }
  });
  return bk;
};

async function processPage(page: PDFPageProxy, pageNo: number, ctx: DocCtx): Promise<{ blocks: LBlock[]; scanned: boolean; top?: number; end?: number }> {
  const vp1 = page.getViewport({ scale: 1 });
  const S = Math.min(3, Math.max(1.6, 1500 / vp1.width));
  const { canvas, viewport } = await renderPage(page, S);
  const W = canvas.width;
  const H = canvas.height;
  await slice();
  const tc = await page.getTextContent();
  const body = ctx.bodyFh * S; // body font height in canvas px

  // ---------- 1. text items ----------
  const items: Item[] = [];
  const rotated: { x0: number; x1: number; top: number; bot: number }[] = [];
  for (const raw of tc.items) {
    if (!('str' in raw)) continue;
    if (!raw.str || !raw.str.trim()) continue;
    if (/^!+$/.test(raw.str.trim()) && raw.str.length <= 3) continue; // a lone "!" is how some PDF makers store a blank
    const tx = pdfjs.Util.transform(viewport.transform, raw.transform) as number[];
    const fh = Math.hypot(tx[2], tx[3]);
    if (fh < 1) continue;
    let fontName = raw.fontName;
    try {
      if (page.commonObjs.has(raw.fontName)) fontName = (page.commonObjs.get(raw.fontName) as { name?: string }).name || fontName;
    } catch {
      /* font not loaded */
    }
    const style = tc.styles[raw.fontName];
    const family = `${fontName} ${style?.fontFamily ?? ''}`;
    const w = raw.width * S;
    const isRot = Math.abs(tx[1]) > Math.abs(tx[0]) * 0.2 || Math.abs(tx[2]) > Math.abs(tx[3]) * 0.2;
    const ascent = style?.ascent && style.ascent > 0.4 && style.ascent < 1.2 ? style.ascent : 0.8;
    if (isRot) {
      rotated.push({ x0: tx[4] - fh, x1: tx[4] + fh, top: tx[5] - w, bot: tx[5] + w });
      continue;
    }
    const math = MATH_FONT.test(family) || (MATH_CHARS.test(raw.str) && raw.str.trim().length <= 3) || /^[\s\u{1D400}-\u{1D7FF}()+\-−=,.0-9]+$/u.test(raw.str) && /[\u{1D400}-\u{1D7FF}]/u.test(raw.str);
    const big = BIG_FONT.test(family);
    // TeX radicals and big operators hang below their baseline.
    const hangs = big || (math && /^[√∑∏∫]$/.test(raw.str.trim()));
    items.push({
      // (TeX's symbol font keeps its negating slash where "6" would be)
      str: /CMSY|cmsy/.test(family) && raw.str.includes('6') ? raw.str.replace(/6/g, '\uE006') : raw.str,
      x0: tx[4],
      x1: tx[4] + w,
      base: tx[5],
      top: hangs ? tx[5] - fh * 0.1 : tx[5] - fh * ascent,
      bot: hangs ? tx[5] + fh * (big ? 1.2 : 0.95) : tx[5] + fh * 0.22,
      fh,
      font: family,
      math,
      bold: BOLD_FONT.test(family),
      italic: ITALIC_FONT.test(family),
      big,
    });
  }

  // Some PDFs draw every word twice (a shadow, a fake bold, an invisible copy left by a converter): keep one of each.
  dedupeItems(items);
  // Numbered lines (a court transcript's 1–25, a legal pleading's margin, a listing's line numbers): the numbers stand in a column
  // of their own at the edge, one a line, counting up. They are not part of the text.
  {
    const nums = items.filter((it) => /^\d{1,3}$/.test(it.str.trim()));
    const byX = new Map<number, Item[]>();
    for (const it of nums) {
      const k = Math.round(it.x1 / (ctx.bodyFh * S * 1.2));
      byX.set(k, [...(byX.get(k) ?? []), it]);
    }
    for (const col of byX.values()) {
      if (col.length < 8) continue;
      col.sort((a, b) => a.base - b.base);
      let up = 0;
      for (let k = 1; k < col.length; k++) if (Number(col[k].str) === Number(col[k - 1].str) + 1) up++;
      if (up < (col.length - 1) * 0.7) continue;
      // (only when they stand to the left of the text, not as a column of figures in it)
      const right = Math.max(...col.map((c) => c.x1));
      if (items.filter((it) => !col.includes(it) && it.x0 < right).length > col.length * 0.5) continue;
      for (const c of col) items.splice(items.indexOf(c), 1);
    }
  }

  const totalChars = items.reduce((a, i) => a + i.str.length, 0);
  for (const it of items) {
    const name = it.font.split(' ')[0];
    if (!it.math) ctx.fontHist.set(name, (ctx.fontHist.get(name) ?? 0) + it.str.length);
  }
  let bodyFont = '';
  let bodyCount = 0;
  ctx.fontHist.forEach((v, k) => {
    if (v > bodyCount) {
      bodyCount = v;
      bodyFont = k;
    }
  });
  for (const it of items) it.body = it.font.split(' ')[0] === bodyFont;

  // ---------- 2. ink grid (non-text marks) ----------
  const C = Math.max(3, Math.round(S * 2)); // cell size px
  const gw = Math.ceil(W / C);
  const gh = Math.ceil(H / C);
  const ink = new Uint8Array(gw * gh); // 1 = ink, 2 = text
  const cx = canvas.getContext('2d')!;
  const img = cx.getImageData(0, 0, W, H).data;
  let inkCells = 0;
  for (let gy = 0; gy < gh; gy++) {
    const y0 = gy * C;
    const y1 = Math.min(H, y0 + C);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * C;
      const x1 = Math.min(W, x0 + C);
      let hit = false;
      for (let y = y0; y < y1 && !hit; y += 1) {
        let p = (y * W + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          if (img[p] < 215 || img[p + 1] < 215 || img[p + 2] < 215) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        ink[gy * gw + gx] = 1;
        inkCells++;
      }
    }
  }

  await slice(); // the page was a long stretch of work: a turn for the screen
  // Scanned page: lots of ink but (almost) no text. Also a page whose "text" is not text: a font with a private encoding makes
  // every letter come out as a symbol (!"#$%&…), and then the only way to read the page is to look at it (OCR).
  if ((totalChars < 25 && inkCells > gw * gh * 0.02) || (inkCells > gw * gh * 0.01 && garbledText(items))) {
    if (totalChars >= 25) console.debug(`[lq] page ${pageNo}: the text layer is not readable text (private font encoding): the page is read by sight`);
    const blob = await cropBlob(canvas, 0, 0, W, H, false);
    return {
      blocks: [{ t: 'img', blob, w: W, h: H, em: 0, mask: false, kind: 'scan', page: pageNo, alt: `Scanned page ${pageNo}` }],
      scanned: true,
    };
  }

  const markText = (x0: number, top: number, x1: number, bot: number, v: number) => {
    const a = Math.max(0, Math.floor(x0 / C) - 1);
    const b = Math.min(gw - 1, Math.floor(x1 / C) + 1);
    const c = Math.max(0, Math.floor(top / C) - 1);
    const d = Math.min(gh - 1, Math.floor(bot / C) + 1);
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (ink[y * gw + x] === 1 || v === 3) ink[y * gw + x] = v;
  };
  for (const it of items) markText(it.x0, it.top, it.x1, it.bot, 2);
  for (const r of rotated) markText(r.x0, r.top, r.x1, r.bot, 2);

  // Connected components of leftover ink, merging cells within a small gap.
  const gapCells = Math.max(2, Math.round((body * 0.6) / C));
  const mk = () =>
    components(ink, gw, gh, gapCells).map((c) => ({
      x0: c.x0 * C,
      x1: (c.x1 + 1) * C,
      top: c.y0 * C,
      bot: (c.y1 + 1) * C,
      cells: c.n,
    }));
  type Comp = ReturnType<typeof mk>[number];
  // A border drawn round the page, or an outline round a block of text, is decoration: taken as a picture it would swallow every
  // line of text inside it (a whole page, turned into one image). Its ink lies along the edge of its box, in a band.
  const edge = (c: Comp) => {
    const band = Math.max(2, Math.round(Math.min(c.x1 - c.x0, c.bot - c.top) / C / 12));
    return { band, gx0: Math.round(c.x0 / C), gx1: Math.round(c.x1 / C) - 1, gy0: Math.round(c.top / C), gy1: Math.round(c.bot / C) - 1 };
  };
  const along = (c: Comp, erase = false) => {
    const { band, gx0, gx1, gy0, gy1 } = edge(c);
    let n = 0;
    for (let y = Math.max(0, gy0); y <= Math.min(gh - 1, gy1); y++)
      for (let x = Math.max(0, gx0); x <= Math.min(gw - 1, gx1); x++)
        if (ink[y * gw + x] === 1 && (x - gx0 < band || gx1 - x < band || y - gy0 < band || gy1 - y < band)) {
          n++;
          if (erase) ink[y * gw + x] = 0;
        }
    return n;
  };
  const insideOf = (c: Comp) => items.filter((it) => it.x0 >= c.x0 - C && it.x1 <= c.x1 + C && it.top >= c.top - C && it.bot <= c.bot + C).length;
  let raw = mk();
  // a picture that sits close to the frame is joined to it by the gap: take the frame's ink away and look again, so the picture is a
  // picture on its own and the frame is not
  for (const c of raw) {
    if ((c.x1 - c.x0) * (c.bot - c.top) < W * H * 0.35 || insideOf(c) < 4) continue;
    const a = along(c);
    if (a >= c.cells * 0.35 && a < c.cells * 0.97) {
      along(c, true);
      raw = mk();
      break;
    }
  }
  const comps = raw.filter((c) => {
    const w = c.x1 - c.x0;
    const h = c.bot - c.top;
    if (w * h < W * H * 0.35) return true; // (only a big outline: the chart frame of a plot is a picture, a frame round the page is not)
    const outline = c.cells * C * C < w * h * 0.06 || along(c) >= c.cells * 0.85;
    return !outline || insideOf(c) < 4;
  });

  await slice();
  // Classify components.
  const figures: Box[] = [];
  const rules: Box[] = [];
  const smalls: Box[] = [];
  for (const c of comps) {
    const w = c.x1 - c.x0;
    const h = c.bot - c.top;
    // a line of printed words with no text behind it: kept (as a figure, which is then read), never dropped
    if (h > body * 0.6 && h <= body * 2.4 && w > body * 6 && c.cells > 20 && textStrip(img, W, c, body)) figures.push(c);
    else if (h <= C * 2.2 && w > body * 3) rules.push(c);
    else if (w > body * 3.5 && h > body * 2.2 && c.cells > 30) figures.push(c);
    else smalls.push(c);
  }
  // Tables: stacks of horizontal rules that overlap horizontally.
  const tables: Box[] = [];
  const usedRule = new Set<Box>();
  const sortedRules = [...rules].sort((a, b) => a.top - b.top);
  for (let i = 0; i < sortedRules.length; i++) {
    const r = sortedRules[i];
    if (usedRule.has(r)) continue;
    const group = [r];
    let last = r;
    for (let j = i + 1; j < sortedRules.length; j++) {
      const s = sortedRules[j];
      if (usedRule.has(s)) continue;
      const overlap = Math.min(last.x1, s.x1) - Math.max(last.x0, s.x0);
      if (overlap > 0.6 * Math.min(last.x1 - last.x0, s.x1 - s.x0) && s.top - last.bot < body * 12) {
        // Only group if text sits between (otherwise it is e.g. two separate underlines)
        group.push(s);
        last = s;
      }
    }
    if (group.length >= 2) {
      const box = unionBoxes(group);
      // must contain several text rows and not be a full page
      const inside = items.filter((it) => centerIn(it, box)).length;
      if (inside >= 4 && box.bot - box.top < H * 0.8) {
        group.forEach((g) => usedRule.add(g));
        tables.push(box);
      }
    }
  }

  // Writing that is a picture (a scanned body under typed headings, text turned into outlines): the page is read as a
  // whole, so every line comes out as text, in the order it is printed, with nothing left behind as a picture.
  const pageArea = W * H;
  // (lines of such writing may come apart into separate marks, so wide marks are put back together first)
  const lead = Math.max(body, H / 80) * 1.2;
  const patches = mergeOverlapping(
    comps.filter((c) => c.x1 - c.x0 > W * 0.18 && c.bot - c.top > C * 2.2).map((c) => ({ x0: c.x0, x1: c.x1, top: c.top - lead, bot: c.bot + lead })),
  ).map((c) => ({ ...c, top: Math.max(0, c.top + lead), bot: Math.min(H, c.bot - lead) }));
  const writing = patches.filter((f) => looksLikeWriting(img, W, f)).reduce((a, f) => a + (f.x1 - f.x0) * (f.bot - f.top), 0);
  // (a typed page with one screenshot in it keeps its typed text: the screenshot is looked at later on its own)
  const typed = items.reduce((a, i) => a + (i.x1 - i.x0) * (i.bot - i.top), 0);
  if (writing > pageArea * 0.08 && writing > typed * 0.6) {
    console.debug(`[lq] page ${pageNo}: writing printed as a picture (${Math.round((writing / pageArea) * 100)}% of the page): read as a whole`);
    const blob = await cropBlob(canvas, 0, 0, W, H, false);
    return {
      blocks: [{ t: 'img', blob, w: W, h: H, em: 0, mask: false, kind: 'scan', page: pageNo, alt: `Page ${pageNo}` }],
      scanned: true,
    };
  }

  // Figures absorb text whose centre lies inside them (axis labels, legends); tables absorb their cells.
  // Rule pieces of one table can form several groups; fuse any that overlap or touch.
  const fused = mergeOverlapping(tables.map((t) => ({ ...t, top: t.top - body * 0.5, bot: t.bot + body * 0.5 }))).map((t) => ({ ...t, top: t.top + body * 0.5, bot: t.bot - body * 0.5 }));
  tables.length = 0;
  tables.push(...fused);
  const figs = mergeOverlapping(figures).filter((f) => {
    const t = tables.find((tb) => intersects(tb, f));
    if (!t) return true;
    Object.assign(t, unionBoxes([t, f]));
    return false;
  });
  const imgBoxes: (Box & { kind: 'figure' | 'table' })[] = [
    ...figs.map((b) => ({ ...b, kind: 'figure' as const })),
    ...tables.map((b) => ({ ...b, kind: 'table' as const })),
  ];
  // Grow figure boxes by the text inside/touching them, then drop that text from the flow.
  const absorbed = new Set<Item>();
  for (const b of imgBoxes) {
    for (const it of items) {
      if (absorbed.has(it)) continue;
      // small labels (legends, axis ticks) may sit a little outside the drawing
      const pad = it.fh < body * 0.85 ? body * 1.4 : body * 0.4;
      const inside = centerIn(it, { x0: b.x0 - pad, x1: b.x1 + pad, top: b.top - pad, bot: b.bot + pad });
      if (inside) {
        absorbed.add(it);
        b.x0 = Math.min(b.x0, it.x0);
        b.x1 = Math.max(b.x1, it.x1);
        b.top = Math.min(b.top, it.top);
        b.bot = Math.max(b.bot, it.bot);
      }
    }
  }
  // Rotated text (e.g. y-axis labels) inside figures is fine; arXiv side stamps are dropped entirely.

  // ---------- 3. rows & segments ----------
  const flowItems = items.filter((i) => !absorbed.has(i));
  // A drop cap (a big first letter beside the first two or three lines) belongs to the word next to it, on the first line: left as it
  // is, it becomes a lone letter (or a heading) above the paragraph.
  for (const it of flowItems) {
    const ch = it.str.trim();
    if (ch.length > 2 || !/^[\p{Lu}“"'¿¡]/u.test(ch) || it.fh < body * 1.7) continue;
    const beside = flowItems
      .filter((o) => o !== it && o.fh < body * 1.3 && o.x0 >= it.x1 - body * 0.3 && o.x0 < it.x1 + body * 2.5 && o.base > it.top - body * 0.3 && o.top < it.bot)
      .sort((a, b) => a.base - b.base || a.x0 - b.x0);
    const next = beside[0];
    if (!next) continue;
    const w = Math.min(it.x1 - it.x0, next.fh * 0.8 * ch.length);
    it.x1 = next.x0 - 0.2;
    it.x0 = it.x1 - w;
    it.fh = next.fh;
    it.base = next.base;
    it.top = next.top;
    it.bot = next.bot;
    it.bold = next.bold;
    it.italic = next.italic;
    it.math = false;
  }
  const gutters = findGutters(flowItems, W, body);
  /** which column a stretch of the page is in: 1, 2, 3 … from the left, or 0 when it runs across a gap between columns */
  const colIndex = (x0: number, x1: number) => {
    if (!gutters.length) return 0;
    if (gutters.some((g) => x0 < g - body * 0.3 && x1 > g + body * 0.3)) return 0;
    return 1 + gutters.filter((g) => x0 >= g - body * 0.3).length;
  };
  const rows = mergeFragments(buildRows(flowItems, body), body);
  const segs: Row[] = [];
  for (const r of rows) segs.push(...splitRow(r, gutters));

  // Margin furniture: page numbers and running headers/footers.
  const keep = segs.filter((s) => {
    const inMargin = s.top < H * 0.075 || s.bot > H * 0.93;
    if (!inMargin) return true;
    const text = rowText(s).trim();
    if (/^(\d+|[ivxlcdm]+|page \d+( of \d+)?|\d+\s*\/\s*\d+|– ?\d+ ?–|- ?\d+ ?-)$/i.test(text)) return false;
    const key = text.replace(/\d+/g, '#').toLowerCase().slice(0, 80);
    const seen = ctx.seenMargins.get(key) ?? 0;
    ctx.seenMargins.set(key, seen + 1);
    // a running header comes back page after page, in small type; a heading or the first line of a page is kept
    if (seen > 0) return false;
    return text.length > 0 && (pageNo <= 2 || s.fh >= body * 0.97);
  });

  // ---------- contents pages ----------
  // A book's own list of contents ("1.1 Topologische Räume . . . . 2") is a list, one entry a line, with the page numbers set apart:
  // run together it is one long paragraph, and its lines taken for titles would fill the list of sections with entries that all
  // point at the contents page instead of the chapters.
  {
    const bodyRows = keep.filter((r) => r.top > H * 0.05 && r.bot < H * 0.96);
    const lineRows = mergeFragments(buildRows(bodyRows.flatMap((r) => r.items), body), body).filter((r) => rowText(r).trim());
    const tocTitle = lineRows.find((r) => CONTENTS_TITLE.test(rowText(r).trim()));
    const entries = lineRows.filter((r) => {
      const m = TOC_ROW.exec(rowText(r).trim());
      return !!m && /\p{L}{2,}/u.test(m[1]);
    });
    const nums = entries.map((r) => TOC_ROW.exec(rowText(r).trim())![2]).filter((n) => /^\d+$/.test(n)).map(Number);
    let rising = 0;
    for (let k = 1; k < nums.length; k++) if (nums[k] >= nums[k - 1]) rising++;
    const ordered = nums.length < 3 || rising >= (nums.length - 1) * 0.7;
    const leaders = entries.filter((r) => /(\.\s*){3,}|…|·{3,}/.test(rowText(r))).length;
    const isContents = ordered && ((!!tocTitle && entries.length >= 3) || (entries.length >= 6 && entries.length >= lineRows.length * 0.5 && (leaders >= entries.length * 0.3 || entries.length >= lineRows.length * 0.75)));
    if (isContents) {
      const left = Math.min(...entries.map((r) => r.x0));
      const out: LBlock[] = [];
      let prev: (LBlock & { t: 'p' }) | null = null;
      let prevRow: Row | null = null;
      for (const r of lineRows.sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
        const t = rowText(r).trim();
        if (r === tocTitle) {
          out.push({ t: 'h', level: 1, html: escapeHtml(t), page: pageNo, toc: true });
          prev = null;
          continue;
        }
        const m0 = TOC_ROW.exec(t);
        const m = m0 && /\p{L}{2,}/u.test(m0[1]) ? m0 : null;
        const lvl = Math.max(0, Math.min(3, Math.round((r.x0 - left) / (body * 1.4))));
        if (m) {
          const title = m[1].replace(/[\s.·…]+$/, '');
          if (prev && prevRow && !/\d\s*<\/span>$/.test(prev.html) && r.top - prevRow.bot < body * 0.7) prev.html = prev.html.replace(/<span class="tocn">.*$/, '') + ' ' + escapeHtml(title) + `<span class="tocn">${escapeHtml(m[2])}</span>`;
          else {
            prev = { t: 'p', toc: true, lvl, html: `${escapeHtml(title)}<span class="tocn">${escapeHtml(m[2])}</span>`, page: pageNo };
            out.push(prev);
          }
        } else if (prev && prevRow && r.top - prevRow.bot < body * 0.7 && /^[\p{Ll}(]/u.test(t)) {
          prev.html = prev.html.replace(/(<span class="tocn">)/, ' ' + escapeHtml(t) + '$1');
        } else {
          // a part title without a page ("Part I", "Anhang"), or a title whose page number is on its next line
          prev = { t: 'p', toc: true, lvl, html: escapeHtml(t), page: pageNo };
          out.push(prev);
        }
        prevRow = r;
      }
      const top = Math.min(...lineRows.map((r) => r.top)) / H;
      const end = Math.max(...lineRows.map((r) => r.bot)) / H;
      return { blocks: out, scanned: false, top, end };
    }
  }

  // ---------- tables set without rules ----------
  // Rows of three or more cells set apart by wide gaps, several rows running: a table. It is kept whole, as a picture (each cell
  // read as a word of a paragraph would make nonsense of it).
  {
    const colX = colIndex;
    type Line = { col: number; base: number; fh: number; segs: Row[]; top: number; bot: number };
    const lines: Line[] = [];
    for (const sg of [...keep].sort((a, b) => a.base - b.base || a.x0 - b.x0)) {
      const col = colX(sg.x0, sg.x1);
      const l = lines.find((x) => x.col === col && Math.abs(x.base - sg.base) < Math.min(x.fh, sg.fh) * 0.45);
      if (l) {
        l.segs.push(sg);
        l.top = Math.min(l.top, sg.top);
        l.bot = Math.max(l.bot, sg.bot);
      } else lines.push({ col, base: sg.base, fh: sg.fh, segs: [sg], top: sg.top, bot: sg.bot });
    }
    // where the cells of a line start: a piece of text after a clear gap (not a word going on, nor an italic word in a sentence)
    const stopBin = body * 0.8;
    const stops = (l: Line) => {
      const its = l.segs.flatMap((sg) => sg.items).filter((it) => it.str.trim()).sort((x, y) => x.x0 - y.x0);
      const out: number[] = [];
      // (a title's number set apart from its words, "7   Generation confidence", is not a cell; nor is a line in larger type)
      if (l.fh > body * 1.05) return out;
      for (let q = 1; q < its.length; q++) {
        if (q === 1 && /^(\d{1,2}(\.\d{1,2}){0,3}\.?|[IVXLC]{1,5}\.?|[A-Z]\.|§)$/.test(its[0].str.trim())) continue;
        if (its[q].x0 - Math.max(...its.slice(0, q).map((o) => o.x1)) > body * 0.9) out.push(Math.round(its[q].x0 / stopBin));
      }
      return out;
    };
    const found: Box[] = [];
    for (const col of new Set(lines.map((l) => l.col))) {
      const ls = lines.filter((l) => l.col === col).sort((x, y) => x.top - y.top);
      const st = ls.map(stops);
      let k = 0;
      while (k < ls.length) {
        if (!st[k].length) {
          k++;
          continue;
        }
        // a run of lines with cells, allowing a line or two of a wrapped cell (or a blank row) between them
        let j = k + 1;
        let lastCelled = k;
        while (j < ls.length && ls[j].top - ls[j - 1].bot < body * 2.6 && ls[j].fh <= body * 1.05) {
          if (st[j].length) lastCelled = j;
          else if (j - lastCelled > 2) break;
          j++;
        }
        const run = ls.slice(k, lastCelled + 1);
        const runStops = st.slice(k, lastCelled + 1);
        // the cells' starts line up, row after row
        const counts = new Map<number, number>();
        for (const ss of runStops) for (const b0 of new Set(ss.flatMap((x) => [x - 1, x, x + 1]))) counts.set(b0, (counts.get(b0) ?? 0) + 1);
        const celled = runStops.filter((x) => x.length).length;
        const strong = [...counts.values()].filter((v) => v >= Math.max(3, celled * 0.35)).length;
        const proseLike = run.filter((l) => l.segs.some((sg) => sg.x1 - sg.x0 > W * 0.55 && rowText(sg).split(/\s+/).length > 10)).length;
        if (celled >= 4 && strong >= 2 && proseLike <= run.length * 0.2) {
          const head = ls[k - 1];
          if (head && stops(head).length && run[0].top - head.bot < body * 2) run.unshift(head);
          const segsIn = new Set(run.flatMap((l) => l.segs));
          const box = unionBoxes([...segsIn]);
          box.x0 -= body * 0.3;
          box.x1 += body * 0.3;
          box.top -= body * 0.3;
          box.bot += body * 0.3;
          for (let q = keep.length - 1; q >= 0; q--) if (segsIn.has(keep[q])) keep.splice(q, 1);
          found.push(box);
          k = lastCelled + 1;
        } else k++;
      }
    }
    // pieces of one table: halves either side of the page's gutter, or parts split by a long cell's wrapped lines, are one table;
    // with them go the lines between the pieces and the column titles just above
    let merged = true;
    while (merged) {
      merged = false;
      for (let a = 0; a < found.length && !merged; a++)
        for (let c = a + 1; c < found.length && !merged; c++) {
          const A = found[a];
          const B = found[c];
          const vOverlap = Math.min(A.bot, B.bot) - Math.max(A.top, B.top);
          const hOverlap = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          const side = vOverlap > Math.min(A.bot - A.top, B.bot - B.top) * 0.4 && Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1) < W * 0.08;
          const gapTop = Math.min(A.bot, B.bot);
          const gapBot = Math.max(A.top, B.top);
          // (what lies between two pieces in the table's own small type is a long cell running on, not the text of the page)
          const between = keep.filter((sg) => sg.top >= gapTop - 2 && sg.bot <= gapBot + 2 && sg.x1 > Math.min(A.x0, B.x0) && sg.x0 < Math.max(A.x1, B.x1));
          const smallBetween = between.length > 0 && between.every((sg) => sg.fh < body * 0.96);
          const stacked = hOverlap > Math.min(A.x1 - A.x0, B.x1 - B.x0) * 0.5 && gapBot - gapTop < body * (smallBetween ? 16 : 6);
          if (side || stacked) {
            found[a] = unionBoxes([A, B]);
            found.splice(c, 1);
            merged = true;
          }
        }
    }
    for (const box of found) {
      // the column titles above it (short pieces, set close above)
      for (let n = 0; n < 3; n++) {
        const head = keep.filter((sg) => {
          const words = rowText(sg).trim().split(/\s+/);
          return sg.top < box.top && box.top - sg.bot < body * 1.8 && sg.x0 >= box.x0 - body && sg.x1 <= box.x1 + body && words.length <= 12 && !/[.;:,]$/.test(words[words.length - 1]) && words.every((w) => w.length <= 16) && !words.some((w) => /^(the|and|of|is|are|was|that|which|with|der|die|und|el|la|que|les|des)$/i.test(w));
        });
        if (!head.length) break;
        Object.assign(box, unionBoxes([box, ...head]));
        for (const h of head) keep.splice(keep.indexOf(h), 1);
      }
      // anything left inside it is part of it
      for (let q = keep.length - 1; q >= 0; q--) if (centerIn(keep[q], box)) keep.splice(q, 1);
      imgBoxes.push({ ...box, kind: 'table' });
    }
  }

  // ---------- 4. columns & reading order ----------
  const colOf = colIndex;
  const elems: Elem[] = [
    ...keep.map((row) => ({ k: 'line' as const, row, col: colOf(row.x0, row.x1) })),
    ...imgBoxes.map((b) => ({ k: 'img' as const, ...b, col: colOf(b.x0, b.x1) })),
  ];
  const topOf = (e: Elem) => (e.k === 'line' ? e.row.top : e.top);
  elems.sort((a, b) => topOf(a) - topOf(b));
  const ordered: Elem[] = [];
  if (!gutters.length) ordered.push(...elems);
  else {
    let band: Elem[] = [];
    const flush = () => {
      for (let c = 1; c <= gutters.length + 1; c++) ordered.push(...band.filter((e) => e.col === c));
      band = [];
    };
    for (const e of elems) {
      if (e.col === 0) {
        flush();
        ordered.push(e);
      } else band.push(e);
    }
    flush();
  }

  // ---------- 5. blocks ----------
  const blocks: LBlock[] = [];
  // Column bounds for indentation / short-line checks
  const colBounds = new Map<number, { l: number; r: number }>();
  for (const e of ordered) {
    if (e.k !== 'line') continue;
    const b = colBounds.get(e.col) ?? { l: Infinity, r: -Infinity };
    b.l = Math.min(b.l, e.row.x0);
    b.r = Math.max(b.r, e.row.x1);
    colBounds.set(e.col, b);
  }
  // Column bounds via percentiles is more robust; approximate with min/max but ignore outliers
  for (const [col, b] of colBounds) {
    const lines = ordered.filter((e): e is Extract<Elem, { k: 'line' }> => e.k === 'line' && e.col === col);
    const ls = lines.map((l) => l.row.x0).sort((a, b) => a - b);
    const rs = lines.map((l) => l.row.x1).sort((a, b) => a - b);
    if (ls.length > 4) {
      b.l = ls[Math.floor(ls.length * 0.1)];
      b.r = rs[Math.floor(rs.length * 0.9)];
    }
  }

  // Identify display math / complex rows first.
  const lineElems = ordered.filter((e): e is Extract<Elem, { k: 'line' }> => e.k === 'line');
  const isMathRow = new Set<Row>();
  for (const e of lineElems) {
    const r = e.row;
    const chars = r.items.reduce((a, i) => a + i.str.replace(/\s/g, '').length, 0);
    const mchars = r.items.reduce((a, i) => a + (i.math || MATH_CHARS.test(i.str) ? i.str.replace(/\s/g, '').length : 0), 0);
    // prose letters: body font, or any non-math text font other than TeX's roman (used for "sin", "softmax" in equations)
    const bodyLetters = r.items.some((i) => !i.math && /[A-Za-z]{2,}/.test(i.str) && (i.body || !/(^|\+)(CMR\d|CMSS\d|LMRoman|CMU|LMMathRoman)/i.test(i.font)));
    const anyMath = r.items.some((i) => i.math);
    const ratio = !bodyLetters && anyMath ? 1 : mchars / Math.max(1, chars);
    const cb = colBounds.get(e.col)!;
    const colW = cb.r - cb.l;
    const words = rowText(r).split(/\s+/).filter((w) => /^[A-Za-z]{3,}[.,;:]?$/.test(w)).length;
    const hasBig = r.items.some((i) => i.big);
    const eqNo = /\(\s*\d+(\.\d+)*[a-z]?\s*\)\s*$/.test(rowText(r)) && r.x1 > cb.r - body * 2;
    const stacked = r.items.some((i) => i.frag || (Math.abs(i.base - r.base) > r.fh * 0.45 && i.fh > r.fh * 0.75));
    const indentedBoth = r.x0 > cb.l + body * 1.5 && r.x1 < cb.r - body * 1.5;
    let display = false;
    if (hasBig && words < 6) display = true;
    else if (ratio >= 0.45 && words <= 4) display = true;
    else if (ratio >= 0.3 && (indentedBoth || eqNo) && words <= 6) display = true;
    else if (eqNo && words <= 3 && ratio > 0.1) display = true;
    else if (stacked && ratio > 0.25 && words < 8) display = true;
    // tiny math fragments (numerators, limits) that sit between lines
    else if (chars <= 6 && ratio >= 0.5 && r.fh < body * 0.95) display = true;
    if (display && r.x1 - r.x0 > colW * 0.98 && words > 8) display = false;
    // A short last line of a paragraph that happens to be mostly symbols is not a display.
    if (display && !hasBig && !eqNo && r.x0 <= cb.l + body * 0.4 && !r.items.some((i) => i.frag)) display = false;
    if (display) isMathRow.add(r);
  }

  const dbg = (globalThis as { __lq?: unknown[] }).__lq;
  if (dbg) {
    for (const e of ordered) {
      if (e.k === 'line') dbg.push({ page: pageNo, col: e.col, math: isMathRow.has(e.row), frag: e.row.items.filter((i) => i.frag).map((i) => i.str).join('|'), top: Math.round(e.row.top), x0: Math.round(e.row.x0), x1: Math.round(e.row.x1), fh: +(e.row.fh / body).toFixed(2), t: rowText(e.row).slice(0, 70), f: [...new Set(e.row.items.map((i) => i.font.split(' ')[0].replace(/^[A-Z]{6}\+/, '')))].join(',').slice(0, 60) });
      else dbg.push({ page: pageNo, img: e.kind, top: Math.round(e.top), bot: Math.round(e.bot), x0: Math.round(e.x0), x1: Math.round(e.x1) });
    }
  }
  const mathItems = new Set([...isMathRow].flatMap((r) => r.items));
  const proseItems = flowItems.filter((it) => !mathItems.has(it));

  // Inline stacked math (e.g. 1/√d inside a sentence) becomes a small baseline-aligned crop.
  const inlTokens = new Map<Item, string>();
  const inlSkip = new Set<Item>();
  let inlN = 0;
  for (const e of lineElems) {
    const r = e.row;
    if (isMathRow.has(r) || !r.items.some((i) => i.frag)) continue;
    const clusters: { items: Item[]; box: Box }[] = [];
    for (const seed of r.items.filter((i) => i.frag)) {
      let c = clusters.find((cl) => seed.x0 < cl.box.x1 + r.fh * 0.15 && seed.x1 > cl.box.x0 - r.fh * 0.15);
      if (!c) {
        c = { items: [], box: { x0: seed.x0, x1: seed.x1, top: seed.top, bot: seed.bot } };
        clusters.push(c);
      }
      c.items.push(seed);
      c.box = unionBoxes([c.box, seed]);
    }
    for (const c of clusters) {
      // pull in line items overlapping the cluster horizontally, then touching math glyphs
      let grew = true;
      while (grew) {
        grew = false;
        for (const it of r.items) {
          if (c.items.includes(it)) continue;
          const overlap = it.x0 < c.box.x1 - 0.5 && it.x1 > c.box.x0 + 0.5;
          const touching = it.math && (Math.abs(it.x0 - c.box.x1) < r.fh * 0.12 || Math.abs(c.box.x0 - it.x1) < r.fh * 0.12) && it.str.trim().length <= 3;
          if (overlap || touching) {
            c.items.push(it);
            c.box = unionBoxes([c.box, it]);
            grew = true;
          }
        }
      }
      const box = takeSmallsNear(c.box, smalls, r.fh);
      const pad = 1.5;
      box.x0 -= pad;
      box.x1 += pad;
      box.top -= pad;
      box.bot += pad;
      const blk = await imgBlock(canvas, box, 'math', pageNo, body, undefined, proseItems.filter((it) => !c.items.includes(it)));
      if (blk.t !== 'img') continue;
      const id = `${pageNo}_${inlN++}`;
      blocks.push({ t: 'inl', id, blob: blk.blob, em: blk.em, hem: blk.h / body, dem: (box.bot - r.base) / body });
      const first = [...c.items].sort((a, b) => a.x0 - b.x0)[0];
      inlTokens.set(first, `\u0001${id}\u0001`);
      for (const it of c.items) if (it !== first) inlSkip.add(it);
    }
  }

  // Typical gap between consecutive lines (to spot paragraph spacing).
  const gaps: number[] = [];
  for (let k = 1; k < lineElems.length; k++) {
    const a = lineElems[k - 1].row;
    const b = lineElems[k].row;
    const g = b.top - a.bot;
    if (lineElems[k].col === lineElems[k - 1].col && g > -body && g < body * 2) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const lineGap = Math.max(0, gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 0.2);

  // Program code: lines in a typewriter face with the marks of code in them ({ } ( ) ; = // …), several together
  const monoBody = MONO_FONT.test(bodyFont);
  const codeish = new Set<Row>();
  {
    const mono = lineElems.filter((e) => e.row.items.every((it) => MONO_FONT.test(it.font) || !it.str.trim()));
    const marked = mono.filter((e) => /[{}();=<>[\]#]|\/\/|:=|->|\b(var|let|const|function|return|if|for|while|def|class|int|void|mov|ld|st)\b/.test(rowText(e.row)));
    if (marked.length >= Math.max(2, mono.length * 0.25)) for (const e of mono) codeish.add(e.row);
  }
  // Walk ordered elements and assemble blocks.
  let para: { html: string; lastRow: Row; col: number; li: boolean; sec?: boolean; cap?: boolean; code?: boolean; x0?: number } | null = null;
  /** the heading just written runs on to the next line ("2 Mannigfaltigkeiten und / Simplizialkomplexe") */
  let headRunsOn = false;
  let pendingSec = false;
  let lastBottom = -Infinity;
  let lastCol = -1;
  const deferred: LBlock[] = [];
  const flushPara = () => {
    if (para) {
      const html = para.html.trim();
      if (html) blocks.push(para.li ? { t: 'li', html, page: pageNo } : { t: 'p', html, page: pageNo, ...(para.sec && !para.cap ? { sec: true } : {}), ...(para.cap ? { cap: true } : {}), ...(para.code ? { code: true } : {}) });
      para = null;
    }
    if (deferred.length) blocks.push(...deferred.splice(0));
  };
  // Footnotes: small-font rows in the lower part of the page; emitted after the page's text.
  const footRows = new Set<Row>();
  for (const e of lineElems) {
    const r = e.row;
    if (r.fh < body * 0.92 && r.top > H * 0.45 && !isMathRow.has(r) && rowText(r).trim().length > 3) footRows.add(r);
  }
  // Only keep runs that start with a footnote marker, or that stand apart at the foot of their column (a copyright notice, a
  // "received / accepted" box on a paper's first page): small type below a gap, running to the end of the column.
  const colOfRow = new Map(lineElems.map((e) => [e.row, e.col]));
  const apart = (r: Row) => {
    const col = colOfRow.get(r);
    const above = lineElems.filter((e) => e.col === col && e.row.bot <= r.top + 1 && !footRows.has(e.row)).sort((a, b) => b.row.bot - a.row.bot)[0];
    const belowBody = lineElems.some((e) => e.col === col && e.row.top > r.bot && !footRows.has(e.row));
    return !!above && r.top - above.row.bot > body * 0.9 && !belowBody;
  };
  for (const r of [...footRows]) {
    const first = r.items[0];
    const starts = /^([\d*†‡§¶]|[a-z]\s)/.test(rowText(r).trim()) || (first && first.fh < r.fh * 0.86);
    const prevRow = lineElems.find((e) => e.row !== r && footRows.has(e.row) && r.top - e.row.bot < r.fh && r.top > e.row.top && Math.abs(e.row.x0 - r.x0) < body * 2);
    if (!starts && !prevRow && !apart(r)) footRows.delete(r);
  }
  // notes sit at the foot of their column: a run of small type that stops well above the foot is not notes (higher up the page, a
  // run counts only when it goes on down to the foot)
  {
    const runs: Row[][] = [];
    for (const e of [...lineElems].sort((a, b) => a.row.top - b.row.top)) {
      if (!footRows.has(e.row)) continue;
      const run = runs.find((rn) => colOfRow.get(rn[0]) === e.col && e.row.top - rn[rn.length - 1].bot < body * 1.2);
      if (run) run.push(e.row);
      else runs.push([e.row]);
    }
    for (const rn of runs) if (rn[0].top < H * 0.62 && Math.max(...rn.map((x) => x.bot)) < H * 0.82) for (const x of rn) footRows.delete(x);
  }
  // (a run kept for standing apart keeps all its lines)
  for (const e of lineElems) {
    if (footRows.has(e.row)) continue;
    const r = e.row;
    if (!(r.fh < body * 0.92 && r.top > H * 0.62)) continue;
    const prevRow = lineElems.find((x) => x.row !== r && footRows.has(x.row) && r.top - x.row.bot < r.fh && r.top > x.row.top && Math.abs(x.row.x0 - r.x0) < body * 2);
    if (prevRow) footRows.add(r);
  }
  const footnotes: string[] = [];

  const pendingSmalls = [...smalls];
  const takeSmalls = (box: Box) => {
    // absorb fraction bars, radicals, etc. that intersect a math box
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = pendingSmalls.length - 1; i >= 0; i--) {
        const s = pendingSmalls[i];
        if (intersects(s, { x0: box.x0 - body * 0.3, x1: box.x1 + body * 0.3, top: box.top - body * 0.25, bot: box.bot + body * 0.25 })) {
          box.x0 = Math.min(box.x0, s.x0);
          box.x1 = Math.max(box.x1, s.x1);
          box.top = Math.min(box.top, s.top);
          box.bot = Math.max(box.bot, s.bot);
          pendingSmalls.splice(i, 1);
          grew = true;
        }
      }
    }
    return box;
  };

  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (e.k === 'line' && footRows.has(e.row)) {
      const t = rowHtml(e.row, body, inlTokens, inlSkip);
      const starts = /^(<sup>)?[\d*†‡§¶]/.test(t);
      if (starts || !footnotes.length) footnotes.push(t);
      else footnotes[footnotes.length - 1] += (/[A-Za-z]-$/.test(footnotes[footnotes.length - 1]) ? '' : ' ') + t;
      continue;
    }
    if (e.k === 'img') {
      const box = { x0: e.x0, x1: e.x1, top: e.top, bot: e.bot };
      // A strip of printed text with no text layer (a line or two the PDF's text missed) is text: it is read, and goes on with the
      // paragraph, so nothing is left behind as a picture of words (Listen would skip it, and it looks wrong in a column of text).
      if (e.kind === 'figure' && textStrip(img, W, box, body)) {
        const words = await readStrip(canvas, box);
        if (words) {
          const prevText = para ? rowText((para as { lastRow: Row }).lastRow).trim() : '';
          // (a strip tight under the line before is part of the same paragraph)
          const tight = !!para && e.top - lastBottom < body * 0.7 && e.col === lastCol;
          const goesOn = !!para && (tight || !/[.!?:"”»)]$/.test(prevText) || /^[\p{Ll}(]/u.test(words));
          if (goesOn && para) (para as { html: string }).html += (/[A-Za-z]-$/.test((para as { html: string }).html) ? '' : ' ') + escapeHtml(words);
          else {
            flushPara();
            const row: Row = { items: [], x0: e.x0, x1: e.x1, top: e.top, bot: e.bot, base: e.bot, fh: body };
            para = { html: escapeHtml(words), lastRow: row, col: e.col, li: false };
          }
          if (para) (para as { lastRow: Row }).lastRow = { items: [{ str: words, x0: e.x0, x1: e.x1, base: e.bot, top: e.top, bot: e.bot, fh: body, font: '', math: false, bold: false, italic: false, big: false }], x0: e.x0, x1: e.x1, top: e.top, bot: e.bot, base: e.bot, fh: body };
          lastBottom = e.bot;
          lastCol = e.col;
          continue;
        }
      }
      const blk = await imgBlock(canvas, box, e.kind, pageNo, body, undefined, proseItems);
      // A figure dropped in mid-sentence waits until the paragraph ends.
      const p = para as { html: string } | null;
      if (p && !/[.!?:"”)]\s*$/.test(p.html.replace(/<[^>]+>/g, ''))) {
        deferred.push(blk);
        continue;
      }
      flushPara();
      blocks.push(blk);
      lastBottom = e.bot;
      lastCol = e.col;
      continue;
    }
    const r = e.row;
    if (isMathRow.has(r)) {
      flushPara();
      // gather consecutive math rows of the same column that are vertically close
      const group: Row[] = [r];
      let j = i + 1;
      // the rows of one equation stay together: numerators and denominators set on lines of their own ("4  8", "L"), a left-hand
      // side ("P_M =") or a row that overlaps the equation are pieces of it, not text between two halves of it (which would
      // cut the equation into strips and show parts of it twice)
      const fragment = (row: Row) => {
        const t = rowText(row).trim();
        return t.length <= 24 && !t.split(/\s+/).some((w) => /^[A-Za-z]{4,}[.,;:]?$/.test(w) && !/^(sin|cos|tan|log|exp|max|min|lim|sup|inf|det|mod)$/i.test(w));
      };
      while (j < ordered.length) {
        const n = ordered[j];
        if (n.k !== 'line' || n.col !== e.col) break;
        const bottom = Math.max(...group.map((g) => g.bot));
        const gapN = n.row.top - bottom;
        const overlaps = n.row.top < bottom - 2;
        if (!(isMathRow.has(n.row) || overlaps || (fragment(n.row) && gapN < body * 1.1))) break;
        if (gapN > body * 1.4) break;
        group.push(n.row);
        isMathRow.add(n.row);
        j++;
      }
      i = j - 1;
      const EQNO = /^\(\s*\d+(\.\d+)*[a-z]?\s*\)$/;
      const numItems = group.flatMap((g) => g.items).filter((it) => EQNO.test(it.str.trim()) && it.x0 > (group[0].x0 + group[0].x1) / 2);
      const eqItems = group.flatMap((g) => g.items).filter((it) => !numItems.includes(it));
      const box = takeSmalls(unionBoxes(eqItems.length ? eqItems : group));
      // pad
      const pad = body * 0.25;
      box.x0 = Math.max(0, box.x0 - pad);
      box.x1 = Math.min(W, box.x1 + pad);
      box.top = Math.max(0, box.top - pad);
      box.bot = Math.min(H, box.bot + pad);
      const inGroup = new Set(group.flatMap((g) => g.items));
      const blk = await imgBlock(canvas, box, 'math', pageNo, body, group.map(rowText).join(' '), [...proseItems.filter((it) => !inGroup.has(it)), ...numItems]);
      if (blk.t === 'img' && numItems.length) blk.num = numItems.map((n) => n.str.trim()).join(' ');
      blocks.push(blk);
      lastBottom = box.bot;
      lastCol = e.col;
      continue;
    }

    const text = rowHtml(r, body, inlTokens, inlSkip);
    const plain = rowText(r).trim();
    const letters = (plain.match(/\p{L}/gu) ?? []).length;
    const rowWords = plain.split(/\s+/).filter(Boolean);
    // the labels of a drawing that were not taken into it (axis ticks "0 1 2 3", "36%", a lone "F", "a a bb b"): not text to read
    const labelish = (letters <= 2 && plain.length <= 24) || (rowWords.length >= 3 && rowWords.every((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length <= 2) && !/[.!?]$/.test(plain));
    const firstOnPage = !para && !blocks.some((b) => b.t === 'p' || b.t === 'h' || b.t === 'li');
    const chapterNo = /^(\d{1,3}|[IVXLC]{1,7})\.?$/.test(plain) && firstOnPage;
    if (labelish && !chapterNo) {
      const nearFigure = imgBoxes.some((b) => r.bot > b.top - body * 4 && r.top < b.bot + body * 4);
      if (nearFigure || letters <= 2) {
        lastBottom = r.bot;
        continue;
      }
    }
    // program code: a run of lines set in a typewriter font keeps its lines and their indentation
    const monoChars = r.items.reduce((a, it) => a + (MONO_FONT.test(it.font) ? it.str.replace(/\s/g, '').length : 0), 0);
    // (a typewritten page — a transcript, a filing — is set in a typewriter face throughout: that is its text, not code)
    const isCode = !monoBody && codeish.has(r) && monoChars >= Math.max(3, plain.replace(/\s/g, '').length * 0.8) && (para?.code || lineElems.some((o) => o.row !== r && o.col === e.col && Math.abs(o.row.top - r.bot) < body * 1.6 && o.row.items.every((it) => MONO_FONT.test(it.font) || !it.str.trim())));
    if (isCode) {
      const cw = Math.max(1, r.fh * 0.5);
      if (para && !(para.code && r.top - lastBottom < body * 1.6)) flushPara();
      if (!para) para = { html: '', lastRow: r, col: e.col, li: false, code: true, x0: r.x0 };
      const indent = '\u00a0'.repeat(Math.max(0, Math.round((r.x0 - (para.x0 ?? r.x0)) / cw)));
      para.html += (para.html ? '<br>' : '') + indent + escapeHtml(plain);
      para.x0 = Math.min(para.x0 ?? r.x0, r.x0);
      para.lastRow = r;
      lastBottom = r.bot;
      lastCol = e.col;
      continue;
    }
    if (para?.code) flushPara();
    // a figure's or table's caption: its own small paragraph, never a title and never part of the text around it
    const caption = CAPTION.test(plain);
    // the second line of a two-line title
    const prevH = blocks[blocks.length - 1];
    if (headRunsOn && !para && prevH?.t === 'h' && r.top - lastBottom < r.fh * 0.9 && Math.abs(r.fh / body - ((prevH as { _s?: number })._s ?? 0)) < 0.08) {
      prevH.html += ' ' + text.replace(/<\/?(b|i)>/g, '');
      headRunsOn = /([,;\-–]|\b(the|a|an|of|and|or|to|in|on|at|for|with|by|from|und|der|die|das|de|la|el|y|et|du|des)$)/i.test(plain);
      lastBottom = r.bot;
      lastCol = e.col;
      continue;
    }
    headRunsOn = false;
    const cb = colBounds.get(e.col)!;
    const gap = r.top - lastBottom;
    const sizeRatio = r.fh / body;
    const allBold = r.items.every((it) => it.bold || !/[A-Za-z]/.test(it.str));
    // A heading looks like one: it starts with a capital or a number, is short, does not run on (no trailing comma, hyphen or
    // "the"/"a"/"of"…), and does not sit inside a sentence that is still open. A line set a little larger in the middle of a
    // paragraph (common in scanned and newspaper PDFs) is text, not a title.
    const nWords = plain.split(/\s+/).length;
    const numbered = /^(\d{1,2}(\.\d{1,2}){0,3}\.?|[IVXLC]{1,6}\.|[A-Z]\.|§\s?\d+)\s+\p{Lu}/u.test(plain);
    const quoteStart = /^[“"«„‘']/.test(plain);
    // (a caption or a note that ends without a full stop does not leave a sentence open; a numbered title in bold or larger type,
    // with space above it, is a title whatever came before)
    const openSentence =
      !!para && !para.cap && !/[.!?:"”»)]\s*$/.test(rowText((para as { lastRow: Row }).lastRow).trim()) && gap < body * 2.2 && !(numbered && (allBoldRow(r) || r.fh / body > 1.1) && gap > body * 0.6);
    const runsOn = /([,;\-–]|\b(the|a|an|of|and|or|to|in|on|at|for|with|by|from|that|which|el|la|los|las|de|del|y|en|un|una|le|les|des|et|du|der|die|das|und))$/i.test(plain);
    // a title set over two lines may break after "and" or "of": it is still a title when it is large or numbered and the next
    // line, in the same type, finishes it
    const nextSame = (n: Row | null) => !!n && Math.abs(n.fh - r.fh) < body * 0.1 && n.top - r.bot < r.fh * 0.9 && allBoldRow(n) === allBoldRow(r);
    const titleLike = /^[\p{Lu}0-9§«“"¿¡(]/u.test(plain) && (!runsOn || ((numbered || sizeRatio > 1.18) && !quoteStart && nWords <= 12)) && nWords <= 16 && plain.length < 120 && !openSentence && !caption && !(quoteStart && nWords > 5);
    // a short line on its own, centred in the column, after space: "CHAPTER IV", "Part Two", "XII", "* * *"
    const centred = Math.abs((r.x0 + r.x1) / 2 - (cb.l + cb.r) / 2) < (cb.r - cb.l) * 0.06 && r.x1 - r.x0 < (cb.r - cb.l) * 0.6;
    const marker = /^((chapter|cap[ií]tulo|chapitre|kapitel|capitolo|part|parte|partie|teil|book|libro|livre|section|secci[oó]n|act|acto|scene|escena|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n|preface|prefacio|pr[eé]face)\b.{0,40}|[IVXLCDM]{1,7}\.?|\d{1,3}\.?)$/i.test(plain);
    // the line below: a title stands apart from it; the first line of a paragraph (in bold or a little larger, as some books and
    // newspapers set it) runs straight into it at ordinary line spacing
    let below: Row | null = null;
    for (let j = i + 1; j < ordered.length; j++) {
      const n = ordered[j];
      if (n.k === 'line' && n.col === e.col && !footRows.has(n.row)) {
        below = n.row;
        break;
      }
      if (n.k === 'img') break;
    }
    const belowBold = !!below && below.items.every((it) => it.bold || !/[A-Za-z]/.test(it.str));
    // (a short headline set tight above its article, whose text starts a sentence of its own, is still a headline)
    const tight = !!below && !belowBold && below.top - r.bot < Math.max(lineGap * 1.8, body * 0.55) && Math.abs(below.fh - body) < body * 0.15;
    const goesOnBelow = !!below && /^[\p{Ll}(,;:]/u.test(rowText(below).trim());
    // a line whose sentence carries on, in the same type, on the next line is part of a paragraph (a pull quote, a bold opening)
    const sentenceGoesOn = goesOnBelow && !!below && Math.abs(below.fh - r.fh) < body * 0.15 && below.top - r.bot < r.fh * 1.1 && !/[.!?:]$/.test(plain) && !numbered;
    const wide = r.x1 > cb.r - body * 4;
    const runsInto = tight && (goesOnBelow || wide) && sizeRatio < 1.35 && !marker;
    const fullWidth = r.x1 > cb.r - body * 1.5 && r.x0 <= cb.l + body * 2.5 && nWords >= 9 && sizeRatio < 1.35;
    const isHeading =
      titleLike &&
      !runsInto &&
      !fullWidth &&
      !sentenceGoesOn &&
      !(labelish && !chapterNo) &&
      // a bold line at the text's own size that ends in a colon, or reads as a sentence, introduces what follows ("Parameters:",
      // "On Windows, you have two options:"): it is a lead-in, not a title
      !(sizeRatio < 1.12 && !numbered && (/[:;,]$/.test(plain) || (nWords >= 5 && /,\s/.test(plain)))) &&
      ((sizeRatio > 1.18 && plain.length > 1) ||
        (allBold && plain.length < 80 && !/\.$/.test(plain) && (gap > body * 0.5 || lastCol !== e.col)) ||
        (marker && (centred || gap > body * 1.2 || sizeRatio > 1.05)) ||
        (centred && sizeRatio > 1.02 && nWords <= 8 && gap > body * 1.2));
    // "* * *", "⁂", "~": a break between scenes
    if (/^([*·•⁂~#◆◇❧§]\s*){1,5}$/.test(plain) && (centred || plain.length <= 5)) {
      flushPara();
      pendingSec = true;
      lastBottom = r.bot;
      lastCol = e.col;
      continue;
    }
    if (isHeading) {
      // merge multi-line headings with same size
      const prevBlock = blocks[blocks.length - 1];
      if (!para && prevBlock?.t === 'h' && gap < r.fh * 0.8 && Math.abs(sizeRatio - (prevBlock as { _s?: number })._s!) < 0.05) {
        prevBlock.html += ' ' + text;
      } else {
        flushPara();
        const level = sizeRatio > 1.6 || (marker && sizeRatio > 1.25) ? 1 : sizeRatio > 1.3 || marker ? 2 : 3;
        // a heading is plain type in its own style: the bold and italics of the printed line are not carried over
        const hb = { t: 'h' as const, level, html: text.replace(/<\/?(b|i)>/g, ''), page: pageNo, sec: pendingSec || gap > body * 2.5 } as LBlock & { _s?: number };
        pendingSec = false;
        hb._s = sizeRatio;
        blocks.push(hb);
      }
      headRunsOn = (runsOn || goesOnBelow) && nextSame(below);
      lastBottom = r.bot;
      lastCol = e.col;
      continue;
    }

    // a whole line in bold inside ordinary text (a run-in first line, a line the page set apart) reads as ordinary text
    const textHtml = allBold && !belowBold && plain.split(/\s+/).length > 3 ? text.replace(/<\/?b>/g, '') : text;
    // a bullet or "a)", "iv.", "12." — never the end of a word broken over the line before ("grown- / up. I have")
    const prevEndsHyphen: boolean = !!para && /[A-Za-z]-$/.test(rowText((para as { lastRow: Row }).lastRow).trim());
    const bullet: boolean = /^([•●◦▪‣∙·\-–—*]\s|\(?([a-z]|[ivx]{1,4}|\d{1,2})[.)]\s)/i.test(plain) && r.x0 <= cb.l + body * 3 && !prevEndsHyphen;
    let newPara = !para || caption;
    if (para && !caption && para.cap) {
      const prev = para.lastRow;
      // a caption ends at its last short line, a change of size, or space below it
      if (prev.x1 < cb.r - body * 2.5 || Math.abs(r.fh - prev.fh) > body * 0.08 || gap > Math.max(body * 0.6, lineGap * 1.6)) newPara = true;
    } else if (para && !caption) {
      const prev = para.lastRow;
      const prevText = rowText(prev).trim();
      const prevShort = prev.x1 < cb.r - body * 2.5;
      const indented = r.x0 > cb.l + body * 0.7 && r.x0 < cb.l + body * 4;
      const sameCol = e.col === para.col;
      if (!sameCol && e.col !== 0 && para.col !== 0) {
        // column switch: continue unless previous line was short (paragraph ended)
        newPara = prevShort && /[.!?:"”)]$/.test(prevText);
        if (indented) newPara = true;
      } else {
        if (gap > Math.max(body * 0.75, prev.fh * 0.75)) newPara = true;
        else if (indented && (prevShort || /[.!?:"”]$/.test(prevText))) newPara = true;
        else if (prevShort && /[.!?:"”)]$/.test(prevText)) newPara = true;
        else if (gap > lineGap * 2.5 + body * 0.2) newPara = true;
        else if (Math.abs(r.fh - prev.fh) > body * 0.2) newPara = true;
        // ...but a sentence that has not ended goes on: a wider gap or a slightly different size inside a sentence is how the page
        // was set, not a new paragraph ("hundreds of pieces of a wrecked Lockheed / Lightning, found on the seabed")
        const open = !/[.!?:"”»)\]]$/.test(prevText) || /[,;\-–]$/.test(prevText);
        // (an indented line after an open one is the rest of the sentence, set with a hanging indent: "Deputy Attorney General, Los /
        //    Angeles, Cal.")
        // (but not out of a page's header, nor across a clear change of type size)
        const fromHeader = prev.bot < H * 0.08;
        if (newPara && open && !bullet && !fromHeader && Math.abs(r.fh - prev.fh) <= body * 0.15 && gap < body * 2.6 && (!indented || (/[\p{L},]$/u.test(prevText) && gap < Math.max(lineGap * 1.6, body * 0.6)))) newPara = false;
      }
      if (bullet) newPara = true;
    }
    if (newPara) {
      flushPara();
      // a wide empty band before a paragraph is a break between sections (or scenes)
      if (lastBottom > -Infinity && gap > Math.max(body * 2.6, lineGap * 6) && e.col === lastCol) pendingSec = true;
      para = { html: caption ? text.replace(/<\/?b>/g, '') : textHtml, lastRow: r, col: e.col, li: bullet && !caption, sec: pendingSec && !caption, cap: caption };
      pendingSec = false;
    } else if (para) {
      // de-hyphenate
      if (/[A-Za-z]-$/.test(para.html) && /^[a-z]/.test(plain)) para.html = para.html.slice(0, -1) + textHtml;
      else para.html += ' ' + textHtml;
      para.lastRow = r;
      para.col = e.col;
    }
    lastBottom = r.bot;
    lastCol = e.col;
  }
  flushPara();
  for (const f of footnotes) blocks.push({ t: 'p', html: `<small class="fn">${f}</small>`, page: pageNo });

  // Over-long "headings" are really emphasised paragraphs.
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    // (a numbered section's title stays a title however long it runs: "6.6 Juhn, Kalemli-Ozcan, and Turan (2009), “HIV and …”")
    const t = b.t === 'h' ? b.html.replace(/<[^>]+>/g, '') : '';
    if (b.t === 'h' && t.length > 110 && !(/^\d{1,2}(\.\d{1,2}){1,3}\.?\s+\p{Lu}/u.test(t) && t.length < 400)) blocks[k] = { t: 'p', html: b.html, page: b.page };
  }
  tidyBlocks(blocks);

  // Mark first paragraph as a possible continuation of the previous page.
  const first = blocks.find((b) => b.t === 'p' || b.t === 'h' || b.t === 'img' || b.t === 'li');
  if (first && first.t === 'p' && /^[a-z(]/.test(first.html.replace(/<[^>]+>/g, ''))) first.cont = true;

  // where the text starts and ends on the page (a chapter often starts low on a fresh page, after a page that ended early)
  const textRows = lineElems.filter((e) => !footRows.has(e.row)).map((e) => e.row);
  const top = textRows.length ? Math.min(...textRows.map((r) => r.top)) / H : undefined;
  const end = textRows.length ? Math.max(...textRows.map((r) => r.bot)) / H : undefined;
  return { blocks, scanned: false, top, end };
}

// ---------- helpers ----------

const plainOf = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\u0001\w+\u0001/g, ' x ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const ENDS = /[.!?:;"”»)\]…]$/;
/**
 * The last word on a page's blocks: a sentence cut in two (by a figure, a column, a wider gap) is joined again, a line of only
 * numbers or one letter (a page number, a stray label) is dropped, and a "heading" that is the start of a sentence going on in
 * the next paragraph is put back at its start.
 */
function tidyBlocks(blocks: LBlock[]) {
  for (let k = blocks.length - 1; k >= 0; k--) {
    const b = blocks[k];
    if (b.t !== 'p' || b.cap || b.toc || b.code || /^<small/.test(b.html)) continue;
    const t = plainOf(b.html);
    if (/^[\d\s.,%–\-+()$€£/:×]+$/.test(t) && t.length <= 24) blocks.splice(k, 1);
    else if ((t.match(/\p{L}/gu) ?? []).length <= 1 && t.length <= 4) blocks.splice(k, 1);
  }
  for (let k = 1; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.t !== 'p' || b.cap || b.toc || b.code || /^<small/.test(b.html)) continue;
    const t = plainOf(b.html);
    if (!/^[\p{Ll}]/u.test(t)) continue;
    // the paragraph (or bold "heading") it goes on from, past any pictures in between
    let j = k - 1;
    while (j >= 0 && (blocks[j].t === 'img' || blocks[j].t === 'inl')) j--;
    const a = blocks[j];
    if (!a || (a.t !== 'p' && a.t !== 'h' && a.t !== 'li') || (a.t === 'p' && (a.cap || a.toc || a.code || /^<small/.test(a.html)))) continue;
    const at = plainOf(a.html);
    // (a web address broken over two lines: "http://www." / "aeaweb.org/…", or a reference's address on a line of its own)
    const url = /(https?:\/\/\S*|www\.)$/i.test(at);
    const address = /^[a-z0-9][\w-]*(\.[\w-]+)+\/\S*/i.test(t);
    if (ENDS.test(at) && !url && !address) continue;
    if (a.t === 'h' && (/^(\d{1,2}(\.\d{1,2}){0,3}\.?|[IVXLC]{1,6}\.)\s/.test(at) || at.split(' ').length < 4)) continue;
    if (j === k - 1) {
      const joined = url ? a.html.replace(/\s+$/, '') + b.html : /[A-Za-z]-$/.test(at) ? a.html.replace(/-\s*$/, '') + b.html : a.html + ' ' + b.html;
      blocks[j] = a.t === 'li' ? { t: 'li', html: joined, page: a.page } : { t: 'p', html: joined, page: a.page, ...(a.t === 'p' && a.cont ? { cont: true } : {}), ...(a.sec ? { sec: true } : {}) };
      blocks.splice(k, 1);
      k--;
    } else {
      if (a.t === 'h') blocks[j] = { t: 'p', html: a.html, page: a.page, ...(a.sec ? { sec: true } : {}) };
      if (a.t === 'li') continue;
      b.cont = true;
    }
  }
}

/**
 * Drops text drawn twice in (almost) the same place. The copies are not always cut into the same pieces ("Wh" + "y T…"
 * beside "Why T…"), so it works letter by letter: a letter that sits on top of the same letter already kept is a copy.
 * A piece made only of copies goes; copied letters at either end of a piece are cut off.
 */
function dedupeItems(items: Item[]) {
  type Ch = { c: string; x: number; base: number; fh: number };
  const grid = new Map<number, Ch[]>(); // by baseline band
  const band = (y: number) => Math.round(y / 4);
  const near = (ch: Ch, cw: number) => {
    for (let b = band(ch.base) - 2; b <= band(ch.base) + 2; b++) {
      for (const o of grid.get(b) ?? []) {
        if (o.c !== ch.c) continue;
        if (Math.abs(o.base - ch.base) > ch.fh * 0.35 || Math.abs(o.fh - ch.fh) > ch.fh * 0.25) continue;
        if (Math.abs(o.x - ch.x) < Math.max(cw * 0.5, ch.fh * 0.12)) return true;
      }
    }
    return false;
  };
  const out: Item[] = [];
  for (const it of items) {
    const n = it.str.length;
    const cw = (it.x1 - it.x0) / Math.max(1, n);
    const chars: Ch[] = Array.from(it.str, (c, k) => ({ c, x: it.x0 + cw * (k + 0.5), base: it.base, fh: it.fh }));
    const dup = chars.map((ch) => (/\s/.test(ch.c) ? null : near(ch, cw)));
    const solid = dup.filter((d) => d !== null).length;
    const copies = dup.filter((d) => d === true).length;
    if (solid && copies >= solid * 0.7) continue; // a copy
    let a = 0;
    let b = n;
    if (copies) {
      while (a < b && dup[a] !== false) a++;
      while (b > a && dup[b - 1] !== false) b--;
      if (a > 0 || b < n) {
        it.str = it.str.slice(a, b);
        it.x0 += cw * a;
        it.x1 -= cw * (n - b);
      }
    }
    if (!it.str.trim()) continue;
    for (const ch of chars.slice(a, b)) {
      const k = band(ch.base);
      const list = grid.get(k);
      if (list) list.push(ch);
      else grid.set(k, [ch]);
    }
    out.push(it);
  }
  items.length = 0;
  items.push(...out);
}

/**
 * Is this patch of ink lines of writing (a picture of text) rather than a drawing or a photo? Writing has rows of
 * ink of about the same height, with thin white gaps between them at a steady rhythm, and neither solid nor sparse ink.
 */
function looksLikeWriting(px: Uint8ClampedArray, W: number, b: Box): boolean {
  const x0 = Math.max(0, Math.floor(b.x0));
  const x1 = Math.min(W, Math.ceil(b.x1));
  const y0 = Math.max(0, Math.floor(b.top));
  const y1 = Math.ceil(b.bot);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 120 || h < 60) return false;
  const step = Math.max(1, Math.floor(w / 400)); // a few hundred samples per row are plenty
  const prof: number[] = [];
  let dark = 0;
  let mid = 0;
  let samples = 0;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    let p = (y * W + x0) * 4;
    for (let x = x0; x < x1; x += step, p += 4 * step) {
      const v = (px[p] * 3 + px[p + 1] * 6 + px[p + 2]) / 10;
      samples++;
      if (v < 140) n++, dark++;
      else if (v < 215) mid++;
    }
    prof.push(n / Math.ceil(w / step));
  }
  // photos are full of grey; writing is dark ink on white
  if (mid > samples * 0.25 || dark > samples * 0.4 || dark < samples * 0.02) return false;
  const runs: { a: number; b: number }[] = [];
  let s = -1;
  for (let y = 0; y <= prof.length; y++) {
    const on = y < prof.length && prof[y] > 0.004;
    if (on && s < 0) s = y;
    else if (!on && s >= 0) {
      if (y - s >= 3) runs.push({ a: s, b: y });
      s = -1;
    }
  }
  if (runs.length < 3) return false;
  const hs = runs.map((r) => r.b - r.a).sort((p, q) => p - q);
  const mh = hs[hs.length >> 1];
  if (mh < 6 || mh > h * 0.4) return false;
  // most rows are about one line high
  const lineish = hs.filter((x) => x > mh * 0.45 && x < mh * 2.2).length;
  if (lineish < runs.length * 0.7) return false;
  // the rows cover a good part of the patch, at a steady pitch
  const pitches = runs.slice(1).map((r, i) => r.a - runs[i].a).sort((p, q) => p - q);
  const mp = pitches[pitches.length >> 1];
  const steady = pitches.filter((p) => Math.abs(p - mp) < mp * 0.45).length;
  if (steady < pitches.length * 0.55 || mp > mh * 3.5) return false;
  // and each row is made of letters: many small marks side by side, not one long stroke (the grid lines of a
  // chart and the rules of a table also come at a steady pitch, but they are lines)
  const lettered = (r: { a: number; b: number }) => {
    let best = 0;
    for (const f of [0.35, 0.55, 0.75]) {
      const y = y0 + r.a + Math.floor((r.b - r.a) * f);
      let marks = 0;
      let run = 0;
      let longest = 0;
      let was = false;
      for (let x = x0, p = (y * W + x0) * 4; x < x1; x++, p += 4) {
        const ink = (px[p] * 3 + px[p + 1] * 6 + px[p + 2]) / 10 < 160;
        if (ink) {
          if (!was) marks++;
          run++;
          if (run > longest) longest = run;
        } else run = 0;
        was = ink;
      }
      const used = marks >= Math.max(5, w / 60) && longest < Math.max(mh * 2.5, w * 0.06);
      if (used) best++;
    }
    return best >= 2;
  };
  return runs.filter(lettered).length >= runs.length * 0.7;
}

/** A band of one to five lines of printed letters (not a drawing, a photo or a table): text without a text layer. */
function textStrip(px: Uint8ClampedArray, W: number, b: Box, body: number): boolean {
  const x0 = Math.max(0, Math.floor(b.x0));
  const x1 = Math.min(W, Math.ceil(b.x1));
  const y0 = Math.max(0, Math.floor(b.top));
  const y1 = Math.ceil(b.bot);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < body * 6 || h > body * 7.5 || h < body * 0.6) return false;
  const rows: number[] = [];
  let dark = 0;
  let mid = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    let k = 0;
    for (let x = x0, p = (y * W + x0) * 4; x < x1; x += 2, p += 8) {
      const v = (px[p] * 3 + px[p + 1] * 6 + px[p + 2]) / 10;
      n++;
      if (v < 140) k++, dark++;
      else if (v < 215) mid++;
    }
    rows.push(k / Math.ceil(w / 2));
  }
  if (mid > n * 0.2 || dark > n * 0.35 || dark < n * 0.015) return false;
  const runs: { a: number; b: number }[] = [];
  let st = -1;
  for (let y = 0; y <= rows.length; y++) {
    const on = y < rows.length && rows[y] > 0.004;
    if (on && st < 0) st = y;
    else if (!on && st >= 0) {
      if (y - st >= 2) runs.push({ a: st, b: y });
      st = -1;
    }
  }
  if (!runs.length || runs.length > 6) return false;
  if (!runs.every((r) => r.b - r.a > body * 0.35 && r.b - r.a < body * 2.2)) return false;
  // each line is many small marks side by side (letters), not long strokes (rules, axes, borders)
  return runs.every((r) => {
    const y = y0 + r.a + Math.floor((r.b - r.a) * 0.55);
    let marks = 0;
    let run = 0;
    let longest = 0;
    let was = false;
    for (let x = x0, p = (y * W + x0) * 4; x < x1; x++, p += 4) {
      const ink = (px[p] * 3 + px[p + 1] * 6 + px[p + 2]) / 10 < 160;
      if (ink) {
        if (!was) marks++;
        run++;
        if (run > longest) longest = run;
      } else run = 0;
      was = ink;
    }
    return marks >= Math.max(8, w / (body * 1.2)) && longest < body * 1.6;
  });
}

/** Reads a strip of printed text from the rendered page (enlarged for the reader); empty when it is not confident words. */
async function readStrip(canvas: HTMLCanvasElement, b: Box): Promise<string> {
  try {
    const pad = 4;
    const x = Math.max(0, Math.floor(b.x0 - pad));
    const y = Math.max(0, Math.floor(b.top - pad));
    const w = Math.min(canvas.width - x, Math.ceil(b.x1 - b.x0 + pad * 2));
    const h = Math.min(canvas.height - y, Math.ceil(b.bot - b.top + pad * 2));
    const k = Math.min(2, 2400 / Math.max(1, w));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const cx = c.getContext('2d')!;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
    const r = await recognize(c, undefined, 6, 20_000);
    // (a capital I at the start of a line is often read as a bracket or a bar)
    const text = r.text.replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1$2').trim().replace(/^[[|l1]\s(?=\p{Ll})/u, 'I ');
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    return r.confidence >= 60 && letters >= 6 && letters >= text.length * 0.55 ? text : '';
  } catch {
    return '';
  }
}

interface Box {
  x0: number;
  x1: number;
  top: number;
  bot: number;
}

const centerIn = (it: Box, b: Box) => {
  const cx = (it.x0 + it.x1) / 2;
  const cy = (it.top + it.bot) / 2;
  return cx >= b.x0 && cx <= b.x1 && cy >= b.top && cy <= b.bot;
};
const intersects = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.top < b.bot && a.bot > b.top;

function unionBoxes(bs: Box[]): Box {
  return {
    x0: Math.min(...bs.map((b) => b.x0)),
    x1: Math.max(...bs.map((b) => b.x1)),
    top: Math.min(...bs.map((b) => b.top)),
    bot: Math.max(...bs.map((b) => b.bot)),
  };
}

function mergeOverlapping(bs: Box[]): Box[] {
  const out = bs.map((b) => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = i + 1; j < out.length && !merged; j++)
        if (intersects(out[i], out[j])) {
          out[i] = unionBoxes([out[i], out[j]]);
          out.splice(j, 1);
          merged = true;
        }
  }
  return out;
}

/** Is this page's text layer gibberish (letters stored as symbols by a font with its own encoding)? */
function garbledText(items: Item[]): boolean {
  const s = items.filter((i) => !i.math).map((i) => i.str).join('');
  const chars = s.replace(/\s/g, '').length;
  if (chars < 60) return false;
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  if (letters / chars < 0.3) return true; // nearly all symbols
  const latin = (s.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
  if (latin > 40 && latin / letters > 0.8) {
    const vowels = (s.match(/[aeiouyáéíóúàèìòùâêîôûäëïöüåæœ]/giu) ?? []).length;
    if (vowels / latin < 0.12) return true; // letters, but not a language
  }
  return false;
}

function components(grid: Uint8Array, gw: number, gh: number, gap: number) {
  const seen = new Uint8Array(gw * gh);
  const out: { x0: number; x1: number; y0: number; y1: number; n: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < grid.length; s++) {
    if (grid[s] !== 1 || seen[s]) continue;
    let x0 = gw;
    let x1 = 0;
    let y0 = gh;
    let y1 = 0;
    let n = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % gw;
      const y = (p / gw) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -gap; dy <= gap; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -gap; dx <= gap; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          const q = yy * gw + xx;
          if (grid[q] === 1 && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    out.push({ x0, x1, y0, y1, n });
  }
  return out;
}

function buildRows(items: Item[], body: number): Row[] {
  const hangs = (it: Item) => it.bot - it.base > it.fh * 0.5;
  const isSmall = (it: Item) => it.fh < body * 0.86 || hangs(it);
  const big = items.filter((i) => !isSmall(i)).sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const small = items.filter(isSmall).sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const rows: Row[] = [];
  const add = (r: Row, it: Item, setBase: boolean) => {
    r.items.push(it);
    r.x0 = Math.min(r.x0, it.x0);
    r.x1 = Math.max(r.x1, it.x1);
    r.top = Math.min(r.top, it.top);
    r.bot = Math.max(r.bot, it.bot);
    if (setBase && it.fh > r.fh && it.str.trim().length > 2) {
      r.fh = it.fh;
      r.base = it.base;
    }
  };
  const fresh = (it: Item): Row => ({ items: [it], x0: it.x0, x1: it.x1, top: it.top, bot: it.bot, base: it.base, fh: it.fh });
  // pass 1: main-size glyphs establish baselines
  for (const it of big) {
    let target: Row | null = null;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 8; k--) {
      const r = rows[k];
      if (Math.abs(it.base - r.base) < Math.min(it.fh, r.fh) * 0.3) {
        target = r;
        break;
      }
    }
    if (target) add(target, it, true);
    else rows.push(fresh(it));
  }
  // pass 2: scripts attach to the nearest compatible line
  const smallRows: Row[] = [];
  for (const it of small) {
    let best: Row | null = null;
    let bestD = Infinity;
    for (const r of rows) {
      if (it.x1 < r.x0 - r.fh * 1.5 || it.x0 > r.x1 + r.fh * 1.5) continue;
      if (hangs(it)) {
        // attach by vertical overlap (radical signs, big operators)
        const ov = Math.min(it.bot, r.bot) - Math.max(it.top, r.top);
        const score = -ov;
        if (ov > (it.bot - it.top) * 0.4 && score < bestD) {
          bestD = score;
          best = r;
        }
        continue;
      }
      const d = Math.abs(it.base - r.base);
      if (d < r.fh * 0.55 && d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (best) {
      add(best, it, false);
      continue;
    }
    const sr = smallRows.find((r) => Math.abs(it.base - r.base) < Math.min(it.fh, r.fh) * 0.3);
    if (sr) add(sr, it, true);
    else smallRows.push(fresh(it));
  }
  const out = [...rows, ...smallRows].sort((a, b) => a.top - b.top);
  for (const r of out) {
    r.items.sort((a, b) => a.x0 - b.x0);
    // Stacked pieces (inline fractions, limits): items overlapping horizontally at different heights.
    for (const a of r.items) {
      for (const b of r.items) {
        if (a === b) continue;
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (ov > Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.4 && Math.abs(a.base - b.base) > Math.min(a.fh, b.fh) * 0.3 && (a.math || b.math || isSmall(a) || isSmall(b))) {
          a.frag = true;
          b.frag = true;
        }
      }
    }
  }
  return out;
}

/** Fold tiny rows (numerators, limits, radical signs) into the line they belong to. */
function mergeFragments(rows: Row[], body: number): Row[] {
  const out = [...rows];
  const charsOf = (r: Row) => r.items.reduce((a, it) => a + it.str.trim().length, 0);
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    const symbolOnly = !/[A-Za-z0-9]/.test(r.items.map((it) => it.str).join(''));
    if (charsOf(r) > 6 && !symbolOnly) continue;
    if (!symbolOnly && r.fh > body * 0.95 && !r.items.every((it) => it.math)) continue;
    let best: Row | null = null;
    let bestD = Infinity;
    for (const o of out) {
      if (o === r || charsOf(o) <= 3) continue;
      if (r.x0 < o.x0 - o.fh || r.x1 > o.x1 + o.fh) continue;
      const d = Math.max(0, Math.max(o.top - r.bot, r.top - o.bot));
      if (d < o.fh * 0.45 && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) continue;
    const mid = (r.top + r.bot) / 2;
    const inside = mid > best.top && mid < best.bot;
    const clash = best.items.some((it) => it.x0 < r.x1 - 0.5 && it.x1 > r.x0 + 0.5);
    if (clash || !inside) for (const it of r.items) it.frag = !symbolOnly || clash;
    best.items.push(...r.items);
    best.items.sort((a, b) => a.x0 - b.x0);
    best.x0 = Math.min(best.x0, r.x0);
    best.x1 = Math.max(best.x1, r.x1);
    best.top = Math.min(best.top, r.top);
    best.bot = Math.max(best.bot, r.bot);
    out.splice(i, 1);
    i--;
  }
  return out;
}

function takeSmallsNear(box: Box, smalls: Box[], fh: number): Box {
  const b = { ...box };
  for (const s of smalls) {
    if (s.x0 >= b.x0 - fh * 0.2 && s.x1 <= b.x1 + fh * 0.4 && s.top >= b.top - fh * 0.3 && s.bot <= b.bot + fh * 0.3) {
      b.x0 = Math.min(b.x0, s.x0);
      b.x1 = Math.max(b.x1, s.x1);
      b.top = Math.min(b.top, s.top);
      b.bot = Math.max(b.bot, s.bot);
    }
  }
  return b;
}

function splitRow(r: Row, gutters: number[]): Row[] {
  const out: Row[] = [];
  let cur: Item[] = [];
  const push = () => {
    if (!cur.length) return;
    const fh = Math.max(...cur.map((i) => i.fh));
    const main = cur.find((i) => i.fh === fh)!;
    out.push({
      items: cur,
      x0: Math.min(...cur.map((i) => i.x0)),
      x1: Math.max(...cur.map((i) => i.x1)),
      top: Math.min(...cur.map((i) => i.top)),
      bot: Math.max(...cur.map((i) => i.bot)),
      base: main.base,
      fh,
    });
    cur = [];
  };
  let lastX1 = -Infinity;
  for (const it of r.items) {
    const eqNo = /^\(\s*\d+(\.\d+)*[a-z]?\s*\)$/.test(it.str.trim());
    // (the gap found between two columns may sit a little to one side of the true gap: a line may end just past it)
    const crossesGutter = gutters.some((g) => lastX1 <= g + r.fh * 0.6 && it.x0 >= g - r.fh * 0.6 && it.x0 > lastX1 + r.fh * 0.15);
    if (cur.length && (crossesGutter || (!eqNo && it.x0 - lastX1 > Math.max(r.fh * 2.4, 14)))) push();
    cur.push(it);
    lastX1 = Math.max(lastX1, it.x1);
  }
  push();
  return out;
}

/** Find the white channel between two text columns, using individual text runs (which never cross it). */
/** The gaps between a page's columns of text (none for a single column; one or two for two or three columns). */
function findGutters(items: Item[], W: number, body: number): number[] {
  if (items.length < 30) return [];
  // the gap between two columns is looked for among the column-wide pieces of text: a title, an author line or a picture caption
  // set across the whole page (common above the columns on a paper's first page) would otherwise fill the gap in
  const narrow = items.filter((it) => it.x1 - it.x0 < W * 0.5);
  if (narrow.length < 20) return [];
  const bins = 300;
  const cov = new Float64Array(bins);
  for (const it of narrow) {
    const a = Math.max(0, Math.floor((it.x0 / W) * bins));
    const b = Math.min(bins - 1, Math.floor((it.x1 / W) * bins));
    for (let i = a; i <= b; i++) cov[i] += it.bot - it.top;
  }
  const nz = [...cov].filter((v) => v > 0).sort((a, b) => a - b);
  const typical = nz[Math.floor(nz.length * 0.6)] ?? 0;
  if (!typical) return [];
  // the widest dip in the cover between two fractions of the page's width (a few centred lines across the gap — a title page's
  // authors and affiliations, a short caption — leave it a gap: a dip to under half of the usual cover is one)
  const gapIn = (loF: number, hiF: number) => {
    const lo = Math.floor(bins * loF);
    const hi = Math.ceil(bins * hiF);
    let best: { x: number; width: number } | null = null;
    let i = lo;
    while (i < hi) {
      if (cov[i] < typical * 0.45) {
        let j = i;
        while (j < hi && cov[j] < typical * 0.45) j++;
        const width = ((j - i) / bins) * W;
        if (width >= body * 0.5 && (!best || width > best.width)) best = { x: ((i + j) / 2 / bins) * W, width };
        i = j;
      } else i++;
    }
    return best?.x ?? null;
  };
  // each column reads as a column of text: enough lines, running beside the others down a good part of the page, its lines mostly
  // running across it (a wide table's cells are short, and a gap between two of its columns is not a gutter), with few lines
  // crossing the gaps (a page of ordinary wide lines with a table in it has no gutter)
  const filled = (side: Item[]) => {
    const x0 = Math.min(...side.map((t) => t.x0));
    const x1 = Math.max(...side.map((t) => t.x1));
    const lines = new Map<number, { a: number; b: number }>();
    for (const t of side) {
      const k = Math.round(t.base / (body * 0.5));
      const l = lines.get(k) ?? lines.get(k - 1) ?? lines.get(k + 1);
      if (l) (l.a = Math.min(l.a, t.x0)), (l.b = Math.max(l.b, t.x1));
      else lines.set(k, { a: t.x0, b: t.x1 });
    }
    const widths = [...lines.values()].map((l) => (l.b - l.a) / Math.max(1, x1 - x0)).sort((a, b) => a - b);
    return widths[Math.floor(widths.length / 2)] ?? 0;
  };
  const valid = (gs: number[]) => {
    const edges = [-Infinity, ...gs, Infinity];
    const cols = edges.slice(1).map((e, k) => narrow.filter((it) => it.x0 > edges[k] && it.x1 < e));
    const need = gs.length > 1 ? 10 : 15;
    if (cols.some((c) => c.length < need)) return false;
    const spans = cols.map((c) => [Math.min(...c.map((l) => l.top)), Math.max(...c.map((l) => l.bot))]);
    for (let k = 1; k < spans.length; k++) {
      const [at, ab] = spans[k - 1];
      const [bt, bb] = spans[k];
      if (Math.min(ab, bb) - Math.max(at, bt) < Math.min(ab - at, bb - bt) * 0.35) return false;
    }
    const total = cols.reduce((a, c) => a + c.length, 0);
    for (const g of gs) if (items.filter((it) => it.x0 < g - body * 0.3 && it.x1 > g + body * 0.3).length > total * 0.25) return false;
    return cols.every((c) => filled(c) >= 0.6);
  };
  // three columns (a newspaper, a government gazette), then two
  const g1 = gapIn(0.22, 0.45);
  const g2 = gapIn(0.55, 0.78);
  if (g1 !== null && g2 !== null && valid([g1, g2])) return [g1, g2];
  const g = gapIn(0.3, 0.7);
  return g !== null && valid([g]) ? [g] : [];
}
function rowText(r: Row): string {
  let s = '';
  let lastX1 = -Infinity;
  for (const it of r.items) {
    if (s && it.x0 - lastX1 > it.fh * 0.12 && !s.endsWith(' ') && !it.str.startsWith(' ')) s += ' ';
    s += it.str;
    lastX1 = it.x1;
  }
  return negations(s.replace(/\s+/g, ' '));
}

/** TeX draws "≠", "∉" … as a slash (the symbol font's "6") laid over "=", "∈" …: put back as the one sign */
const NEG: Record<string, string> = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊆': '⊈', '⊃': '⊅', '⊇': '⊉', '≡': '≢', '∼': '≁', '≤': '≰', '≥': '≱', '<': '≮', '>': '≯', '|': '∤', '∃': '∄', '≈': '≉', '≅': '≇', '∥': '∦' };
const negations = (s: string) => (s.includes('\uE006') ? s.replace(/\uE006\s*(&lt;|&gt;|.)?/g, (_, c?: string) => (c ? NEG[c === '&lt;' ? '<' : c === '&gt;' ? '>' : c] ?? '/' + c : '/')) : s);

function rowHtml(r: Row, body: number, tokens?: Map<Item, string>, skip?: Set<Item>): string {
  let s = '';
  let lastX1 = -Infinity;
  let open: string | null = null; // current wrapper tag
  const close = () => {
    if (open) s += `</${open}>`;
    open = null;
  };
  for (const it of r.items) {
    if (skip?.has(it)) continue;
    const tok = tokens?.get(it);
    if (tok) {
      close();
      if (s && !s.endsWith(' ') && it.x0 - lastX1 > it.fh * 0.12) s += ' ';
      s += tok;
      lastX1 = Math.max(lastX1, it.x1, ...r.items.filter((o) => skip?.has(o) && Math.abs(o.x0 - it.x0) < it.fh * 3).map((o) => o.x1));
      continue;
    }
    let tag: string | null = null;
    const small = it.fh < r.fh * 0.86;
    if (small && it.base < r.base - r.fh * 0.12) tag = 'sup';
    else if (small && it.base > r.base + r.fh * 0.08) tag = 'sub';
    else if (it.bold && !it.math) tag = 'b';
    else if ((it.italic || (it.math && /^[A-Za-z]+$/.test(it.str.trim()))) && /[A-Za-z]/.test(it.str)) tag = 'i';
    const needSpace = s && it.x0 - lastX1 > it.fh * 0.12 && !it.str.startsWith(' ');
    if (tag !== open) {
      close();
      if (needSpace && !s.endsWith(' ')) s += ' ';
      if (tag) {
        s += `<${tag}>`;
        open = tag;
      }
    } else if (needSpace && !s.endsWith(' ')) s += ' ';
    s += escapeHtml(it.str);
    lastX1 = it.x1;
  }
  close();
  void body;
  return negations(s.replace(/\s+/g, ' '));
}

async function imgBlock(
  canvas: HTMLCanvasElement,
  box: Box,
  kind: 'math' | 'figure' | 'table',
  page: number,
  body: number,
  alt?: string,
  foreign: Box[] = [],
): Promise<LBlock> {
  const x = Math.max(0, Math.floor(box.x0));
  const y = Math.max(0, Math.floor(box.top));
  const w = Math.min(canvas.width - x, Math.ceil(box.x1 - box.x0));
  const h = Math.min(canvas.height - y, Math.ceil(box.bot - box.top));
  // Erase text that belongs to the surrounding prose but intrudes into the crop.
  const intruders = foreign.filter((f) => intersects(f, box) && !centerIn(f, { x0: box.x0, x1: box.x1, top: box.top + 2, bot: box.bot - 2 }) || (intersects(f, box) && kind === 'math'));
  if (intruders.length) {
    const cx = canvas.getContext('2d')!;
    cx.save();
    cx.fillStyle = '#fff';
    for (const f of intruders) cx.fillRect(f.x0 - 1, f.top - 1, f.x1 - f.x0 + 2, f.bot - f.top + 2);
    cx.restore();
  }
  const sub = canvas.getContext('2d')!.getImageData(x, y, Math.max(1, w), Math.max(1, h));
  // Decide whether we can turn it into a theme-coloured mask (mostly white background, no colour)
  let white = 0;
  let colour = 0;
  const d = sub.data;
  const n = d.length / 4;
  for (let p = 0; p < d.length; p += 16) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    if (r > 235 && g > 235 && b > 235) white++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colour++;
  }
  const samples = n / 4;
  const mask = kind === 'math' || (white / samples > 0.6 && colour / samples < 0.01);
  const blob = await cropBlob(canvas, x, y, w, h, mask);
  return { t: 'img', blob, w, h, em: w / body, mask, kind, page, alt };
}

async function cropBlob(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, mask: boolean): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const cx = c.getContext('2d')!;
  cx.drawImage(src, x, y, w, h, 0, 0, w, h);
  if (mask) {
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let p = 0; p < d.length; p += 4) {
      const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      const a = Math.max(0, Math.min(255, ((245 - lum) * 255) / 205));
      d[p] = d[p + 1] = d[p + 2] = 0;
      d[p + 3] = a;
    }
    cx.putImageData(id, 0, 0);
  }
  return new Promise((r) => c.toBlob((b) => r(b!), mask ? 'image/png' : 'image/jpeg', 0.88));
}

// ---------- HTML rendering of blocks ----------

export function blocksToHtml(blocks: LBlock[], urls: string[]): string {
  let html = '';
  let hi = 0;
  const inl = new Map<string, string>();
  for (const b of blocks) {
    if (b.t !== 'inl') continue;
    const url = URL.createObjectURL(b.blob);
    urls.push(url);
    inl.set(b.id, `<span class="im" role="img" style="width:${b.em.toFixed(2)}em;height:${b.hem.toFixed(2)}em;vertical-align:-${b.dem.toFixed(2)}em;--m:url(${url})"></span>`);
  }
  const fill = (h: string) => h.replace(/\u0001([\w]+)\u0001/g, (_, id) => inl.get(id) ?? '');
  for (const b0 of blocks) {
    // never mutate the blocks: they are cached and blob URLs are per-session
    const b = b0.t === 'p' || b0.t === 'li' || b0.t === 'h' ? { ...b0, html: fill(b0.html) } : b0;
    switch (b.t) {
      case 'page':
        html += `<span class="pg" id="page-${b.page}" data-page="${b.page}"></span>`;
        break;
      case 'h': {
        const cls = [b.sec ? 'sec' : '', b.toc ? 'toc-h' : ''].filter(Boolean).join(' ');
        html += `<h${b.level + 1} id="h-${hi++}" data-page="${b.page}"${cls ? ` class="${cls}"` : ''}>${b.html}</h${b.level + 1}>`;
        break;
      }
      case 'p':
        if (b.toc) html += `<p class="toc" data-page="${b.page}"${b.lvl ? ` style="--l:${b.lvl}"` : ''}>${b.html}</p>`;
        else if (b.code) html += `<p class="code" data-page="${b.page}">${b.html}</p>`;
        else if (b.cap) html += `<p class="cap" data-page="${b.page}">${b.html}</p>`;
        else html += `<p data-page="${b.page}"${b.cont ? ' class="cont"' : b.sec ? ' class="sec"' : ''}>${b.html}</p>`;
        break;
      case 'li':
        html += `<p class="li" data-page="${b.page}">${b.html}</p>`;
        break;
      case 'img': {
        const url = URL.createObjectURL(b.blob);
        urls.push(url);
        const ratio = `${b.w} / ${b.h}`;
        if (b.mask) {
          html += `<figure class="lq lq-${b.kind}${b.num ? ' numbered' : ''}" data-page="${b.page}" data-src="${url}" data-w="${b.w}" data-h="${b.h}"><span class="mask" role="img" aria-label="${escapeHtml(b.alt ?? b.kind)}" style="width:${b.em.toFixed(2)}em;aspect-ratio:${ratio};--m:url(${url})"></span>${b.num ? `<span class="eqno">${escapeHtml(b.num)}</span>` : ''}</figure>`;
        } else {
          html += `<figure class="lq lq-${b.kind}${b.ref ? ' lq-ref' : ''}${b.unread ? ' lq-unread' : ''}" data-page="${b.page}" data-src="${url}" data-w="${b.w}" data-h="${b.h}"><img src="${url}" alt="${escapeHtml(b.alt ?? b.kind)}" style="aspect-ratio:${ratio}${b.em ? `;width:${b.em.toFixed(2)}em` : ''}" loading="lazy"/></figure>`;
        }
        break;
      }
    }
  }
  return html;
}
