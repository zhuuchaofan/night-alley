import { describe, expect, it } from 'vitest';
import {
  BOSS_ATTACK_COOLDOWN,
  BOSS_CONTACT_DAMAGE,
  BOSS_MAX_HP,
  BOSS_RADIUS,
  BOSS_SPAWN_ELAPSED_SECONDS,
  BOSS_SPEED,
  BOSS_STATS,
  BOSS_XP_ORBS,
  enemyStatsAt,
  ENEMY_RADIUS,
  MAX_ENEMIES,
  spawnIntervalAt,
  xpNeededForLevel,
} from '../../src/game/balance.ts';

describe('xpNeededForLevel', () => {
  it('follows 5 + L * 3 curve and increases monotonically', () => {
    expect(xpNeededForLevel(1)).toBe(8);
    expect(xpNeededForLevel(2)).toBe(11);
    expect(xpNeededForLevel(3)).toBe(14);
    expect(xpNeededForLevel(10)).toBe(35);

    for (let level = 1; level < 20; level += 1) {
      expect(xpNeededForLevel(level + 1)).toBeGreaterThan(xpNeededForLevel(level));
    }
  });
});

describe('spawnIntervalAt', () => {
  it('starts at 1.2s, decreases over time (slope 0.004), and clamps at 0.35s', () => {
    expect(spawnIntervalAt(0)).toBeCloseTo(1.2, 6);
    expect(spawnIntervalAt(60)).toBeCloseTo(0.96, 6);
    expect(spawnIntervalAt(120)).toBeCloseTo(0.72, 6);
    expect(spawnIntervalAt(180)).toBeCloseTo(0.48, 6);
    expect(spawnIntervalAt(212.5)).toBeCloseTo(0.35, 6);
    expect(spawnIntervalAt(250)).toBe(0.35);
    expect(spawnIntervalAt(1000)).toBe(0.35);
    expect(spawnIntervalAt(-10)).toBeCloseTo(1.2, 6);

    expect(spawnIntervalAt(60)).toBeLessThan(spawnIntervalAt(0));
    expect(spawnIntervalAt(120)).toBeLessThan(spawnIntervalAt(60));
    expect(spawnIntervalAt(180)).toBeLessThan(spawnIntervalAt(120));
  });
});

describe('enemyStatsAt', () => {
  it('scales HP and speed monotonically at t=0, 60, 120, 180 while keeping contact stats fixed', () => {
    const t0 = enemyStatsAt(0);
    expect(t0.maxHp).toBe(8);
    expect(t0.speed).toBeCloseTo(55, 6);
    expect(t0.contactDamage).toBe(2);
    expect(t0.attackCooldown).toBe(0.5);

    const t60 = enemyStatsAt(60);
    expect(t60.maxHp).toBe(10);
    expect(t60.speed).toBeCloseTo(55 * (1 + 0.4 / 3), 6);

    const t120 = enemyStatsAt(120);
    expect(t120.maxHp).toBe(12);
    expect(t120.speed).toBeCloseTo(55 * (1 + 0.8 / 3), 6);

    const t180 = enemyStatsAt(180);
    expect(t180.maxHp).toBe(14);
    expect(t180.speed).toBeCloseTo(55 * 1.4, 6);

    expect(t60.maxHp).toBeGreaterThan(t0.maxHp);
    expect(t120.maxHp).toBeGreaterThan(t60.maxHp);
    expect(t180.maxHp).toBeGreaterThan(t120.maxHp);

    expect(t60.speed).toBeGreaterThan(t0.speed);
    expect(t120.speed).toBeGreaterThan(t60.speed);
    expect(t180.speed).toBeGreaterThan(t120.speed);
  });
});

describe('Boss constants', () => {
  it('exposes consistent final boss constants and BOSS_STATS', () => {
    expect(BOSS_SPAWN_ELAPSED_SECONDS).toBe(150);
    expect(BOSS_MAX_HP).toBe(120);
    expect(BOSS_SPEED).toBe(85);
    expect(BOSS_CONTACT_DAMAGE).toBe(4);
    expect(BOSS_ATTACK_COOLDOWN).toBe(1.75);
    expect(BOSS_RADIUS).toBe(24);
    expect(BOSS_XP_ORBS).toBe(20);
    expect(BOSS_STATS).toEqual({
      maxHp: BOSS_MAX_HP,
      speed: BOSS_SPEED,
      contactDamage: BOSS_CONTACT_DAMAGE,
      attackCooldown: BOSS_ATTACK_COOLDOWN,
      radius: BOSS_RADIUS,
    });
  });

  it('boss is strictly bigger, faster and harder-hitting than a normal enemy', () => {
    expect(MAX_ENEMIES).toBe(65);
    expect(BOSS_RADIUS).toBeGreaterThan(ENEMY_RADIUS);
    expect(BOSS_SPEED).toBeGreaterThan(enemyStatsAt(180).speed);
    expect(BOSS_CONTACT_DAMAGE).toBeGreaterThan(enemyStatsAt(180).contactDamage);
  });
});
