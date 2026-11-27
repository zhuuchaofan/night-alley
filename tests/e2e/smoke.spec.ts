import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { DebugState } from '../../src/game/debug.ts';
import { clickLogical, getDebugState, startGame, waitForCanvasAndDebug } from './helpers.ts';

const SCREENSHOT_DIR = path.resolve(process.cwd(), '../visuals-screenshots');

function ensureScreenshotDir(): void {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
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

    const originX = box!.x + 80;
    const originY = box!.y + box!.height * 0.55;
    const farRightX = originX + 220;

    const before = await getDebugState(page);

    await page.mouse.move(originX, originY);
    await page.mouse.down();
    await page.mouse.move(farRightX, originY, { steps: 8 });
    await page.waitForTimeout(350);

    const afterRight = await getDebugState(page);
    expect(afterRight.playerX).toBeGreaterThan(before.playerX + 25);

    // Pull back 65 CSS px (50 radius + 7 deadzone + 8 CSS px), still 155 CSS px right of start.
    const earlyBackX = farRightX - 65;
    await page.mouse.move(earlyBackX, originY, { steps: 6 });
    const earlyStart = await getDebugState(page);
    await page.waitForTimeout(450);
    const earlyEnd = await getDebugState(page);
    const earlyDelta = earlyStart.playerX - earlyEnd.playerX;
    expect(earlyDelta).toBeGreaterThan(4);

    // Pull further back to 28.5 CSS px past followed base (50% speed) then >=50 CSS px (100% speed).
    const halfBackX = farRightX - 78.5;
    await page.mouse.move(halfBackX, originY, { steps: 4 });
    const halfStart = await getDebugState(page);
    await page.waitForTimeout(450);
    const halfEnd = await getDebugState(page);
    const halfDelta = halfStart.playerX - halfEnd.playerX;

    const fullBackX = farRightX - 105;
    await page.mouse.move(fullBackX, originY, { steps: 4 });
    const fullStart = await getDebugState(page);
    await page.waitForTimeout(450);
    const fullEnd = await getDebugState(page);
    const fullDelta = fullStart.playerX - fullEnd.playerX;

    await page.mouse.up();

    expect(halfDelta).toBeGreaterThan(15);
    expect(fullDelta).toBeGreaterThan(45);
    expect(halfDelta).toBeLessThan(fullDelta * 0.75);
    expect(halfDelta).toBeGreaterThan(fullDelta * 0.25);
  });

  test('9. joystick activates only on left half and ignores second finger sequence', async ({
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

      const cdp = await touchContext.newCDPSession(touchPage);
      const x1 = tBox!.x + 180;
      const y1 = tBox!.y + 300;
      const x2 = tBox!.x + 420;
      const y2 = tBox!.y + 300;

      const finger1 = { x: x1, y: y1, id: 1 };
      const finger1Right = { x: x1 + 80, y: y1, id: 1 };
      const finger1Down = { x: x1 + 80, y: y1 + 140, id: 1 };
      const finger2 = { x: x2, y: y2, id: 2 };
      const finger2Moved = { x: x2 - 120, y: y2 - 120, id: 2 };

      const start = await getDebugState(touchPage);

      // 1. Finger 1 presses left half and drags right.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger1],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [finger1Right],
      });
      await touchPage.waitForTimeout(250);

      const mid1 = await getDebugState(touchPage);
      expect(mid1.playerX).toBeGreaterThan(start.playerX + 15);

      // 2. Finger 2 presses, moves, and lifts while finger 1 holds right.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [finger1Right, finger2],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [finger1Right, finger2Moved],
      });
      await touchPage.waitForTimeout(250);

      const mid2 = await getDebugState(touchPage);
      expect(mid2.playerX).toBeGreaterThan(mid1.playerX + 15);
      expect(Math.abs(mid2.playerY - mid1.playerY)).toBeLessThan(5);

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [finger2Moved],
      });
      await touchPage.waitForTimeout(200);

      const mid3 = await getDebugState(touchPage);
      expect(mid3.playerX).toBeGreaterThan(mid2.playerX + 10);

      // 3. Finger 1 steers down and still controls direction.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [finger1Down],
      });
      await touchPage.waitForTimeout(350);

      const afterDown = await getDebugState(touchPage);
      expect(afterDown.playerY).toBeGreaterThan(mid3.playerY + 25);

      // 4. Finger 1 releases -> velocity returns to zero.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [finger1Down],
      });
      const atRelease = await getDebugState(touchPage);
      await touchPage.waitForTimeout(250);
      const afterRelease = await getDebugState(touchPage);

      expect(Math.abs(afterRelease.playerX - atRelease.playerX)).toBeLessThan(1);
      expect(Math.abs(afterRelease.playerY - atRelease.playerY)).toBeLessThan(1);
    } finally {
      await touchContext.close();
    }
  });

  test('10. mouse drag continues updating direction after leaving canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    await startGame(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(40);

    const startX = box!.x + 80;
    const startY = box!.y + box!.height * 0.65;
    const outsideX = box!.x - 40;
    const upY = box!.y + 40;

    const before = await getDebugState(page);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(outsideX, startY, { steps: 8 });
    await page.waitForTimeout(350);

    const afterLeft = await getDebugState(page);
    expect(afterLeft.playerX).toBeLessThan(before.playerX - 20);

    await page.mouse.move(outsideX, upY, { steps: 10 });
    await page.waitForTimeout(450);

    const afterUp = await getDebugState(page);
    expect(afterUp.playerY).toBeLessThan(afterLeft.playerY - 30);

    await page.mouse.up();
    const atRelease = await getDebugState(page);
    await page.waitForTimeout(250);
    const afterRelease = await getDebugState(page);

    expect(Math.abs(afterRelease.playerX - atRelease.playerX)).toBeLessThan(1);
    expect(Math.abs(afterRelease.playerY - atRelease.playerY)).toBeLessThan(1);
  });

  test('11. 390px portrait viewport preserves CSS-pixel deadzone and proportional speed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startGame(page);

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.width).toBeGreaterThan(380);

    const startX = box!.x + 80;
    const startY = box!.y + box!.height * 0.55;

    const measureCssDrag = async (cssDx: number, holdMs: number): Promise<number> => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + cssDx, startY, { steps: 6 });
      const before = await getDebugState(page);
      await page.waitForTimeout(holdMs);
      const after = await getDebugState(page);
      await page.mouse.up();
      return after.playerX - before.playerX;
    };

    // 5 CSS px (< 7 CSS px deadzone) corresponds to ~12.3 game px, proving GameScene scales deadzone.
    const deadzoneDelta = await measureCssDrag(5, 450);
    expect(Math.abs(deadzoneDelta)).toBeLessThan(0.5);

    // 28.5 CSS px (50% of 7..50 range) corresponds to ~70.2 game px, proving radius scales beyond 50.
    const halfDelta = await measureCssDrag(28.5, 550);
    const fullDelta = await measureCssDrag(60, 550);

    expect(halfDelta).toBeGreaterThan(20);
    expect(fullDelta).toBeGreaterThan(55);
    expect(halfDelta).toBeLessThan(fullDelta * 0.75);
    expect(halfDelta).toBeGreaterThan(fullDelta * 0.25);
  });
});
