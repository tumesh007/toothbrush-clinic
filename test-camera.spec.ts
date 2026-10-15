import { expect, test } from '@playwright/test';
import { tapControl } from './test-helpers';

test('mapped GLB zone focus transitions, reduced motion, bounded gestures and reset work in the app', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => localStorage.setItem('clinic_settings', JSON.stringify({
    duration: 360, zoneMode: 12, chewing: true, voice: false, sound: false,
    countdownSound: false, haptics: false, cameraMode: 'auto', reducedAnimation: false,
  })));
  await page.setViewportSize({ width: 480, height: 800 });
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
  await page.evaluate(() => {
    document.getElementById('mouth-view-container')!.style.visibility = 'visible';
    document.getElementById('ui-layer')!.style.visibility = 'hidden';
  });
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
  expect(Math.hypot(...transitionStart.from.map((value: number, index: number) => value - before[index]))).toBeLessThan(0.01);
  expect(transitionStart.destination).not.toEqual(before);

  await page.waitForTimeout(700);
  const settled = await page.evaluate(() => ({
    position: (window as any).mouthView.basePosition.toArray(),
    target: (window as any).mouthView.target.toArray(),
    started: (window as any).mouthView.transitionStarted,
  }));
  expect(settled.position).toEqual(transitionStart.destination);
  expect(settled.target).toEqual(transitionStart.target);
  expect(settled.started).toBe(0);

  await page.evaluate(() => (document.getElementById('ui-layer')!.style.visibility = ''));
  await page.locator('#btn-start').click();
  await expect(page.locator('#btn-pause')).toBeVisible();
  // Trigger the next brushing zone through the real protocol/timer path and make
  // sure camera animation runs concurrently without pausing its countdown.
  await expect(page.locator('#btn-pause')).toBeVisible();
  await page.waitForTimeout(2_800);
  await expect(page.getByText('Upper right — outside')).toBeVisible();
  const firstRoutineTarget = frames[0].target;
  await expect.poll(() => page.evaluate((expected: number[]) => {
    const target = (window as any).mouthView.target.toArray();
    return Math.hypot(...target.map((value: number, index: number) => value - expected[index]));
  }, firstRoutineTarget)).toBeLessThan(0.01);
  const timerBefore = Number(await page.locator('#remaining-seconds').innerText());
  const clockBefore = await page.evaluate(() => performance.now());
  await tapControl(page, page.locator('#btn-reset-view'));
  await page.waitForTimeout(700);
  const timerAfter = Number(await page.locator('#remaining-seconds').innerText());
  const elapsedMs = await page.evaluate((start: number) => performance.now() - start, clockBefore);
  const displayedElapsed = timerBefore - timerAfter;
  expect(displayedElapsed).toBeGreaterThanOrEqual(Math.max(0, Math.floor(elapsedMs / 1000) - 1));
  expect(displayedElapsed).toBeLessThanOrEqual(Math.ceil(elapsedMs / 1000) + 1);
  await expect(page.getByText('Upper right — outside')).toBeVisible();

  // Switch to manual in Settings on the next session and exercise the actual
  // viewport pointer/wheel handlers, then use Reset View from the UI.
  await tapControl(page, page.locator('#btn-pause'));
  await tapControl(page, page.locator('#btn-exit'));
  await page.locator('#btn-settings').click();
  await page.locator('.ans[data-val="5"]').click();
  await page.locator('input[name="camera-mode"][value="manual"]').check();
  await page.locator('#chk-reduced-motion').check();
  await page.locator('#btn-save').click();
  await page.locator('#btn-start').click();
  await expect(page.locator('#btn-pause')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).mouthView.meshes && Object.keys((window as any).mouthView.meshes).length)).toBe(72);

  const manualCanvas = page.locator('#mouth-view-container canvas');
  const box = await page.evaluate(() => {
    const rect = document.querySelector<HTMLCanvasElement>('#mouth-view-container canvas')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.evaluate(({ x, y, width, height }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#mouth-view-container canvas')!;
    // Dispatch pointer events to the actual canvas listeners without requiring
    // browser input acknowledgements while the software WebGL renderer is busy.
    canvas.setPointerCapture = () => {};
    const send = (type: string, pointerId: number, clientX: number, clientY: number, shiftKey = false) =>
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, clientX, clientY, shiftKey }));
    const startX = x + 30, startY = y + height * 0.65;
    const endX = x + Math.min(450, width - 20), endY = y + height * 0.75;
    send('pointerdown', 1, startX, startY);
    send('pointermove', 1, endX, endY);
    send('pointerup', 1, endX, endY);
    send('pointerdown', 2, startX, startY);
    send('pointermove', 2, endX, endY, true);
    send('pointerup', 2, endX, endY, true);
    send('pointerdown', 3, x + 120, y + 500);
    send('pointerdown', 4, x + 160, y + 500);
    send('pointermove', 4, x + 300, y + 500);
    send('pointerup', 4, x + 300, y + 500);
    send('pointerup', 3, x + 120, y + 500);
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10000 }));
  }, box);

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

  await tapControl(page, page.locator('#btn-reset-view'));
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
