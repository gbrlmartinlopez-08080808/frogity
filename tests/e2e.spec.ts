// @ts-nocheck
// End to end, as a reader would: onboarding and the tour, every kind of file opening, and the word flow (select → define →
// highlight → remove). Any uncaught error on the way fails the test.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const FX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });

const watch = (page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};
const noCrash = async (page) => expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
const openByName = async (page, name: string) => {
  for (let k = 0; k < 3 && !(await page.locator('.reader').count()); k++) {
    await page.evaluate((n) => {
      const row = [...document.querySelectorAll('.shelf-row')].find((r) => r.innerText.split('\n').some((l) => l.trim() === n));
      (row ?? document.querySelector(`[aria-label="Open ${n}"]`))?.click();
    }, name);
    await page.waitForTimeout(800);
  }
  await expect(page.locator('.reader')).toBeVisible();
};

test('onboarding with the guide, then the tour to its end', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watch(page);
  await page.goto('/');
  for (let i = 0; i < 14; i++) {
    const name = page.getByRole('textbox', { name: 'Your name' });
    if (await name.isVisible().catch(() => false)) await name.fill('Ada');
    const guide = page.getByRole('button', { name: 'Open the short guide' });
    if (await guide.isVisible().catch(() => false)) {
      await guide.click();
      break;
    }
    await page.locator('.ob-cta').click();
    await page.waitForTimeout(450);
  }
  await expect(page.getByRole('heading', { name: 'Welcome to Frogity', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.tour-next').waitFor({ timeout: 15000 });
  let steps = 0;
  while (await page.locator('.tour-next').isVisible().catch(() => false)) {
    await page.locator('.tour-next').click();
    await page.waitForTimeout(450);
    expect(++steps).toBeLessThan(15);
  }
  expect(steps).toBeGreaterThan(3);
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await noCrash(page);
  expect(errors).toEqual([]);
});

test('explore on my own: an empty shelf, no guide and no sample', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 14; i++) {
    const own = page.getByRole('button', { name: 'explore on my own' });
    if (await own.isVisible().catch(() => false)) {
      await own.click();
      break;
    }
    await page.locator('.ob-cta').click();
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(800);
  expect(await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().docs.length)).toBe(0);
});

test('every kind of file opens in the reader without an error', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watch(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => (await import('/src/lib/db.ts')).put('kv', 'tour', 'done'));
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  const files = fs.readdirSync(FX).map((f) => path.join(FX, f));
  await page.locator('input[type=file][multiple]:not([capture])').setInputFiles(files);
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/store.ts')).getState().docs.length), { timeout: 60000 }).toBeGreaterThanOrEqual(files.length + 1);
  const names = await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().docs.map((d) => d.name));
  for (const n of names) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
    await openByName(page, n);
    await page.waitForTimeout(1200);
    await noCrash(page);
  }
  expect(errors).toEqual([]);
});

test('select a word: define it, highlight it, tap the highlight and remove it', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watch(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => (await import('/src/lib/db.ts')).put('kv', 'tour', 'done'));
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await page.locator('input[type=file][multiple]:not([capture])').setInputFiles([path.join(FX, 'notes.md')]);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 20000 });
  const para = page.locator('.flow p').first();
  await para.dblclick();
  await page.getByRole('button', { name: 'Define' }).click();
  await expect(page.locator('.lk-save').first()).toBeVisible({ timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await para.dblclick();
  await page.locator('.sm-hl').first().click();
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 2000 }).catch(() => {});
  const mark = page.locator('.flow mark, .flow .hl').first();
  await expect(mark).toBeVisible();
  await mark.click();
  await page.getByRole('button', { name: /Remove/ }).click();
  await expect(page.locator('.flow mark, .flow .hl')).toHaveCount(0);
  await noCrash(page);
  expect(errors).toEqual([]);
});

test('a passage is only ever highlighted once: again is refused, overlapping joins, inside removes', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watch(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => {
    const db = await import('/src/lib/db.ts');
    await db.put('kv', 'tour', 'done');
    await db.put('kv', 'saves:intro', true);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await page.locator('input[type=file][multiple]:not([capture])').setInputFiles([path.join(FX, 'story.txt')]);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.flow p')].some((p) => (p.textContent ?? '').length > 400));
  // select characters [a, b) of the first long paragraph
  const select = async (a: number, b: number) => {
    await page.evaluate(([a, b]) => {
      const p = [...document.querySelectorAll('.flow p')].find((x) => (x.textContent ?? '').length > 400)!;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) nodes.push(t as Text);
      const at = (off: number) => {
        for (const n of nodes) {
          if (off <= n.data.length) return [n, off] as const;
          off -= n.data.length;
        }
        return [nodes[nodes.length - 1], nodes[nodes.length - 1].data.length] as const;
      };
      const r = document.createRange();
      r.setStart(...at(a));
      r.setEnd(...at(b));
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
    }, [a, b]);
    await page.waitForTimeout(450);
  };
  const stored = () => page.evaluate(async () => (await (await import('/src/lib/db.ts')).entries('marks')).filter(([, v]) => v && 'text' in v).map(([, v]) => v.text));
  const marks = () => page.evaluate(() => new Set([...document.querySelectorAll('.flow mark.hl')].map((m) => m.dataset.id)).size);

  await select(10, 40);
  await page.locator('.sm-hl').click();
  await expect.poll(stored).toHaveLength(1);
  // the same words again: nothing new
  await select(10, 40);
  await expect(page.getByRole('button', { name: 'Remove highlight' })).toBeVisible();
  await select(12, 30); // inside it, but not the same: still "remove", never a second layer
  await expect(page.getByRole('button', { name: 'Remove highlight' })).toBeVisible();
  await page.evaluate(() => getSelection()?.removeAllRanges());
  // overlapping and running on: one highlight covering both
  await select(30, 80);
  await page.locator('.sm-hl').click();
  await expect.poll(stored).toHaveLength(1);
  expect(await marks()).toBe(1);
  const joined = (await stored())[0];
  expect(joined.length).toBeGreaterThanOrEqual(65);
  // select inside it and take it away: once, and it is gone
  await select(40, 50);
  await page.getByRole('button', { name: 'Remove highlight' }).click();
  await expect.poll(stored).toHaveLength(0);
  expect(await marks()).toBe(0);
  // Undo brings it back once
  await page.locator('.frogity-toast, [role=status]').filter({ hasText: 'Undo' }).first().click();
  await expect.poll(stored).toHaveLength(1);
  // tapping it offers Remove; removing leaves nothing behind
  await page.locator('.flow mark.hl').first().click();
  await page.getByRole('button', { name: /Remove/ }).first().click();
  await expect.poll(stored).toHaveLength(0);
  expect(await marks()).toBe(0);
  expect(errors).toEqual([]);
});

test('highlights saved twice by an earlier version become one when the book opens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => (await import('/src/lib/db.ts')).put('kv', 'tour', 'done'));
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await page.locator('input[type=file][multiple]:not([capture])').setInputFiles([path.join(FX, 'story.txt')]);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 20000 });
  const docId = await page.evaluate(async () => (await import('/src/lib/store.ts')).getState().docs.find((d) => d.name === 'story').id);
  await page.evaluate(async (docId) => {
    const db = await import('/src/lib/db.ts');
    for (const id of ['a', 'b', 'c']) await db.put('marks', `${docId}:h:${id}`, { id, docId, text: 'a frog read a book', prefix: 'Once upon a time ', at: Date.now(), progress: 0 });
  }, docId);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate((n) => [...document.querySelectorAll('.shelf-row')].find((r) => r.innerText.includes(n))?.click(), 'story');
  await expect(page.locator('.reader')).toBeVisible();
  await expect.poll(() => page.evaluate(async (docId) => (await (await import('/src/lib/db.ts')).entries('marks')).filter(([k]) => k.startsWith(docId + ':h:')).length, docId)).toBe(1);
  expect(await page.locator('.flow mark.hl').count()).toBeGreaterThan(0);
});

// ---- Liquid: real PDFs, checked for what a reader would notice ----
const PDFS = path.join(path.dirname(new URL(import.meta.url).pathname), 'pdfs');
const liquidOf = (page, file: string) =>
  page.evaluate(async (file) => {
    const { pdfToLiquid, blocksToHtml } = await import('/src/lib/formats/liquidPdf.ts');
    const blob = await (await fetch('/__pdfs/' + file)).blob();
    const { blocks } = await pdfToLiquid(blob, () => {});
    const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\u0001\w+\u0001/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      list: blocks.filter((b) => b.t !== 'inl' && b.t !== 'page').map((b) => (b.t === 'img' ? { t: 'img', kind: b.kind, page: b.page } : { t: b.t, page: b.page, cap: !!b.cap, toc: !!b.toc, cont: !!b.cont, text: plain(b.html) })),
      html: blocksToHtml(blocks, []),
    };
  }, file);

test('Liquid: a two-column research paper reads in order, with only its real titles', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/__pdfs/*', (r) => r.fulfill({ path: path.join(PDFS, r.request().url().split('/__pdfs/')[1]), contentType: 'application/pdf' }));
  await page.goto('/');
  const { list } = await liquidOf(page, 'tracemonkey.pdf');
  const heads = list.filter((b) => b.t === 'h').map((b) => b.text);
  for (const t of ['Abstract', '1. Introduction', '3.1 Traces', '4.1 Nesting Algorithm', '6.4 Preemption', '8. Related Work', 'References']) expect(heads).toContain(t);
  // no figure label, no bold opening of a sentence, no sentence fragment as a title
  for (const h of heads) {
    expect((h.match(/\p{L}/gu) ?? []).length, h).toBeGreaterThan(2);
    expect(h, h).not.toMatch(/\b(the|a|an|of|and|or|to|in|for|with)$/i);
  }
  // the columns of the first page are not woven together
  const abstract = list.find((b) => b.t === 'p' && b.text.startsWith('Dynamic languages such as JavaScript are more difficult'));
  expect(abstract?.text).not.toMatch(/Categories|application logic/);
  // the copyright box at the foot of the first column is not in the middle of the text
  const intro = list.find((b) => b.t === 'p' && b.text.startsWith('Dynamic languages such as JavaScript, Python'));
  expect(intro?.text).not.toMatch(/Permission to make/);
  // the benchmark table is one whole table, its column titles with it
  expect(list.filter((b) => b.t === 'img' && b.kind === 'table' && b.page === 12)).toHaveLength(1);
  expect(list.some((b) => b.t === 'p' && /^Loops Trees Traces/.test(b.text))).toBe(false);
  // captions are captions
  expect(list.find((b) => b.t === 'p' && b.text.startsWith('Figure 13.'))?.cap).toBe(true);
  // no sentence is cut in two: a paragraph starting in lower case goes on from the one before (or is marked as going on)
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    const a = list[i - 1];
    if (b.t === 'p' && !b.cap && !b.cont && /^[a-z]/.test(b.text) && a.t === 'p' && !a.cap && !/<small|^Copyright/.test(a.text)) expect(/[.!?:;)"”]$/.test(a.text), `${a.text.slice(-40)} ⟶ ${b.text.slice(0, 40)}`).toBe(true);
  }
});

test('Liquid: a list of contents stays a list, and its entries and the Contents sheet lead to the chapters themselves', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/__pdfs/*', (r) => r.fulfill({ path: path.join(PDFS, r.request().url().split('/__pdfs/')[1]), contentType: 'application/pdf' }));
  await page.goto('/');
  const { list } = await liquidOf(page, 'pdflatex-outline.pdf');
  const entries = list.filter((b) => b.toc);
  expect(entries.length).toBeGreaterThanOrEqual(9);
  expect(list.filter((b) => b.t === 'h' && /^Contents$/.test(b.text))).toHaveLength(1);
  // in the reader
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => {
    const db = await import('/src/lib/db.ts');
    await db.put('kv', 'tour', 'done');
    await db.put('kv', 'lq-intro', true);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await page.locator('input[type=file][multiple]:not([capture])').setInputFiles([path.join(PDFS, 'pdflatex-outline.pdf')]);
  await expect(page.locator('.reader')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 3000 }).catch(() => {});
  await expect.poll(() => page.evaluate(async () => {
    const st = (await import('/src/lib/store.ts')).getState();
    const d = st.docs.find((x) => x.kind === 'pdf');
    return d ? (await import('/src/lib/db.ts')).get('kv', 'liquid:' + d.id) : null;
  }), { timeout: 60000 }).toBe('ready');
  const clickText = (t: string) => page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, [role=button], .row')].reverse().find((e) => e.textContent?.trim().startsWith(t) && e.getBoundingClientRect().width);
    (el as HTMLElement | undefined)?.click();
    return !!el;
  }, t);
  const more = () => page.evaluate(() => (document.querySelector('.reader button[aria-label="More"]') as HTMLElement | null)?.click());
  await more();
  await page.waitForTimeout(500);
  expect(await clickText('Liquid view')).toBe(true);
  await page.locator('.flow p.toc').first().waitFor({ timeout: 20000 });
  const topTitle = () => page.evaluate(() => {
    const r = document.querySelector('.reader-scroll')!.getBoundingClientRect();
    const h = [...document.querySelectorAll('.flow h2, .flow h3, .flow h4')].find((e) => {
      const b = e.getBoundingClientRect();
      return b.top >= r.top - 4 && b.top < r.top + 140;
    });
    return h?.textContent ?? '';
  });
  // an entry of the book's own list of contents
  await page.locator('.flow p.toc', { hasText: 'Baz' }).nth(1).click();
  await page.waitForTimeout(700);
  expect(await topTitle()).toMatch(/Baz/);
  // the Contents sheet: to the chapter's title, not the top of its page
  await page.evaluate(() => document.querySelector('.reader-scroll')!.scrollTo(0, 0));
  await more();
  await page.waitForTimeout(500);
  await clickText('Contents');
  await page.waitForTimeout(700);
  await page.locator('.sheet .toc-item', { hasText: 'Bar' }).nth(1).click();
  await page.waitForTimeout(800);
  expect(await topTitle()).toMatch(/Bar/);
});
