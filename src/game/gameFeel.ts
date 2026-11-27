import { ARENA_HEIGHT, ARENA_WIDTH, HUD_HEIGHT, PLAYER_RADIUS } from './balance.ts';

export const ENEMY_HIT_FLASH_DURATION = 0.12;
export const PLAYER_HIT_FLASH_DURATION = 0.14;
export const PLAYER_SCREEN_FLASH_DURATION = 0.16;
export const PLAYER_SCREEN_FLASH_MAX_ALPHA = 0.22;
export const PLAYER_SHAKE_DURATION_MS = 90;
export const PLAYER_SHAKE_INTENSITY = 0.003;

export const SWING_ANIM_DURATION = 0.22;
export const SWING_PHASE_SPLIT = 0.45;
export const SWING_MAX_TILT_RAD = 0.26;

export const KNOCKBACK_IMPULSE_NORMAL = 10;
export const KNOCKBACK_MAX_NORMAL = 12;
export const KNOCKBACK_IMPULSE_BOSS = 4;
export const KNOCKBACK_MAX_BOSS = 5;
export const KNOCKBACK_DECAY_SPEED = 85;
export const ENEMY_RENDER_HALF_WIDTH = 32;
export const BOSS_RENDER_HALF_WIDTH = 64;

export const DAMAGE_NUMBER_DURATION = 0.55;
export const DAMAGE_NUMBER_MERGE_WINDOW = 0.22;
export const DAMAGE_NUMBER_MAX_MERGED_LIFE = 0.65;
export const MAX_DAMAGE_NUMBERS = 18;
export const DAMAGE_NUMBER_RISE_SPEED = 44;
export const DAMAGE_NUMBER_MARGIN_X = 20;
export const DAMAGE_NUMBER_HUD_PADDING = 16;

export const MAX_BURST_PARTICLES = 120;
export const ORB_SCATTER_VISUAL_SCALE = 0.4;

export interface SwingPose {
  active: boolean;
  textureKey: 'player_swing_1' | 'player_swing_2';
  flipX: boolean;
  rotation: number;
}

export interface Offset2D {
  x: number;
  y: number;
}

export interface DamageMergeCandidate {
  enemyId: number;
  sinceLastHit: number;
  totalLife: number;
}

export interface OrbScatterVelocity {
  vx: number;
  vy: number;
  duration: number;
  hopPeak: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes the 2-frame peach-wood sword swing sprite pose, horizontal facing, and subtle tilt
 * aligned to the attack direction.
 */
export function computeSwingPose(
  swingTimer: number,
  swingAngle: number,
  fallbackFacingLeft: boolean,
): SwingPose {
  if (swingTimer <= 0) {
    return {
      active: false,
      textureKey: 'player_swing_1',
      flipX: fallbackFacingLeft,
      rotation: 0,
    };
  }

  const progress = clamp(1 - swingTimer / SWING_ANIM_DURATION, 0, 1);
  const textureKey = progress < SWING_PHASE_SPLIT ? 'player_swing_1' : 'player_swing_2';
  const cos = Math.cos(swingAngle);
  const flipX = cos < -0.05 ? true : cos > 0.05 ? false : fallbackFacingLeft;
  const rotation = (flipX ? -1 : 1) * Math.sin(swingAngle) * SWING_MAX_TILT_RAD;

  return {
    active: true,
    textureKey,
    flipX,
    rotation,
  };
}

/**
 * Adds a bounded visual-only knockback offset away from `(fromX, fromY)`.
 */
export function applyKnockbackImpulse(
  currentX: number,
  currentY: number,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  isBoss: boolean,
): Offset2D {
  const dx = targetX - fromX;
  const dy = targetY - fromY;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 0.001 ? dx / dist : 1;
  const ny = dist > 0.001 ? dy / dist : 0;

  const impulse = isBoss ? KNOCKBACK_IMPULSE_BOSS : KNOCKBACK_IMPULSE_NORMAL;
  const maxLen = isBoss ? KNOCKBACK_MAX_BOSS : KNOCKBACK_MAX_NORMAL;

  let nextX = currentX + nx * impulse;
  let nextY = currentY + ny * impulse;
  const len = Math.hypot(nextX, nextY);
  if (len > maxLen && len > 0.001) {
    const scale = maxLen / len;
    nextX *= scale;
    nextY *= scale;
  }
  return { x: nextX, y: nextY };
}

/**
 * Decays a visual knockback offset smoothly back to zero.
 */
export function decayKnockbackOffset(offsetX: number, offsetY: number, dt: number): Offset2D {
  if (dt <= 0) {
    return { x: offsetX, y: offsetY };
  }
  const len = Math.hypot(offsetX, offsetY);
  if (len <= 0.001) {
    return { x: 0, y: 0 };
  }
  const nextLen = Math.max(0, len - KNOCKBACK_DECAY_SPEED * dt);
  if (nextLen < 0.15) {
    return { x: 0, y: 0 };
  }
  const scale = nextLen / len;
  return { x: offsetX * scale, y: offsetY * scale };
}

/**
 * Applies visual knockback offset while keeping inside-arena sprites within arena walls/HUD,
 * and avoiding snapping newly spawned off-screen enemies inward.
 */
export function computeClampedRenderPos(
  logicalX: number,
  logicalY: number,
  offsetX: number,
  offsetY: number,
  halfWidth: number,
): Offset2D {
  const minX = Math.min(logicalX, halfWidth);
  const maxX = Math.max(logicalX, ARENA_WIDTH - halfWidth);
  const minY = Math.min(logicalY, HUD_HEIGHT + halfWidth);
  const maxY = Math.max(logicalY, ARENA_HEIGHT - halfWidth);
  return {
    x: clamp(logicalX + offsetX, minX, maxX),
    y: clamp(logicalY + offsetY, minY, maxY),
  };
}

/**
 * Computes clamped coordinates for a floating damage number (shared by create and merge paths).
 */
export function computeDamageNumberPos(
  enemyX: number,
  enemyY: number,
  yOffset: number,
  spreadX = 0,
): Offset2D {
  return {
    x: clamp(enemyX + spreadX, DAMAGE_NUMBER_MARGIN_X, ARENA_WIDTH - DAMAGE_NUMBER_MARGIN_X),
    y: Math.max(HUD_HEIGHT + DAMAGE_NUMBER_HUD_PADDING, enemyY - yOffset),
  };
}

/**
 * Formats damage as ASCII digits ('0'-'9') guaranteed to exist in the pixel font.
 */
export function formatDamageNumber(amount: number): string {
  return String(Math.max(1, Math.round(amount)));
}

/**
 * Computes floating damage number opacity (solid early, smooth fade-out in the tail).
 */
export function computeDamageNumberAlpha(
  timer: number,
  maxTimer = DAMAGE_NUMBER_DURATION,
): number {
  if (maxTimer <= 0) {
    return 0;
  }
  const progress = clamp(1 - timer / maxTimer, 0, 1);
  return progress < 0.55 ? 1 : Math.max(0, (1 - progress) / 0.45);
}

/**
 * Returns true if a new hit on `enemyId` should merge into an existing floating number.
 */
export function canMergeDamageNumber(entry: DamageMergeCandidate, enemyId: number): boolean {
  return (
    entry.enemyId === enemyId &&
    entry.sinceLastHit <= DAMAGE_NUMBER_MERGE_WINDOW &&
    entry.totalLife <= DAMAGE_NUMBER_MAX_MERGED_LIFE
  );
}

/**
 * Computes initial burst scatter velocity and hop height for dropped XP orbs.
 */
export function computeOrbScatterVelocity(
  index: number,
  total: number,
  rng: () => number = Math.random,
): OrbScatterVelocity {
  if (total > 1) {
    const angle = (index / total) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const speed = 130 + rng() * 110;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      duration: 0.32,
      hopPeak: 12,
    };
  }
  const angle = rng() * Math.PI * 2;
  const speed = 80 + rng() * 45;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    duration: 0.24,
    hopPeak: 9,
  };
}

/**
 * Computes the visual-only scatter offset for a dropped XP orb.
 * Peaks mid-flight and decays smoothly back to (0, 0) as scatterTimer reaches 0.
 */
export function computeOrbScatterOffset(
  vx: number,
  vy: number,
  scatterTimer: number,
  scatterMaxTimer: number,
): Offset2D {
  if (scatterTimer <= 0 || scatterMaxTimer <= 0) {
    return { x: 0, y: 0 };
  }
  const progress = clamp(1 - scatterTimer / scatterMaxTimer, 0, 1);
  const arc = Math.sin(progress * Math.PI);
  const factor = scatterMaxTimer * ORB_SCATTER_VISUAL_SCALE * arc;
  return {
    x: vx * factor,
    y: vy * factor,
  };
}

/**
 * Restores radial 10-42px logical spawn distribution for Boss XP orbs, clamped inside arena.
 */
export function computeBossOrbSpawnPos(
  originX: number,
  originY: number,
  index: number,
  total: number,
  rng: () => number = Math.random,
): Offset2D {
  const angle = (index / total) * Math.PI * 2 + rng() * 0.25;
  const dist = 10 + rng() * 32;
  return {
    x: clamp(originX + Math.cos(angle) * dist, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS),
    y: clamp(
      originY + Math.sin(angle) * dist,
      HUD_HEIGHT + PLAYER_RADIUS,
      ARENA_HEIGHT - PLAYER_RADIUS,
    ),
  };
}
