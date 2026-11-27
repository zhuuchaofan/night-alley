import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, formatTime, PLAYER_MAX_HP } from '../game/balance.ts';
import { registerDebugHook, SettlementData } from '../game/debug.ts';
import { addPixelText } from '../game/pixelFont.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';

export class GameOverScene extends Phaser.Scene {
  private settlement: SettlementData = {
    won: false,
    survivedSeconds: 0,
    kills: 0,
    level: 1,
    maxConcurrent: 0,
  };

  constructor() {
    super('GameOverScene');
  }

  init(data?: SettlementData): void {
    if (data) {
      this.settlement = data;
    }
  }

  create(): void {
    const { won, survivedSeconds, kills, level, maxConcurrent, winReason } = this.settlement;

    ensureGameTextures(this);
    buildNightAlleyBackdrop(this, 0);

    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 620, 380, 0x1b2a4a)
      .setStrokeStyle(2, won ? 0xe8b34b : 0xb03a2e)
      .setDepth(10);

    const heading = !won
      ? '倒在夜巷'
      : winReason === 'boss'
        ? '心魔已除 · 守夜成功'
        : '天亮了 · 守夜成功';
    addPixelText(this, ARENA_WIDTH / 2 + 2, 128 + 2, heading, {
      size: 48,
      color: PALETTE.inkBlack,
      origin: 0.5,
    }).setDepth(11);
    addPixelText(this, ARENA_WIDTH / 2, 128, heading, {
      size: 48,
      color: won ? PALETTE.lanternYellow : PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(12);

    const lines = [
      `存活时间：${formatTime(survivedSeconds)}`,
      `杀敌数：${kills}`,
      `等级：Lv.${level}`,
      `最高同时在场敌人数：${maxConcurrent}`,
    ];

    lines.forEach((line, idx) => {
      addPixelText(this, ARENA_WIDTH / 2, 200 + idx * 38, line, {
        size: 24,
        color: PALETTE.candleLight,
        origin: 0.5,
      }).setDepth(11);
    });

    this.createButton(370, 405, '再来一局', 0x2e2118, 0xe8b34b, () => {
      this.scene.start('GameScene');
    });

    this.createButton(590, 405, '返回标题', 0x10182b, 0x8fa8c8, () => {
      this.scene.start('TitleScene');
    });

    registerDebugHook({
      getState: () => ({
        scene: 'GameOverScene',
        hp: won ? PLAYER_MAX_HP : 0,
        maxHp: PLAYER_MAX_HP,
        level,
        xp: 0,
        kills,
        timeLeft: won ? 0 : Math.max(0, 180 - survivedSeconds),
        enemies: 0,
        maxConcurrent,
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
        settlement: { ...this.settlement },
      }),
      addXp: () => {},
      setTimeLeft: () => {},
      setHp: () => {},
      spawnEnemyNearPlayer: () => {},
    });
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    fillColor: number,
    borderColor: number,
    onClick: () => void,
  ): void {
    const rect = this.add
      .rectangle(x, y, 170, 48, fillColor)
      .setStrokeStyle(2, borderColor)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    const text = addPixelText(this, x, y, label, {
      size: 24,
      color: PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(12);

    rect.on('pointerover', () => {
      rect.setFillStyle(0x2e4a73);
      text.setTint(0xe8b34b);
    });
    rect.on('pointerout', () => {
      rect.setFillStyle(fillColor);
      text.setTint(0xfbf6e9);
    });
    rect.on('pointerdown', onClick);
  }
}
