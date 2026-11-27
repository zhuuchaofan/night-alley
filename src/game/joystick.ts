export const JOYSTICK_RADIUS_CSS_PX = 50;
export const JOYSTICK_DEADZONE_CSS_PX = 7;
export const JOYSTICK_KNOB_RADIUS_CSS_PX = 14;

export interface JoystickPoint {
  x: number;
  y: number;
}

export interface JoystickDimensions {
  deadzone: number;
  maxDistance: number;
  knobRadius: number;
}

export interface JoystickInput {
  dx: number;
  dy: number;
  speedFactor: number;
  knobOffsetX: number;
  knobOffsetY: number;
}

/**
 * Converts fixed CSS-pixel joystick dimensions into game logical pixels
 * using the current canvas display scale (`displayWidth / ARENA_WIDTH`).
 */
export function computeJoystickDimensions(displayScale = 1): JoystickDimensions {
  const scale = displayScale > 0 ? displayScale : 1;
  return {
    deadzone: JOYSTICK_DEADZONE_CSS_PX / scale,
    maxDistance: JOYSTICK_RADIUS_CSS_PX / scale,
    knobRadius: JOYSTICK_KNOB_RADIUS_CSS_PX / scale,
  };
}

const DEFAULT_JOYSTICK_DIMENSIONS = computeJoystickDimensions(1);

/**
 * Shifts the floating joystick origin along the pointer direction whenever the
 * pointer exceeds `maxDistance`, keeping the knob pinned to the outer edge.
 */
export function followJoystickBase(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  maxDistance: number,
): JoystickPoint {
  const dx = currentX - originX;
  const dy = currentY - originY;
  const dist = Math.hypot(dx, dy);

  if (dist <= maxDistance || dist <= 0.0001) {
    return { x: originX, y: originY };
  }

  const excess = dist - maxDistance;
  return {
    x: originX + (dx / dist) * excess,
    y: originY + (dy / dist) * excess,
  };
}

/**
 * Maps pointer drag distance (px) to a normalized speed factor in [0, 1].
 * Returns 0 within `deadzone`, scales linearly up to `maxDistance`, and clamps at 1.
 */
export function computeDragSpeedFactor(
  distance: number,
  deadzone = DEFAULT_JOYSTICK_DIMENSIONS.deadzone,
  maxDistance = DEFAULT_JOYSTICK_DIMENSIONS.maxDistance,
): number {
  if (distance <= deadzone) {
    return 0;
  }
  if (distance >= maxDistance) {
    return 1;
  }
  return (distance - deadzone) / (maxDistance - deadzone);
}

/**
 * Computes unit movement direction, proportional speed factor, and clamped knob offset
 * from the drag vector relative to the drag origin.
 */
export function computeJoystickInput(
  offsetX: number,
  offsetY: number,
  deadzone = DEFAULT_JOYSTICK_DIMENSIONS.deadzone,
  maxDistance = DEFAULT_JOYSTICK_DIMENSIONS.maxDistance,
): JoystickInput {
  const dist = Math.hypot(offsetX, offsetY);
  const clampedDist = Math.min(dist, maxDistance);
  const knobOffsetX = dist > 0.0001 ? (offsetX / dist) * clampedDist : 0;
  const knobOffsetY = dist > 0.0001 ? (offsetY / dist) * clampedDist : 0;
  const speedFactor = computeDragSpeedFactor(dist, deadzone, maxDistance);

  if (speedFactor <= 0 || dist <= 0.0001) {
    return {
      dx: 0,
      dy: 0,
      speedFactor: 0,
      knobOffsetX,
      knobOffsetY,
    };
  }

  return {
    dx: offsetX / dist,
    dy: offsetY / dist,
    speedFactor,
    knobOffsetX,
    knobOffsetY,
  };
}
