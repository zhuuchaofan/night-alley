import { Page } from '@playwright/test';
import type { DebugState } from '../../src/game/debug.ts';

export async function waitForCanvasAndDebug(page: Page): Promise<void> {
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__NIGHT_ALLEY_DEBUG__));
}

export async function getDebugState(page: Page): Promise<DebugState> {
  return page.evaluate(() => {
    if (!window.__NIGHT_ALLEY_DEBUG__) {
      throw new Error('Missing __NIGHT_ALLEY_DEBUG__');
    }
    return window.__NIGHT_ALLEY_DEBUG__.getState();
  });
}

export async function clickLogical(page: Page, lx: number, ly: number): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const box = await page.locator('canvas').boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('Canvas bounding box is empty');
  }
  const x = box.x + (lx / 960) * box.width;
  const y = box.y + (ly / 540) * box.height;
  await page.mouse.click(x, y);
}

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await waitForCanvasAndDebug(page);
  await clickLogical(page, 480, 320);
  await page.waitForFunction(() => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene');
}
