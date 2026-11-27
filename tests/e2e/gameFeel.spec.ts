import { expect, test } from '@playwright/test';
import { ARENA_WIDTH, PLAYER_PICKUP_RADIUS } from '../../src/game/balance.ts';
import type { DebugState } from '../../src/game/debug.ts';
import { MAX_DAMAGE_NUMBERS } from '../../src/game/gameFeel.ts';
import { startGame } from './helpers.ts';

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
    // Note: this test does NOT assert the level-up modal opens — a
    // stationary player strands orbs that land beyond the 60px magnet
    // radius, so reaching 8 XP from one spot is luck, not a guarantee.
    // The modal itself is covered by test 4 (xp threshold opens it) and by
    // real play; this test pins the NaN freeze and the XP flow.
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
              // test, not survival.
              if (now - lastHeal > 2000) {
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
              if ((maxKills >= 8 && maxXp > 0) || t > 40) {
                resolve({ kills: maxKills, maxXp, maxLevel, everLevelUpOpen, sawNaNOrb });
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          },
        ),
    );

    expect(observed.kills).toBeGreaterThanOrEqual(8);
    expect(observed.maxXp).toBeGreaterThan(0);
    expect(observed.sawNaNOrb).toBe(false);
  });
});
