import { test, expect } from '@playwright/test';

test('App lifecycle, settings, persistence', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // Home screen
  await expect(page.getByText('Toothbrush Clinic')).toBeVisible();
  
  // Go to Settings via Parent Gate
  await page.click('#btn-settings');
  await expect(page.getByText('Parent Gate')).toBeVisible();
  await page.click('button:has-text("5")'); // Answer correctly
  
  // Settings screen
  await expect(page.getByText('Settings')).toBeVisible();
  
  // Toggle some settings
  const chkChewing = page.locator('#chk-chewing');
  await chkChewing.check();
  
  await page.selectOption('#sel-duration', '120'); // 2 Minutes
  
  await page.click('#btn-save');
  
  // Back to home, verify text changed
  await expect(page.getByText('2 Minutes, 12 Sections + Chewing')).toBeVisible();
  
  // Reload page to test persistence
  await page.reload();
  await expect(page.getByText('2 Minutes, 12 Sections + Chewing')).toBeVisible();
  
  // Start brushing
  await page.click('#btn-start');
  
  // Verify GET READY
  await expect(page.getByText('GET READY')).toBeVisible();
  
  // Trigger visibilitychange to test auto-pause
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  
  // Should be paused
  await expect(page.getByText('BRUSHING PAUSED')).toBeVisible();
  
  // Resume
  await page.click('#btn-resume');
  await expect(page.getByText('GET READY')).toBeVisible();
  
  // Exit
  page.on('dialog', dialog => dialog.accept()); // Accept confirm
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.click('#btn-exit');
  
  await expect(page.getByText('Toothbrush Clinic')).toBeVisible();
});
