import { expect, test } from '@playwright/test';
import { tapControl } from './test-helpers';

test('settings, duration presets, persistence, pause, resume and cancellation', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Toothbrush Clinic' })).toBeVisible();
  await page.locator('#btn-settings').click();
  await page.locator('.ans[data-val="5"]').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const durationOptions = page.locator('input[name="duration"]');
  await expect(durationOptions).toHaveCount(5);
  for (const value of ['120', '180', '240', '300', '360']) {
    await expect(page.locator(`input[name="duration"][value="${value}"]`)).toBeAttached();
  }

  await expect(page.locator('#chk-chewing')).toBeChecked();
  await page.locator('input[name="duration"][value="120"]').check();
  await page.locator('input[name="zones"][value="8"]').check();
  await page.locator('input[name="camera-mode"][value="manual"]').check();
  await page.locator('#chk-reduced-motion').check();
  await page.locator('#btn-save').click();
  await expect(page.locator('#ui-layer')).toContainText('2 min · 12 sections · chewing surfaces');

  await page.reload();
  await expect(page.locator('#ui-layer')).toContainText('2 min · 12 sections · chewing surfaces');
  await page.locator('#btn-start').click();
  await expect(page.locator('#btn-pause')).toBeVisible();

  await page.locator('#btn-pause').click();
  await expect(page.getByRole('heading', { name: 'BRUSHING PAUSED' })).toBeVisible();
  await tapControl(page, page.locator('#btn-resume'));
  await expect(page.locator('#btn-pause')).toBeVisible();
  await tapControl(page, page.locator('#btn-pause'));
  await tapControl(page, page.locator('#btn-exit'));
  await expect(page.getByRole('heading', { name: 'Toothbrush Clinic' })).toBeVisible();
});
