import { describe, expect, it } from 'vitest';
import { formatSimSummary, runSimBatch, runSingleSim } from '../../scripts/sim/sim.ts';
import { PLAYER_MAX_HP, ROUND_DURATION_SECONDS } from '../../src/game/balance.ts';

describe('headless balance sim', () => {
  it('completes a single run with valid metrics and 10s HP trajectory', () => {
    const result = runSingleSim(1);
    expect(result.survivedSeconds).toBeGreaterThan(0);
    expect(result.survivedSeconds).toBeLessThanOrEqual(ROUND_DURATION_SECONDS);
    expect(result.kills).toBeGreaterThanOrEqual(0);
    expect(result.level).toBeGreaterThanOrEqual(1);
    expect(result.maxConcurrent).toBeGreaterThanOrEqual(0);
    expect(result.hpTrajectory).toHaveLength(19);
    expect(result.hpTrajectory[0]).toBe(PLAYER_MAX_HP);
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

  it('aggregates a batch and formats the summary table', () => {
    const summary = runSimBatch({ runs: 5, seed: 1 });
    expect(summary.runs).toBe(5);
    expect(summary.results).toHaveLength(5);
    expect(summary.winRate).toBeGreaterThanOrEqual(0);
    expect(summary.winRate).toBeLessThanOrEqual(100);
    expect(summary.avgHpAt30s).toBe(summary.avgHpTrajectory[3]);

    const report = formatSimSummary(summary);
    expect(report).toContain('Win Rate');
    expect(report).toContain('Avg HP @ 30s');
    expect(report).toContain('180s');
  });
});
