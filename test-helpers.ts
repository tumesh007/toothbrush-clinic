import { expect, type Locator, type Page } from '@playwright/test';

/** Hit-test the visible control, then send a pointer click without layout-stability flakiness from WebGL. */
export async function tapControl(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const point = await control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      receivesPointer: hit === element || element.contains(hit),
      hitTarget: hit instanceof HTMLElement ? `${hit.tagName.toLowerCase()}#${hit.id}.${hit.className}` : String(hit),
      hitStack: document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        .slice(0, 5)
        .map(node => node instanceof HTMLElement ? `${node.tagName.toLowerCase()}#${node.id}.${node.className}` : String(node)),
      pointerStyles: [element, element.parentElement, element.parentElement?.parentElement]
        .map(node => node instanceof HTMLElement ? `${node.tagName}#${node.id}:${getComputedStyle(node).pointerEvents}` : 'missing'),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });
  expect(point.receivesPointer, `control center must be the top hit target; hit ${point.hitTarget} (${point.hitStack.join(' > ')}); ${point.pointerStyles.join(' > ')}`).toBe(true);
  await page.mouse.click(point.x, point.y);
}
