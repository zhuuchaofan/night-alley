import { describe, expect, it } from 'vitest';
import { ARENA_HEIGHT, ARENA_WIDTH, ENEMY_RADIUS, HUD_HEIGHT } from '../../src/game/balance.ts';
import {
  applyKnockbackImpulse,
  canMergeDamageNumber,
  computeClampedRenderPos,
  computeDamageNumberAlpha,
  computeOrbScatterVelocity,
  computeSwingPose,
  DAMAGE_NUMBER_DURATION,
  DAMAGE_NUMBER_MAX_MERGED_LIFE,
  DAMAGE_NUMBER_MERGE_WINDOW,
  decayKnockbackOffset,
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

  it('clamps render knockback inside arena bounds without teleporting off-screen spawns', () => {
    const clampedRightTop = computeClampedRenderPos(
      ARENA_WIDTH - ENEMY_RADIUS - 2,
      HUD_HEIGHT + ENEMY_RADIUS + 1,
      12,
      -10,
      ENEMY_RADIUS,
    );
    expect(clampedRightTop.x).toBe(ARENA_WIDTH - ENEMY_RADIUS);
    expect(clampedRightTop.y).toBe(HUD_HEIGHT + ENEMY_RADIUS);

    const clampedBottom = computeClampedRenderPos(
      100,
      ARENA_HEIGHT - ENEMY_RADIUS - 1,
      0,
      12,
      ENEMY_RADIUS,
    );
    expect(clampedBottom.y).toBe(ARENA_HEIGHT - ENEMY_RADIUS);

    const offscreen = computeClampedRenderPos(-30, 200, 0, 0, ENEMY_RADIUS);
    expect(offscreen).toEqual({ x: -30, y: 200 });
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
});
