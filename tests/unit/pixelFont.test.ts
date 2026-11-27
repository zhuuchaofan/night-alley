import { describe, expect, it } from 'vitest';
import {
  createInitialPlayerStats,
  createInitialWeapon,
  WEAPON_DEFS,
  WEAPON_ORDER,
} from '../../src/game/balance.ts';
import { buildChoicePool } from '../../src/game/choices.ts';
import { parseHexColor, PIXEL_FONT_DATA, wrapPixelText } from '../../src/game/pixelFont.ts';

const TOFU_BOX_12 = [
  '111111111111',
  ...Array.from({ length: 10 }, () => '100000000001'),
  '111111111111',
];

function collectAllGameUiStrings(): string[] {
  const start = createInitialPlayerStats();
  const full = createInitialPlayerStats();
  for (const id of WEAPON_ORDER) {
    full.weapons[id] = createInitialWeapon(id);
  }
  const choices = [...buildChoicePool(start), ...buildChoicePool(full)];

  return [
    // TitleScene
    '夜 巷',
    'NIGHT ALLEY',
    '1987 · 老城夜巷',
    '守夜学徒手持桃木剑，在成群心魔中活到天亮（3 分钟）',
    '开始守夜',
    'WASD / 方向键 或 按住拖动移动 · 自动攻击 · 升级三选一',
    // GameScene HUD & loadout
    'HP 30/30',
    '03:00',
    'Lv.1',
    '击杀 0',
    ...WEAPON_ORDER.map((id) => `${WEAPON_DEFS[id].name} Lv.1`),
    // Level-up modal
    '升至 Lv.2 · 三选一',
    '点击一项强化以继续守夜',
    '新武器',
    '武器强化',
    '属性提升',
    ...choices.flatMap((c) => [c.title, c.description]),
    // GameOverScene
    '天亮了 · 守夜成功',
    '倒在夜巷',
    '存活时间：03:00',
    '杀敌数：0',
    '等级：Lv.1',
    '最高同时在场敌人数：0',
    '再来一局',
    '返回标题',
  ];
}

describe('pixelFont glyph coverage', () => {
  it('contains every character used in game UI without tofu boxes', () => {
    const strings = collectAllGameUiStrings();
    const missing: string[] = [];
    const tofu: string[] = [];

    for (const text of strings) {
      for (const ch of text) {
        if (ch === '\n' || ch === '\r' || ch === '\t') {
          continue;
        }
        const glyph = PIXEL_FONT_DATA.glyphs[ch];
        if (!glyph) {
          missing.push(ch);
        } else if (
          glyph.rows.length === TOFU_BOX_12.length &&
          glyph.rows.every((r, idx) => r === TOFU_BOX_12[idx])
        ) {
          tofu.push(ch);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(tofu).toEqual([]);
  });

  it('parses hex colors and wraps CJK text to pixel width', () => {
    expect(parseHexColor('#E8B34B')).toBe(0xe8b34b);
    expect(parseHexColor('10182B')).toBe(0x10182b);

    const wrapped = wrapPixelText('向 320 范围内最近敌人发射铜钱镖', 220, 24);
    const lines = wrapped.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toContain('铜钱镖');
  });
});
