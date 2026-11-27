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

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();

    const displayScale = box!.width / 960;
    const logicalRadius = 50 / displayScale;
    const logicalDeadzone = 7 / displayScale;

    const startX = box!.x + (300 / 960) * box!.width;
    const startY = box!.y + (300 / 540) * box!.height;

    const measureHorizontalDrag = async (logicalDx: number): Promise<number> => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const before = await getDebugState(page);
      const endX = box!.x + ((300 + logicalDx) / 960) * box!.width;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, startY, { steps: 6 });
      await page.waitForTimeout(800);
      await page.mouse.up();

      const after = await getDebugState(page);
      return after.playerX - before.playerX;
    };

    const fullDelta = await measureHorizontalDrag(logicalRadius + 10);
    const halfDelta = await measureHorizontalDrag(
      logicalDeadzone + (logicalRadius - logicalDeadzone) * 0.5,
    );

    expect(fullDelta).toBeGreaterThan(40);
    expect(halfDelta).toBeGreaterThan(10);
    expect(halfDelta).toBeLessThan(fullDelta * 0.8);
  });

  test('7. peach sword slash arc stays pinned at swing-time position while player moves', async ({
    page,
  }) => {
    await startGame(page);

    await page.keyboard.down('KeyD');
    try {
      const result = await page.evaluate(
        () =>
          new Promise<{
            first: {
              playerX: number;
              slash: NonNullable<DebugState['slashes']>[number];
            };
            later: {
              playerX: number;
              slash: NonNullable<DebugState['slashes']>[number];
            };
          }>((resolve, reject) => {
            const dbg = window.__NIGHT_ALLEY_DEBUG__;
            if (!dbg) {
              reject(new Error('Missing __NIGHT_ALLEY_DEBUG__'));
              return;
            }
            dbg.spawnEnemyNearPlayer();

            const startedAt = performance.now();
            let first: {
              playerX: number;
              slash: NonNullable<DebugState['slashes']>[number];
            } | null = null;
            let later: {
              playerX: number;
              slash: NonNullable<DebugState['slashes']>[number];
            } | null = null;

            const step = (): void => {
              const state = dbg.getState();
              const activeSlash = state.slashes?.[0];

              if (!first) {
                if (activeSlash) {
                  first = { playerX: state.playerX, slash: { ...activeSlash } };
                  later = { playerX: state.playerX, slash: { ...activeSlash } };
                }
              } else if (activeSlash) {
                later = { playerX: state.playerX, slash: { ...activeSlash } };
                if (state.playerX - first.playerX >= 8) {
                  resolve({ first, later });
                  return;
                }
              } else {
                resolve({ first, later: later ?? first });
                return;
              }

              if (performance.now() - startedAt > 2000) {
                reject(new Error('Timed out waiting for slash arc observation'));
                return;
              }
              requestAnimationFrame(step);
            };

            requestAnimationFrame(step);
          }),
      );

      expect(result.later.playerX - result.first.playerX).toBeGreaterThanOrEqual(5);
      expect(result.later.slash.x).toBe(result.first.slash.x);
      expect(result.later.slash.y).toBe(result.first.slash.y);
      expect(result.later.slash.rotation).toBe(result.first.slash.rotation);
      expect(result.first.slash.displayWidth).toBeGreaterThan(150);
      expect(result.first.slash.displayHeight).toBeGreaterThan(150);
    } finally {
      await page.keyboard.up('KeyD');
    }
  });

  test('8. follow-base lets player reverse direction immediately after dragging past radius', async ({
    page,
  }) => {
    await startGame(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();

    const toClient = (lx: number, ly: number) => ({
      x: box!.x + (lx / 960) * box!.width,
      y: box!.y + (ly / 540) * box!.height,
    });

    const before = await getDebugState(page);
    const origin = toClient(140, 300);
    const farRight = toClient(360, 300);
    const shortBackLeft = toClient(300, 300);

    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(farRight.x, farRight.y, { steps: 8 });
    await page.waitForTimeout(400);

    const afterRight = await getDebugState(page);
    expect(afterRight.playerX).toBeGreaterThan(before.playerX + 30);

    await page.mouse.move(shortBackLeft.x, shortBackLeft.y, { steps: 6 });
    await page.waitForTimeout(500);
    await page.mouse.up();

    const afterLeft = await getDebugState(page);
    expect(afterLeft.playerX).toBeLessThan(afterRight.playerX - 20);
  });

  test('9. joystick activates only on left half and ignores second pointer down/up', async ({
    page,
    browser,
  }) => {
    await startGame(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();

    const beforeRight = await getDebugState(page);
    const rightStartX = box!.x + (650 / 960) * box!.width;
    const rightEndX = box!.x + (750 / 960) * box!.width;
    const midY = box!.y + (300 / 540) * box!.height;

    await page.mouse.move(rightStartX, midY);
    await page.mouse.down();
    await page.mouse.move(rightEndX, midY, { steps: 6 });
    await page.waitForTimeout(500);
    await page.mouse.up();

    const afterRight = await getDebugState(page);
    expect(Math.abs(afterRight.playerX - beforeRight.playerX)).toBeLessThan(1);
    expect(Math.abs(afterRight.playerY - beforeRight.playerY)).toBeLessThan(1);

    const touchContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      hasTouch: true,
    });
    try {
      const touchPage = await touchContext.newPage();
      touchPage.on('pageerror', (err) => {
        throw err;
      });
      await startGame(touchPage);

      const tBox = await touchPage.locator('canvas').boundingBox();
      expect(tBox).not.toBeNull();

      const startDragX = tBox!.x + (180 / 960) * tBox!.width;
      const moveDragX = tBox!.x + (260 / 960) * tBox!.width;
      const dragY = tBox!.y + (300 / 540) * tBox!.height;
      const tapX = tBox!.x + (320 / 960) * tBox!.width;
      const tapY = dragY;

      const start = await getDebugState(touchPage);
      await touchPage.mouse.move(startDragX, dragY);
      await touchPage.mouse.down();
      await touchPage.mouse.move(moveDragX, dragY, { steps: 6 });
      await touchPage.waitForTimeout(250);

      const mid1 = await getDebugState(touchPage);
      expect(mid1.playerX).toBeGreaterThan(start.playerX + 15);

      await touchPage.touchscreen.tap(tapX, tapY);
      await touchPage.waitForTimeout(400);

      const mid2 = await getDebugState(touchPage);
      await touchPage.mouse.up();
      expect(mid2.playerX).toBeGreaterThan(mid1.playerX + 30);
    } finally {
      await touchContext.close();
    }
  });
});
