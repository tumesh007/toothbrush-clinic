import { test, expect } from '@playwright/test';
import * as path from 'path';

test('capture screenshots of P0 spike', async ({ page }) => {
  // Use file:// protocol to load the built dist/index.html
  const url = `http://localhost:5173`;
  await page.goto(url);

  // Take a screenshot of the initial state
  await page.screenshot({ path: 'screenshots/00-initial.png' });

  // Test the zones
  const zones = [
    'upper_front_outer',
    'upper_right_outer',
    'upper_left_outer',
    'lower_front_outer',
    'lower_right_outer',
    'lower_left_outer',
    'upper_front_inner',
    'upper_right_inner',
    'upper_left_inner',
    'lower_front_inner',
    'lower_right_inner',
    'lower_left_inner',
  ];

  for (const zone of zones) {
    await page.evaluate((z) => {
      (window as any).highlightZone(z);
    }, zone);
    await page.waitForTimeout(100); // Give it a moment to render
    await page.screenshot({ path: `screenshots/${zone}.png` });
  }

  // Check how many teeth there are (should be 28)
  const teethCount = await page.evaluate(() => {
    return Object.keys((window as any).ZONES).length; // Just checking if it runs
  });
  console.log(`Zones counted: ${teethCount}`);
});
