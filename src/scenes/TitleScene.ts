import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_MAX_HP,
  ROUND_DURATION_SECONDS,
} from '../game/balance.ts';
import { registerDebugHook } from '../game/debug.ts';
import { addPixelText } from '../game/pixelFont.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    ensureGameTextures(this);
    buildNightAlleyBackdrop(this, 0);

    // Pixel showcase sprites flanking the start button
    this.add.image(210, 322, 'player_idle').setDepth(5);
    this.add.image(730, 304, 'enemy_paper').setFlipX(true).setDepth(5);
    this.add.image(782, 344, 'enemy_lantern').setFlipX(true).setDepth(5);

    // Title + shadow (48px = 4x 12px source)
    addPixelText(this, ARENA_WIDTH / 2 + 2, 76 + 2, '夜 巷', {
      size: 48,
      color: PALETTE.inkBlack,
      origin: 0.5,
    }).setDepth(10);
    addPixelText(this, ARENA_WIDTH / 2, 76, '夜 巷', {
      size: 48,
      color: PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(11);

    addPixelText(this, ARENA_WIDTH / 2 + 2, 132 + 2, 'NIGHT ALLEY', {
      size: 48,
      color: PALETTE.inkBlack,
      origin: 0.5,
    }).setDepth(10);
    addPixelText(this, ARENA_WIDTH / 2, 132, 'NIGHT ALLEY', {
      size: 48,
      color: PALETTE.lanternYellow,
      origin: 0.5,
    }).setDepth(11);

    addPixelText(this, ARENA_WIDTH / 2, 182, '1987 · 老城夜巷', {
      size: 24,
      color: PALETTE.oldPaper,
      origin: 0.5,
    }).setDepth(11);

    this.add
      .rectangle(ARENA_WIDTH / 2, 234, 680, 38, 0x10182b)
      .setStrokeStyle(2, 0x2e4a73)
      .setDepth(10);
    addPixelText(
      this,
      ARENA_WIDTH / 2,
      234,
      '守夜学徒手持桃木剑，在成群心魔中活到天亮（3 分钟）',
      {
        size: 24,
        color: PALETTE.candleLight,
        origin: 0.5,
      },
    ).setDepth(11);

    const startBtn = this.add
      .rectangle(ARENA_WIDTH / 2, 320, 220, 56, 0x2e2118)
      .setStrokeStyle(2, 0xe8b34b)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    const startLabel = addPixelText(this, ARENA_WIDTH / 2, 320, '开始守夜', {
      size: 24,
      color: PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(11);

    const startGame = (): void => {
      this.scene.start('GameScene');
    };

    startBtn.on('pointerover', () => {
      startBtn.setFillStyle(0x5a3a22);
      startLabel.setTint(0xe8b34b);
    });
    startBtn.on('pointerout', () => {
      startBtn.setFillStyle(0x2e2118);
      startLabel.setTint(0xfbf6e9);
    });
    startBtn.on('pointerdown', startGame);

    this.input.keyboard?.once('keydown-ENTER', startGame);
    this.input.keyboard?.once('keydown-SPACE', startGame);

    this.add
      .rectangle(ARENA_WIDTH / 2, 434, 710, 38, 0x10182b)
      .setStrokeStyle(2, 0x2e4a73)
      .setDepth(10);
    addPixelText(
      this,
      ARENA_WIDTH / 2,
      434,
      'WASD / 方向键 或 按住拖动移动 · 自动攻击 · 升级三选一',
      {
        size: 24,
        color: PALETTE.silverBlue,
        origin: 0.5,
      },
    ).setDepth(11);

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
        settlement: null,
      }),
      addXp: () => {},
      setTimeLeft: () => {},
      setHp: () => {},
      spawnEnemyNearPlayer: () => {},
    });
  }
}
