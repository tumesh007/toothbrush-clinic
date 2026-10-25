import { expect, test } from '@playwright/test';
import { tapControl } from './test-helpers';

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 600, height: 800 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document, 'document should not overflow horizontally').toBeLessThanOrEqual(sizes.viewport);
}

test('all screens keep bottom controls reachable across mobile, tablet, and desktop sizes', async ({ page }) => {
  test.setTimeout(180_000);
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);

    await page.locator('#btn-settings').click();
    await expect(page.getByRole('heading', { name: 'Parent Gate' })).toBeVisible();
    if (viewport === viewports[0]) {
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
      await tapControl(page, page.locator('#btn-cancel'));
      await page.locator('#btn-settings').click();
    }
    await page.locator('.ans[data-val="5"]').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    if (viewport.height <= 800) {
      await expect.poll(() => page.evaluate(() =>
        document.scrollingElement!.scrollHeight > document.scrollingElement!.clientHeight
      ), { message: `settings should use the document scroller at ${viewport.width}x${viewport.height}` }).toBe(true);
    }

    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    await tapControl(page, page.locator('#btn-save'));
    await expect(page.locator('#btn-settings')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-pause')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    await page.locator('#btn-pause').click();

    await expect(page.getByRole('heading', { name: 'BRUSHING PAUSED' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    await tapControl(page, page.locator('#btn-exit'));
    await expect(page.getByRole('heading', { name: 'Toothbrush Clinic' })).toBeVisible();
  }
});

test('mouth gestures stay on the canvas and viewport changes preserve the responsive layout', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await tapControl(page, page.locator('#btn-start'));
  await expect(page.locator('#btn-pause')).toBeVisible();

  const canvas = page.locator('#mouth-view-container canvas');
  await expect(canvas).toHaveCSS('touch-action', 'pan-y');

  await page.evaluate(() => {
    (window as Window & { bubbledPointerDown?: boolean }).bubbledPointerDown = false;
    document.addEventListener('pointerdown', () => {
      (window as Window & { bubbledPointerDown?: boolean }).bubbledPointerDown = true;
    });
  });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  expect(await page.evaluate(() =>
    (window as Window & { bubbledPointerDown?: boolean }).bubbledPointerDown
  )).toBe(false);

  await page.setViewportSize({ width: 844, height: 390 });
  await expectNoHorizontalOverflow(page);
  await page.locator('#btn-pause').click();
  await expect(page.getByRole('heading', { name: 'BRUSHING PAUSED' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
  await tapControl(page, page.locator('#btn-exit'));

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await tapControl(page, page.locator('#btn-settings'));
  await expect(page.getByRole('heading', { name: 'Parent Gate' })).toBeVisible();
});

test('completion screen keeps its final action tappable on a short phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const now = performance.now.bind(performance);
    const start = now();
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => start + (now() - start) * 1000,
    });
    localStorage.setItem('clinic_settings', JSON.stringify({
      duration: 120,
      zoneMode: 8,
      chewing: false,
      voice: false,
      sound: false,
      haptics: false,
    }));
  });
  await page.goto('/');
  await tapControl(page, page.locator('#btn-start'));
  await expect(page.getByRole('heading', { name: 'BRUSHING COMPLETE!' })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
  await tapControl(page, page.locator('#btn-done'));
  await expect(page.getByRole('heading', { name: 'Toothbrush Clinic' })).toBeVisible();
});
