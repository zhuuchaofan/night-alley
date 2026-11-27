import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getDebugState, startGame } from './helpers.ts';

const FUN_SCREENSHOT_DIR = path.resolve(process.cwd(), '../fun-stage1-screenshots');

function ensureFunScreenshotDir(): void {
  fs.mkdirSync(FUN_SCREENSHOT_DIR, { recursive: true });
}

test.describe('Night Alley final boss', () => {
  test.beforeEach(async ({ page }) => {
    ensureFunScreenshotDir();
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('12. Boss 在 150 秒现身、撑到 03:00 照样赢', async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setTimeLeft(31);
    });

    await page.waitForFunction(
      () => {
        const s = window.__NIGHT_ALLEY_DEBUG__?.getState();
        return Boolean(s && s.bossSpawned && s.bossAlive);
      },
      undefined,
      { timeout: 6000 },
    );

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
    });

    await page.waitForTimeout(1500);

    const bossState = await getDebugState(page);
    expect(bossState.bossSpawned).toBe(true);
    expect(bossState.bossAlive).toBe(true);

    await page.screenshot({ path: path.join(FUN_SCREENSHOT_DIR, 'boss.png') });

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setTimeLeft(2);
    });

    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
      undefined,
      { timeout: 6000 },
    );

    const overState = await getDebugState(page);
    expect(overState.settlement).not.toBeNull();
    expect(overState.settlement!.won).toBe(true);
  });

  test('13. Boss 不占普通怪 65 上限名额', async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setTimeLeft(31);
    });

    await page.waitForFunction(
      () => {
        const s = window.__NIGHT_ALLEY_DEBUG__?.getState();
        return Boolean(s && s.bossSpawned && s.bossAlive);
      },
      undefined,
      { timeout: 6000 },
    );

    // The debug spawner shares the game's normal-enemy cap: with the boss
    // alive it must still fill 65 normal enemies, for 66 on the field.
    // All 70 calls run in one synchronous evaluate, so the sword and the
    // timed spawner cannot interfere with the count.
    await page.evaluate(() => {
      for (let i = 0; i < 70; i += 1) {
        window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
      }
    });

    const filled = await getDebugState(page);
    expect(filled.bossAlive).toBe(true);
    expect(filled.enemies).toBe(66);
    expect(filled.maxConcurrent).toBeGreaterThanOrEqual(66);
  });
});
