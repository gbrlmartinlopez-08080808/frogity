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
  await expect(page.locator('.lk-save').first()).toBeVisible({ timeout: 10000 });
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
