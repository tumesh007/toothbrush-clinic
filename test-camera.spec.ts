import { expect, test } from '@playwright/test';

test('mapped GLB zone focus transitions, reduced motion, bounded gestures and reset work in the app', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => localStorage.setItem('clinic_settings', JSON.stringify({
    duration: 120, zoneMode: 12, chewing: true, voice: false, sound: false,
    countdownSound: false, haptics: false, cameraMode: 'auto', reducedAnimation: false,
  })));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Toothbrush Clinic' })).toBeVisible();

  await expect.poll(() => page.evaluate(() => Object.keys((window as any).mouthView.meshes).length)).toBe(72);
  const frames = await page.evaluate(() => {
    const view = (window as any).mouthView;
    const zones = [
      'upper_right_outer','upper_front_outer','upper_left_outer','lower_right_outer','lower_front_outer','lower_left_outer',
      'upper_right_inner','upper_front_inner','upper_left_inner','lower_right_inner','lower_front_inner','lower_left_inner',
      'q_upper_right_outer','q_upper_left_outer','q_lower_right_outer','q_lower_left_outer',
      'q_upper_right_inner','q_upper_left_inner','q_lower_right_inner','q_lower_left_inner',
      'upper_right_chewing','upper_left_chewing','lower_left_chewing','lower_right_chewing',
    ];
    view.setReducedMotion(true);
    return zones.map((zone: string) => {
      view.focusZone(zone);
      return { zone, target: view.target.toArray(), destination: view.basePosition.toArray(), transition: view.transitionStarted };
    });
  });
  expect(frames).toHaveLength(24);
  expect(frames.every(frame => frame.transition === 0 && frame.target.every(Number.isFinite) && frame.destination.every(Number.isFinite))).toBe(true);
  expect(new Set(frames.map(frame => frame.target.join(','))).size).toBeGreaterThan(12);
  await page.evaluate(() => (window as any).mouthView.setReducedMotion(false));
  await page.locator('#btn-start').click();
  await expect(page.getByText('GET READY')).toBeVisible();

  const canvas = page.locator('#mouth-view-container canvas');
  await expect(canvas).toBeVisible();
  const before = await page.evaluate(() => (window as any).mouthView.basePosition.toArray());
  await page.evaluate(() => (window as any).mouthView.focusZone('upper_right_outer'));
  const transitionStart = await page.evaluate(() => ({
    started: (window as any).mouthView.transitionStarted,
    from: (window as any).mouthView.transitionFrom.toArray(),
    destination: (window as any).mouthView.destination.toArray(),
    target: (window as any).mouthView.targetDestination.toArray(),
  }));
  expect(transitionStart.started).toBeGreaterThan(0);
  expect(transitionStart.from).toEqual(before);
  expect(transitionStart.destination).not.toEqual(before);

  await page.waitForTimeout(300);
  const midpoint = await page.evaluate(() => (window as any).mouthView.basePosition.toArray());
  expect(midpoint).not.toEqual(transitionStart.from);
  expect(midpoint).not.toEqual(transitionStart.destination);
  await page.waitForTimeout(450);
  const settled = await page.evaluate(() => ({
    position: (window as any).mouthView.basePosition.toArray(),
    target: (window as any).mouthView.target.toArray(),
    started: (window as any).mouthView.transitionStarted,
  }));
  expect(settled.position).toEqual(transitionStart.destination);
  expect(settled.target).toEqual(transitionStart.target);
  expect(settled.started).toBe(0);

  // Trigger the next brushing zone through the real protocol/timer path and make
  // sure camera animation runs concurrently without pausing its countdown.
  await expect(page.getByText('GET READY')).toBeVisible();
  await page.waitForTimeout(2_800);
  await expect(page.getByText('Upper right — outside')).toBeVisible();
  const timerBefore = Number(await page.locator('#remaining-seconds').innerText());
  await page.locator('#btn-reset-view').click();
  await page.waitForTimeout(700);
  const timerAfter = Number(await page.locator('#remaining-seconds').innerText());
  expect(timerAfter).toBeGreaterThanOrEqual(timerBefore - 1);
  expect(timerAfter).toBeLessThanOrEqual(timerBefore);
  await expect(page.getByText('Upper right — outside')).toBeVisible();

  // Switch to manual in Settings on the next session and exercise the actual
  // viewport pointer/wheel handlers, then use Reset View from the UI.
  await page.locator('#btn-pause').click();
  await page.locator('#btn-exit').click();
  await page.locator('#btn-settings').click();
  await page.locator('.ans[data-val="5"]').click();
  await page.locator('input[name="camera-mode"][value="manual"]').check();
  await page.locator('#chk-reduced-motion').check();
  await page.locator('#btn-save').click();
  await page.locator('#btn-start').click();
  await expect(page.getByText('GET READY')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).mouthView.meshes && Object.keys((window as any).mouthView.meshes).length)).toBe(72);

  const manualCanvas = page.locator('#mouth-view-container canvas');
  const box = await manualCanvas.boundingBox();
  if (!box) throw new Error('3D canvas has no visible bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2000, box.y + box.height / 2 + 2000, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2000, box.y + box.height / 2 + 2000, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.mouse.wheel(0, -10000);

  const manual = await page.evaluate(() => {
    const view = (window as any).mouthView;
    return { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, pan: view.pan.toArray() };
  });
  expect(Math.abs(manual.yaw)).toBeLessThanOrEqual(8 * Math.PI / 180);
  expect(Math.abs(manual.pitch)).toBeLessThanOrEqual(8 * Math.PI / 180);
  expect(manual.zoom).toBeGreaterThanOrEqual(0.9);
  expect(manual.zoom).toBeLessThanOrEqual(1.35);
  expect(Math.abs(manual.pan[0])).toBeLessThanOrEqual(1.8);
  expect(Math.abs(manual.pan[1])).toBeLessThanOrEqual(1.4);

  await page.locator('#btn-reset-view').click();
  const reset = await page.evaluate(() => {
    const view = (window as any).mouthView;
    return { position: view.basePosition.toArray(), target: view.target.toArray(), zoom: view.zoom, yaw: view.yaw, pitch: view.pitch, pan: view.pan.toArray() };
  });
  expect(reset.position).toEqual([0, 2, 22]);
  expect(reset.target).toEqual([0, 0, -1]);
  expect(reset.zoom).toBe(1);
  expect(reset.yaw).toBe(0);
  expect(reset.pitch).toBe(0);
  expect(reset.pan).toEqual([0, 0]);
});
