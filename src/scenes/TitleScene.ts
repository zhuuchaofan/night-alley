import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_MAX_HP,
  ROUND_DURATION_SECONDS,
} from '../game/balance.ts';
import { createEmptyKillCounts, registerDebugHook } from '../game/debug.ts';
import { requestLandscapeOnStart } from '../game/landscape.ts';
import { addPixelText } from '../game/pixelFont.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';
import { getSoundState, setSoundMuted, unlockSound } from '../game/sound.ts';

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

    const bestiaryBtn = this.add
      .rectangle(ARENA_WIDTH / 2, 380, 170, 44, 0x10182b)
      .setStrokeStyle(2, 0x8fa8c8)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    const bestiaryLabel = addPixelText(this, ARENA_WIDTH / 2, 380, '图册', {
      size: 24,
      color: PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(11);

    bestiaryBtn.on('pointerover', () => {
      bestiaryBtn.setFillStyle(0x2e4a73);
      bestiaryLabel.setTint(0xe8b34b);
    });
    bestiaryBtn.on('pointerout', () => {
      bestiaryBtn.setFillStyle(0x10182b);
      bestiaryLabel.setTint(0xfbf6e9);
    });
    bestiaryBtn.on('pointerdown', () => {
      this.scene.start('BestiaryScene', { origin: 'TitleScene' });
    });

    const soundToggle = document.getElementById('sound-toggle') as HTMLButtonElement | null;
    const syncSoundToggle = (): void => {
      if (soundToggle) {
        soundToggle.setAttribute('aria-pressed', String(getSoundState().soundMuted));
      }
    };
    const onToggleClick = (): void => {
      setSoundMuted(!getSoundState().soundMuted);
      syncSoundToggle();
    };
    if (soundToggle) {
      syncSoundToggle();
      soundToggle.hidden = false;
      soundToggle.addEventListener('click', onToggleClick);
    }

    let started = false;
    const startGame = (): void => {
      if (started) {
        return;
      }
      started = true;
      unlockSound();
      requestLandscapeOnStart();
      this.scene.start('GameScene');
    };

    const isNonMousePointer = (pointer: Phaser.Input.Pointer): boolean => {
      if (pointer.wasTouch) {
        return true;
      }
      const nativeType = (pointer.event as { pointerType?: string } | undefined)?.pointerType;
      return typeof nativeType === 'string' && nativeType !== 'mouse';
    };

    let armedPointerId: number | null = null;
    const clearArmForPointer = (pointer: Phaser.Input.Pointer): void => {
      if (armedPointerId !== null && pointer.id === armedPointerId) {
        armedPointerId = null;
      }
    };
    const clearAllArm = (): void => {
      armedPointerId = null;
    };

    startBtn.on('pointerover', () => {
      startBtn.setFillStyle(0x5a3a22);
      startLabel.setTint(0xe8b34b);
    });
    startBtn.on('pointerout', () => {
      startBtn.setFillStyle(0x2e2118);
      startLabel.setTint(0xfbf6e9);
    });
    startBtn.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (isNonMousePointer(pointer)) {
        if (armedPointerId === null) {
          armedPointerId = pointer.id;
        }
        return;
      }
      startGame();
    });
    startBtn.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (armedPointerId !== null && pointer.id === armedPointerId) {
        armedPointerId = null;
        if (!pointer.wasCanceled) {
          startGame();
        }
      }
    });

    this.input.on('pointerup', clearArmForPointer);
    this.input.on('pointerupoutside', clearArmForPointer);
    window.addEventListener('touchcancel', clearAllArm);
    window.addEventListener('pointercancel', clearAllArm);

    const onStartKey = (event: KeyboardEvent): void => {
      if (
        soundToggle &&
        (event.target === soundToggle || document.activeElement === soundToggle)
      ) {
        return;
      }
      startGame();
    };
    const kb = this.input.keyboard;
    kb?.on('keydown-ENTER', onStartKey);
    kb?.on('keydown-SPACE', onStartKey);

    let cleanedUp = false;
    const cleanupTitle = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      // Unregister the pending DESTROY listener too: the scene is stopped,
      // not destroyed, on a normal Title exit, so without this the listener
      // (and this visit's closure) would pile up one per visit.
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanupTitle);
      if (soundToggle) {
        soundToggle.removeEventListener('click', onToggleClick);
        if (document.activeElement === soundToggle) {
          soundToggle.blur();
        }
        soundToggle.hidden = true;
      }
      this.input.off('pointerup', clearArmForPointer);
      this.input.off('pointerupoutside', clearArmForPointer);
      window.removeEventListener('touchcancel', clearAllArm);
      window.removeEventListener('pointercancel', clearAllArm);
      kb?.off('keydown-ENTER', onStartKey);
      kb?.off('keydown-SPACE', onStartKey);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupTitle);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanupTitle);

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
        killsByKind: createEmptyKillCounts(),
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
