import { describe, expect, it } from 'vitest';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BOSS_XP_ORBS,
  HUD_HEIGHT,
  PLAYER_RADIUS,
} from '../../src/game/balance.ts';
import {
  applyKnockbackImpulse,
  BOSS_RENDER_HALF_WIDTH,
  canMergeDamageNumber,
  computeBossOrbSpawnPos,
  computeClampedRenderPos,
  computeDamageNumberAlpha,
  computeDamageNumberPos,
  computeOrbScatterOffset,
  computeOrbScatterVelocity,
  computeSwingPose,
  DAMAGE_NUMBER_DURATION,
  DAMAGE_NUMBER_HUD_PADDING,
  DAMAGE_NUMBER_MARGIN_X,
  DAMAGE_NUMBER_MAX_MERGED_LIFE,
  DAMAGE_NUMBER_MERGE_WINDOW,
  decayKnockbackOffset,
  ENEMY_RENDER_HALF_WIDTH,
  formatDamageNumber,
  KNOCKBACK_MAX_BOSS,
  KNOCKBACK_MAX_NORMAL,
  SWING_ANIM_DURATION,
} from '../../src/game/gameFeel.ts';
import { PIXEL_FONT_DATA } from '../../src/game/pixelFont.ts';

describe('gameFeel helpers', () => {
  it('computes 2-frame swing pose aligned to attack angle and fallback facing', () => {
    const inactive = computeSwingPose(0, Math.PI, true);
    expect(inactive.active).toBe(false);
    expect(inactive.flipX).toBe(true);
    expect(inactive.rotation).toBe(0);

    // Early phase -> player_swing_1, attacking up-right
    const earlyRight = computeSwingPose(SWING_ANIM_DURATION * 0.9, -Math.PI / 4, false);
    expect(earlyRight.active).toBe(true);
    expect(earlyRight.textureKey).toBe('player_swing_1');
    expect(earlyRight.flipX).toBe(false);
    expect(earlyRight.rotation).toBeLessThan(0);

    // Late phase -> player_swing_2, attacking down-left
    const lateLeft = computeSwingPose(SWING_ANIM_DURATION * 0.2, (3 * Math.PI) / 4, false);
    expect(lateLeft.active).toBe(true);
    expect(lateLeft.textureKey).toBe('player_swing_2');
    expect(lateLeft.flipX).toBe(true);
    // Attacking downward tilts blade downward even when flipped horizontally
    expect(lateLeft.rotation).toBeLessThan(0);

    // Straight up keeps fallback facing
    const straightUp = computeSwingPose(SWING_ANIM_DURATION * 0.5, -Math.PI / 2, true);
    expect(straightUp.flipX).toBe(true);
  });

  it('applies bounded render-only knockback and decays cleanly to zero', () => {
    let offset = applyKnockbackImpulse(0, 0, 100, 100, 150, 100, false);
    expect(offset.x).toBeGreaterThan(0);
    expect(Math.abs(offset.y)).toBeLessThan(1e-6);
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(KNOCKBACK_MAX_NORMAL + 1e-6);

    // Repeated hits stay capped
    for (let i = 0; i < 5; i += 1) {
      offset = applyKnockbackImpulse(offset.x, offset.y, 100, 100, 150, 100, false);
    }
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(KNOCKBACK_MAX_NORMAL, 5);

    // Boss uses smaller cap
    let bossOffset = applyKnockbackImpulse(0, 0, 100, 100, 150, 100, true);
    bossOffset = applyKnockbackImpulse(bossOffset.x, bossOffset.y, 100, 100, 150, 100, true);
    expect(Math.hypot(bossOffset.x, bossOffset.y)).toBeCloseTo(KNOCKBACK_MAX_BOSS, 5);

    // Decay shrinks and snaps to exact zero
    const half = decayKnockbackOffset(offset.x, offset.y, 0.05);
    expect(Math.hypot(half.x, half.y)).toBeLessThan(Math.hypot(offset.x, offset.y));

    const zeroed = decayKnockbackOffset(half.x, half.y, 1.0);
    expect(zeroed).toEqual({ x: 0, y: 0 });
  });

  it('clamps render knockback by sprite visible half-width without teleporting off-screen spawns', () => {
    const clampedNormalRightTop = computeClampedRenderPos(
      ARENA_WIDTH - ENEMY_RENDER_HALF_WIDTH - 2,
      HUD_HEIGHT + ENEMY_RENDER_HALF_WIDTH + 1,
      12,
      -10,
      ENEMY_RENDER_HALF_WIDTH,
    );
    expect(clampedNormalRightTop.x).toBe(ARENA_WIDTH - ENEMY_RENDER_HALF_WIDTH);
    expect(clampedNormalRightTop.y).toBe(HUD_HEIGHT + ENEMY_RENDER_HALF_WIDTH);

    const clampedNormalBottom = computeClampedRenderPos(
      100,
      ARENA_HEIGHT - ENEMY_RENDER_HALF_WIDTH - 1,
      0,
      12,
      ENEMY_RENDER_HALF_WIDTH,
    );
    expect(clampedNormalBottom.y).toBe(ARENA_HEIGHT - ENEMY_RENDER_HALF_WIDTH);

    const clampedBoss = computeClampedRenderPos(
      ARENA_WIDTH - BOSS_RENDER_HALF_WIDTH - 1,
      HUD_HEIGHT + BOSS_RENDER_HALF_WIDTH + 2,
      5,
      -5,
      BOSS_RENDER_HALF_WIDTH,
    );
    expect(clampedBoss.x).toBe(ARENA_WIDTH - BOSS_RENDER_HALF_WIDTH);
    expect(clampedBoss.y).toBe(HUD_HEIGHT + BOSS_RENDER_HALF_WIDTH);

    // Wall-hugging enemy already inside half-width stays at its logical position without inward snap
    const wallHugger = computeClampedRenderPos(20, 200, -10, 0, ENEMY_RENDER_HALF_WIDTH);
    expect(wallHugger).toEqual({ x: 20, y: 200 });

    const offscreenNormal = computeClampedRenderPos(-30, 200, 0, 0, ENEMY_RENDER_HALF_WIDTH);
    expect(offscreenNormal).toEqual({ x: -30, y: 200 });

    const offscreenBoss = computeClampedRenderPos(ARENA_WIDTH + 30, 200, 0, 0, BOSS_RENDER_HALF_WIDTH);
    expect(offscreenBoss).toEqual({ x: ARENA_WIDTH + 30, y: 200 });
  });

  it('clamps floating damage numbers consistently on both create and merge paths', () => {
    // Merge path (no spread) near left/top/right walls
    const mergedTopLeft = computeDamageNumberPos(4, HUD_HEIGHT + 5, 24);
    expect(mergedTopLeft.x).toBe(DAMAGE_NUMBER_MARGIN_X);
    expect(mergedTopLeft.y).toBe(HUD_HEIGHT + DAMAGE_NUMBER_HUD_PADDING);

    const mergedTopRightBoss = computeDamageNumberPos(ARENA_WIDTH - 5, HUD_HEIGHT + 12, 42);
    expect(mergedTopRightBoss.x).toBe(ARENA_WIDTH - DAMAGE_NUMBER_MARGIN_X);
    expect(mergedTopRightBoss.y).toBe(HUD_HEIGHT + DAMAGE_NUMBER_HUD_PADDING);

    // Create path with ±6 spread still respects bounds near edges and spreads in interior
    const createdEdge = computeDamageNumberPos(16, HUD_HEIGHT + 80, 24, -6);
    expect(createdEdge.x).toBe(DAMAGE_NUMBER_MARGIN_X);
    expect(createdEdge.y).toBe(HUD_HEIGHT + 56);

    const createdInterior = computeDamageNumberPos(400, 300, 24, 6);
    expect(createdInterior).toEqual({ x: 406, y: 276 });
  });

  it('formats damage numbers with only ASCII digits present in pixelFont', () => {
    const formatted = [formatDamageNumber(1.4), formatDamageNumber(6), formatDamageNumber(12.6)];
    expect(formatted).toEqual(['1', '6', '13']);
    expect(formatDamageNumber(0.2)).toBe('1');
    for (const s of formatted) {
      for (const ch of s) {
        expect(PIXEL_FONT_DATA.glyphs[ch]).toBeDefined();
      }
    }
  });

  it('computes damage number fade alpha and merge window eligibility', () => {
    expect(computeDamageNumberAlpha(DAMAGE_NUMBER_DURATION)).toBe(1);
    expect(computeDamageNumberAlpha(DAMAGE_NUMBER_DURATION * 0.5)).toBe(1);
    expect(computeDamageNumberAlpha(DAMAGE_NUMBER_DURATION * 0.1)).toBeGreaterThan(0);
    expect(computeDamageNumberAlpha(0)).toBe(0);

    expect(
      canMergeDamageNumber(
        { enemyId: 3, sinceLastHit: DAMAGE_NUMBER_MERGE_WINDOW * 0.5, totalLife: 0.2 },
        3,
      ),
    ).toBe(true);
    expect(
      canMergeDamageNumber(
        { enemyId: 3, sinceLastHit: DAMAGE_NUMBER_MERGE_WINDOW + 0.01, totalLife: 0.2 },
        3,
      ),
    ).toBe(false);
    expect(
      canMergeDamageNumber(
        { enemyId: 3, sinceLastHit: 0.05, totalLife: DAMAGE_NUMBER_MAX_MERGED_LIFE + 0.01 },
        3,
      ),
    ).toBe(false);
    expect(
      canMergeDamageNumber({ enemyId: 3, sinceLastHit: 0.05, totalLife: 0.1 }, 4),
    ).toBe(false);
  });

  it('computes outward orb scatter velocities for single and boss bursts', () => {
    const single = computeOrbScatterVelocity(0, 1, () => 0.5);
    expect(Math.hypot(single.vx, single.vy)).toBeGreaterThan(70);
    expect(single.duration).toBeGreaterThan(0);
    expect(single.hopPeak).toBeGreaterThan(0);

    const boss0 = computeOrbScatterVelocity(0, 20, () => 0.5);
    const boss10 = computeOrbScatterVelocity(10, 20, () => 0.5);
    expect(boss0.vx).toBeGreaterThan(0);
    expect(boss10.vx).toBeLessThan(0);
  });

  it('computes render-only orb scatter offset that peaks mid-flight and returns to zero', () => {
    const maxTimer = 0.24;
    expect(computeOrbScatterOffset(100, -50, maxTimer, maxTimer)).toEqual({ x: 0, y: -0 });
    expect(computeOrbScatterOffset(100, -50, 0, maxTimer)).toEqual({ x: 0, y: 0 });
    expect(computeOrbScatterOffset(100, -50, -0.1, maxTimer)).toEqual({ x: 0, y: 0 });

    const mid = computeOrbScatterOffset(100, -50, maxTimer * 0.5, maxTimer);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(0);
  });

  it('distributes Boss XP orbs radially 10-42px around death point and clamps inside arena', () => {
    const originX = 480;
    const originY = 300;
    const angles = new Set<number>();
    for (let k = 0; k < BOSS_XP_ORBS; k += 1) {
      const pos = computeBossOrbSpawnPos(originX, originY, k, BOSS_XP_ORBS, () => 0.5);
      const dist = Math.hypot(pos.x - originX, pos.y - originY);
      expect(dist).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(dist).toBeLessThanOrEqual(42 + 1e-6);
      angles.add(Math.round(Math.atan2(pos.y - originY, pos.x - originX) * 10));
    }
    expect(angles.size).toBeGreaterThanOrEqual(10);

    const cornerOrb = computeBossOrbSpawnPos(0, 0, 10, BOSS_XP_ORBS, () => 0.5);
    expect(cornerOrb.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(cornerOrb.x).toBeLessThanOrEqual(ARENA_WIDTH - PLAYER_RADIUS);
    expect(cornerOrb.y).toBeGreaterThanOrEqual(HUD_HEIGHT + PLAYER_RADIUS);
    expect(cornerOrb.y).toBeLessThanOrEqual(ARENA_HEIGHT - PLAYER_RADIUS);
  });
});
