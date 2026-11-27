import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BOSS_SPAWN_ELAPSED_SECONDS,
  BOSS_STATS,
  ELITE_XP_ORBS,
  type EnemyKind,
  enemyStatsForKind,
  PLAYER_MAX_HP,
  ROUND_DURATION_SECONDS,
  SHOOTER_BOLT_DAMAGE,
  SHOOTER_FIRE_COOLDOWN,
  SHOOTER_RANGE,
  SHOOTER_RETREAT_DIST,
} from '../game/balance.ts';
import { createEmptyKillCounts, registerDebugHook, SettlementData } from '../game/debug.ts';
import { addPixelText } from '../game/pixelFont.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';

export type BestiarySceneData =
  | { origin: 'TitleScene' }
  | { origin: 'GameOverScene'; settlement: SettlementData };

interface BestiaryCardSpec {
  kind: EnemyKind;
  name: string;
  texture: string;
  maxHp: number;
  speed: number;
  details: string[];
}

const CARD_COLS = [188, 480, 772];
const CARD_ROWS = [180, 354];
const CARD_W = 280;
const CARD_H = 164;

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.?0+$/, '');
}

export function buildBestiaryEntries(): BestiaryCardSpec[] {
  const paper = enemyStatsForKind('paper', 0);
  const lantern = enemyStatsForKind('lantern', 0);
  const swift = enemyStatsForKind('swift', 0);
  const shooter = enemyStatsForKind('shooter', 0);
  const elite = enemyStatsForKind('elite', 0);

  return [
    {
      kind: 'paper',
      name: '心魔',
      texture: 'enemy_paper',
      maxHp: paper.maxHp,
      speed: paper.speed,
      details: [`近身伤害 ${paper.contactDamage}`, '近身攻击'],
    },
    {
      kind: 'lantern',
      name: '灯笼',
      texture: 'enemy_lantern',
      maxHp: lantern.maxHp,
      speed: lantern.speed,
      details: [`近身伤害 ${lantern.contactDamage}`, '近身攻击'],
    },
    {
      kind: 'swift',
      name: '疾纸人',
      texture: 'enemy_swift',
      maxHp: swift.maxHp,
      speed: swift.speed,
      details: [`近身伤害 ${swift.contactDamage}`, '高速近身 · 血量固定'],
    },
    {
      kind: 'shooter',
      name: '远灯笼',
      texture: 'enemy_shooter',
      maxHp: shooter.maxHp,
      speed: shooter.speed,
      details: [
        `近身伤害 ${shooter.contactDamage} · 远程伤害 ${SHOOTER_BOLT_DAMAGE}`,
        `发射间隔 ${SHOOTER_FIRE_COOLDOWN.toFixed(1)}s · >${SHOOTER_RANGE}px 靠近`,
        `<${SHOOTER_RETREAT_DIST}px 后退至 ${SHOOTER_RANGE}px`,
      ],
    },
    {
      kind: 'elite',
      name: '大魔面',
      texture: 'enemy_elite',
      maxHp: elite.maxHp,
      speed: elite.speed,
      details: [`近身伤害 ${elite.contactDamage}`, `击杀掉落 ${ELITE_XP_ORBS} 个升级珠`],
    },
    {
      kind: 'boss',
      name: '大心魔',
      texture: 'enemy_boss',
      maxHp: BOSS_STATS.maxHp,
      speed: BOSS_STATS.speed,
      details: [
        `近身伤害 ${BOSS_STATS.contactDamage}`,
        `${BOSS_SPAWN_ELAPSED_SECONDS}s 现身 · 攻击间隔 ${BOSS_STATS.attackCooldown}s`,
      ],
    },
  ];
}

export class BestiaryScene extends Phaser.Scene {
  private origin: 'TitleScene' | 'GameOverScene' = 'TitleScene';
  private settlement: SettlementData | null = null;

  constructor() {
    super('BestiaryScene');
  }

  init(data?: BestiarySceneData): void {
    if (data?.origin === 'GameOverScene') {
      this.origin = 'GameOverScene';
      this.settlement = data.settlement;
    } else {
      this.origin = 'TitleScene';
      this.settlement = null;
    }
  }

  create(): void {
    ensureGameTextures(this);
    buildNightAlleyBackdrop(this, 0);

    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 912, 504, 0x1b2a4a)
      .setStrokeStyle(2, 0x8fa8c8)
      .setDepth(10);

    addPixelText(this, ARENA_WIDTH / 2, 48, '图册', {
      size: 24,
      color: PALETTE.lanternYellow,
      origin: 0.5,
    }).setDepth(11);

    addPixelText(
      this,
      ARENA_WIDTH / 2,
      76,
      '开局数值 · 血量提升 · 移速提升 · 疾纸人血量固定 · 大心魔数值固定',
      {
        size: 12,
        color: PALETTE.silverBlue,
        origin: 0.5,
      },
    ).setDepth(11);

    const entries = buildBestiaryEntries();
    entries.forEach((entry, idx) => {
      const cx = CARD_COLS[idx % 3];
      const cy = CARD_ROWS[Math.floor(idx / 3)];
      const left = cx - CARD_W / 2;
      const top = cy - CARD_H / 2;

      this.add
        .rectangle(cx, cy, CARD_W, CARD_H, 0x10182b)
        .setStrokeStyle(1, 0x2e4a73)
        .setDepth(11);

      this.add.image(left + 36, top + 36, entry.texture).setDisplaySize(48, 48).setDepth(12);

      addPixelText(this, left + 68, top + 25, entry.name, {
        size: 24,
        color: PALETTE.paperWhite,
        origin: [0, 0.5],
      }).setDepth(12);

      addPixelText(
        this,
        left + 68,
        top + 50,
        `血量 ${entry.maxHp} · 移速 ${formatSpeed(entry.speed)}`,
        {
          size: 12,
          color: PALETTE.candleLight,
          origin: [0, 0.5],
        },
      ).setDepth(12);

      entry.details.slice(0, 3).forEach((line, lineIdx) => {
        addPixelText(this, left + 12, top + 78 + lineIdx * 20, line, {
          size: 12,
          color: PALETTE.candleLight,
          origin: [0, 0.5],
        }).setDepth(12);
      });

      const killLabel = this.settlement
        ? `本局击杀 ${this.settlement.killsByKind[entry.kind]}`
        : '本局击杀 未开局';
      addPixelText(this, left + 268, top + 146, killLabel, {
        size: 12,
        color: PALETTE.lanternYellow,
        origin: [1, 0.5],
      }).setDepth(12);
    });

    const goBack = (): void => {
      if (this.origin === 'GameOverScene' && this.settlement) {
        this.scene.start('GameOverScene', this.settlement);
      } else {
        this.scene.start('TitleScene');
      }
    };

    const backBtn = this.add
      .rectangle(ARENA_WIDTH / 2, 476, 170, 44, 0x10182b)
      .setStrokeStyle(2, 0x8fa8c8)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    const backLabel = addPixelText(this, ARENA_WIDTH / 2, 476, '返回', {
      size: 24,
      color: PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(12);

    backBtn.on('pointerover', () => {
      backBtn.setFillStyle(0x2e4a73);
      backLabel.setTint(0xe8b34b);
    });
    backBtn.on('pointerout', () => {
      backBtn.setFillStyle(0x10182b);
      backLabel.setTint(0xfbf6e9);
    });
    backBtn.on('pointerdown', goBack);

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', goBack);
    const cleanupKey = (): void => {
      kb?.off('keydown-ESC', goBack);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupKey);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupKey);

    registerDebugHook({
      getState: () => {
        const s = this.origin === 'GameOverScene' ? this.settlement : null;
        return {
          scene: 'BestiaryScene',
          hp: s ? (s.won ? PLAYER_MAX_HP : 0) : PLAYER_MAX_HP,
          maxHp: PLAYER_MAX_HP,
          level: s ? s.level : 1,
          xp: 0,
          kills: s ? s.kills : 0,
          killsByKind: s ? { ...s.killsByKind } : createEmptyKillCounts(),
          timeLeft: s
            ? s.won
              ? 0
              : Math.max(0, ROUND_DURATION_SECONDS - s.survivedSeconds)
            : ROUND_DURATION_SECONDS,
          enemies: 0,
          maxConcurrent: s ? s.maxConcurrent : 0,
          weapons: ['peach_sword'],
          evolvedWeapons: [],
          playerX: ARENA_WIDTH / 2,
          playerY: ARENA_HEIGHT / 2,
          isLevelUpOpen: false,
          levelUpChoices: [],
          bossSpawned: false,
          bossAlive: false,
          bossDying: false,
          bossKillKills: null,
          bossKillMaxConcurrent: null,
          settlement: s ? { ...s, killsByKind: { ...s.killsByKind } } : null,
        };
      },
      addXp: () => {},
      setTimeLeft: () => {},
      setHp: () => {},
      spawnEnemyNearPlayer: () => {},
    });
  }
}
