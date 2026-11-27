import { describe, expect, it } from 'vitest';
import {
  ENEMY_KINDS,
  formatSimSummary,
  pickUpgradeChoice,
  runSimBatch,
  runSingleSim,
} from '../../scripts/sim/sim.ts';
import {
  createInitialPlayerStats,
  createInitialWeapon,
  EVOLUTION_DEFS,
  PLAYER_MAX_HP,
  ROUND_DURATION_SECONDS,
  WEAPON_ORDER,
} from '../../src/game/balance.ts';
import { buildChoicePool } from '../../src/game/choices.ts';

describe('headless balance sim', () => {
  it('completes a single run with valid metrics and 10s HP trajectory', () => {
    const result = runSingleSim(1);
    expect(result.survivedSeconds).toBeGreaterThan(0);
    expect(result.survivedSeconds).toBeLessThanOrEqual(ROUND_DURATION_SECONDS);
    expect(result.kills).toBeGreaterThanOrEqual(0);
    expect(result.level).toBeGreaterThanOrEqual(1);
    expect(result.maxConcurrent).toBeGreaterThanOrEqual(0);
    expect(typeof result.bossSpawned).toBe('boolean');
    expect(typeof result.bossKilled).toBe('boolean');
    expect(Array.isArray(result.evolved)).toBe(true);
    for (const id of result.evolved) {
      expect(WEAPON_ORDER).toContain(id);
    }
    expect(result.hpTrajectory).toHaveLength(19);
    expect(result.hpTrajectory[0]).toBe(PLAYER_MAX_HP);
    expect(result.eliteSpawned).toBeGreaterThanOrEqual(0);
    let kindSum = 0;
    for (const kind of ENEMY_KINDS) {
      expect(result.killsByKind).toHaveProperty(kind);
      expect(result.killsByKind[kind]).toBeGreaterThanOrEqual(0);
      kindSum += result.killsByKind[kind];
    }
    expect(kindSum).toBe(result.kills);
    if (!result.won) {
      const deathIndex = Math.floor(result.survivedSeconds / 10) + 1;
      for (let i = deathIndex; i < result.hpTrajectory.length; i += 1) {
        expect(result.hpTrajectory[i]).toBe(0);
      }
    }
  });

  it('produces identical results for a fixed seed', () => {
    const a = runSingleSim(42);
    const b = runSingleSim(42);
    expect(a).toEqual(b);
  });

  it('prioritizes evolution cards and evolved weapon upgrades in pickUpgradeChoice', () => {
    const evoStats = createInitialPlayerStats();
    evoStats.weapons.peach_sword!.level = 5;
    const evoPool = buildChoicePool(evoStats);
    const evoSword = evoPool.find((o) => o.id === 'evo:peach_sword')!;
    const newDart = evoPool.find((o) => o.id === 'new:coin_dart')!;
    const statDmg = evoPool.find((o) => o.id === 'stat:damage')!;
    expect(pickUpgradeChoice(evoStats, [statDmg, newDart, evoSword]).id).toBe('evo:peach_sword');

    const evolvedDartStats = createInitialPlayerStats();
    evolvedDartStats.weapons.coin_dart = {
      ...createInitialWeapon('coin_dart'),
      level: 5,
      evolved: true,
    };
    const dartPool = buildChoicePool(evolvedDartStats);
    const dartCount = dartPool.find((o) => o.id === 'upg:coin_dart:count')!;
    const swordDmg = dartPool.find((o) => o.id === 'upg:peach_sword:damage')!;
    expect(pickUpgradeChoice(evolvedDartStats, [swordDmg, dartCount, statDmg]).id).toBe(
      'upg:coin_dart:count',
    );

    const evolvedSwordStats = createInitialPlayerStats();
    evolvedSwordStats.weapons.peach_sword = {
      ...createInitialWeapon('peach_sword'),
      level: 5,
      evolved: true,
    };
    evolvedSwordStats.weapons.coin_dart = createInitialWeapon('coin_dart');
    const swordPool = buildChoicePool(evolvedSwordStats);
    const swordSpeed = swordPool.find((o) => o.id === 'upg:peach_sword:speed')!;
    const swordDmgEvolved = swordPool.find((o) => o.id === 'upg:peach_sword:damage')!;
    const dartDmg = swordPool.find((o) => o.id === 'upg:coin_dart:damage')!;
    expect(pickUpgradeChoice(evolvedSwordStats, [dartDmg, swordSpeed, statDmg]).id).toBe(
      'upg:peach_sword:speed',
    );
    expect(pickUpgradeChoice(evolvedSwordStats, [swordSpeed, swordDmgEvolved]).id).toBe(
      'upg:peach_sword:damage',
    );

    const unevolvedStats = createInitialPlayerStats();
    unevolvedStats.weapons.coin_dart = createInitialWeapon('coin_dart');
    const unevolvedPool = buildChoicePool(unevolvedStats);
    const unevolvedSwordDmg = unevolvedPool.find((o) => o.id === 'upg:peach_sword:damage')!;
    const unevolvedDartDmg = unevolvedPool.find((o) => o.id === 'upg:coin_dart:damage')!;
    expect(pickUpgradeChoice(unevolvedStats, [unevolvedDartDmg, unevolvedSwordDmg]).id).toBe(
      'upg:peach_sword:damage',
    );
  });

  it('aggregates a batch including evolution stats and formats the summary table', () => {
    const summary = runSimBatch({ runs: 5, seed: 1 });
    expect(summary.runs).toBe(5);
    expect(summary.results).toHaveLength(5);
    expect(summary.winRate).toBeGreaterThanOrEqual(0);
    expect(summary.winRate).toBeLessThanOrEqual(100);
    expect(summary.bossKillRate).toBeGreaterThanOrEqual(0);
    expect(summary.bossKillRate).toBeLessThanOrEqual(100);
    expect(summary.avgHpAt30s).toBe(summary.avgHpTrajectory[3]);

    expect(summary.anyEvolutionRate).toBeGreaterThanOrEqual(0);
    expect(summary.anyEvolutionRate).toBeLessThanOrEqual(100);
    expect(summary.eliteSpawnRate).toBeGreaterThanOrEqual(0);
    let shareSum = 0;
    for (const kind of ENEMY_KINDS) {
      expect(summary.killShareByKind[kind]).toBeGreaterThanOrEqual(0);
      expect(summary.killShareByKind[kind]).toBeLessThanOrEqual(100);
      shareSum += summary.killShareByKind[kind];
    }
    expect(shareSum).toBeCloseTo(100, 1);
    for (const id of WEAPON_ORDER) {
      expect(summary.evolutionRates[id]).toBeGreaterThanOrEqual(0);
      expect(summary.evolutionRates[id]).toBeLessThanOrEqual(100);
    }
    const routes = summary.evolutionRouteCounts;
    const routeValues = [
      routes.none,
      routes.swordOnly,
      routes.dartOnly,
      routes.lanternOnly,
      routes.two,
      routes.three,
    ];
    for (const count of routeValues) {
      expect(count).toBeGreaterThanOrEqual(0);
    }
    expect(routeValues.reduce((sum, n) => sum + n, 0)).toBe(summary.runs);

    const report = formatSimSummary(summary);
    expect(report).toContain('Win Rate');
    expect(report).toContain('Elite Spawn Rate');
    expect(report).toContain('Enemy Kill Share');
    expect(report).toContain('Boss Kill Rate');
    expect(report).toContain('Any Evolution Rate');
    expect(report).toContain(EVOLUTION_DEFS.peach_sword.name);
    expect(report).toContain(EVOLUTION_DEFS.coin_dart.name);
    expect(report).toContain(EVOLUTION_DEFS.lantern_fire.name);
    expect(report).toContain('无进化');
    expect(report).toContain('仅剑');
    expect(report).toContain('仅镖');
    expect(report).toContain('仅火');
    expect(report).toContain('两把');
    expect(report).toContain('三把');
    expect(report).toContain('Avg HP @ 30s');
    expect(report).toContain('180s');
  });
});
