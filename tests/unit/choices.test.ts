import { describe, expect, it } from 'vitest';
import { createInitialPlayerStats, createInitialWeapon } from '../../src/game/balance.ts';
import { applyChoice, buildChoicePool, generateChoices } from '../../src/game/choices.ts';

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('generateChoices', () => {
  it('always returns 3 distinct options across weapon ownership states', () => {
    const start = createInitialPlayerStats();

    const twoWeapons = createInitialPlayerStats();
    twoWeapons.weapons.coin_dart = createInitialWeapon('coin_dart');

    const allWeapons = createInitialPlayerStats();
    allWeapons.weapons.coin_dart = createInitialWeapon('coin_dart');
    allWeapons.weapons.lantern_fire = createInitialWeapon('lantern_fire');

    for (const stats of [start, twoWeapons, allWeapons]) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const picked = generateChoices(stats, createSeededRng(seed));
        expect(picked).toHaveLength(3);
        const ids = new Set(picked.map((opt) => opt.id));
        expect(ids.size).toBe(3);
      }
    }
  });

  it('offers new_weapon only for unowned weapons and weapon_upgrade only for owned weapons', () => {
    const start = createInitialPlayerStats();
    const startPool = buildChoicePool(start);

    const startNewWeapons = startPool
      .filter((o) => o.category === 'new_weapon')
      .map((o) => o.weaponId);
    expect(startNewWeapons).toEqual(['coin_dart', 'lantern_fire']);

    const startUpgrades = startPool
      .filter((o) => o.category === 'weapon_upgrade')
      .map((o) => o.weaponId);
    expect(startUpgrades).toEqual(['peach_sword', 'peach_sword']);

    const allWeapons = createInitialPlayerStats();
    allWeapons.weapons.coin_dart = createInitialWeapon('coin_dart');
    allWeapons.weapons.lantern_fire = createInitialWeapon('lantern_fire');
    const fullPool = buildChoicePool(allWeapons);

    expect(fullPool.filter((o) => o.category === 'new_weapon')).toHaveLength(0);
    expect(fullPool.filter((o) => o.category === 'weapon_upgrade')).toHaveLength(6);
  });
});

describe('applyChoice', () => {
  it('adds a new weapon cleanly without mutating previous stats', () => {
    const stats = createInitialPlayerStats();
    const dartOpt = buildChoicePool(stats).find((o) => o.id === 'new:coin_dart')!;
    const updated = applyChoice(stats, dartOpt);

    expect(stats.weapons.coin_dart).toBeUndefined();
    expect(updated.weapons.coin_dart).toBeDefined();
    expect(updated.weapons.coin_dart?.level).toBe(1);
    expect(updated.weapons.coin_dart?.damage).toBe(5);
  });

  it('upgrades weapon damage, cooldown, count, and range', () => {
    const stats = createInitialPlayerStats();
    stats.weapons.coin_dart = createInitialWeapon('coin_dart');
    stats.weapons.lantern_fire = createInitialWeapon('lantern_fire');

    const pool = buildChoicePool(stats);
    const swordDmg = pool.find((o) => o.id === 'upg:peach_sword:damage')!;
    const swordSpd = pool.find((o) => o.id === 'upg:peach_sword:speed')!;
    const dartCnt = pool.find((o) => o.id === 'upg:coin_dart:count')!;
    const lanternRng = pool.find((o) => o.id === 'upg:lantern_fire:range')!;

    let next = applyChoice(stats, swordDmg);
    expect(next.weapons.peach_sword?.damage).toBeCloseTo(6 * 1.3, 6);
    expect(next.weapons.peach_sword?.level).toBe(2);

    next = applyChoice(next, swordSpd);
    expect(next.weapons.peach_sword?.cooldown).toBeCloseTo(0.8 / 1.2, 6);
    expect(next.weapons.peach_sword?.level).toBe(3);

    next = applyChoice(next, dartCnt);
    expect(next.weapons.coin_dart?.count).toBe(2);

    next = applyChoice(next, lanternRng);
    expect(next.weapons.lantern_fire?.range).toBeCloseTo(90 * 1.3, 6);
  });

  it('applies all four player stat upgrades including HP cap and heal', () => {
    const stats = createInitialPlayerStats();
    stats.hp = 15;
    const pool = buildChoicePool(stats);

    let next = applyChoice(stats, pool.find((o) => o.id === 'stat:damage')!);
    expect(next.damageMultiplier).toBeCloseTo(1.2, 6);

    next = applyChoice(next, pool.find((o) => o.id === 'stat:speed')!);
    expect(next.speed).toBeCloseTo(160 * 1.15, 6);

    next = applyChoice(next, pool.find((o) => o.id === 'stat:hp')!);
    expect(next.maxHp).toBe(40);
    expect(next.hp).toBe(25);

    next = applyChoice(next, pool.find((o) => o.id === 'stat:pickup')!);
    expect(next.pickupRadius).toBeCloseTo(60 * 1.4, 6);
  });
});
