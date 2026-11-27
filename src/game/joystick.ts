export const JOYSTICK_DEADZONE_PX = 4;
export const JOYSTICK_MAX_DISTANCE_PX = 60;

export interface JoystickInput {
  dx: number;
  dy: number;
  speedFactor: number;
  knobOffsetX: number;
  knobOffsetY: number;
}

/**
 * Maps pointer drag distance (px) to a normalized speed factor in [0, 1].
 * Returns 0 within `deadzone`, scales linearly up to `maxDistance`, and clamps at 1.
 */
export function computeDragSpeedFactor(
  distance: number,
  deadzone = JOYSTICK_DEADZONE_PX,
  maxDistance = JOYSTICK_MAX_DISTANCE_PX,
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
  deadzone = JOYSTICK_DEADZONE_PX,
  maxDistance = JOYSTICK_MAX_DISTANCE_PX,
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
