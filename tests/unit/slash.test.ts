import { describe, expect, it } from 'vitest';
import { GAME_PIXEL_ART } from '../../src/data/pixelart.ts';
import { ENEMY_RADIUS, WEAPON_DEFS } from '../../src/game/balance.ts';
import { SPRITE_SIZE } from '../../src/game/pixelart.ts';
import { computeSlashPlacement, SlashPlacement } from '../../src/game/slash.ts';

interface SlashArcGeometry {
  frontCenterReach: number;
  frontOuterEdgeReach: number;
  maxPixelCenterReach: number;
  topTipDist: number;
  bottomTipDist: number;
  topTipAngleDeg: number;
  bottomTipAngleDeg: number;
  maxHalfAngleDeg: number;
}

function normalizeSignedDeg(rad: number): number {
  let diff = rad;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return (diff * 180) / Math.PI;
}

function measureSlashArcGeometry(
  originX: number,
  originY: number,
  angle: number,
  placement: SlashPlacement,
): SlashArcGeometry {
  const rows = GAME_PIXEL_ART.slash_arc;
  const cos = Math.cos(placement.rotation);
  const sin = Math.sin(placement.rotation);

  let frontCenterReach = 0;
  let frontOuterEdgeReach = 0;
  let maxPixelCenterReach = 0;
  let maxHalfAngleDeg = 0;
  let topTipDist = 0;
  let bottomTipDist = 0;
  let topTipAngleDeg = 0;
  let bottomTipAngleDeg = 0;

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === '.') {
        continue;
      }
      const lx = ((c + 0.5) / SPRITE_SIZE - 0.5) * placement.displayWidth;
      const ly = ((r + 0.5) / SPRITE_SIZE - 0.5) * placement.displayHeight;
      const wx = placement.x + lx * cos - ly * sin;
      const wy = placement.y + lx * sin + ly * cos;
      const dx = wx - originX;
      const dy = wy - originY;
      const dist = Math.hypot(dx, dy);
      const relDeg = normalizeSignedDeg(Math.atan2(dy, dx) - angle);

      maxPixelCenterReach = Math.max(maxPixelCenterReach, dist);
      maxHalfAngleDeg = Math.max(maxHalfAngleDeg, Math.abs(relDeg));

      if (r === 15 || r === 16) {
        frontCenterReach = Math.max(frontCenterReach, dist);
        const edgeLx = ((c + 1) / SPRITE_SIZE - 0.5) * placement.displayWidth;
        const edgeWx = placement.x + edgeLx * cos - ly * sin;
        const edgeWy = placement.y + edgeLx * sin + ly * cos;
        frontOuterEdgeReach = Math.max(
          frontOuterEdgeReach,
          Math.hypot(edgeWx - originX, edgeWy - originY),
        );
      }
      if (r === 0) {
        topTipDist = dist;
        topTipAngleDeg = relDeg;
      }
      if (r === rows.length - 1) {
        bottomTipDist = dist;
        bottomTipAngleDeg = relDeg;
      }
    }
  }

  return {
    frontCenterReach,
    frontOuterEdgeReach,
    maxPixelCenterReach,
    topTipDist,
    bottomTipDist,
    topTipAngleDeg,
    bottomTipAngleDeg,
    maxHalfAngleDeg,
  };
}

describe('computeSlashPlacement', () => {
  it('aligns default peach_sword slash arc reach (100px) and half-angle (±50°) within ±2px and ±2°', () => {
    const sword = WEAPON_DEFS.peach_sword;
    const expectedReach = sword.range + ENEMY_RADIUS;
    const expectedHalfAngle = sword.arcDeg / 2;

    const placement = computeSlashPlacement(480, 292, 0, sword.range, sword.arcDeg);
    const geom = measureSlashArcGeometry(480, 292, 0, placement);

    expect(placement.rotation).toBe(0);
    expect(Math.abs(geom.frontCenterReach - expectedReach)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.frontOuterEdgeReach - expectedReach)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.maxPixelCenterReach - expectedReach)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.topTipDist - expectedReach)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.bottomTipDist - expectedReach)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.topTipAngleDeg - -expectedHalfAngle)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.bottomTipAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
    expect(Math.abs(geom.maxHalfAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
  });

  it('maintains reach and angle accuracy across swing origins and angles', () => {
    const sword = WEAPON_DEFS.peach_sword;
    const expectedReach = sword.range + ENEMY_RADIUS;
    const expectedHalfAngle = sword.arcDeg / 2;
    const cases = [
      { x: 480, y: 292, angle: 0 },
      { x: 240, y: 180, angle: Math.PI / 2 },
      { x: 700, y: 400, angle: -Math.PI * 0.75 },
      { x: 120, y: 310, angle: Math.PI },
    ];

    for (const tc of cases) {
      const placement = computeSlashPlacement(tc.x, tc.y, tc.angle, sword.range, sword.arcDeg);
      const geom = measureSlashArcGeometry(tc.x, tc.y, tc.angle, placement);

      expect(placement.rotation).toBe(tc.angle);
      expect(Math.abs(geom.frontCenterReach - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.frontOuterEdgeReach - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.topTipDist - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.bottomTipDist - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.topTipAngleDeg - -expectedHalfAngle)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.bottomTipAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.maxHalfAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
    }
  });

  it('scales proportionally for custom range and arcDeg within ±2px and ±2°', () => {
    const cases = [
      { range: 120, arcDeg: 100 },
      { range: 90, arcDeg: 80 },
    ];

    for (const tc of cases) {
      const expectedReach = tc.range + ENEMY_RADIUS;
      const expectedHalfAngle = tc.arcDeg / 2;
      const placement = computeSlashPlacement(300, 250, Math.PI / 4, tc.range, tc.arcDeg);
      const geom = measureSlashArcGeometry(300, 250, Math.PI / 4, placement);

      expect(Math.abs(geom.frontCenterReach - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.frontOuterEdgeReach - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.topTipDist - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.bottomTipDist - expectedReach)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.topTipAngleDeg - -expectedHalfAngle)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.bottomTipAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
      expect(Math.abs(geom.maxHalfAngleDeg - expectedHalfAngle)).toBeLessThanOrEqual(2);
    }
  });
});
