import { describe, expect, it } from 'vitest';
import {
  computeDragSpeedFactor,
  computeJoystickInput,
  JOYSTICK_DEADZONE_PX,
  JOYSTICK_MAX_DISTANCE_PX,
} from '../../src/game/joystick.ts';

describe('computeDragSpeedFactor', () => {
  it('returns 0 inside and at the 4px deadzone', () => {
    expect(JOYSTICK_DEADZONE_PX).toBe(4);
    expect(JOYSTICK_MAX_DISTANCE_PX).toBe(60);
    expect(computeDragSpeedFactor(0)).toBe(0);
    expect(computeDragSpeedFactor(2)).toBe(0);
    expect(computeDragSpeedFactor(4)).toBe(0);
  });

  it('scales linearly between deadzone (4px) and max distance (60px)', () => {
    expect(computeDragSpeedFactor(18)).toBeCloseTo(0.25, 6);
    expect(computeDragSpeedFactor(32)).toBeCloseTo(0.5, 6);
    expect(computeDragSpeedFactor(46)).toBeCloseTo(0.75, 6);
  });

  it('reaches 1 at 60px and clamps to 1 beyond max distance', () => {
    expect(computeDragSpeedFactor(60)).toBe(1);
    expect(computeDragSpeedFactor(80)).toBe(1);
    expect(computeDragSpeedFactor(240)).toBe(1);
  });
});

describe('computeJoystickInput', () => {
  it('outputs zero velocity inside deadzone', () => {
    const res = computeJoystickInput(3, 2);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.speedFactor).toBe(0);
    expect(res.knobOffsetX).toBeCloseTo(3, 6);
    expect(res.knobOffsetY).toBeCloseTo(2, 6);
  });

  it('outputs normalized unit direction, proportional speed, and clamped 60px knob offset', () => {
    const mid = computeJoystickInput(32, 0);
    expect(mid.dx).toBeCloseTo(1, 6);
    expect(mid.dy).toBeCloseTo(0, 6);
    expect(mid.speedFactor).toBeCloseTo(0.5, 6);
    expect(mid.knobOffsetX).toBeCloseTo(32, 6);
    expect(mid.knobOffsetY).toBeCloseTo(0, 6);

    const far = computeJoystickInput(90, 120); // dist = 150
    expect(far.dx).toBeCloseTo(0.6, 6);
    expect(far.dy).toBeCloseTo(0.8, 6);
    expect(far.speedFactor).toBe(1);
    expect(Math.hypot(far.knobOffsetX, far.knobOffsetY)).toBeCloseTo(60, 6);
    expect(far.knobOffsetX).toBeCloseTo(36, 6);
    expect(far.knobOffsetY).toBeCloseTo(48, 6);
  });
});
