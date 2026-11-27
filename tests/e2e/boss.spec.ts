import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { KillCountsByKind } from '../../src/game/debug.ts';
import { clickLogical, getDebugState, startGame } from './helpers.ts';

const FUN_SCREENSHOT_DIR = path.resolve(process.cwd(), '../fun-stage1-screenshots');
const POLISH_SCREENSHOT_DIR = path.resolve(process.cwd(), '../polish-stage3-screenshots');

function ensureFunScreenshotDir(): void {
  fs.mkdirSync(FUN_SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(POLISH_SCREENSHOT_DIR, { recursive: true });
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
    // The count is captured in the same evaluate as the spawns, so a game
    // tick cannot add a normal between the fill and the read and mask a
    // regression in the debug spawner's own cap check.
    const filled = await page.evaluate(() => {
      const dbg = window.__NIGHT_ALLEY_DEBUG__;
      if (!dbg) {
        throw new Error('Missing __NIGHT_ALLEY_DEBUG__');
      }
      for (let i = 0; i < 70; i += 1) {
        dbg.spawnEnemyNearPlayer();
      }
      return dbg.getState();
    });

    expect(filled.bossAlive).toBe(true);
    expect(filled.enemies).toBe(66);
    expect(filled.maxConcurrent).toBeGreaterThanOrEqual(66);
  });

  test('14. Boss 被打败立即胜利结算（心魔已除），不用撑到天亮', async ({ page }) => {
    test.setTimeout(200000);
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

    // The boss spawns with only 31s left on the clock, not enough for a
    // level-1 sword to chew through 120 HP while normal enemies swarm.
    // Extend the clock so the fight itself is what ends the run.
    await page.evaluate(() => {
      window.__NIGHT_ALLEY_DEBUG__?.setTimeLeft(120);
    });

    // Keep the player alive and the game unpaused while the sword works
    // the boss down. Level-up modals pause the game, so pick a choice
    // whenever one opens (sword upgrades first, to raise boss DPS);
    // heal whenever HP runs low.
    const deadline = Date.now() + 160000;
    let sawBossDying = false;
    let cinematicShot = false;
    // Lethal-hit snapshot (frozen inside damageEnemyAt, not polled): the
    // settlement must match these exactly.
    let snapshotKills: number | null = null;
    let snapshotMaxConcurrent: number | null = null;
    let snapshotKillsByKind: KillCountsByKind | null = null;
    while (Date.now() < deadline) {
      const state = await getDebugState(page);
      if (state.scene === 'GameOverScene') {
        break;
      }
      if (state.bossDying) {
        sawBossDying = true;
        // Snapshot the lethal-hit counters. Polling state.kills here would
        // be too late: same-update kills after the boss land in the same
        // frame, before any poll observes bossDying — only the snapshot
        // taken inside damageEnemyAt predates them.
        if (snapshotKills === null) {
          snapshotKills = state.bossKillKills;
          snapshotMaxConcurrent = state.bossKillMaxConcurrent;
          snapshotKillsByKind = { ...state.killsByKind };
          expect(snapshotKillsByKind.boss).toBe(1);
          const kindSum = Object.values(snapshotKillsByKind).reduce((sum, n) => sum + n, 0);
          expect(kindSum).toBe(snapshotKills);
        } else {
          expect(state.killsByKind).toEqual(snapshotKillsByKind);
        }
        if (!cinematicShot) {
          cinematicShot = true;
          // Capture the slow-motion shatter mid-cinematic.
          await page.screenshot({
            path: path.join(POLISH_SCREENSHOT_DIR, 'boss-death-slowmo.png'),
          });
        }
      }
      if (state.isLevelUpOpen && state.levelUpChoices.length > 0) {
        const swordChoice =
          state.levelUpChoices.find((c) => c.id === 'evo:peach_sword') ??
          state.levelUpChoices.find((c) => c.id.startsWith('upg:peach_sword:'));
        const choice = swordChoice ?? state.levelUpChoices[0];
        await page.waitForTimeout(500);
        await clickLogical(page, choice.x, choice.y);
      } else if (state.hp < 15) {
        await page.evaluate(() => {
          window.__NIGHT_ALLEY_DEBUG__?.setHp(30);
        });
      }
      await page.waitForTimeout(400);
    }

    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'GameOverScene',
      undefined,
      { timeout: 10000 },
    );

    await page.screenshot({ path: path.join(POLISH_SCREENSHOT_DIR, 'boss-kill-win.png') });

    const overState = await getDebugState(page);
    expect(overState.settlement).not.toBeNull();
    expect(overState.settlement!.won).toBe(true);
    expect(overState.settlement!.winReason).toBe('boss');
    // A boss-kill win ends the run early, before the 180s dawn.
    expect(overState.settlement!.survivedSeconds).toBeLessThan(180);
    // The boss death runs a 1.4s slow-motion shatter before the win
    // settles; the loop must have observed that cinematic state.
    expect(sawBossDying).toBe(true);
    // Settlement counters freeze at the lethal hit: the round timer stops
    // when the boss starts dying, so kills / maxConcurrent recorded after
    // that moment would report activity the survived time never covered.
    // (Codex round-3 Block: same-update sword/lantern/dart kills and
    // cinematic spawns used to leak in.) The damage guard (damageEnemyAt
    // returns while bossDying) and the spawn guard (updateSpawning returns
    // while bossDying) freeze both counters.
    expect(snapshotKills).not.toBeNull();
    expect(overState.settlement!.kills).toBe(snapshotKills);
    expect(overState.settlement!.maxConcurrent).toBe(snapshotMaxConcurrent);
    expect(overState.settlement!.killsByKind).toEqual(snapshotKillsByKind);
    expect(overState.killsByKind).toEqual(snapshotKillsByKind);

    await clickLogical(page, 680, 405);
    await page.waitForFunction(
      () => window.__NIGHT_ALLEY_DEBUG__?.getState().scene === 'BestiaryScene',
    );
    const bestiaryState = await getDebugState(page);
    expect(bestiaryState.killsByKind.boss).toBe(1);
    expect(bestiaryState.killsByKind).toEqual(snapshotKillsByKind);
  });
});
