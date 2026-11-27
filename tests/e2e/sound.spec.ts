import { expect, test } from '@playwright/test';
import { clickLogical, getDebugState, waitForCanvasAndDebug } from './helpers.ts';

test.describe('Night Alley sound controls and unlock (stage 5)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('1. mute toggle starts false, toggles via focused Enter/Space without unlocking, persists across GameOver->Title, and resets on reload', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForCanvasAndDebug(page);

    const initial = await getDebugState(page);
    expect(initial.scene).toBe('TitleScene');
    expect(initial.soundUnlocked).toBe(false);
    expect(initial.soundMuted).toBe(false);

    const toggle = page.locator('#sound-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', '静音');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Focused Enter toggles mute without starting or unlocking audio
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    let state = await getDebugState(page);
    expect(state.scene).toBe('TitleScene');
    expect(state.soundMuted).toBe(true);
    expect(state.soundUnlocked).toBe(false);

    // Focused Space toggles mute back off without starting
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    state = await getDebugState(page);
    expect(state.scene).toBe('TitleScene');
    expect(state.soundMuted).toBe(false);
    expect(state.soundUnlocked).toBe(false);

    // Mute again, then blur and click Start with mouse
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await clickLogical(page, 480, 320);

    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );
    // Resume can finish after the scene starts; wait for the unlock itself.
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().soundUnlocked === true,
    );
    await expect(toggle).toBeHidden();
    const inGame = await getDebugState(page);
    expect(inGame.soundMuted).toBe(true);
    expect(inGame.soundUnlocked).toBe(true);

    // Return to Title via GameOver preserves mute state
    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setHp(0);
    });
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
    );
    await expect(toggle).toBeHidden();

    await clickLogical(page, 480, 405);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'TitleScene',
    );
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const backOnTitle = await getDebugState(page);
    expect(backOnTitle.soundMuted).toBe(true);

    // Reload resets session mute and audio unlock
    await page.reload();
    await waitForCanvasAndDebug(page);
    const reloaded = await getDebugState(page);
    expect(reloaded.soundMuted).toBe(false);
    expect(reloaded.soundUnlocked).toBe(false);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('2. keyboard Enter and Space start the game even after focusing mute toggle', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForCanvasAndDebug(page);

    const toggle = page.locator('#sound-toggle');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Blur mute toggle and start via Space
    await toggle.evaluate((el) => (el as HTMLElement).blur());
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().soundUnlocked === true,
    );
    const afterSpace = await getDebugState(page);
    expect(afterSpace.soundUnlocked).toBe(true);
    expect(afterSpace.soundMuted).toBe(true);

    // Fresh page: start via Enter
    await page.goto('/');
    await waitForCanvasAndDebug(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
    );
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().soundUnlocked === true,
    );
    const afterEnter = await getDebugState(page);
    expect(afterEnter.soundUnlocked).toBe(true);
    expect(afterEnter.soundMuted).toBe(false);
  });

  test('3. touch Start arms on pointerdown and commits only on release over Start button', async ({
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

      const box = await page.locator('canvas').boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + (480 / 960) * box!.width;
      const startY = box!.y + (320 / 540) * box!.height;
      const cdp = await context.newCDPSession(page);

      // 1. Touch down on Start alone must NOT start the game; sliding outside + release cancels arm
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY, id: 1 }],
      });
      await page.waitForTimeout(120);
      expect((await getDebugState(page)).scene).toBe('TitleScene');

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX, y: startY - 80, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: startX, y: startY - 80, id: 1 }],
      });
      await page.waitForTimeout(120);
      expect((await getDebugState(page)).scene).toBe('TitleScene');
      expect((await getDebugState(page)).soundUnlocked).toBe(false);

      // 2. Touch down + release over Start commits Start and unlocks sound
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY, id: 2 }],
      });
      await page.waitForTimeout(60);
      expect((await getDebugState(page)).scene).toBe('TitleScene');

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: startX, y: startY, id: 2 }],
      });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
      );
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().soundUnlocked === true,
      );
      const started = await getDebugState(page);
      expect(started.soundUnlocked).toBe(true);
    } finally {
      await context.close();
    }
  });
});
