import { describe, expect, it } from 'vitest';
import {
  computeDragSpeedFactor,
  computeJoystickDimensions,
  computeJoystickInput,
  followJoystickBase,
  JOYSTICK_DEADZONE_CSS_PX,
  JOYSTICK_KNOB_RADIUS_CSS_PX,
  JOYSTICK_RADIUS_CSS_PX,
} from '../../src/game/joystick.ts';

describe('computeJoystickDimensions', () => {
  it('uses ~50 CSS px radius and ~7 CSS px deadzone (14% of radius) at 1:1 scale', () => {
    expect(JOYSTICK_RADIUS_CSS_PX).toBe(50);
    expect(JOYSTICK_DEADZONE_CSS_PX).toBe(7);
    expect(JOYSTICK_KNOB_RADIUS_CSS_PX).toBe(14);
    expect(JOYSTICK_DEADZONE_CSS_PX / JOYSTICK_RADIUS_CSS_PX).toBeCloseTo(0.14, 6);

    const dims = computeJoystickDimensions(1);
    expect(dims.deadzone).toBe(7);
    expect(dims.maxDistance).toBe(50);
    expect(dims.knobRadius).toBe(14);
  });

  it('scales down game-pixel dimensions on desktop (>1 display scale)', () => {
    const desktopScale = 1280 / 960;
    const dims = computeJoystickDimensions(desktopScale);
    expect(dims.maxDistance).toBeCloseTo(37.5, 6);
    expect(dims.deadzone).toBeCloseTo(5.25, 6);
    expect(dims.maxDistance * desktopScale).toBeCloseTo(JOYSTICK_RADIUS_CSS_PX, 6);
    expect(dims.deadzone * desktopScale).toBeCloseTo(JOYSTICK_DEADZONE_CSS_PX, 6);
  });

  it('scales up game-pixel dimensions on portrait (<1 display scale) so physical size stays constant', () => {
    const portraitScale = 390 / 960;
    const dims = computeJoystickDimensions(portraitScale);
    expect(dims.maxDistance).toBeCloseTo(123.076923, 5);
    expect(dims.deadzone).toBeCloseTo(17.230769, 5);
    expect(dims.maxDistance).toBeGreaterThan(60);
    expect(dims.maxDistance * portraitScale).toBeCloseTo(JOYSTICK_RADIUS_CSS_PX, 6);
    expect(dims.deadzone * portraitScale).toBeCloseTo(JOYSTICK_DEADZONE_CSS_PX, 6);
  });
});

describe('followJoystickBase', () => {
  it('keeps base stationary while pointer stays within or on the radius', () => {
    expect(followJoystickBase(200, 300, 225, 300, 50)).toEqual({ x: 200, y: 300 });
    expect(followJoystickBase(200, 300, 250, 300, 50)).toEqual({ x: 200, y: 300 });
  });

  it('advances base by the exact excess distance along pointer direction', () => {
    const horiz = followJoystickBase(200, 300, 280, 300, 50);
    expect(horiz.x).toBeCloseTo(230, 6);
    expect(horiz.y).toBeCloseTo(300, 6);
    expect(Math.hypot(280 - horiz.x, 300 - horiz.y)).toBeCloseTo(50, 6);

    // 3-4-5 triangle: dist = 100, excess = 50 -> shift (30, 40)
    const diag = followJoystickBase(100, 100, 160, 180, 50);
    expect(diag.x).toBeCloseTo(130, 6);
    expect(diag.y).toBeCloseTo(140, 6);
    expect(Math.hypot(160 - diag.x, 180 - diag.y)).toBeCloseTo(50, 6);
  });

  it('allows immediate direction reversal after pushing right past max radius', () => {
    const origin = followJoystickBase(200, 300, 400, 300, 50);
    expect(origin.x).toBeCloseTo(350, 6);
    expect(origin.y).toBeCloseTo(300, 6);

    // Drag left by only 10px from 400 -> 390? Wait: 390 is still +40 from 350.
    // Drag left to 340 (still 140px right of original 200, only 60px back from 400):
    const reversedOrigin = followJoystickBase(origin.x, origin.y, 340, 300, 50);
    expect(reversedOrigin).toEqual(origin);

    const reversedInput = computeJoystickInput(340 - reversedOrigin.x, 300 - reversedOrigin.y, 7, 50);
    expect(reversedInput.dx).toBeCloseTo(-1, 6);
    expect(reversedInput.dy).toBeCloseTo(0, 6);
    expect(reversedInput.speedFactor).toBeGreaterThan(0);
  });
});

describe('computeDragSpeedFactor', () => {
  it('returns 0 inside and at the CSS-pixel default deadzone (7px)', () => {
    expect(computeDragSpeedFactor(0)).toBe(0);
    expect(computeDragSpeedFactor(3.5)).toBe(0);
    expect(computeDragSpeedFactor(7)).toBe(0);
  });

  it('scales linearly between explicit deadzone (4px) and max distance (60px)', () => {
    expect(computeDragSpeedFactor(18, 4, 60)).toBeCloseTo(0.25, 6);
    expect(computeDragSpeedFactor(32, 4, 60)).toBeCloseTo(0.5, 6);
    expect(computeDragSpeedFactor(46, 4, 60)).toBeCloseTo(0.75, 6);
  });

  it('reaches 1 at maxDistance and clamps to 1 beyond maxDistance', () => {
    expect(computeDragSpeedFactor(50)).toBe(1);
    expect(computeDragSpeedFactor(80)).toBe(1);
    expect(computeDragSpeedFactor(240, 4, 60)).toBe(1);
  });
});

describe('computeJoystickInput', () => {
  it('outputs zero velocity inside deadzone', () => {
    const res = computeJoystickInput(3, 2, 7, 50);
    expect(res.dx).toBe(0);
    expect(res.dy).toBe(0);
    expect(res.speedFactor).toBe(0);
    expect(res.knobOffsetX).toBeCloseTo(3, 6);
    expect(res.knobOffsetY).toBeCloseTo(2, 6);
  });

  it('outputs normalized unit direction, proportional speed, and clamped knob offset', () => {
    const mid = computeJoystickInput(28.5, 0, 7, 50);
    expect(mid.dx).toBeCloseTo(1, 6);
    expect(mid.dy).toBeCloseTo(0, 6);
    expect(mid.speedFactor).toBeCloseTo(0.5, 6);
    expect(mid.knobOffsetX).toBeCloseTo(28.5, 6);
    expect(mid.knobOffsetY).toBeCloseTo(0, 6);

    const far = computeJoystickInput(90, 120, 7, 50); // dist = 150
    expect(far.dx).toBeCloseTo(0.6, 6);
    expect(far.dy).toBeCloseTo(0.8, 6);
    expect(far.speedFactor).toBe(1);
    expect(Math.hypot(far.knobOffsetX, far.knobOffsetY)).toBeCloseTo(50, 6);
    expect(far.knobOffsetX).toBeCloseTo(30, 6);
    expect(far.knobOffsetY).toBeCloseTo(40, 6);
  });
});
