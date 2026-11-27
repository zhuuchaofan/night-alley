import { describe, expect, it } from 'vitest';
import { GAME_PIXEL_ART } from '../../src/data/pixelart.ts';
import {
  MAX_COLORS_PER_SPRITE,
  SPRITE_SIZE,
  validatePixelRows,
} from '../../src/game/pixelart.ts';

describe('GAME_PIXEL_ART validation', () => {
  it('every sprite is 32x32, uses <= 12 colors from the 16-color palette, and has visible pixels', () => {
    const entries = Object.entries(GAME_PIXEL_ART);
    expect(entries.length).toBeGreaterThanOrEqual(15);

    for (const [key, rows] of entries) {
      const result = validatePixelRows(rows);
      expect(result.errors, `${key} failed validation: ${result.errors.join(', ')}`).toEqual([]);
      expect(result.valid, `${key} should be valid`).toBe(true);
      expect(rows.length, `${key} row count`).toBe(SPRITE_SIZE);
      expect(result.colorCount, `${key} color count`).toBeLessThanOrEqual(MAX_COLORS_PER_SPRITE);
      expect(result.colorCount, `${key} non-empty`).toBeGreaterThan(0);
    }
  });
});
