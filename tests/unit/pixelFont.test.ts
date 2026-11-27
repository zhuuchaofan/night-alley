import { describe, expect, it } from 'vitest';
import {
  BOSS_SPAWN_ELAPSED_SECONDS,
  BOSS_STATS,
  createInitialPlayerStats,
  createInitialWeapon,
  ELITE_XP_ORBS,
  enemyStatsForKind,
  EVOLUTION_DEFS,
  EVOLUTION_MIN_LEVEL,
  SHOOTER_BOLT_DAMAGE,
  SHOOTER_FIRE_COOLDOWN,
  SHOOTER_RANGE,
  SHOOTER_RETREAT_DIST,
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
  const readyToEvolve = createInitialPlayerStats();
  const evolved = createInitialPlayerStats();
  for (const id of WEAPON_ORDER) {
    full.weapons[id] = createInitialWeapon(id);
    readyToEvolve.weapons[id] = {
      ...createInitialWeapon(id),
      level: EVOLUTION_MIN_LEVEL,
    };
    evolved.weapons[id] = {
      ...createInitialWeapon(id),
      level: EVOLUTION_MIN_LEVEL,
      evolved: true,
    };
  }
  const choices = [
    ...buildChoicePool(start),
    ...buildChoicePool(full),
    ...buildChoicePool(readyToEvolve),
    ...buildChoicePool(evolved),
  ];

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
    '大心魔现身',
    ...WEAPON_ORDER.map((id) => `${WEAPON_DEFS[id].name} Lv.1`),
    // Evolution banner (one per evolved weapon)
    ...WEAPON_ORDER.map((id) => `武器进化 · ${EVOLUTION_DEFS[id].name}`),
    // Level-up modal
    '升至 Lv.2 · 三选一',
    '点击一项强化以继续守夜',
    '新武器',
    '武器强化',
    '武器进化',
    '属性提升',
    ...choices.flatMap((c) => [c.title, c.description]),
    // GameOverScene
    '天亮了 · 守夜成功',
    '心魔已除 · 守夜成功',
    '倒在夜巷',
    '存活时间：03:00',
    '杀敌数：0',
    '等级：Lv.1',
    '最高同时在场敌人数：0',
    '再来一局',
    '返回标题',
    // BestiaryScene (all 6 enemies + headers + formatted balance values)
    '图册',
    '返回',
    '开局数值 · 血量提升 · 移速提升 · 疾纸人血量固定 · 大心魔数值固定',
    '本局击杀 未开局',
    '本局击杀 0123456789',
    ...(['paper', 'lantern', 'swift', 'shooter', 'elite'] as const).map((kind) => {
      const s = enemyStatsForKind(kind, 0);
      return `血量 ${s.maxHp} · 移速 ${s.speed.toFixed(2).replace(/\.?0+$/, '')} 近身伤害 ${s.contactDamage}`;
    }),
    `血量 ${BOSS_STATS.maxHp} · 移速 ${BOSS_STATS.speed.toFixed(2).replace(/\.?0+$/, '')} 近身伤害 ${BOSS_STATS.contactDamage}`,
    '心魔',
    '灯笼',
    '疾纸人',
    '远灯笼',
    '大魔面',
    '大心魔',
    '近身攻击',
    '高速近身 · 血量固定',
    `近身伤害 ${enemyStatsForKind('shooter', 0).contactDamage} · 远程伤害 ${SHOOTER_BOLT_DAMAGE}`,
    `发射间隔 ${SHOOTER_FIRE_COOLDOWN.toFixed(1)}s · >${SHOOTER_RANGE}px 靠近`,
    `<${SHOOTER_RETREAT_DIST}px 后退至 ${SHOOTER_RANGE}px`,
    `击杀掉落 ${ELITE_XP_ORBS} 个升级珠`,
    `${BOSS_SPAWN_ELAPSED_SECONDS}s 现身 · 攻击间隔 ${BOSS_STATS.attackCooldown}s`,
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

  it('keeps numeric and +number tokens intact when wrapping', () => {
    const wrapped = wrapPixelText('血量上限 +10 并回复 10', 256, 24);
    expect(wrapped.split('\n')).toEqual(['血量上限 +10 并回复', '10']);

    const wrappedPlus = wrapPixelText('血量上限 +10 并回复 10', 136, 24);
    const plusLines = wrappedPlus.split('\n');
    expect(plusLines[0]).toBe('血量上限');
    expect(plusLines[1].startsWith('+10')).toBe(true);
  });
});
