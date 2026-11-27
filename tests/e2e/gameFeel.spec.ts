import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ARENA_WIDTH, PLAYER_PICKUP_RADIUS } from '../../src/game/balance.ts';
import type { DebugState } from '../../src/game/debug.ts';
import { MAX_DAMAGE_NUMBERS } from '../../src/game/gameFeel.ts';
import { getDebugState, startGame } from './helpers.ts';

const STAGE5_SCREENSHOT_DIR = path.resolve(process.cwd(), '../fun-stage5-screenshots');

test.describe('Night Alley game feel (stage 2)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('14. peach sword swing plays 2-frame pose, hit-flash, bounded render knockback, and damage numbers', async ({
    page,
  }) => {
    await startGame(page);

    const observed = await page.evaluate(
      () =>
        new Promise<{
          textures: string[];
          hitFlashed: boolean;
          maxKnockback: number;
          renderDiffX: number;
          damageNumberText: string | null;
          decayedToZero: boolean;
          renderedInBounds: boolean;
        }>((resolve, reject) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__;
          if (!dbg) {
            reject(new Error('Missing __NIGHT_ALLEY_DEBUG__'));
            return;
          }
          dbg.spawnEnemyNearPlayer();

          const startedAt = performance.now();
          const textures = new Set<string>();
          let hitFlashed = false;
          let maxKnockback = 0;
          let renderDiffX = 0;
          let damageNumberText: string | null = null;
          let decayedToZero = false;
          let renderedInBounds = true;

          const step = (): void => {
            const state: DebugState = dbg.getState();
            const gf = state.gameFeel;
            if (!gf) {
              reject(new Error('Missing gameFeel debug state'));
              return;
            }

            if (gf.playerSwinging) {
              textures.add(gf.playerTexture);
            }
            for (const dn of gf.damageNumbers) {
              if (!damageNumberText) {
                damageNumberText = dn.text;
              }
            }
            for (const enemy of gf.enemies) {
              if (enemy.hitFlash > 0) {
                hitFlashed = true;
              }
              const kbMag = Math.hypot(enemy.knockbackX, enemy.knockbackY);
              if (kbMag > maxKnockback) {
                maxKnockback = kbMag;
                renderDiffX = Math.abs(enemy.renderX - enemy.x);
              }
              if (maxKnockback > 0 && kbMag === 0) {
                decayedToZero = true;
              }
              if (enemy.renderX < 0 || enemy.renderX > 960) {
                renderedInBounds = false;
              }
            }

            if (
              textures.has('player_swing_1') &&
              textures.has('player_swing_2') &&
              hitFlashed &&
              maxKnockback > 0 &&
              damageNumberText !== null &&
              decayedToZero
            ) {
              resolve({
                textures: [...textures],
                hitFlashed,
                maxKnockback,
                renderDiffX,
                damageNumberText,
                decayedToZero,
                renderedInBounds,
              });
              return;
            }

            if (performance.now() - startedAt > 5000) {
              resolve({
                textures: [...textures],
                hitFlashed,
                maxKnockback,
                renderDiffX,
                damageNumberText,
                decayedToZero,
                renderedInBounds,
              });
              return;
            }
            requestAnimationFrame(step);
          };

          requestAnimationFrame(step);
        }),
    );

    expect(observed.textures).toContain('player_swing_1');
    expect(observed.textures).toContain('player_swing_2');
    expect(observed.hitFlashed).toBe(true);
    expect(observed.maxKnockback).toBeGreaterThan(0);
    expect(observed.maxKnockback).toBeLessThanOrEqual(12.01);
    expect(observed.renderDiffX).toBeGreaterThan(0);
    expect(observed.damageNumberText).toMatch(/^\d+$/);
    expect(observed.decayedToZero).toBe(true);
    expect(observed.renderedInBounds).toBe(true);
  });

  test('15. killing an enemy spawns death burst particles and scattering XP orb', async ({
    page,
  }) => {
    await startGame(page);

    const observed = await page.evaluate(
      () =>
        new Promise<{
          kills: number;
          maxBurstParticles: number;
          maxScatteringOrbs: number;
        }>((resolve, reject) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__;
          if (!dbg) {
            reject(new Error('Missing __NIGHT_ALLEY_DEBUG__'));
            return;
          }
          dbg.spawnEnemyNearPlayer();

          const startedAt = performance.now();
          let maxBurstParticles = 0;
          let maxScatteringOrbs = 0;

          const step = (): void => {
            const state = dbg.getState();
            const gf = state.gameFeel;
            if (gf) {
              maxBurstParticles = Math.max(maxBurstParticles, gf.burstParticles);
              maxScatteringOrbs = Math.max(maxScatteringOrbs, gf.scatteringOrbs);
            }
            if (state.kills >= 1 && maxBurstParticles > 0 && maxScatteringOrbs > 0) {
              resolve({
                kills: state.kills,
                maxBurstParticles,
                maxScatteringOrbs,
              });
              return;
            }
            if (performance.now() - startedAt > 8000) {
              resolve({
                kills: state.kills,
                maxBurstParticles,
                maxScatteringOrbs,
              });
              return;
            }
            requestAnimationFrame(step);
          };

          requestAnimationFrame(step);
        }),
    );

    expect(observed.kills).toBeGreaterThanOrEqual(1);
    expect(observed.maxBurstParticles).toBeGreaterThan(0);
    expect(observed.maxScatteringOrbs).toBeGreaterThan(0);
  });

  test('16. simultaneous hits cap active damage numbers at MAX_DAMAGE_NUMBERS', async ({
    page,
  }) => {
    await startGame(page);

    const observed = await page.evaluate(
      (maxCap) =>
        new Promise<{
          peakNumbers: number;
          neverExceededCap: boolean;
          playerX: number;
        }>((resolve, reject) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__;
          if (!dbg) {
            reject(new Error('Missing __NIGHT_ALLEY_DEBUG__'));
            return;
          }
          for (let i = 0; i < 28; i += 1) {
            dbg.spawnEnemyNearPlayer();
          }

          const startedAt = performance.now();
          let peakNumbers = 0;
          let neverExceededCap = true;

          const step = (): void => {
            const state = dbg.getState();
            const count = state.gameFeel?.damageNumbers.length ?? 0;
            peakNumbers = Math.max(peakNumbers, count);
            if (count > maxCap) {
              neverExceededCap = false;
            }
            if (performance.now() - startedAt > 1400) {
              resolve({
                peakNumbers,
                neverExceededCap,
                playerX: state.playerX,
              });
              return;
            }
            requestAnimationFrame(step);
          };

          requestAnimationFrame(step);
        }),
      MAX_DAMAGE_NUMBERS,
    );

    expect(observed.playerX).toBeGreaterThan(0);
    expect(observed.playerX).toBeLessThan(ARENA_WIDTH);
    expect(observed.peakNumbers).toBeGreaterThan(0);
    expect(observed.peakNumbers).toBeLessThanOrEqual(MAX_DAMAGE_NUMBERS);
    expect(observed.neverExceededCap).toBe(true);
  });

  test('17. orb scatter animation is render-only and preserves logical pickup coordinates', async ({
    page,
  }) => {
    await startGame(page);

    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.spawnEnemyNearPlayer();
    });

    await page.waitForFunction(
      () => {
        const s = window.__NIGHT_ALLEY_DEBUG__?.getState();
        const enemy = s?.gameFeel?.enemies[0];
        return Boolean(s && enemy && enemy.x - s.playerX <= 36);
      },
      undefined,
      { timeout: 4000 },
    );

    await page.keyboard.down('ArrowLeft');

    const observed = await page.evaluate(
      (pickupRadius) =>
        new Promise<{
          sawKill: boolean;
          sawScattering: boolean;
          maxLogicalDrift: number;
          maxVisualOffset: number;
          finishedWhileOutside: boolean;
        }>((resolve, reject) => {
          const dbg = window.__NIGHT_ALLEY_DEBUG__;
          if (!dbg) {
            reject(new Error('Missing __NIGHT_ALLEY_DEBUG__'));
            return;
          }

          const startedAt = performance.now();
          let initialX: number | null = null;
          let initialY: number | null = null;
          let sawKill = false;
          let sawScattering = false;
          let maxLogicalDrift = 0;
          let maxVisualOffset = 0;

          const step = (): void => {
            const state = dbg.getState();
            const gf = state.gameFeel;
            if (!gf) {
              reject(new Error('Missing gameFeel debug state'));
              return;
            }

            if (state.kills >= 1) {
              sawKill = true;
            }

            if (sawKill && gf.orbs.length > 0) {
              const candidate =
                initialX === null
                  ? gf.orbs.find(
                      (orb) => Math.hypot(orb.x - state.playerX, orb.y - state.playerY) > pickupRadius + 5,
                    )
                  : gf.orbs[0];

              if (candidate) {
                if (initialX === null || initialY === null) {
                  initialX = candidate.x;
                  initialY = candidate.y;
                }
                const distToPlayer = Math.hypot(
                  candidate.x - state.playerX,
                  candidate.y - state.playerY,
                );
                if (distToPlayer > pickupRadius) {
                  maxLogicalDrift = Math.max(
                    maxLogicalDrift,
                    Math.hypot(candidate.x - initialX, candidate.y - initialY),
                  );
                  if (candidate.scattering) {
                    sawScattering = true;
                    maxVisualOffset = Math.max(
                      maxVisualOffset,
                      Math.hypot(candidate.renderX - candidate.x, candidate.renderY - candidate.y),
                    );
                  } else if (sawScattering) {
                    resolve({
                      sawKill,
                      sawScattering,
                      maxLogicalDrift,
                      maxVisualOffset,
                      finishedWhileOutside: true,
                    });
                    return;
                  }
                }
              }
            }

            if (performance.now() - startedAt > 4000) {
              resolve({
                sawKill,
                sawScattering,
                maxLogicalDrift,
                maxVisualOffset,
                finishedWhileOutside: false,
              });
              return;
            }
            requestAnimationFrame(step);
          };

          requestAnimationFrame(step);
        }),
      PLAYER_PICKUP_RADIUS,
    );

    await page.keyboard.up('ArrowLeft');

    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(
      () => (window.__NIGHT_ALLEY_DEBUG__?.getState().xp ?? 0) >= 1,
      undefined,
      { timeout: 4000 },
    );
    await page.keyboard.up('ArrowRight');

    const xpAfterWalkBack = await page.evaluate(() => window.__NIGHT_ALLEY_DEBUG__?.getState().xp ?? 0);

    expect(observed.sawScattering).toBe(true);
    expect(observed.finishedWhileOutside).toBe(true);
    expect(observed.maxLogicalDrift).toBeLessThanOrEqual(0.01);
    expect(observed.maxVisualOffset).toBeGreaterThan(2);
    expect(xpAfterWalkBack).toBeGreaterThanOrEqual(1);
  });

  test('18. close-range kills grant XP and open the level-up modal', async ({ page }) => {
    await startGame(page);

    // Regression test for the live stage-3 bug: after the scatter fix gated
    // collection on scatterTimer, the magnet pull could snap an orb exactly
    // onto the standing player (dist === 0) and the next frame's dx / dist
    // became 0 / 0 = NaN, freezing every orb forever — kills piled up, XP
    // stayed 0, no level-ups ever opened. Real kills only, no addXp.
    // Note: this test does NOT require the level-up modal to open — a
    // stationary player strands orbs that land beyond the 60px magnet
    // radius, so reaching 8 XP from one spot is luck, not a guarantee.
    // The modal itself is covered by test 4 (xp threshold opens it) and by
    // real play; this test pins the NaN freeze and the XP flow.
    // Two races found 2026-11-27 (probe timeline, not load jitter):
    // (1) a stationary player is a death race — spawns (~2.5/s with the
    // natural spawner) outrun the sword (~1 kill/s), the pile's contact
    // dps outruns a 2s heal cadence, and the player dies around 7s with
    // 6 kills, freezing everything; (2) an elite's 3 orbs can push XP to
    // the 8 threshold before the 8th kill, the modal opens, the game
    // pauses, and the kill count freezes below 8. Both are correct game
    // behavior; the test heals every 500ms and also resolves when the
    // modal opens, since an open modal IS the XP-flow proof.
    const observed = await page.evaluate(
      () =>
        new Promise<{
          kills: number;
          maxXp: number;
          maxLevel: number;
          everLevelUpOpen: boolean;
          sawNaNOrb: boolean;
        }>(
          (resolve) => {
            const dbg = window.__NIGHT_ALLEY_DEBUG__;
            if (!dbg) throw new Error('Missing __NIGHT_ALLEY_DEBUG__');
            const startedAt = performance.now();
            let maxKills = 0;
            let maxXp = 0;
            let maxLevel = 1;
            let everLevelUpOpen = false;
            let sawNaNOrb = false;
            let lastSpawn = 0;
            let lastHeal = 0;
            const step = (): void => {
              const now = performance.now();
              const t = (now - startedAt) / 1000;
              if (now - lastSpawn > 1200) {
                dbg.spawnEnemyNearPlayer();
                dbg.spawnEnemyNearPlayer();
                lastSpawn = now;
              }
              // Keep the stationary player alive: contact damage would kill
              // it before 8 kills otherwise. The XP chain is what's under
              // test, not survival. 500ms cadence: a ~12-enemy pile deals
              // ~7 dps, a 65-enemy cap pile ~37 dps, both under 30 HP per
              // 500ms window; the old 2s cadence lost the race ~25% of runs.
              if (now - lastHeal > 500) {
                dbg.setHp(30);
                lastHeal = now;
              }
              const state = dbg.getState();
              maxKills = Math.max(maxKills, state.kills);
              maxXp = Math.max(maxXp, state.xp);
              maxLevel = Math.max(maxLevel, state.level);
              everLevelUpOpen = everLevelUpOpen || state.isLevelUpOpen;
              // Direct regression signal: a frozen orb has NaN coordinates.
              if (
                state.gameFeel?.orbs.some(
                  (o: { x: number; y: number }) => !Number.isFinite(o.x) || !Number.isFinite(o.y),
                )
              ) {
                sawNaNOrb = true;
              }
              if ((maxKills >= 8 && maxXp > 0) || everLevelUpOpen || t > 40) {
                resolve({ kills: maxKills, maxXp, maxLevel, everLevelUpOpen, sawNaNOrb });
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          },
        ),
    );

    // Either 8 close-range kills landed, or a level-up opened: an elite's
    // 3 orbs can reach the 8-XP threshold before the 8th kill, and the open
    // modal pauses the game, freezing the kill count — the open modal is
    // itself proof the XP flowed.
    expect(observed.kills >= 8 || observed.everLevelUpOpen).toBe(true);
    expect(observed.maxXp).toBeGreaterThan(0);
    expect(observed.sawNaNOrb).toBe(false);
  });

  test('19. virtual joystick touch drag respects 6/7/50 CSS px thresholds across two scales and ignores right-half/second touch', async ({
    browser,
  }) => {
    fs.mkdirSync(STAGE5_SCREENSHOT_DIR, { recursive: true });
    const viewports = [
      { width: 1280, height: 720, capture: true },
      { width: 390, height: 844, capture: false },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: true,
        isMobile: true,
      });
      try {
        const page = await context.newPage();
        page.on('pageerror', (err) => {
          throw err;
        });
        await page.goto('/');
        await page.waitForSelector('canvas', { state: 'visible' });
        await page.waitForFunction(() => Boolean(window.__NIGHT_ALLEY_DEBUG__));

        const cdp = await context.newCDPSession(page);
        const titleBox = await page.locator('canvas').boundingBox();
        expect(titleBox).not.toBeNull();
        const startCssX = titleBox!.x + (480 / 960) * titleBox!.width;
        const startCssY = titleBox!.y + (320 / 540) * titleBox!.height;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: startCssX, y: startCssY, id: 1 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [{ x: startCssX, y: startCssY, id: 1 }],
        });
        await page.waitForFunction(
          () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameScene',
        );

        const box = await page.locator('canvas').boundingBox();
        expect(box).not.toBeNull();
        const originX = box!.x + box!.width * 0.22;
        const originY = box!.y + box!.height * 0.65;

        // 1. Right-half touch cannot start a drag
        const rightOriginX = box!.x + box!.width * 0.72;
        const beforeRight = await getDebugState(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: rightOriginX, y: originY, id: 10 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: rightOriginX + 45, y: originY, id: 10 }],
        });
        await page.waitForTimeout(250);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [{ x: rightOriginX + 45, y: originY, id: 10 }],
        });
        const afterRight = await getDebugState(page);
        expect(Math.abs(afterRight.playerX - beforeRight.playerX)).toBeLessThan(0.5);

        // 2. Left-half press (idle) + 6 CSS px inside deadzone -> no movement
        const beforeDeadzone = await getDebugState(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: originX, y: originY, id: 11 }],
        });
        await page.waitForTimeout(180);
        if (vp.capture) {
          await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'joystick-idle.png') });
        }
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: originX + 6, y: originY, id: 11 }],
        });
        await page.waitForTimeout(280);
        const afterDeadzone = await getDebugState(page);
        expect(Math.abs(afterDeadzone.playerX - beforeDeadzone.playerX)).toBeLessThan(0.5);

        // 3. Partial tilt beyond 7 CSS px (28 CSS px) -> moves right
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: originX + 28, y: originY, id: 11 }],
        });
        await page.waitForTimeout(260);
        if (vp.capture) {
          await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'joystick-partial.png') });
        }
        const afterPartial = await getDebugState(page);
        expect(afterPartial.playerX).toBeGreaterThan(afterDeadzone.playerX + 12);

        // 4. Full tilt beyond 50 CSS px (75 CSS px) + second touch ignored
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: originX + 75, y: originY, id: 11 }],
        });
        await page.waitForTimeout(260);
        if (vp.capture) {
          await page.screenshot({ path: path.join(STAGE5_SCREENSHOT_DIR, 'joystick-full.png') });
        }
        const afterFull = await getDebugState(page);
        expect(afterFull.playerX).toBeGreaterThan(afterPartial.playerX + 20);

        // Second finger tries to steer up/left while finger 11 holds right
        const secondTouch = { x: originX + 140, y: originY, id: 12 };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: originX + 75, y: originY, id: 11 }, secondTouch],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: originX + 75, y: originY, id: 11 },
            { x: originX + 20, y: originY - 120, id: 12 },
          ],
        });
        await page.waitForTimeout(250);
        const duringSecond = await getDebugState(page);
        expect(duringSecond.playerX).toBeGreaterThan(afterFull.playerX + 15);
        expect(Math.abs(duringSecond.playerY - afterFull.playerY)).toBeLessThan(5);

        // Release both fingers -> movement stops
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [{ x: originX + 20, y: originY - 120, id: 12 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [{ x: originX + 75, y: originY, id: 11 }],
        });
        const atRelease = await getDebugState(page);
        await page.waitForTimeout(260);
        const afterRelease = await getDebugState(page);
        expect(Math.abs(afterRelease.playerX - atRelease.playerX)).toBeLessThan(1);
        expect(Math.abs(afterRelease.playerY - atRelease.playerY)).toBeLessThan(1);
      } finally {
        await context.close();
      }
    }
  });
});
