import { describe, expect, it } from 'vitest';
import {
  createInitialPlayerStats,
  createInitialWeapon,
  displayWeaponName,
  EVOLUTION_DEFS,
  WEAPON_DEFS,
  WEAPON_ORDER,
} from '../../src/game/balance.ts';
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

describe('weapon evolution', () => {
  it('offers evolution card only at level >= 5 and replaces the 2 normal upgrades', () => {
    const lv4Stats = createInitialPlayerStats();
    lv4Stats.weapons.peach_sword!.level = 4;
    const lv4Pool = buildChoicePool(lv4Stats);
    expect(lv4Pool.filter((o) => o.category === 'evolution')).toHaveLength(0);
    expect(
      lv4Pool.filter((o) => o.category === 'weapon_upgrade' && o.weaponId === 'peach_sword'),
    ).toHaveLength(2);

    const lv5Stats = createInitialPlayerStats();
    lv5Stats.weapons.peach_sword!.level = 5;
    const lv5Pool = buildChoicePool(lv5Stats);
    const evos = lv5Pool.filter((o) => o.category === 'evolution');
    expect(evos).toHaveLength(1);
    expect(evos[0]).toMatchObject({
      id: 'evo:peach_sword',
      category: 'evolution',
      title: EVOLUTION_DEFS.peach_sword.name,
      weaponId: 'peach_sword',
    });
    expect(evos[0].description).toContain('进化');
    expect(
      lv5Pool.filter((o) => o.category === 'weapon_upgrade' && o.weaponId === 'peach_sword'),
    ).toHaveLength(0);

    // Unowned weapons and stat options remain intact; generateChoices still yields 3 distinct options
    expect(lv5Pool.filter((o) => o.category === 'new_weapon')).toHaveLength(2);
    expect(lv5Pool.filter((o) => o.category === 'stat')).toHaveLength(4);

    const allLv5 = createInitialPlayerStats();
    for (const id of WEAPON_ORDER) {
      allLv5.weapons[id] = { ...createInitialWeapon(id), level: 5 };
    }
    const picked = generateChoices(allLv5, createSeededRng(42));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((o) => o.id)).size).toBe(3);
  });

  it('applies exact evolution bonuses without changing level and mutating input', () => {
    const stats = createInitialPlayerStats();
    stats.weapons.peach_sword!.level = 5;
    stats.weapons.coin_dart = { ...createInitialWeapon('coin_dart'), level: 5 };
    stats.weapons.lantern_fire = { ...createInitialWeapon('lantern_fire'), level: 5 };

    const pool = buildChoicePool(stats);
    const evoSword = pool.find((o) => o.id === 'evo:peach_sword')!;
    const evoDart = pool.find((o) => o.id === 'evo:coin_dart')!;
    const evoLantern = pool.find((o) => o.id === 'evo:lantern_fire')!;

    let next = applyChoice(stats, evoSword);
    expect(stats.weapons.peach_sword?.evolved).toBe(false);
    expect(next.weapons.peach_sword?.evolved).toBe(true);
    expect(next.weapons.peach_sword?.level).toBe(5);
    expect(next.weapons.peach_sword?.damage).toBeCloseTo(6 * 2, 6);
    expect(next.weapons.peach_sword?.arcDeg).toBe(100 + 40);

    next = applyChoice(next, evoDart);
    expect(next.weapons.coin_dart?.evolved).toBe(true);
    expect(next.weapons.coin_dart?.level).toBe(5);
    expect(next.weapons.coin_dart?.count).toBe(1 + 2);
    expect(next.weapons.coin_dart?.damage).toBeCloseTo(5 * 1.5, 6);

    next = applyChoice(next, evoLantern);
    expect(next.weapons.lantern_fire?.evolved).toBe(true);
    expect(next.weapons.lantern_fire?.level).toBe(5);
    expect(next.weapons.lantern_fire?.damage).toBeCloseTo(1.5 * 2, 6);
    expect(next.weapons.lantern_fire?.range).toBeCloseTo(90 * 1.5, 6);

    // Re-applying evolution to an already-evolved weapon is a no-op
    const reapplied = applyChoice(next, evoSword);
    expect(reapplied.weapons.peach_sword?.damage).toBeCloseTo(6 * 2, 6);
    expect(reapplied.weapons.peach_sword?.arcDeg).toBe(140);
  });

  it('removes evolution card and restores normal upgrades after evolving', () => {
    const stats = createInitialPlayerStats();
    stats.weapons.peach_sword!.level = 5;
    const evoOpt = buildChoicePool(stats).find((o) => o.id === 'evo:peach_sword')!;

    const evolved = applyChoice(stats, evoOpt);
    const afterPool = buildChoicePool(evolved);

    expect(afterPool.filter((o) => o.id === 'evo:peach_sword')).toHaveLength(0);
    const swordUpgrades = afterPool.filter(
      (o) => o.category === 'weapon_upgrade' && o.weaponId === 'peach_sword',
    );
    expect(swordUpgrades).toHaveLength(2);

    const dmgUpgrade = swordUpgrades.find((o) => o.id === 'upg:peach_sword:damage')!;
    const lv6 = applyChoice(evolved, dmgUpgrade);
    expect(lv6.weapons.peach_sword?.level).toBe(6);
    expect(lv6.weapons.peach_sword?.evolved).toBe(true);
    expect(lv6.weapons.peach_sword?.damage).toBeCloseTo(6 * 2 * 1.3, 6);
  });

  it('displays base name before evolution and evolved name after evolution', () => {
    for (const id of WEAPON_ORDER) {
      const weapon = createInitialWeapon(id);
      expect(weapon.evolved).toBe(false);
      expect(displayWeaponName(weapon)).toBe(WEAPON_DEFS[id].name);

      const evolvedWeapon = { ...weapon, evolved: true };
      expect(displayWeaponName(evolvedWeapon)).toBe(EVOLUTION_DEFS[id].name);
    }
  });

  it('ignores evolution choice when weapon is below level 5', () => {
    const stats = createInitialPlayerStats();
    stats.weapons.peach_sword!.level = 4;

    const updated = applyChoice(stats, {
      id: 'evo:peach_sword',
      category: 'evolution',
      title: EVOLUTION_DEFS.peach_sword.name,
      description: '',
      weaponId: 'peach_sword',
    });

    expect(updated.weapons.peach_sword?.evolved).toBe(false);
    expect(updated.weapons.peach_sword?.level).toBe(4);
    expect(updated.weapons.peach_sword?.damage).toBe(6);
    expect(updated.weapons.peach_sword?.arcDeg).toBe(100);
    expect(stats.weapons.peach_sword?.evolved).toBe(false);
    expect(stats.weapons.peach_sword?.level).toBe(4);
    expect(stats.weapons.peach_sword?.damage).toBe(6);
    expect(updated).not.toBe(stats);
    expect(updated.weapons.peach_sword).not.toBe(stats.weapons.peach_sword);
  });
});
