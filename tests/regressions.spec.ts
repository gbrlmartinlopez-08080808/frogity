// @ts-nocheck
import { test, expect } from '@playwright/test';
const openLibrary = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await expect(
    page.getByText('Welcome to Frogity', { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
};
test('unsafe document links are inert', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.evaluate(async () => {
      const m = await import('/src/lib/sanitize.ts');
      return m.sanitizeHtml(
        '<a href="jav&#x09;ascript:alert(1)">bad</a><img src=x onerror=alert(1)>',
      );
    }),
  ).not.toMatch(/javascript|jav\t|onerror/i);
});
test('concurrent document patches preserve both fields', async ({ page }) => {
  await openLibrary(page);
  expect(
    await page.evaluate(async () => {
      const s = await import('/src/lib/store.ts');
      const id = s.getState().docs[0].id;
      await Promise.all([
        s.patchDoc(id, { name: 'Concurrent title' }),
        s.patchDoc(id, { progress: 0.42 }),
      ]);
      const db = await import('/src/lib/db.ts');
      const d = await db.get('docs', id);
      return { name: d.name, progress: d.progress };
    }),
  ).toEqual({ name: 'Concurrent title', progress: 0.42 });
});
test('settings persist without debounce loss', async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(async () => {
    const s = await import('/src/lib/store.ts');
    await s.updateSettings({ dailyGoal: 37 });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  expect(
    await page.evaluate(
      async () =>
        (await import('/src/lib/store.ts')).getState().settings.dailyGoal,
    ),
  ).toBe(37);
});
test('storage denial shows recovery and retry', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Couldn’t open your library',
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
test('note Back saves the latest edit', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /New note/ }).click();
  await page.locator('[contenteditable]').fill('A draft that survives Back');
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(async () => {
      const s = await import('/src/lib/store.ts'),
        l = await import('/src/lib/library.ts');
      const d = s.getState().docs.find((d) => d.kind === 'fr');
      return await (await l.getFile(d.id)).text();
    }),
  ).toContain('A draft that survives Back');
});
test('delete cleans private conversation and undo restores', async ({
  page,
}) => {
  await openLibrary(page);
  expect(
    await page.evaluate(async () => {
      const s = await import('/src/lib/store.ts'),
        db = await import('/src/lib/db.ts');
      const id = s.getState().docs[0].id;
      await db.put('kv', 'froggy:' + id, { msgs: ['private'] });
      await s.removeDoc(id);
      const gone = await db.get('kv', 'froggy:' + id);
      await s.undoRemoval();
      return {
        gone: gone === undefined,
        restored: !!(await db.get('docs', id)),
      };
    }),
  ).toEqual({ gone: true, restored: true });
});
test('encrypted backup round trip and wrong password', async ({ page }) => {
  await openLibrary(page);
  expect(
    await page.evaluate(async () => {
      const b = await import('/src/lib/backup.ts');
      const zip = await b.exportBackup('review-password');
      let rejected = false;
      try {
        await b.readBackup(zip, 'wrong');
      } catch {
        rejected = true;
      }
      const backup = await b.readBackup(zip, 'review-password');
      await backup.restore();
      return { count: backup.count, rejected };
    }),
  ).toEqual({ count: 1, rejected: true });
});
test('streak handles consecutive frozen days', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.evaluate(async () => {
      const s = await import('/src/lib/store.ts');
      const k = [0, 1, 2, 3].map((n) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return s.dayKey(d);
      });
      const r = s.streakInfo({ [k[0]]: 60000, [k[3]]: 60000 }, [k[1], k[2]]);
      return { current: r.current, longest: r.longest };
    }),
  ).toEqual({ current: 2, longest: 2 });
});
test('Add traps focus and returns it', async ({ page }) => {
  await openLibrary(page);
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await add.click();
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
    )
    .toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
});
test('French deletion messages do not break React', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openLibrary(page);
  await page.evaluate(async () => {
    (await import('/src/lib/i18n.ts')).setPref('fr');
    const s = await import('/src/lib/store.ts');
    await s.removeDoc(s.getState().docs[0].id);
    (await import('/src/ui/kit.tsx')).toast('Deleted');
  });
  await expect(page.getByRole('status')).toBeVisible();
  await page.waitForTimeout(2600);
  expect(errors).toEqual([]);
});
test('Sling practice supports keyboard and pause', async ({ page }) => {
  await page.goto('/tests/games.html');
  await page.getByText('Sling', { exact: true }).first().click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Let’s climb' }).click();
  const canvas = page.locator('canvas').last();
  await canvas.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume climb' }).click();
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toHaveCount(
    0,
  );
});
test('game difficulty stays bounded and physics stays finite', async ({
  page,
}) => {
  await page.goto('/tests/games.html');
  expect(
    await page.evaluate(async () => {
      const { slingLevel, rng } = await import('/src/lib/games.ts');
      const { initSling, stepSling } = await import('/src/screens/Climb.tsx');
      const cfg = slingLevel(1000),
        s = initSling(cfg, 1000);
      for (let i = 0; i < 1500; i++) stepSling(s, cfg, 1 / 60, 390);
      const a = rng(42),
        b = rng(42);
      return {
        finite: Number.isFinite(s.frog.x) && Number.isFinite(s.frog.y),
        bounded: cfg.goal <= 8500,
        seeded: a() === b(),
      };
    }),
  ).toEqual({ finite: true, bounded: true, seeded: true });
});
test('Deep cuts can pause without losing the prompt', async ({ page }) => {
  await page.goto('/tests/games.html');
  await page.getByText('Deep cuts', { exact: true }).first().click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Let’s climb' }).click();
  const prompt = page.locator('.deep2 h2');
  await expect(prompt).toBeVisible();
  const question = await prompt.innerText();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume climb' }).click();
  await expect(prompt).toHaveText(question);
});
test('Pond pairs practice completes without granting a reward', async ({
  page,
}) => {
  await page.goto('/tests/games.html');
  await page.getByRole('button', { name: /Pond pairs ·/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Let’s climb' }).click();
  await page.getByRole('button', { name: /Peek at the pond/ }).click();
  const cards = page.locator('.pair-card');
  const values = await cards.allTextContents();
  await expect(cards.first()).toHaveText('?');
  const pairs = new Map<string, number[]>();
  values.forEach((v, i) => pairs.set(v, [...(pairs.get(v) ?? []), i]));
  for (const [word, indices] of pairs) {
    await cards.nth(indices[0]).click();
    await cards.nth(indices[1]).click();
    await expect(cards.nth(indices[0])).toHaveText(word);
    if (word !== [...pairs.keys()].at(-1))
      await expect
        .poll(() => page.locator('.pair-card:disabled').count())
        .not.toBe(12);
  }
  await expect(page.getByRole('heading', { name: 'At the top' })).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await import('/src/lib/store.ts')).freezeStatus().blocks,
    ),
  ).toBe(0);
});
test('spreadsheet worker parses CSV and rejects oversized input', async ({
  page,
}) => {
  await page.goto('/');
  expect(
    await page.evaluate(async () => {
      const { readSheets } = await import('/src/lib/formats/flow.ts');
      const rows = await readSheets(
        new TextEncoder().encode('name,value\nalpha,12').buffer,
        'test.csv',
      );
      let limited = false;
      try {
        await readSheets(new ArrayBuffer(25000001), 'large.csv');
      } catch {
        limited = true;
      }
      return { rows: rows[0].rows, limited };
    }),
  ).toEqual({
    rows: [
      ['name', 'value'],
      ['alpha', '12'],
    ],
    limited: true,
  });
});
test('transaction abort rolls back all records', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.evaluate(async () => {
      const db = await import('/src/lib/db.ts');
      let failed = false;
      try {
        await db.batch(['kv'], (tx) => {
          tx.objectStore('kv').put('must not persist', 'review:abort');
          throw new Error('abort');
        });
      } catch {
        failed = true;
      }
      return failed && (await db.get('kv', 'review:abort')) === undefined;
    }),
  ).toBe(true);
});
test('duplicate imports reuse the existing file', async ({ page }) => {
  await openLibrary(page);
  expect(
    await page.evaluate(async () => {
      const l = await import('/src/lib/library.ts');
      const file = new Blob(['duplicate fixture'], { type: 'text/plain' });
      const a = await l.importFile(file, 'duplicate.txt'),
        b = await l.importFile(file, 'duplicate.txt');
      return a.id === b.id;
    }),
  ).toBe(true);
});
test('production web library and reader reopen offline', async ({
  page,
  context,
}) => {
  await page.goto('http://localhost:4174/');
  await page.getByRole('button', { name: 'skip intro', exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Open Now', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to Frogity', exact: true }),
  ).toBeVisible();
});
