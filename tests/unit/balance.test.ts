import { describe, expect, it } from 'vitest';
import {
  enemyStatsAt,
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
  it('starts at 1.2s, decreases over time, and clamps at 0.35s', () => {
    expect(spawnIntervalAt(0)).toBeCloseTo(1.2, 6);
    expect(spawnIntervalAt(60)).toBeCloseTo(0.96, 6);
    expect(spawnIntervalAt(180)).toBeCloseTo(0.48, 6);
    expect(spawnIntervalAt(212.5)).toBeCloseTo(0.35, 6);
    expect(spawnIntervalAt(250)).toBe(0.35);
    expect(spawnIntervalAt(1000)).toBe(0.35);
    expect(spawnIntervalAt(-10)).toBeCloseTo(1.2, 6);
  });
});

describe('enemyStatsAt', () => {
  it('scales HP and speed up over time while keeping contact stats fixed', () => {
    const start = enemyStatsAt(0);
    expect(start.maxHp).toBe(8);
    expect(start.speed).toBeCloseTo(55, 6);
    expect(start.contactDamage).toBe(2);
    expect(start.attackCooldown).toBe(0.5);

    const mid = enemyStatsAt(90);
    expect(mid.maxHp).toBe(11);
    expect(mid.speed).toBeCloseTo(55 * 1.2, 6);

    const end = enemyStatsAt(180);
    expect(end.maxHp).toBe(14);
    expect(end.speed).toBeCloseTo(55 * 1.4, 6);

    expect(end.maxHp).toBeGreaterThan(mid.maxHp);
    expect(mid.maxHp).toBeGreaterThan(start.maxHp);
    expect(end.speed).toBeGreaterThan(mid.speed);
    expect(mid.speed).toBeGreaterThan(start.speed);
  });
});
