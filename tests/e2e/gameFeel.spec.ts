import { expect, test } from '@playwright/test';
import { ARENA_WIDTH } from '../../src/game/balance.ts';
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
});
