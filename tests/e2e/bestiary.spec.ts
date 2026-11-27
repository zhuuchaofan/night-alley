import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createEmptyKillCounts } from '../../src/game/debug.ts';
import { clickLogical, getDebugState, waitForCanvasAndDebug } from './helpers.ts';

const STAGE5_SCREENSHOT_DIR = path.resolve(process.cwd(), '../fun-stage5-screenshots');

test.describe('Night Alley bestiary (stage 5)', () => {
  test.beforeEach(async ({ page }) => {
    fs.mkdirSync(STAGE5_SCREENSHOT_DIR, { recursive: true });
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('1. bestiary navigates from Title and GameOver, shows run kills by kind, preserves settlement on Escape, and resets on Title return', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await waitForCanvasAndDebug(page);

    // 1. Open Bestiary from Title
    await clickLogical(page, 480, 380);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
    );
    const fromTitle = await getDebugState(page);
    expect(fromTitle.settlement).toBeNull();
    expect(fromTitle.kills).toBe(0);
    expect(fromTitle.killsByKind).toEqual(createEmptyKillCounts());

    await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'bestiary-title.png') });

    // 2. Return to Title and start a run
    await clickLogical(page, 480, 476);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'TitleScene',
    );

    await clickLogical(page, 480, 320);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );

    // Spawn a swift enemy within sword range and wait for a real kill
    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyKind?.('swift', 55, 0);
    });
    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().killsByKind.swift ?? 0) >= 1,
      undefined,
      { timeout: 10000 },
    );

    const midRun = await getDebugState(page);
    const midSum = Object.values(midRun.killsByKind).reduce((sum, n) => sum + n, 0);
    expect(midSum).toBe(midRun.kills);
    expect(midRun.killsByKind.swift).toBeGreaterThanOrEqual(1);

    // 3. End run via setHp(0) -> GameOver -> open Bestiary
    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setHp(0);
    });
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
    );
    const overState = await getDebugState(page);
    expect(overState.settlement).not.toBeNull();
    const expectedSettlement = overState.settlement!;
    expect(overState.killsByKind).toEqual(expectedSettlement.killsByKind);
    expect(expectedSettlement.killsByKind.swift).toBeGreaterThanOrEqual(1);

    await clickLogical(page, 680, 405);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
    );
    const fromGameOver = await getDebugState(page);
    expect(fromGameOver.killsByKind).toEqual(expectedSettlement.killsByKind);
    expect(fromGameOver.settlement).toEqual(expectedSettlement);

    await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'bestiary-gameover.png') });

    // 4. Press Escape to return to GameOver -> full settlement preserved
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
    );
    const returnedOver = await getDebugState(page);
    expect(returnedOver.settlement).toEqual(expectedSettlement);
    expect(returnedOver.settlement!.won).toBe(expectedSettlement.won);
    expect(returnedOver.settlement!.winReason).toBe(expectedSettlement.winReason);

    // 5. Return to Title -> Bestiary resets to empty/unstarted; fresh run starts at zero
    await clickLogical(page, 480, 405);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'TitleScene',
    );
    await clickLogical(page, 480, 380);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
    );
    const resetBestiary = await getDebugState(page);
    expect(resetBestiary.settlement).toBeNull();
    expect(resetBestiary.killsByKind).toEqual(createEmptyKillCounts());

    await clickLogical(page, 480, 476);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'TitleScene',
    );
    await clickLogical(page, 480, 320);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );
    const freshRun = await getDebugState(page);
    expect(freshRun.kills).toBe(0);
    expect(freshRun.killsByKind).toEqual(createEmptyKillCounts());
  });

  test('2. scaled touch viewport renders bestiary and all 3 GameOver buttons remain clickable', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      page.on('pageerror', (err) => {
        throw err;
      });
      await page.goto('/');
      await waitForCanvasAndDebug(page);

      // Start via touch release
      const box = await page.locator('canvas').boundingBox();
      const cdp = await context.newCDPSession(page);
      const sx = box!.x + (480 / 960) * box!.width;
      const sy = box!.y + (320 / 540) * box!.height;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: sx, y: sy, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: sx, y: sy, id: 1 }],
      });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
      );

      await page.evaluate(() => {
        window.__NIGHT_ALLEY_DEBUG__?.setHp(0);
      });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
      );

      // Click GameOver Bestiary (680, 405), verify scene & screenshot, then Return (480, 476)
      await clickLogical(page, 680, 405);
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
      );
      await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'bestiary-mobile.png') });

      await clickLogical(page, 480, 476);
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
      );

      // Click GameOver Return to Title (480, 405)
      await clickLogical(page, 480, 405);
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'TitleScene',
      );

      // Click Title Bestiary (480, 380)
      await clickLogical(page, 480, 380);
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
      );
    } finally {
      await context.close();
    }
  });
});
