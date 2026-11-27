import fs from 'node:fs';
import path from 'node:path';
import { expect, Page, test } from '@playwright/test';
import type { DebugState } from '../../src/game/debug.ts';

const SCREENSHOT_DIR = path.resolve(process.cwd(), '../visuals-screenshots');

function ensureScreenshotDir(): void {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function waitForCanvasAndDebug(page: Page): Promise<void> {
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => Boolean(window.__NIGHT_ALLEY_DEBUG__));
}

async function getDebugState(page: Page): Promise<DebugState> {
  return page.evaluate(() => {
    if (!window.__NIGHT_ALLEY_DEBUG__) {
      throw new Error('Missing __NIGHT_ALLEY_DEBUG__');
    }
    return window.__NIGHT_ALLEY_DEBUG__.getState();
  });
}

async function clickLogical(page: Page, lx: number, ly: number): Promise<void> {
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

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await waitForCanvasAndDebug(page);
  await clickLogical(page, 480, 320);
  await page.waitForFunction(() => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene');
}

test.describe('Night Alley pixel visuals & controls', () => {
  test.beforeEach(async ({ page }) => {
    ensureScreenshotDir();
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('1. loads page, renders canvas, and shows title screen', async ({ page }) => {
    await page.goto('/');
    await waitForCanvasAndDebug(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    const state = await getDebugState(page);
    expect(state.scene).toBe('TitleScene');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'title.png') });
  });

  test('2. starts game and moves player right when holding D for 1s', async ({ page }) => {
    await startGame(page);
    const before = await getDebugState(page);

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyD');

    const after = await getDebugState(page);
    expect(after.playerX).toBeGreaterThan(before.playerX + 50);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
    });
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gameplay.png') });
  });

  test('3. auto-attack kills spawned enemy within 20 seconds', async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
    });

    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().kills ?? 0) >= 1,
      undefined,
      { timeout: 20000 },
    );

    const state = await getDebugState(page);
    expect(state.kills).toBeGreaterThanOrEqual(1);
  });

  test('4. level-up shows 3 distinct choices and clicking one resumes game', async ({ page }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.addXp(50);
    });

    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().isLevelUpOpen === true,
    );

    const modalState = await getDebugState(page);
    expect(modalState.levelUpChoices).toHaveLength(3);
    const uniqueIds = new Set(modalState.levelUpChoices.map((c) => c.id));
    expect(uniqueIds.size).toBe(3);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'levelup.png') });

    const firstChoice = modalState.levelUpChoices[0];
    await clickLogical(page, firstChoice.x, firstChoice.y);

    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().isLevelUpOpen === false,
    );

    const t1 = (await getDebugState(page)).timeLeft;
    await page.waitForTimeout(600);
    const t2 = (await getDebugState(page)).timeLeft;
    expect(t2).toBeLessThan(t1);
  });

  test('5. settlement appears when timer ends and Restart returns to fresh GameScene', async ({
    page,
  }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
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
    expect(overState.settlement!.survivedSeconds).toBe(180);
    expect(overState.settlement!.level).toBeGreaterThanOrEqual(1);
    expect(overState.settlement!.maxConcurrent).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'settlement.png') });

    await clickLogical(page, 370, 405);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );

    const restarted = await getDebugState(page);
    expect(restarted.hp).toBe(30);
    expect(restarted.kills).toBe(0);
    expect(restarted.level).toBe(1);
    expect(restarted.timeLeft).toBeGreaterThan(170);
  });

  test('6. moves player proportionally in drag direction via virtual joystick', async ({
    page,
  }) => {
    await startGame(page);
    const before = await getDebugState(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + (300 / 960) * box!.width;
    const startY = box!.y + (300 / 540) * box!.height;
    const endX = box!.x + (360 / 960) * box!.width;
    const endY = startY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 6 });
    await page.waitForTimeout(800);
    await page.mouse.up();

    const after = await getDebugState(page);
    expect(after.playerX).toBeGreaterThan(before.playerX + 40);
  });
});
