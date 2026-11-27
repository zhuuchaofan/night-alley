import { describe, expect, it } from 'vitest';
import { GAME_PIXEL_ART } from '../../src/data/pixelart.ts';
import {
  ELITE_HP_MULT,
  ELITE_RADIUS,
  ELITE_SPEED_MULT,
  ELITE_XP_ORBS,
  enemyStatsAt,
  enemyStatsForKind,
  pickSpawnKind,
  SHOOTER_BOLT_DAMAGE,
  SHOOTER_BOLT_RADIUS,
  SHOOTER_BOLT_SPEED,
  SHOOTER_FIRE_COOLDOWN,
  SHOOTER_RADIUS,
  SHOOTER_RANGE,
  SHOOTER_RETREAT_DIST,
  SHOOTER_SPEED_MULT,
  SPAWN_WEIGHT_ELITE,
  SPAWN_WEIGHT_SHOOTER_MAX,
  SPAWN_WEIGHT_SWIFT_MAX,
  spawnWeightsAt,
  SWIFT_HP,
  SWIFT_RADIUS,
  SWIFT_SPEED_MULT,
  type SpawnEnemyKind,
} from '../../src/game/balance.ts';
import { validatePixelRows } from '../../src/game/pixelart.ts';

function sampleSpawnCounts(elapsedSeconds: number, samples = 1000): Record<SpawnEnemyKind, number> {
  const counts: Record<SpawnEnemyKind, number> = {
    paper: 0,
    lantern: 0,
    swift: 0,
    shooter: 0,
    elite: 0,
  };
  for (let i = 0; i < samples; i += 1) {
    const r = (i + 0.5) / samples;
    counts[pickSpawnKind(elapsedSeconds, r)] += 1;
  }
  return counts;
}

describe('enemy variety spawn weights and picker', () => {
  it('spawnWeightsAt always sums to 1 across the full 3-minute round', () => {
    for (const t of [0, 15, 30, 60, 90, 120, 150, 180]) {
      const w = spawnWeightsAt(t);
      const sum = w.paper + w.lantern + w.swift + w.shooter + w.elite;
      expect(sum).toBeCloseTo(1, 10);
      expect(w.elite).toBeCloseTo(SPAWN_WEIGHT_ELITE, 10);
      expect(w.lantern).toBeCloseTo((w.paper + w.lantern) / 3, 10);
    }
  });

  it('at t=0s has 0 swift/shooter, elite ~ SPAWN_WEIGHT_ELITE, and paper/lantern 2:1', () => {
    const counts = sampleSpawnCounts(0, 1000);
    expect(counts.swift).toBe(0);
    expect(counts.shooter).toBe(0);
    expect(Math.abs(counts.elite / 1000 - SPAWN_WEIGHT_ELITE)).toBeLessThanOrEqual(0.03);
    const remaining = 1 - SPAWN_WEIGHT_ELITE;
    expect(Math.abs(counts.lantern / 1000 - remaining / 3)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(counts.paper / 1000 - (remaining * 2) / 3)).toBeLessThanOrEqual(0.03);
  });

  it('at t=120s ramps swift to ~25% and shooter to ~15% within +-3%', () => {
    const counts = sampleSpawnCounts(120, 1000);
    expect(Math.abs(counts.swift / 1000 - SPAWN_WEIGHT_SWIFT_MAX)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(counts.shooter / 1000 - SPAWN_WEIGHT_SHOOTER_MAX)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(counts.elite / 1000 - SPAWN_WEIGHT_ELITE)).toBeLessThanOrEqual(0.03);
    const remaining = 1 - SPAWN_WEIGHT_ELITE - SPAWN_WEIGHT_SWIFT_MAX - SPAWN_WEIGHT_SHOOTER_MAX;
    expect(Math.abs(counts.lantern / 1000 - remaining / 3)).toBeLessThanOrEqual(0.03);
  });
});

describe('enemy variety stats', () => {
  it('computes swift, shooter, elite, paper, and lantern stats consistently', () => {
    for (const t of [0, 60, 120, 180]) {
      const base = enemyStatsAt(t);

      const swift = enemyStatsForKind('swift', t);
      expect(swift.maxHp).toBe(SWIFT_HP);
      expect(swift.speed).toBeCloseTo(base.speed * SWIFT_SPEED_MULT, 6);
      expect(swift.radius).toBe(SWIFT_RADIUS);
      expect(swift.contactDamage).toBe(base.contactDamage);
      expect(swift.attackCooldown).toBe(base.attackCooldown);

      const shooter = enemyStatsForKind('shooter', t);
      expect(shooter.maxHp).toBe(base.maxHp);
      expect(shooter.speed).toBeCloseTo(base.speed * SHOOTER_SPEED_MULT, 6);
      expect(shooter.radius).toBe(SHOOTER_RADIUS);

      const elite = enemyStatsForKind('elite', t);
      expect(elite.maxHp).toBe(Math.floor(base.maxHp * ELITE_HP_MULT));
      expect(elite.speed).toBeCloseTo(base.speed * ELITE_SPEED_MULT, 6);
      expect(elite.radius).toBe(ELITE_RADIUS);
      expect(elite.contactDamage).toBe(base.contactDamage);
      expect(elite.attackCooldown).toBe(base.attackCooldown);

      expect(enemyStatsForKind('paper', t)).toEqual(base);
      expect(enemyStatsForKind('lantern', t)).toEqual(base);
    }

    expect(SHOOTER_RANGE).toBe(200);
    expect(SHOOTER_RETREAT_DIST).toBe(120);
    expect(SHOOTER_FIRE_COOLDOWN).toBe(3.0);
    expect(SHOOTER_BOLT_SPEED).toBe(110);
    expect(SHOOTER_BOLT_RADIUS).toBe(5);
    expect(SHOOTER_BOLT_DAMAGE).toBe(1);
    expect(ELITE_XP_ORBS).toBe(3);
  });

  it('registers valid 32x32 pixel art for all new enemy sprites and enemy_bolt', () => {
    for (const key of ['enemy_swift', 'enemy_shooter', 'enemy_elite', 'enemy_bolt'] as const) {
      expect(GAME_PIXEL_ART).toHaveProperty(key);
      const res = validatePixelRows(GAME_PIXEL_ART[key]);
      expect(res.valid, `${key}: ${res.errors.join(', ')}`).toBe(true);
    }
  });
});
