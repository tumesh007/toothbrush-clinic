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
    // 12-zone
    'upper_front_outer', 'upper_right_outer', 'upper_left_outer',
    'lower_front_outer', 'lower_right_outer', 'lower_left_outer',
    'upper_front_inner', 'upper_right_inner', 'upper_left_inner',
    'lower_front_inner', 'lower_right_inner', 'lower_left_inner',
    // 8-zone
    'q_upper_right_outer', 'q_upper_left_outer', 'q_lower_right_outer', 'q_lower_left_outer',
    'q_upper_right_inner', 'q_upper_left_inner', 'q_lower_right_inner', 'q_lower_left_inner',
    // chewing
    'upper_right_chewing', 'upper_left_chewing', 'lower_left_chewing', 'lower_right_chewing'
  ];

  for (const zone of zones) {
    await page.evaluate((z) => {
      (window as any).mouthView.highlightZone(z);
      (window as any).mouthView.focusZone(z);
    }, zone);
    await page.waitForTimeout(500); // Wait for camera lerping
    await page.screenshot({ path: `screenshots/${zone}.png` });
  }

  // Check how many teeth there are (should be 28)
  const teethCount = await page.evaluate(() => {
    return Object.keys((window as any).ZONES).length; // Just checking if it runs
  });
  console.log(`Zones counted: ${teethCount}`);
});
