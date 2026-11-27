import { describe, expect, it } from 'vitest';
import { GAME_PIXEL_ART } from '../../src/data/pixelart.ts';
import {
  EVOLVED_DART_PALETTE,
  EVOLVED_LANTERN_PALETTE,
  EVOLVED_SLASH_PALETTE,
  MAX_COLORS_PER_SPRITE,
  PIXEL_PALETTE,
  SPRITE_SIZE,
  validatePixelRows,
} from '../../src/game/pixelart.ts';

describe('GAME_PIXEL_ART validation', () => {
  it('every sprite is 32x32, uses <= 12 colors from the 16-color palette, and has visible pixels', () => {
    const entries = Object.entries(GAME_PIXEL_ART);
    expect(entries.length).toBeGreaterThanOrEqual(17);
    expect(GAME_PIXEL_ART).toHaveProperty('player_swing_1');
    expect(GAME_PIXEL_ART).toHaveProperty('player_swing_2');

    for (const [key, rows] of entries) {
      const result = validatePixelRows(rows);
      expect(result.errors, `${key} failed validation: ${result.errors.join(', ')}`).toEqual([]);
      expect(result.valid, `${key} should be valid`).toBe(true);
      expect(rows.length, `${key} row count`).toBe(SPRITE_SIZE);
      expect(result.colorCount, `${key} color count`).toBeLessThanOrEqual(MAX_COLORS_PER_SPRITE);
      expect(result.colorCount, `${key} non-empty`).toBeGreaterThan(0);
    }
  });

  it('every hex in evolved weapon palettes belongs to PIXEL_PALETTE', () => {
    const allowed = new Set(PIXEL_PALETTE);
    const evolvedPalettes = [
      ['EVOLVED_SLASH_PALETTE', EVOLVED_SLASH_PALETTE],
      ['EVOLVED_DART_PALETTE', EVOLVED_DART_PALETTE],
      ['EVOLVED_LANTERN_PALETTE', EVOLVED_LANTERN_PALETTE],
    ] as const;

    for (const [name, palette] of evolvedPalettes) {
      for (const hex of palette) {
        expect(allowed.has(hex), `${name} contains off-palette hex ${hex}`).toBe(true);
      }
    }
  });
});
