import { expect, test } from '@playwright/test';
import { clickLogical, getDebugState, waitForCanvasAndDebug } from './helpers.ts';

async function installOrientationStubs(
  page: import('@playwright/test').Page,
  mode:
    | 'pending_then_lock'
    | 'missing_lock'
    | 'fullscreen_reject'
    | 'lock_reject_after_fs'
    | 'already_fs_lock_reject',
): Promise<void> {
  await page.addInitScript((stubMode: string) => {
    const calls: string[] = [];
    let fsEl: Element | null = null;
    let alreadyFs = stubMode === 'already_fs_lock_reject';
    let resolvePendingFs: (() => void) | null = null;

    (window as unknown as Record<string, unknown>).__FS_CALLS__ = calls;
    (window as unknown as Record<string, unknown>).__RESOLVE_PENDING_FS__ = () => {
      if (resolvePendingFs) {
        fsEl = document.documentElement;
        resolvePendingFs();
        resolvePendingFs = null;
      }
    };

    Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(Document.prototype, 'fullscreenElement', {
      configurable: true,
      get: () => (alreadyFs ? document.documentElement : fsEl),
    });

    Element.prototype.requestFullscreen = function () {
      calls.push('requestFullscreen');
      if (stubMode === 'fullscreen_reject') {
        return Promise.reject(new Error('Fullscreen rejected'));
      }
      if (stubMode === 'pending_then_lock') {
        return new Promise<void>((resolve) => {
          resolvePendingFs = resolve;
        });
      }
      fsEl = document.documentElement;
      return Promise.resolve();
    };

    Document.prototype.exitFullscreen = function () {
      calls.push('exitFullscreen');
      alreadyFs = false;
      fsEl = null;
      return Promise.resolve();
    };

    const orientationObj =
      stubMode === 'missing_lock'
        ? { type: 'portrait-primary', angle: 0 }
        : {
            type: 'portrait-primary',
            angle: 0,
            lock: (orientation: string) => {
              calls.push(`lock:${orientation}`);
              if (stubMode === 'lock_reject_after_fs' || stubMode === 'already_fs_lock_reject') {
                return Promise.reject(new Error('NotSupportedError'));
              }
              return Promise.resolve();
            },
          };

    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: orientationObj,
    });
  }, mode);
}

test.describe('Night Alley landscape & portrait hint (stage 5)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('1. coarse-pointer portrait shows hint below 16:9 canvas, hides in landscape, and restores on rotate back', async ({
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

      const hint = page.locator('#portrait-hint');
      await expect(hint).toBeVisible();
      await expect(hint).toContainText('横屏体验更佳');
      expect((await getDebugState(page)).portraitHintVisible).toBe(true);

      const portraitCanvas = await page.locator('canvas').boundingBox();
      const hintBox = await hint.boundingBox();
      expect(portraitCanvas).not.toBeNull();
      expect(hintBox).not.toBeNull();
      expect(portraitCanvas!.width / portraitCanvas!.height).toBeCloseTo(16 / 9, 1);
      expect(portraitCanvas!.width).toBeLessThanOrEqual(390.5);
      expect(portraitCanvas!.height).toBeLessThanOrEqual(844.5);
      expect(hintBox!.y).toBeGreaterThanOrEqual(portraitCanvas!.y + portraitCanvas!.height + 16);

      // Rotate to landscape -> hint hides, canvas fits 844x390 at 16:9
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().portraitHintVisible === false,
      );
      await expect(hint).toBeHidden();

      const landscapeCanvas = await page.locator('canvas').boundingBox();
      expect(landscapeCanvas).not.toBeNull();
      expect(landscapeCanvas!.width / landscapeCanvas!.height).toBeCloseTo(16 / 9, 1);
      expect(landscapeCanvas!.width).toBeLessThanOrEqual(844.5);
      expect(landscapeCanvas!.height).toBeLessThanOrEqual(390.5);

      // Rotate back to portrait -> hint reappears
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().portraitHintVisible === true,
      );
      await expect(hint).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('2. desktop fine-pointer portrait keeps portrait hint hidden', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForCanvasAndDebug(page);

    const hint = page.locator('#portrait-hint');
    await expect(hint).toBeHidden();
    expect((await getDebugState(page)).portraitHintVisible).toBe(false);
  });

  test('3. pending fullscreen starts GameScene immediately, locks landscape after fulfillment, and replay makes no fresh request', async ({
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
      await installOrientationStubs(page, 'pending_then_lock');
      await page.goto('/');
      await waitForCanvasAndDebug(page);

      const initial = await getDebugState(page);
      expect(initial.orientationLockAttempted).toBe(false);
      expect(initial.orientationLockStatus).toBe('idle');
      expect(await page.evaluate(() => (window as unknown as { __FS_CALLS__: string[] }).__FS_CALLS__)).toEqual([]);

      // Touch tap Start
      const box = await page.locator('canvas').boundingBox();
      const sx = box!.x + (480 / 960) * box!.width;
      const sy = box!.y + (320 / 540) * box!.height;
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: sx, y: sy, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: sx, y: sy, id: 1 }],
      });

      // GameScene starts while requestFullscreen is still pending
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
      );
      const pendingState = await getDebugState(page);
      expect(pendingState.orientationLockStatus).toBe('requestingFullscreen');
      expect(pendingState.orientationLockAttempted).toBe(false);
      expect(await page.evaluate(() => (window as unknown as { __FS_CALLS__: string[] }).__FS_CALLS__)).toEqual([
        'requestFullscreen',
      ]);

      // Resolve fullscreen -> lock('landscape') runs
      await page.evaluate(() => {
        (window as unknown as { __RESOLVE_PENDING_FS__: () => void }).__RESOLVE_PENDING_FS__();
      });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().orientationLockStatus === 'locked',
      );
      const lockedState = await getDebugState(page);
      expect(lockedState.orientationLockAttempted).toBe(true);
      expect(await page.evaluate(() => (window as unknown as { __FS_CALLS__: string[] }).__FS_CALLS__)).toEqual([
        'requestFullscreen',
        'lock:landscape',
      ]);

      // Replay from GameOver makes no fresh fullscreen/lock request
      await page.evaluate(() => {
        window.__NIGHT_ALLEY_DEBUG__?.setHp(0);
      });
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
      );
      await clickLogical(page, 280, 405);
      await page.waitForFunction(
        () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
      );
      expect(await page.evaluate(() => (window as unknown as { __FS_CALLS__: string[] }).__FS_CALLS__)).toEqual([
        'requestFullscreen',
        'lock:landscape',
      ]);
    } finally {
      await context.close();
    }
  });

  test('4. missing lock API, fullscreen rejection, and lock rejection with/without owned fullscreen all fall back cleanly', async ({
    browser,
  }) => {
    const cases: Array<{
      mode: 'missing_lock' | 'fullscreen_reject' | 'lock_reject_after_fs' | 'already_fs_lock_reject';
      expectedStatus: string;
      expectedAttempted: boolean;
      expectedCalls: string[];
    }> = [
      {
        mode: 'missing_lock',
        expectedStatus: 'unavailable',
        expectedAttempted: false,
        expectedCalls: [],
      },
      {
        mode: 'fullscreen_reject',
        expectedStatus: 'fullscreenRejected',
        expectedAttempted: false,
        expectedCalls: ['requestFullscreen'],
      },
      {
        mode: 'lock_reject_after_fs',
        expectedStatus: 'lockRejected',
        expectedAttempted: true,
        expectedCalls: ['requestFullscreen', 'lock:landscape', 'exitFullscreen'],
      },
      {
        mode: 'already_fs_lock_reject',
        expectedStatus: 'lockRejected',
        expectedAttempted: true,
        expectedCalls: ['lock:landscape'],
      },
    ];

    for (const c of cases) {
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
        await installOrientationStubs(page, c.mode);
        await page.goto('/');
        await waitForCanvasAndDebug(page);

        const box = await page.locator('canvas').boundingBox();
        const sx = box!.x + (480 / 960) * box!.width;
        const sy = box!.y + (320 / 540) * box!.height;
        const cdp = await context.newCDPSession(page);
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
        await page.waitForFunction(
          (target) => window.__NIGHT_ALLEY_DEBUG__?.getState().orientationLockStatus === target,
          c.expectedStatus,
        );

        const state = await getDebugState(page);
        expect(state.orientationLockAttempted).toBe(c.expectedAttempted);
        expect(
          await page.evaluate(() => (window as unknown as { __FS_CALLS__: string[] }).__FS_CALLS__),
        ).toEqual(c.expectedCalls);
      } finally {
        await context.close();
      }
    }
  });
});
