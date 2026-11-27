import fs from 'node:fs';
import path from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { xpNeededForLevel } from '../../src/game/balance.ts';
import type { DebugChoiceInfo, DebugState } from '../../src/game/debug.ts';
import { clickLogical, getDebugState, startGame } from './helpers.ts';

const POLISH_SCREENSHOT_DIR = path.resolve(process.cwd(), '../polish-stage3-screenshots');

async function triggerNextLevelUp(page: Page): Promise<DebugState> {
  await page.evaluate(() => {
    const dbg = window.__NIGHT_ALLEY_DEBUG__;
    if (!dbg) {
      throw new Error('Missing __NIGHT_ALLEY_DEBUG__');
    }
    const state = dbg.getState();
    const needed = 5 + state.level * 3;
    const delta = Math.max(1, needed - state.xp);
    dbg.addXp(delta);
  });

  await page.waitForFunction(
    () => window.__NIGHT_ALLEY_DEBUG__?.getState().isLevelUpOpen === true,
  );
  return getDebugState(page);
}

async function pickChoice(page: Page, choice: DebugChoiceInfo): Promise<void> {
  // The modal ignores clicks for the first 400ms (mis-tap guard).
  await page.waitForTimeout(500);
  await clickLogical(page, choice.x, choice.y);
  await page.waitForFunction(
    () => window.__NIGHT_ALLEY_DEBUG__?.getState().isLevelUpOpen === false,
  );
}

test.describe('Night Alley weapon evolution', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('peach sword evolves via evo:peach_sword, updates HUD loadout, and does not reappear', async ({
    page,
  }) => {
    await startGame(page);

    const MAX_LEVEL_UPS = 40;
    const POST_EVO_LEVEL_UPS = 6;

    let levelUps = 0;
    let swordUpgrades = 0;
    let evolved = false;

    await test.step('level up peach sword until evo:peach_sword appears and select it', async () => {
      // Keep formula reference live so unused import does not occur; matches triggerNextLevelUp
      expect(xpNeededForLevel(1)).toBe(8);

      for (let i = 0; i < MAX_LEVEL_UPS; i += 1) {
        const modalState = await triggerNextLevelUp(page);
        levelUps += 1;

        const evoChoice = modalState.levelUpChoices.find((c) => c.id === 'evo:peach_sword');
        if (evoChoice) {
          await pickChoice(page, evoChoice);
          evolved = true;
          // The evolution banner shows for 2.5s after the pick; capture it
          // while it is still up.
          fs.mkdirSync(POLISH_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(POLISH_SCREENSHOT_DIR, 'evolution-banner.png'),
          });
          break;
        }

        const swordChoice = modalState.levelUpChoices.find((c) =>
          c.id.startsWith('upg:peach_sword:'),
        );
        if (swordChoice) {
          swordUpgrades += 1;
          await pickChoice(page, swordChoice);
          continue;
        }

        const statChoice = modalState.levelUpChoices.find((c) => c.id.startsWith('stat:'));
        await pickChoice(page, statChoice ?? modalState.levelUpChoices[0]);
      }

      if (!evolved) {
        const stage =
          swordUpgrades < 4
            ? `peach_sword only reached ${swordUpgrades} upgrades (< 4 needed for Lv.5)`
            : `peach_sword had ${swordUpgrades} upgrades (Lv.5+), but evo:peach_sword never appeared`;
        throw new Error(
          `Failed to evolve peach_sword within ${levelUps} level-ups: ${stage}`,
        );
      }

      const afterEvo = await getDebugState(page);
      expect(afterEvo.evolvedWeapons).toContain('peach_sword');
      expect(afterEvo.loadoutText).toContain('破魔法剑');
    });

    await test.step('evolved sword upgrade cards show the evolved name, not 桃木剑', async () => {
      // After evolution the sword's two upgrade cards must read
      // 破魔法剑 · 锐利 / 破魔法剑 · 候锋 (or whichever suffixes appear).
      let sawEvolvedUpgrade = false;
      for (let i = 0; i < POST_EVO_LEVEL_UPS; i += 1) {
        const modalState = await triggerNextLevelUp(page);
        const swordUpgrade = modalState.levelUpChoices.find((c) =>
          c.id.startsWith('upg:peach_sword:'),
        );
        if (swordUpgrade) {
          expect(swordUpgrade.title.startsWith('破魔法剑 · ')).toBe(true);
          expect(swordUpgrade.title).not.toContain('桃木剑');
          sawEvolvedUpgrade = true;
          await pickChoice(page, swordUpgrade);
          break;
        }
        await pickChoice(page, modalState.levelUpChoices[0]);
      }
      expect(sawEvolvedUpgrade).toBe(true);
    });

    await test.step('evo:peach_sword does not appear in subsequent level-ups', async () => {
      for (let i = 0; i < POST_EVO_LEVEL_UPS; i += 1) {
        const modalState = await triggerNextLevelUp(page);
        const hasDuplicateEvo = modalState.levelUpChoices.some((c) => c.id === 'evo:peach_sword');
        expect(hasDuplicateEvo).toBe(false);
        await pickChoice(page, modalState.levelUpChoices[0]);
      }
    });
  });
});
