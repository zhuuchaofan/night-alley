import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_MAX_HP,
  ROUND_DURATION_SECONDS,
} from '../game/balance.ts';
import { registerDebugHook } from '../game/debug.ts';

const FONT_FAMILY = 'monospace, sans-serif';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    // Simple greybox night-alley backdrop using colored blocks and circles
    this.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x14101c);
    this.add.rectangle(110, ARENA_HEIGHT / 2, 180, ARENA_HEIGHT, 0x1b1626);
    this.add.rectangle(ARENA_WIDTH - 110, ARENA_HEIGHT / 2, 180, ARENA_HEIGHT, 0x1b1626);
    this.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 420, ARENA_HEIGHT, 0x181322);

    // Subtle lantern & shadow block accents
    this.add.circle(480, 145, 90, 0xe8b34b, 0.08);
    this.add.circle(480, 145, 42, 0xe8b34b, 0.14);
    this.add.circle(260, 390, 10, 0x9a8fb5, 0.55);
    this.add.circle(705, 370, 10, 0x9a8fb5, 0.55);
    this.add.circle(735, 415, 10, 0x9a8fb5, 0.45);

    this.add
      .text(ARENA_WIDTH / 2, 118, '夜 巷', {
        fontFamily: FONT_FAMILY,
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#f2e3c6',
      })
      .setOrigin(0.5);

    this.add
      .text(ARENA_WIDTH / 2, 174, '1987 · 老城夜巷', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#c9973f',
      })
      .setOrigin(0.5);

    this.add
      .text(ARENA_WIDTH / 2, 232, '守夜学徒手持桃木剑，在成群心魔中活到天亮（3 分钟）', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#d4cde0',
      })
      .setOrigin(0.5);

    const startBtn = this.add
      .rectangle(ARENA_WIDTH / 2, 320, 220, 54, 0x2e2118)
      .setStrokeStyle(2, 0xe8b34b)
      .setInteractive({ useHandCursor: true });

    const startLabel = this.add
      .text(ARENA_WIDTH / 2, 320, '开始守夜', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f2e3c6',
      })
      .setOrigin(0.5);

    const startGame = (): void => {
      this.scene.start('GameScene');
    };

    startBtn.on('pointerover', () => {
      startBtn.setFillStyle(0x412e21);
      startLabel.setColor('#ffe5a3');
    });
    startBtn.on('pointerout', () => {
      startBtn.setFillStyle(0x2e2118);
      startLabel.setColor('#f2e3c6');
    });
    startBtn.on('pointerdown', startGame);

    this.input.keyboard?.once('keydown-ENTER', startGame);
    this.input.keyboard?.once('keydown-SPACE', startGame);

    this.add
      .text(ARENA_WIDTH / 2, 412, 'WASD / 方向键 或 按住拖动移动 · 自动攻击 · 升级三选一', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#9a8fb5',
      })
      .setOrigin(0.5);

    registerDebugHook({
      getState: () => ({
        scene: 'TitleScene',
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        level: 1,
        xp: 0,
        kills: 0,
        timeLeft: ROUND_DURATION_SECONDS,
        enemies: 0,
        maxConcurrent: 0,
        weapons: ['peach_sword'],
        playerX: ARENA_WIDTH / 2,
        playerY: ARENA_HEIGHT / 2,
        isLevelUpOpen: false,
        levelUpChoices: [],
        settlement: null,
      }),
      addXp: () => {},
      setTimeLeft: () => {},
      setHp: () => {},
      spawnEnemyNearPlayer: () => {},
    });
  }
}
