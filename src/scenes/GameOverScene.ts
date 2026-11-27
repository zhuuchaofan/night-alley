import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, formatTime, PLAYER_MAX_HP } from '../game/balance.ts';
import { registerDebugHook, SettlementData } from '../game/debug.ts';

const FONT_FAMILY = 'monospace, sans-serif';

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
    const { won, survivedSeconds, kills, level, maxConcurrent } = this.settlement;

    this.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x14101c);
    this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 560, 360, 0x1d1729)
      .setStrokeStyle(2, won ? 0xe8b34b : 0x9a8fb5);

    this.add
      .text(ARENA_WIDTH / 2, 138, won ? '天亮了 · 守夜成功' : '倒在夜巷', {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: 'bold',
        color: won ? '#e8b34b' : '#e06c75',
      })
      .setOrigin(0.5);

    const lines = [
      `存活时间：${formatTime(survivedSeconds)}`,
      `杀敌数：${kills}`,
      `等级：Lv.${level}`,
      `最高同时在场敌人数：${maxConcurrent}`,
    ];

    lines.forEach((line, idx) => {
      this.add
        .text(ARENA_WIDTH / 2, 206 + idx * 36, line, {
          fontFamily: FONT_FAMILY,
          fontSize: '20px',
          color: '#f2e3c6',
        })
        .setOrigin(0.5);
    });

    this.createButton(370, 405, '再来一局', 0x2e2118, 0xe8b34b, () => {
      this.scene.start('GameScene');
    });

    this.createButton(590, 405, '返回标题', 0x221b30, 0x9a8fb5, () => {
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
        playerX: ARENA_WIDTH / 2,
        playerY: ARENA_HEIGHT / 2,
        isLevelUpOpen: false,
        levelUpChoices: [],
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
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f2e3c6',
      })
      .setOrigin(0.5);

    rect.on('pointerover', () => {
      rect.setFillStyle(0x3a2b46);
    });
    rect.on('pointerout', () => {
      rect.setFillStyle(fillColor);
    });
    rect.on('pointerdown', onClick);
  }
}
