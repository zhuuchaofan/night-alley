import { ENEMY_RADIUS } from './balance.ts';

export interface SlashPlacement {
  x: number;
  y: number;
  rotation: number;
  displayWidth: number;
  displayHeight: number;
}

// Normalized coordinates of SLASH_ARC_ART (32x32) relative to sprite center (16, 16):
// front arc columns sit at col 29 (center 29.5, right edge 30.0 -> midpoint 29.75),
// top/bottom tips sit at col 22 (center 22.5), rows 0 and 31 (centers 0.5 and 31.5).
const SLASH_ARC_U_FRONT = (29.75 - 16) / 32;
const SLASH_ARC_U_TIP = (22.5 - 16) / 32;
const SLASH_ARC_V_TIP = (16 - 0.5) / 32;

/**
 * Computes world placement, rotation, and display dimensions so the 32x32 slash arc
 * aligns with the peach-wood sword hit sector (radius `range + enemyRadius`, half-angle `arcDeg / 2`).
 */
export function computeSlashPlacement(
  originX: number,
  originY: number,
  angle: number,
  range: number,
  arcDeg: number,
  enemyRadius = ENEMY_RADIUS,
): SlashPlacement {
  const reach = range + enemyRadius;
  const halfArcRad = ((arcDeg / 2) * Math.PI) / 180;
  const displayWidth = (reach * (1 - Math.cos(halfArcRad))) / (SLASH_ARC_U_FRONT - SLASH_ARC_U_TIP);
  const displayHeight = (reach * Math.sin(halfArcRad)) / SLASH_ARC_V_TIP;
  const offset = reach - SLASH_ARC_U_FRONT * displayWidth;

  return {
    x: originX + Math.cos(angle) * offset,
    y: originY + Math.sin(angle) * offset,
    rotation: angle,
    displayWidth,
    displayHeight,
  };
}
