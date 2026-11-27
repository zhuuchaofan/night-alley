import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getDebugState, startGame, waitForCanvasAndDebug } from './helpers.ts';

const FUN_SCREENSHOT_DIR = path.resolve(process.cwd(), '../fun-stage4-screenshots');

function ensureFunScreenshotDir(): void {
  fs.mkdirSync(FUN_SCREENSHOT_DIR, { recursive: true });
}

test.describe('Night Alley enemy variety (stage 4)', () => {
  test.beforeEach(async ({ page }) => {
    ensureFunScreenshotDir();
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('1. swift, shooter, and elite spawn via debug hook and render together', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForCanvasAndDebug(page);
    await page.screenshot({ path: path.join(FUN_SCREENSHOT_DIR, 'title.png') });

    await startGame(page);
    await page.evaluate(() => {
      const dbg = window.__NIGHT_ALLEY_DEBUG__;
      if (!dbg?.spawnEnemyKind) {
        throw new Error('Missing spawnEnemyKind debug hook');
      }
      dbg.setTimeLeft(179);
      dbg.spawnEnemyKind('swift', -130, -50);
      dbg.spawnEnemyKind('shooter', 165, 0);
      dbg.spawnEnemyKind('elite', 115, 65);
    });

    await page.waitForTimeout(250);

    const state = await getDebugState(page);
    expect(state.enemiesByKind?.swift).toBeGreaterThanOrEqual(1);
    expect(state.enemiesByKind?.shooter).toBeGreaterThanOrEqual(1);
    expect(state.enemiesByKind?.elite).toBeGreaterThanOrEqual(1);

    const kinds = new Set((state.gameFeel?.enemies ?? []).map((e) => e.kind));
    expect(kinds.has('swift')).toBe(true);
    expect(kinds.has('shooter')).toBe(true);
    expect(kinds.has('elite')).toBe(true);

    await page.screenshot({ path: path.join(FUN_SCREENSHOT_DIR, 'variety.png') });
  });

  test('2. shooter bolt hits a stationary player and can be dodged by moving sideways', async ({
    page,
  }) => {
    // Subcase A: stationary player gets hit by shooter bolt
    await startGame(page);
    await page.evaluate(() => {
      const dbg = window.__NIGHT_ALLEY_DEBUG__;
      if (!dbg?.spawnEnemyKind) {
        throw new Error('Missing spawnEnemyKind debug hook');
      }
      dbg.setHp(30);
      dbg.setTimeLeft(179);
      dbg.spawnEnemyKind('shooter', 180, 0);
    });

    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().bolts?.length ?? 0) > 0,
      undefined,
      { timeout: 5000 },
    );

    // Wait ~650ms so the bolt travels ~70px into open space with its 3-square trail clearly visible
    await page.waitForTimeout(650);
    await page.screenshot({ path: path.join(FUN_SCREENSHOT_DIR, 'bolt.png') });

    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().hp ?? 30) < 30,
      undefined,
      { timeout: 6000 },
    );
    const hitState = await getDebugState(page);
    expect(hitState.hp).toBeLessThan(30);

    // Subcase B: moving perpendicularly dodges the incoming bolt without taking damage
    await startGame(page);
    await page.evaluate(() => {
      const dbg = window.__NIGHT_ALLEY_DEBUG__;
      if (!dbg?.spawnEnemyKind) {
        throw new Error('Missing spawnEnemyKind debug hook');
      }
      dbg.setHp(30);
      dbg.setTimeLeft(179);
      dbg.spawnEnemyKind('shooter', 180, 0);
    });

    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().bolts?.length ?? 0) > 0,
      undefined,
      { timeout: 5000 },
    );

    await page.keyboard.down('KeyW');
    await page.waitForTimeout(850);
    await page.keyboard.up('KeyW');

    const dodgeStats = await page.evaluate(
      () =>
        new Promise<{ sawBolt: boolean; minHp: number }>((resolve) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__!;
          let minHp = dbg.getState().hp;
          let sawBolt = (dbg.getState().bolts?.length ?? 0) > 0;
          const started = performance.now();
          const tick = (): void => {
            const s = dbg.getState();
            minHp = Math.min(minHp, s.hp);
            if ((s.bolts?.length ?? 0) > 0) {
              sawBolt = true;
            }
            if ((s.bolts?.length ?? 0) === 0 || performance.now() - started > 1800) {
              resolve({ sawBolt, minHp });
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );

    expect(dodgeStats.sawBolt).toBe(true);
    expect(dodgeStats.minHp).toBe(30);
  });

  test('3. elite displays HP bar and drops 3 XP orbs on kill', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      const dbg = window.__NIGHT_ALLEY_DEBUG__;
      if (!dbg?.spawnEnemyKind) {
        throw new Error('Missing spawnEnemyKind debug hook');
      }
      dbg.setHp(30);
      dbg.setTimeLeft(179);
      // 70px is inside Peach Sword range (90 + 14) and outside pickup radius (60px)
      dbg.spawnEnemyKind('elite', 70, 0);
    });

    // Wait until the elite takes a hit and finishes its brief hit-flash so both its sprite and HP bar are crisp
    await page.waitForFunction(
      () => {
        const s = window.__NIGHT_ALLEY_DEBUG__?.getState();
        const elite = s?.gameFeel?.enemies.find((e) => e.kind === 'elite');
        return Boolean(elite && elite.hitFlash === 0);
      },
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(1050);
    await page.waitForFunction(
      () => {
        const s = window.__NIGHT_ALLEY_DEBUG__?.getState();
        const elite = s?.gameFeel?.enemies.find((e) => e.kind === 'elite');
        return Boolean(elite && elite.hitFlash === 0);
      },
      undefined,
      { timeout: 5000 },
    );
    await page.screenshot({ path: path.join(FUN_SCREENSHOT_DIR, 'elite.png') });

    const killSample = await page.evaluate(
      () =>
        new Promise<{ killed: boolean; orbsDelta: number }>((resolve) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__!;
          let prevOrbs = dbg.getState().gameFeel?.orbs.length ?? 0;
          let prevKills = dbg.getState().kills;
          let prevElites = dbg.getState().enemiesByKind?.elite ?? 0;
          const started = performance.now();

          const step = (): void => {
            const s = dbg.getState();
            if (s.hp < 20) {
              dbg.setHp(30);
            }
            const curOrbs = s.gameFeel?.orbs.length ?? 0;
            const curElites = s.enemiesByKind?.elite ?? 0;

            if (prevElites > 0 && curElites === 0 && s.kills > prevKills) {
              resolve({ killed: true, orbsDelta: curOrbs - prevOrbs });
              return;
            }

            prevOrbs = curOrbs;
            prevKills = s.kills;
            prevElites = curElites;

            if (performance.now() - started > 12000) {
              resolve({ killed: false, orbsDelta: 0 });
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );

    expect(killSample.killed).toBe(true);
    expect(killSample.orbsDelta).toBeGreaterThanOrEqual(3);
  });
});
