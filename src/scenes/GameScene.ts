import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BOSS_SPAWN_ELAPSED_SECONDS,
  BOSS_STATS,
  createInitialPlayerStats,
  displayWeaponName,
  ELITE_XP_ORBS,
  ENEMY_RADIUS,
  type EnemyKind,
  enemyStatsForKind,
  EVOLUTION_DEFS,
  formatTime,
  HUD_HEIGHT,
  MAX_ENEMIES,
  ORB_PULL_SPEED,
  ORB_RADIUS,
  pickSpawnKind,
  PLAYER_RADIUS,
  PlayerStats,
  ROUND_DURATION_SECONDS,
  SHOOTER_BOLT_DAMAGE,
  SHOOTER_BOLT_RADIUS,
  SHOOTER_BOLT_SPEED,
  SHOOTER_FIRE_COOLDOWN,
  SHOOTER_RANGE,
  SHOOTER_RETREAT_DIST,
  SPAWN_MARGIN,
  type SpawnEnemyKind,
  spawnIntervalAt,
  WEAPON_ORDER,
  XP_PER_ORB,
  xpNeededForLevel,
} from '../game/balance.ts';
import { applyChoice, ChoiceOption, generateChoices } from '../game/choices.ts';
import {
  createEmptyKillCounts,
  DebugChoiceInfo,
  KillCountsByKind,
  registerDebugHook,
  SettlementData,
} from '../game/debug.ts';
import { playSound } from '../game/sound.ts';
import {
  computeJoystickDimensions,
  computeJoystickInput,
  followJoystickBase,
  JoystickDimensions,
} from '../game/joystick.ts';
import { addPixelText, wrapPixelText } from '../game/pixelFont.ts';
import {
  applyKnockbackImpulse,
  BOSS_DEATH_CINEMATIC_SECONDS,
  BOSS_DEATH_SLOW_MO_SCALE,
  BOSS_RENDER_HALF_WIDTH,
  canMergeDamageNumber,
  computeClampedRenderPos,
  computeDamageNumberAlpha,
  computeDamageNumberPos,
  computeOrbScatterOffset,
  computeOrbScatterVelocity,
  computeSwingPose,
  DAMAGE_NUMBER_DURATION,
  DAMAGE_NUMBER_RISE_SPEED,
  deathBurstSpec,
  decayKnockbackOffset,
  ENEMY_HIT_FLASH_DURATION,
  ENEMY_RENDER_HALF_WIDTH,
  formatDamageNumber,
  MAX_BURST_PARTICLES,
  MAX_DAMAGE_NUMBERS,
  OrbScatterVelocity,
  PLAYER_HIT_FLASH_DURATION,
  PLAYER_SCREEN_FLASH_DURATION,
  PLAYER_SCREEN_FLASH_MAX_ALPHA,
  PLAYER_SHAKE_DURATION_MS,
  PLAYER_SHAKE_INTENSITY,
  SWING_ANIM_DURATION,
} from '../game/gameFeel.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';
import { computeSlashPlacement } from '../game/slash.ts';

interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  attackCooldown: number;
  attackCooldownRemaining: number;
  fireCooldown: number;
  retreating: boolean;
  hitFlash: number;
  knockbackOffsetX: number;
  knockbackOffsetY: number;
  sprite: Phaser.GameObjects.Image;
}

interface EnemyBoltEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  sprite: Phaser.GameObjects.Image;
}

interface OrbEntity {
  x: number;
  y: number;
  scatterVx: number;
  scatterVy: number;
  scatterTimer: number;
  scatterMaxTimer: number;
  scatterOffsetX: number;
  scatterOffsetY: number;
  hopPeak: number;
  sprite: Phaser.GameObjects.Image;
}

interface DamageNumberEntity {
  enemyId: number;
  amount: number;
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  sinceLastHit: number;
  totalLife: number;
  text: Phaser.GameObjects.BitmapText;
  shadowText: Phaser.GameObjects.BitmapText;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  timer: number;
  maxTimer: number;
  /** Current tumble angle (rad); fragments spin as they fly. */
  rot: number;
  /** Tumble speed (rad/s). */
  spin: number;
}

interface DartEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  sprite: Phaser.GameObjects.Image;
}

interface SlashEffect {
  x: number;
  y: number;
  angle: number;
  range: number;
  arcDeg: number;
  timer: number;
  maxTimer: number;
  sprite: Phaser.GameObjects.Image;
}

interface MovementKeys {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

const CHOICE_CARD_X = [188, 480, 772];
const CHOICE_CARD_Y = 310;
const CHOICE_CARD_W = 280;
const CHOICE_CARD_H = 210;

const CATEGORY_LABEL: Record<ChoiceOption['category'], { text: string; color: string }> = {
  new_weapon: { text: '新武器', color: PALETTE.lanternYellow },
  weapon_upgrade: { text: '武器强化', color: PALETTE.silverBlue },
  evolution: { text: '武器进化', color: PALETTE.lanternYellow },
  stat: { text: '属性提升', color: PALETTE.jadeGreen },
};

function normalizeAngleDiff(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

export class GameScene extends Phaser.Scene {
  private stats!: PlayerStats;
  private playerX = ARENA_WIDTH / 2;
  private playerY = (ARENA_HEIGHT + HUD_HEIGHT) / 2;
  private playerHitFlash = 0;
  private playerScreenFlash = 0;
  private playerSwingTimer = 0;
  private playerSwingAngle = 0;
  private playerFacingLeft = false;
  private playerWalkTimer = 0;
  private playerMoving = false;

  private level = 1;
  private xp = 0;
  private kills = 0;
  private killsByKind: KillCountsByKind = createEmptyKillCounts();
  private elapsedSeconds = 0;
  private timeLeft = ROUND_DURATION_SECONDS;
  private maxConcurrent = 0;
  private nextEnemyId = 1;
  private damageNumberCounter = 0;
  private ended = false;

  private enemies: EnemyEntity[] = [];
  private enemyBolts: EnemyBoltEntity[] = [];
  private orbs: OrbEntity[] = [];
  private darts: DartEntity[] = [];
  private slashes: SlashEffect[] = [];
  private damageNumbers: DamageNumberEntity[] = [];
  private burstParticles: BurstParticle[] = [];

  private spawnTimer = 0.4;
  private swordCooldown = 0;
  private dartCooldown = 0;
  private lanternActiveRemaining = 0;
  private lanternTickTimer = 0;
  private lanternCooldownRemaining = 0;
  private lanternAnimTimer = 0;

  private isDragging = false;
  private activeDragPointerId: number | null = null;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private dragCurrentX = 0;
  private dragCurrentY = 0;
  private joystickAlpha = 0;
  private windowMouseMoveHandler: ((event: MouseEvent) => void) | null = null;

  private isLevelUpOpen = false;
  private levelUpInputLocked = false;
  private activeChoices: DebugChoiceInfo[] = [];
  private levelUpModal: Phaser.GameObjects.Container | null = null;

  private bossSpawned = false;
  /** Boss-death cinematic in progress: world runs in slow motion, win settles after it. */
  private bossDying = false;
  private bossDeathTimer = 0;
  /** Settlement counters frozen at the lethal boss hit (see debug.ts). */
  private bossKillKills: number | null = null;
  private bossKillMaxConcurrent: number | null = null;
  private bossBanner: Phaser.GameObjects.Container | null = null;
  private bossBannerTimer = 0;
  private bannerKind: 'boss' | 'evolution' | null = null;

  private keys: MovementKeys | null = null;
  private worldGfx!: Phaser.GameObjects.Graphics;
  private joystickGfx!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Image;
  private lanternRingSprite!: Phaser.GameObjects.Image;
  private playerDamageFlashRect!: Phaser.GameObjects.Rectangle;

  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.BitmapText;
  private timerText!: Phaser.GameObjects.BitmapText;
  private levelText!: Phaser.GameObjects.BitmapText;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private killsText!: Phaser.GameObjects.BitmapText;
  private loadoutBg!: Phaser.GameObjects.Rectangle;
  private loadoutText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetRunState();
    ensureGameTextures(this);
    buildNightAlleyBackdrop(this, HUD_HEIGHT);

    this.lanternRingSprite = this.add
      .image(this.playerX, this.playerY, 'lantern_ring_1')
      .setDepth(6)
      .setVisible(false);
    this.playerSprite = this.add
      .image(this.playerX, this.playerY, 'player_idle')
      .setDepth(10);

    this.worldGfx = this.add.graphics().setDepth(13);
    this.playerDamageFlashRect = this.add
      .rectangle(
        ARENA_WIDTH / 2,
        (HUD_HEIGHT + ARENA_HEIGHT) / 2,
        ARENA_WIDTH,
        ARENA_HEIGHT - HUD_HEIGHT,
        0xb03a2e,
        1,
      )
      .setAlpha(0)
      .setDepth(18);
    this.joystickGfx = this.add.graphics().setDepth(25);
    this.createHud();
    this.setupInputs();
    this.registerSceneDebugHook();
    this.updateHud();
    this.renderWorld();
  }

  private resetRunState(): void {
    this.stats = createInitialPlayerStats();
    this.playerX = ARENA_WIDTH / 2;
    this.playerY = (ARENA_HEIGHT + HUD_HEIGHT) / 2;
    this.playerHitFlash = 0;
    this.playerScreenFlash = 0;
    this.playerSwingTimer = 0;
    this.playerSwingAngle = 0;
    this.playerFacingLeft = false;
    this.playerWalkTimer = 0;
    this.playerMoving = false;

    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.killsByKind = createEmptyKillCounts();
    this.elapsedSeconds = 0;
    this.timeLeft = ROUND_DURATION_SECONDS;
    this.maxConcurrent = 0;
    this.nextEnemyId = 1;
    this.damageNumberCounter = 0;
    this.ended = false;

    this.enemies = [];
    this.enemyBolts = [];
    this.orbs = [];
    this.darts = [];
    this.slashes = [];
    this.damageNumbers = [];
    this.burstParticles = [];

    this.spawnTimer = 0.4;
    this.swordCooldown = 0;
    this.dartCooldown = 0;
    this.lanternActiveRemaining = 0;
    this.lanternTickTimer = 0;
    this.lanternCooldownRemaining = 0;
    this.lanternAnimTimer = 0;

    this.isDragging = false;
    this.activeDragPointerId = null;
    this.joystickAlpha = 0;
    this.isLevelUpOpen = false;
    this.activeChoices = [];
    this.levelUpModal = null;

    this.bossSpawned = false;
    this.bossDying = false;
    this.bossDeathTimer = 0;
    this.bossKillKills = null;
    this.bossKillMaxConcurrent = null;
    this.bossBanner = null;
    this.bossBannerTimer = 0;
    this.bannerKind = null;
  }

  private createHud(): void {
    this.add
      .rectangle(ARENA_WIDTH / 2, HUD_HEIGHT / 2, ARENA_WIDTH, HUD_HEIGHT, 0x10182b)
      .setDepth(20);
    this.add
      .rectangle(ARENA_WIDTH / 2, HUD_HEIGHT, ARENA_WIDTH, 2, 0x2e4a73)
      .setDepth(20);

    // Left: HP bar + label
    this.add
      .rectangle(14, 22, 110, 16, 0x1b2a4a)
      .setStrokeStyle(2, 0x17120c)
      .setOrigin(0, 0.5)
      .setDepth(21);
    this.hpBarFill = this.add.rectangle(14, 22, 110, 16, 0xb03a2e).setOrigin(0, 0.5).setDepth(22);
    this.hpText = addPixelText(this, 132, 22, '', {
      size: 24,
      color: PALETTE.candleLight,
      origin: [0, 0.5],
    }).setDepth(22);

    // Center: countdown
    this.timerText = addPixelText(this, ARENA_WIDTH / 2, 22, '', {
      size: 24,
      color: PALETTE.lanternYellow,
      origin: 0.5,
    }).setDepth(22);

    // Right: level + XP bar + kills
    this.levelText = addPixelText(this, 570, 22, '', {
      size: 24,
      color: PALETTE.jadeGreen,
      origin: [0, 0.5],
    }).setDepth(22);

    this.add
      .rectangle(644, 22, 120, 14, 0x1b2a4a)
      .setStrokeStyle(2, 0x17120c)
      .setOrigin(0, 0.5)
      .setDepth(21);
    this.xpBarFill = this.add.rectangle(644, 22, 0, 14, 0x4e7a5a).setOrigin(0, 0.5).setDepth(22);

    this.killsText = addPixelText(this, 946, 22, '', {
      size: 24,
      color: PALETTE.candleLight,
      origin: [1, 0.5],
    }).setDepth(22);

    this.loadoutBg = this.add
      .rectangle(10, ARENA_HEIGHT - 8, 120, 30, 0x10182b)
      .setStrokeStyle(2, 0x2e4a73)
      .setOrigin(0, 1)
      .setDepth(19);
    this.loadoutText = addPixelText(this, 18, ARENA_HEIGHT - 12, '', {
      size: 24,
      color: PALETTE.silverBlue,
      origin: [0, 1],
    }).setDepth(20);
  }

  private getJoystickDimensions(): JoystickDimensions {
    const displayWidth = this.game.canvas.clientWidth || this.scale.displaySize.width;
    return computeJoystickDimensions(displayWidth / ARENA_WIDTH);
  }

  private updateDragPosition(x: number, y: number): void {
    this.dragCurrentX = x;
    this.dragCurrentY = y;
    const nextOrigin = followJoystickBase(
      this.dragOriginX,
      this.dragOriginY,
      this.dragCurrentX,
      this.dragCurrentY,
      this.getJoystickDimensions().maxDistance,
    );
    this.dragOriginX = nextOrigin.x;
    this.dragOriginY = nextOrigin.y;
  }

  private removeWindowMouseMove(): void {
    if (this.windowMouseMoveHandler) {
      window.removeEventListener('mousemove', this.windowMouseMoveHandler);
      this.windowMouseMoveHandler = null;
    }
  }

  private setupInputs(): void {
    if (this.input.manager.pointersTotal < 3) {
      this.input.addPointer(3 - this.input.manager.pointersTotal);
    }

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      };
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isLevelUpOpen || this.ended) {
        return;
      }
      if (this.isDragging || pointer.x >= ARENA_WIDTH / 2) {
        return;
      }
      this.isDragging = true;
      this.activeDragPointerId = pointer.id;
      this.dragOriginX = pointer.x;
      this.dragOriginY = pointer.y;
      this.dragCurrentX = pointer.x;
      this.dragCurrentY = pointer.y;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || pointer.id !== this.activeDragPointerId) {
        return;
      }
      this.updateDragPosition(pointer.x, pointer.y);
    });

    this.removeWindowMouseMove();
    this.windowMouseMoveHandler = (event: MouseEvent): void => {
      if (!this.isDragging || this.isLevelUpOpen || this.ended) {
        return;
      }
      if (!this.input.mousePointer || this.activeDragPointerId !== this.input.mousePointer.id) {
        return;
      }
      if (event.target === this.game.canvas) {
        return;
      }
      const rect = this.game.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const gameX = ((event.clientX - rect.left) / rect.width) * ARENA_WIDTH;
      const gameY = ((event.clientY - rect.top) / rect.height) * ARENA_HEIGHT;
      this.updateDragPosition(gameX, gameY);
    };
    window.addEventListener('mousemove', this.windowMouseMoveHandler, { passive: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowMouseMove, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.removeWindowMouseMove, this);

    const stopDrag = (pointer: Phaser.Input.Pointer): void => {
      if (!this.isDragging || pointer.id !== this.activeDragPointerId) {
        return;
      }
      this.isDragging = false;
      this.activeDragPointerId = null;
    };
    this.input.on('pointerup', stopDrag);
    this.input.on('pointerupoutside', stopDrag);
  }

  private registerSceneDebugHook(): void {
    registerDebugHook({
      getState: () => {
        const enemiesByKind: Record<string, number> = {
          paper: 0,
          lantern: 0,
          swift: 0,
          shooter: 0,
          elite: 0,
          boss: 0,
        };
        for (const enemy of this.enemies) {
          enemiesByKind[enemy.kind] = (enemiesByKind[enemy.kind] ?? 0) + 1;
        }
        return {
          scene: 'GameScene',
          hp: Math.round(this.stats.hp * 100) / 100,
          maxHp: this.stats.maxHp,
          level: this.level,
          xp: this.xp,
          kills: this.kills,
          killsByKind: { ...this.killsByKind },
          timeLeft: Math.round(this.timeLeft * 1000) / 1000,
          enemies: this.enemies.length,
          enemiesByKind,
          bolts: this.enemyBolts.map((b) => ({
            x: Math.round(b.x * 100) / 100,
            y: Math.round(b.y * 100) / 100,
          })),
          maxConcurrent: this.maxConcurrent,
          weapons: WEAPON_ORDER.filter((id) => Boolean(this.stats.weapons[id])),
          evolvedWeapons: WEAPON_ORDER.filter((id) => Boolean(this.stats.weapons[id]?.evolved)),
          loadoutText: this.loadoutText.text,
          playerX: Math.round(this.playerX * 100) / 100,
          playerY: Math.round(this.playerY * 100) / 100,
          isLevelUpOpen: this.isLevelUpOpen,
          levelUpChoices: this.activeChoices.map((c) => ({ ...c })),
          bossSpawned: this.bossSpawned,
          bossAlive: this.enemies.some((enemy) => enemy.kind === 'boss'),
          bossDying: this.bossDying,
          bossKillKills: this.bossKillKills,
          bossKillMaxConcurrent: this.bossKillMaxConcurrent,
          slashes: this.slashes.map((slash) => ({
            x: Math.round(slash.sprite.x * 100) / 100,
            y: Math.round(slash.sprite.y * 100) / 100,
            rotation: Math.round(slash.sprite.rotation * 10000) / 10000,
            displayWidth: Math.round(slash.sprite.displayWidth * 100) / 100,
            displayHeight: Math.round(slash.sprite.displayHeight * 100) / 100,
          })),
          gameFeel: {
            playerTexture: this.playerSprite?.texture.key ?? 'player_idle',
            playerSwinging: this.playerSwingTimer > 0,
            playerSwingAngle: Math.round(this.playerSwingAngle * 10000) / 10000,
            playerScreenFlash: Math.round(this.playerScreenFlash * 1000) / 1000,
            damageNumbers: this.damageNumbers.map((dn) => ({
              text: dn.text.text,
              x: Math.round(dn.x * 100) / 100,
              y: Math.round(dn.y * 100) / 100,
              alpha: Math.round(dn.text.alpha * 1000) / 1000,
            })),
            burstParticles: this.burstParticles.length,
            scatteringOrbs: this.orbs.filter((orb) => orb.scatterTimer > 0).length,
            orbs: this.orbs.map((orb) => ({
              x: Math.round(orb.x * 100) / 100,
              y: Math.round(orb.y * 100) / 100,
              renderX: Math.round(orb.sprite.x * 100) / 100,
              renderY: Math.round(orb.sprite.y * 100) / 100,
              scattering: orb.scatterTimer > 0,
            })),
            enemies: this.enemies.map((enemy) => {
              const halfWidth =
                enemy.kind === 'boss'
                  ? BOSS_RENDER_HALF_WIDTH
                  : enemy.kind === 'elite'
                    ? 44
                    : ENEMY_RENDER_HALF_WIDTH;
              const renderPos = computeClampedRenderPos(
                enemy.x,
                enemy.y,
                enemy.knockbackOffsetX,
                enemy.knockbackOffsetY,
                halfWidth,
              );
              return {
                id: enemy.id,
                kind: enemy.kind,
                x: Math.round(enemy.x * 100) / 100,
                y: Math.round(enemy.y * 100) / 100,
                renderX: Math.round(renderPos.x * 100) / 100,
                renderY: Math.round(renderPos.y * 100) / 100,
                hitFlash: Math.round(enemy.hitFlash * 1000) / 1000,
                knockbackX: Math.round(enemy.knockbackOffsetX * 100) / 100,
                knockbackY: Math.round(enemy.knockbackOffsetY * 100) / 100,
              };
            }),
          },
          settlement: null,
        };
      },
      addXp: (n: number) => {
        if (!this.ended && n > 0) {
          this.gainXp(n);
          this.updateHud();
        }
      },
      setTimeLeft: (s: number) => {
        if (this.ended || this.bossDying) {
          return;
        }
        this.timeLeft = Math.max(0, s);
        this.elapsedSeconds = Math.max(0, ROUND_DURATION_SECONDS - this.timeLeft);
        this.updateHud();
        if (this.timeLeft <= 0) {
          this.finishRun(true);
          return;
        }
        this.checkBossSpawn();
        this.renderWorld();
      },
      setHp: (n: number) => {
        if (this.ended || this.bossDying) {
          return;
        }
        this.stats.hp = Math.max(0, Math.min(this.stats.maxHp, n));
        this.updateHud();
        if (this.stats.hp <= 0) {
          this.finishRun(false);
        }
      },
      spawnEnemyNearPlayer: () => {
        if (this.ended || this.normalEnemyCount() >= MAX_ENEMIES) {
          return;
        }
        const offsetX = this.playerX + 55 <= ARENA_WIDTH - ENEMY_RADIUS ? 55 : -55;
        this.spawnEnemyAt(this.playerX + offsetX, this.playerY);
        this.renderWorld();
      },
      spawnEnemyKind: (kind: SpawnEnemyKind, offsetX?: number, offsetY = 0) => {
        if (this.ended || this.normalEnemyCount() >= MAX_ENEMIES) {
          return;
        }
        const dx = offsetX ?? (this.playerX + 55 <= ARENA_WIDTH - ENEMY_RADIUS ? 55 : -55);
        const sx = Phaser.Math.Clamp(this.playerX + dx, ENEMY_RADIUS, ARENA_WIDTH - ENEMY_RADIUS);
        const sy = Phaser.Math.Clamp(
          this.playerY + offsetY,
          HUD_HEIGHT + ENEMY_RADIUS,
          ARENA_HEIGHT - ENEMY_RADIUS,
        );
        this.spawnEnemyAt(sx, sy, kind);
        this.renderWorld();
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.ended) {
      return;
    }

    const rawDt = Math.min(delta / 1000, 0.25);
    // Boss-death cinematic: the world crawls in slow motion while the
    // boss shatters; the win settles on real time, not game time.
    const dt = this.bossDying ? rawDt * BOSS_DEATH_SLOW_MO_SCALE : rawDt;
    if (this.bossDying) {
      this.bossDeathTimer += rawDt;
      if (this.bossDeathTimer >= BOSS_DEATH_CINEMATIC_SECONDS) {
        this.finishRun(true, 'boss');
        return;
      }
    }

    if (!this.isLevelUpOpen) {
      // The round timer freezes during the cinematic: the run is already won.
      if (!this.bossDying) {
        this.elapsedSeconds += dt;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) {
          this.finishRun(true);
          return;
        }
      }

      this.updatePlayerMovement(dt);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      if (this.ended) {
        return;
      }
      this.updateEnemyBolts(dt);
      if (this.ended) {
        return;
      }
      this.updateWeapons(dt);
      if (this.ended) {
        // Boss kill ends the run from inside updateWeapons.
        return;
      }
      this.updateDarts(dt);
      if (this.ended) {
        // Boss kill ends the run from inside updateDarts.
        return;
      }
      this.updateOrbs(dt);
      this.updateEffects(dt);
      if (this.isDragging) {
        this.joystickAlpha = Math.min(1, this.joystickAlpha + dt * 10);
      } else if (this.joystickAlpha > 0) {
        this.joystickAlpha = Math.max(0, this.joystickAlpha - dt * 6);
      }
      this.updateHud();
    }

    this.renderWorld();
  }

  private updatePlayerMovement(dt: number): void {
    let dx = 0;
    let dy = 0;
    let speedFactor = 0;

    if (this.keys) {
      if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      speedFactor = 1;
    } else if (this.isDragging) {
      const { deadzone, maxDistance } = this.getJoystickDimensions();
      const joy = computeJoystickInput(
        this.dragCurrentX - this.dragOriginX,
        this.dragCurrentY - this.dragOriginY,
        deadzone,
        maxDistance,
      );
      dx = joy.dx;
      dy = joy.dy;
      speedFactor = joy.speedFactor;
    }

    this.playerMoving = speedFactor > 0 && (dx !== 0 || dy !== 0);
    if (this.playerMoving) {
      if (dx < -0.05) {
        this.playerFacingLeft = true;
      } else if (dx > 0.05) {
        this.playerFacingLeft = false;
      }
      this.playerWalkTimer += dt;
      this.playerX = Phaser.Math.Clamp(
        this.playerX + dx * this.stats.speed * speedFactor * dt,
        PLAYER_RADIUS,
        ARENA_WIDTH - PLAYER_RADIUS,
      );
      this.playerY = Phaser.Math.Clamp(
        this.playerY + dy * this.stats.speed * speedFactor * dt,
        HUD_HEIGHT + PLAYER_RADIUS,
        ARENA_HEIGHT - PLAYER_RADIUS,
      );
    } else {
      this.playerWalkTimer = 0;
    }

    if (this.playerHitFlash > 0) {
      this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
    }
    if (this.playerSwingTimer > 0) {
      this.playerSwingTimer = Math.max(0, this.playerSwingTimer - dt);
    }
  }

  private randomEdgeSpawnPoint(): { x: number; y: number } {
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) {
      return { x: Math.random() * ARENA_WIDTH, y: -SPAWN_MARGIN };
    }
    if (edge === 1) {
      return { x: ARENA_WIDTH + SPAWN_MARGIN, y: Math.random() * ARENA_HEIGHT };
    }
    if (edge === 2) {
      return { x: Math.random() * ARENA_WIDTH, y: ARENA_HEIGHT + SPAWN_MARGIN };
    }
    return { x: -SPAWN_MARGIN, y: Math.random() * ARENA_HEIGHT };
  }

  private checkBossSpawn(): void {
    if (!this.bossSpawned && this.elapsedSeconds >= BOSS_SPAWN_ELAPSED_SECONDS) {
      this.spawnBoss();
    }
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const { x, y } = this.randomEdgeSpawnPoint();
    const sprite = this.add.image(x, y, 'enemy_boss').setDisplaySize(128, 128).setDepth(9);

    this.enemies.push({
      id: this.nextEnemyId++,
      kind: 'boss',
      x,
      y,
      radius: BOSS_STATS.radius,
      hp: BOSS_STATS.maxHp,
      maxHp: BOSS_STATS.maxHp,
      speed: BOSS_STATS.speed,
      contactDamage: BOSS_STATS.contactDamage,
      attackCooldown: BOSS_STATS.attackCooldown,
      attackCooldownRemaining: 0,
      fireCooldown: 0,
      retreating: false,
      hitFlash: 0,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      sprite,
    });
    if (this.enemies.length > this.maxConcurrent) {
      this.maxConcurrent = this.enemies.length;
    }
    this.showBossBanner();
    playSound('bossEntrance');
  }

  private showBossBanner(): void {
    this.showBanner('大心魔现身', 'boss');
  }

  /** One shared center banner slot (boss spawn, evolution pick, ...). */
  private showBanner(text: string, kind: 'boss' | 'evolution'): void {
    // The boss warning is gameplay-critical: an evolution pick while it
    // is showing must not cut it short. (A boss spawn may overwrite an
    // evolution notice — that direction is fine.)
    if (kind === 'evolution' && this.bannerKind === 'boss') {
      return;
    }
    this.clearBossBanner();
    const banner = this.add.container(0, 0).setDepth(26);
    banner.add(
      addPixelText(this, ARENA_WIDTH / 2 + 2, 80 + 2, text, {
        size: 48,
        color: PALETTE.inkBlack,
        origin: 0.5,
      }),
    );
    banner.add(
      addPixelText(this, ARENA_WIDTH / 2, 80, text, {
        size: 48,
        color: PALETTE.lanternYellow,
        origin: 0.5,
      }),
    );
    this.bossBanner = banner;
    this.bossBannerTimer = 2.5;
    this.bannerKind = kind;
  }

  private clearBossBanner(): void {
    this.bossBanner?.destroy(true);
    this.bossBanner = null;
    this.bossBannerTimer = 0;
    this.bannerKind = null;
  }

  /** Normal (non-boss) enemies on the field; the boss never consumes a normal spawn slot. */
  private normalEnemyCount(): number {
    let count = 0;
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'boss') {
        count += 1;
      }
    }
    return count;
  }

  private updateSpawning(dt: number): void {
    // No spawns during the boss-death cinematic: the run is already won,
    // and a spawn would raise maxConcurrent after the settlement counters
    // froze at the lethal hit.
    if (this.bossDying) {
      return;
    }
    this.checkBossSpawn();

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += spawnIntervalAt(this.elapsedSeconds);
      if (this.normalEnemyCount() < MAX_ENEMIES) {
        const { x, y } = this.randomEdgeSpawnPoint();
        this.spawnEnemyAt(x, y);
      }
    }
  }

  private spawnEnemyAt(x: number, y: number, forcedKind?: SpawnEnemyKind): void {
    const kind: SpawnEnemyKind = forcedKind ?? pickSpawnKind(this.elapsedSeconds, Math.random());
    const template = enemyStatsForKind(kind, this.elapsedSeconds);
    const texKey = `enemy_${kind}`;
    const displaySize = kind === 'elite' ? 88 : 64;
    const sprite = this.add.image(x, y, texKey).setDisplaySize(displaySize, displaySize).setDepth(9);

    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      radius: template.radius,
      hp: template.maxHp,
      maxHp: template.maxHp,
      speed: template.speed,
      contactDamage: template.contactDamage,
      attackCooldown: template.attackCooldown,
      attackCooldownRemaining: 0,
      fireCooldown: kind === 'shooter' ? 0.5 : 0,
      retreating: false,
      hitFlash: 0,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      sprite,
    });
    if (this.enemies.length > this.maxConcurrent) {
      this.maxConcurrent = this.enemies.length;
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      let dx = this.playerX - enemy.x;
      let dy = this.playerY - enemy.y;
      let dist = Math.hypot(dx, dy);

      if (enemy.kind === 'shooter') {
        if (dist < SHOOTER_RETREAT_DIST) {
          enemy.retreating = true;
        } else if (dist >= SHOOTER_RANGE) {
          enemy.retreating = false;
        }

        if (enemy.retreating) {
          const rx = dist > 0.001 ? -dx / dist : 1;
          const ry = dist > 0.001 ? -dy / dist : 0;
          enemy.x = Phaser.Math.Clamp(
            enemy.x + rx * enemy.speed * dt,
            enemy.radius,
            ARENA_WIDTH - enemy.radius,
          );
          enemy.y = Phaser.Math.Clamp(
            enemy.y + ry * enemy.speed * dt,
            HUD_HEIGHT + enemy.radius,
            ARENA_HEIGHT - enemy.radius,
          );
        } else if (dist > SHOOTER_RANGE && dist > 0.001) {
          enemy.x += (dx / dist) * enemy.speed * dt;
          enemy.y += (dy / dist) * enemy.speed * dt;
        }

        dx = this.playerX - enemy.x;
        dy = this.playerY - enemy.y;
        dist = Math.hypot(dx, dy);

        enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
        if (dist <= SHOOTER_RANGE && enemy.fireCooldown <= 0) {
          const ux = dist > 0.001 ? dx / dist : 1;
          const uy = dist > 0.001 ? dy / dist : 0;
          const sprite = this.add
            .image(enemy.x, enemy.y, 'enemy_bolt')
            .setDisplaySize(24, 24)
            .setDepth(11);
          this.enemyBolts.push({
            x: enemy.x,
            y: enemy.y,
            vx: ux * SHOOTER_BOLT_SPEED,
            vy: uy * SHOOTER_BOLT_SPEED,
            radius: SHOOTER_BOLT_RADIUS,
            damage: SHOOTER_BOLT_DAMAGE,
            sprite,
          });
          enemy.fireCooldown = SHOOTER_FIRE_COOLDOWN;
        }
      } else if (dist > 0.001) {
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.y += (dy / dist) * enemy.speed * dt;
      }

      if (enemy.attackCooldownRemaining > 0) {
        enemy.attackCooldownRemaining = Math.max(0, enemy.attackCooldownRemaining - dt);
      }
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      }
      if (enemy.knockbackOffsetX !== 0 || enemy.knockbackOffsetY !== 0) {
        const decayed = decayKnockbackOffset(enemy.knockbackOffsetX, enemy.knockbackOffsetY, dt);
        enemy.knockbackOffsetX = decayed.x;
        enemy.knockbackOffsetY = decayed.y;
      }
    }

    for (let i = 0; i < this.enemies.length; i += 1) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const b = this.enemies[j];
        const minDist = a.radius + b.radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          const push = (minDist - dist) * 0.5;
          const nx = dist > 0.001 ? dx / dist : 1;
          const ny = dist > 0.001 ? dy / dist : 0;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // No contact damage during the boss-death cinematic: the run is already won.
    if (!this.bossDying) {
      for (const enemy of this.enemies) {
        const touchDist = PLAYER_RADIUS + enemy.radius;
        const dist = Math.hypot(this.playerX - enemy.x, this.playerY - enemy.y);
        if (dist <= touchDist && enemy.attackCooldownRemaining <= 0) {
          this.stats.hp = Math.max(0, this.stats.hp - enemy.contactDamage);
          enemy.attackCooldownRemaining = enemy.attackCooldown;
          this.playerHitFlash = PLAYER_HIT_FLASH_DURATION;
          this.playerScreenFlash = PLAYER_SCREEN_FLASH_DURATION;
          if (this.stats.hp <= 0) {
            this.finishRun(false);
            return;
          }
          this.cameras.main.shake(PLAYER_SHAKE_DURATION_MS, PLAYER_SHAKE_INTENSITY);
        }
      }
    }
  }

  private updateEnemyBolts(dt: number): void {
    for (let i = this.enemyBolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.enemyBolts[i];
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;

      if (
        bolt.x < 0 ||
        bolt.x > ARENA_WIDTH ||
        bolt.y < HUD_HEIGHT ||
        bolt.y > ARENA_HEIGHT
      ) {
        bolt.sprite.destroy();
        this.enemyBolts.splice(i, 1);
        continue;
      }

      // Bolts still fly during the boss-death cinematic, but they cannot
      // kill a run that is already won.
      if (
        !this.bossDying &&
        Math.hypot(this.playerX - bolt.x, this.playerY - bolt.y) <= bolt.radius + PLAYER_RADIUS
      ) {
        this.stats.hp = Math.max(0, this.stats.hp - bolt.damage);
        this.playerHitFlash = PLAYER_HIT_FLASH_DURATION;
        this.playerScreenFlash = PLAYER_SCREEN_FLASH_DURATION;
        bolt.sprite.destroy();
        this.enemyBolts.splice(i, 1);
        if (this.stats.hp <= 0) {
          this.finishRun(false);
          return;
        }
        this.cameras.main.shake(PLAYER_SHAKE_DURATION_MS, PLAYER_SHAKE_INTENSITY);
      }
    }
  }

  private updateWeapons(dt: number): void {
    const sword = this.stats.weapons.peach_sword;
    if (sword) {
      this.swordCooldown = Math.max(0, this.swordCooldown - dt);
      if (this.swordCooldown <= 0) {
        const nearest = this.findNearestEnemy(sword.range);
        if (nearest) {
          playSound('swing');
          const angle = Math.atan2(nearest.y - this.playerY, nearest.x - this.playerX);
          const halfArcRad = ((sword.arcDeg / 2) * Math.PI) / 180;
          const dmg = sword.damage * this.stats.damageMultiplier;

          for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
            const enemy = this.enemies[i];
            const dx = enemy.x - this.playerX;
            const dy = enemy.y - this.playerY;
            if (Math.hypot(dx, dy) <= sword.range + enemy.radius) {
              const enemyAngle = Math.atan2(dy, dx);
              if (normalizeAngleDiff(enemyAngle, angle) <= halfArcRad) {
                this.damageEnemyAt(i, dmg, this.playerX, this.playerY, sword.evolved);
              }
            }
          }

          this.playerSwingTimer = SWING_ANIM_DURATION;
          this.playerSwingAngle = angle;

          const placement = computeSlashPlacement(
            this.playerX,
            this.playerY,
            angle,
            sword.range,
            sword.arcDeg,
          );
          const slashSprite = this.add
            .image(placement.x, placement.y, sword.evolved ? 'slash_arc_evolved' : 'slash_arc')
            .setRotation(placement.rotation)
            .setDisplaySize(placement.displayWidth, placement.displayHeight)
            .setDepth(11);

          this.slashes.push({
            x: this.playerX,
            y: this.playerY,
            angle,
            range: sword.range,
            arcDeg: sword.arcDeg,
            timer: 0.18,
            maxTimer: 0.18,
            sprite: slashSprite,
          });
          this.swordCooldown = sword.cooldown;
        }
      }
    }

    const dart = this.stats.weapons.coin_dart;
    if (dart) {
      this.dartCooldown = Math.max(0, this.dartCooldown - dt);
      if (this.dartCooldown <= 0) {
        const targets = this.enemies
          .map((enemy) => ({
            enemy,
            dist: Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY),
          }))
          .filter((item) => item.dist <= dart.range + item.enemy.radius)
          .sort((a, b) => a.dist - b.dist);

        if (targets.length > 0) {
          const dmg = dart.damage * this.stats.damageMultiplier;
          for (let i = 0; i < dart.count; i += 1) {
            const target = targets[i % targets.length].enemy;
            let angle = Math.atan2(target.y - this.playerY, target.x - this.playerX);
            if (i >= targets.length) {
              const step = Math.floor((i - targets.length) / 2) + 1;
              angle += (i % 2 === 0 ? 1 : -1) * step * 0.14;
            }
            const dartSprite = this.add
              .image(this.playerX, this.playerY, dart.evolved ? 'coin_dart_evolved' : 'coin_dart')
              .setDisplaySize(dart.evolved ? 28 : 24, dart.evolved ? 28 : 24)
              .setDepth(11);
            this.darts.push({
              x: this.playerX,
              y: this.playerY,
              vx: Math.cos(angle) * dart.projectileSpeed,
              vy: Math.sin(angle) * dart.projectileSpeed,
              damage: dmg,
              radius: 5,
              sprite: dartSprite,
            });
          }
          this.dartCooldown = dart.cooldown;
        }
      }
    }

    const lantern = this.stats.weapons.lantern_fire;
    if (lantern) {
      if (this.lanternActiveRemaining > 0) {
        this.lanternAnimTimer += dt;
        this.lanternActiveRemaining -= dt;
        this.lanternTickTimer -= dt;
        while (this.lanternTickTimer <= 0) {
          this.lanternTickTimer += lantern.tickInterval;
          const dmg = lantern.damage * this.stats.damageMultiplier;
          for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
            const enemy = this.enemies[i];
            if (Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY) <= lantern.range + enemy.radius) {
              this.damageEnemyAt(i, dmg, this.playerX, this.playerY, lantern.evolved);
            }
          }
        }
        if (this.lanternActiveRemaining <= 0) {
          this.lanternActiveRemaining = 0;
          this.lanternCooldownRemaining = lantern.cooldown;
        }
      } else {
        this.lanternCooldownRemaining -= dt;
        if (this.lanternCooldownRemaining <= 0) {
          this.lanternActiveRemaining = lantern.duration;
          this.lanternTickTimer = 0;
        }
      }
    }
  }

  private updateDarts(dt: number): void {
    for (let i = this.darts.length - 1; i >= 0; i -= 1) {
      const dart = this.darts[i];
      dart.x += dart.vx * dt;
      dart.y += dart.vy * dt;
      dart.sprite.rotation += dt * 10;

      if (
        dart.x < -40 ||
        dart.x > ARENA_WIDTH + 40 ||
        dart.y < HUD_HEIGHT - 40 ||
        dart.y > ARENA_HEIGHT + 40
      ) {
        dart.sprite.destroy();
        this.darts.splice(i, 1);
        continue;
      }

      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        if (Math.hypot(enemy.x - dart.x, enemy.y - dart.y) <= dart.radius + enemy.radius) {
          this.damageEnemyAt(j, dart.damage, dart.x - dart.vx * 0.05, dart.y - dart.vy * 0.05, this.stats.weapons.coin_dart?.evolved ?? false);
          dart.sprite.destroy();
          this.darts.splice(i, 1);
          break;
        }
      }
    }
  }

  private updateOrbs(dt: number): void {
    const collectRadius = PLAYER_RADIUS + ORB_RADIUS + 2;
    for (let i = this.orbs.length - 1; i >= 0; i -= 1) {
      const orb = this.orbs[i];
      if (orb.scatterTimer > 0) {
        orb.scatterTimer = Math.max(0, orb.scatterTimer - dt);
        const offset = computeOrbScatterOffset(
          orb.scatterVx,
          orb.scatterVy,
          orb.scatterTimer,
          orb.scatterMaxTimer,
        );
        orb.scatterOffsetX = offset.x;
        orb.scatterOffsetY = offset.y;
      }

      const dx = this.playerX - orb.x;
      const dy = this.playerY - orb.y;
      const dist = Math.hypot(dx, dy);

      // Do not vacuum the orb mid-scatter: the 0.24s scatter is the visible
      // payoff of a kill, and a close-range kill would otherwise collect the
      // orb in the same update it spawns, so the scatter is never seen.
      if (orb.scatterTimer <= 0 && dist <= collectRadius) {
        orb.sprite.destroy();
        this.orbs.splice(i, 1);
        this.gainXp(XP_PER_ORB);
        continue;
      }

      // Magnet pull only runs after the scatter ends: while the orb is
      // scattering, pulling it can snap it exactly onto the player
      // (dist === 0), and the next frame's dx / dist becomes 0 / 0 = NaN,
      // freezing the orb forever (no XP, no level-ups — live regression).
      if (orb.scatterTimer <= 0 && dist <= this.stats.pickupRadius) {
        const step = Math.min(dist, ORB_PULL_SPEED * dt);
        orb.x += (dx / dist) * step;
        orb.y += (dy / dist) * step;
      }
    }
  }

  private updateEffects(dt: number): void {
    if (this.playerScreenFlash > 0) {
      this.playerScreenFlash = Math.max(0, this.playerScreenFlash - dt);
    }

    if (this.bossBanner) {
      this.bossBannerTimer -= dt;
      if (this.bossBannerTimer <= 0) {
        this.clearBossBanner();
      }
    }

    for (let i = this.slashes.length - 1; i >= 0; i -= 1) {
      const slash = this.slashes[i];
      slash.timer -= dt;
      if (slash.timer <= 0) {
        slash.sprite.destroy();
        this.slashes.splice(i, 1);
      } else {
        const placement = computeSlashPlacement(
          slash.x,
          slash.y,
          slash.angle,
          slash.range,
          slash.arcDeg,
        );
        slash.sprite.setPosition(placement.x, placement.y);
        slash.sprite.setRotation(placement.rotation);
      }
    }

    for (let i = this.damageNumbers.length - 1; i >= 0; i -= 1) {
      const dn = this.damageNumbers[i];
      dn.timer -= dt;
      dn.sinceLastHit += dt;
      dn.totalLife += dt;
      if (dn.timer <= 0) {
        dn.text.destroy();
        dn.shadowText.destroy();
        this.damageNumbers.splice(i, 1);
        continue;
      }
      dn.y -= DAMAGE_NUMBER_RISE_SPEED * dt * (0.4 + 0.6 * (dn.timer / dn.maxTimer));
      const alpha = computeDamageNumberAlpha(dn.timer, dn.maxTimer);
      dn.text.setPosition(Math.round(dn.x), Math.round(dn.y)).setAlpha(alpha);
      dn.shadowText.setPosition(Math.round(dn.x) + 2, Math.round(dn.y) + 2).setAlpha(alpha);
    }

    const drag = Math.max(0, 1 - dt * 5);
    for (let i = this.burstParticles.length - 1; i >= 0; i -= 1) {
      const p = this.burstParticles[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.burstParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      // Fragments tumble as they fly, so the burst reads as shattering.
      p.rot += p.spin * dt;
    }
  }

  private findNearestEnemy(maxRange: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      const dist = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      if (dist <= maxRange + enemy.radius && dist <= bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  private spawnOrbAt(x: number, y: number, scatter?: OrbScatterVelocity): void {
    const orbSprite = this.add
      .image(x, y, 'xp_orb')
      .setDisplaySize(28, 28)
      .setDepth(7);
    this.orbs.push({
      x,
      y,
      scatterVx: scatter?.vx ?? 0,
      scatterVy: scatter?.vy ?? 0,
      scatterTimer: scatter?.duration ?? 0,
      scatterMaxTimer: scatter?.duration ?? 0,
      scatterOffsetX: 0,
      scatterOffsetY: 0,
      hopPeak: scatter?.hopPeak ?? 0,
      sprite: orbSprite,
    });
  }

  private spawnDamageNumber(
    enemy: EnemyEntity,
    damage: number,
    isKill: boolean,
    evolvedHit = false,
  ): void {
    const yOffset = enemy.kind === 'boss' ? 42 : enemy.kind === 'elite' ? 32 : 24;
    for (let i = this.damageNumbers.length - 1; i >= 0; i -= 1) {
      const existing = this.damageNumbers[i];
      if (canMergeDamageNumber(existing, enemy.id)) {
        existing.amount += damage;
        existing.sinceLastHit = 0;
        existing.timer = existing.maxTimer;
        const mergedPos = computeDamageNumberPos(enemy.x, enemy.y, yOffset);
        existing.x = mergedPos.x;
        existing.y = mergedPos.y;
        const label = formatDamageNumber(existing.amount);
        existing.text
          .setText(label)
          .setPosition(Math.round(existing.x), Math.round(existing.y))
          .setAlpha(1);
        existing.shadowText
          .setText(label)
          .setPosition(Math.round(existing.x) + 2, Math.round(existing.y) + 2)
          .setAlpha(1);
        if (isKill || evolvedHit) {
          existing.text.setTint(0xe8b34b);
        }
        if (evolvedHit) {
          // An evolved hit merging into a 24px number must grow it, or the
          // bigger-number signal only appears on fresh numbers.
          existing.text.setFontSize(48);
          existing.shadowText.setFontSize(48);
        }
        return;
      }
    }

    if (this.damageNumbers.length >= MAX_DAMAGE_NUMBERS) {
      const oldest = this.damageNumbers.shift();
      if (oldest) {
        oldest.text.destroy();
        oldest.shadowText.destroy();
      }
    }

    const spread = ((this.damageNumberCounter % 3) - 1) * 6;
    this.damageNumberCounter += 1;
    const { x, y } = computeDamageNumberPos(enemy.x, enemy.y, yOffset, spread);
    const label = formatDamageNumber(damage);
    // Evolved-weapon hits read bigger and gold, so the ×2 damage is
    // visible instead of just wider slash arcs. 48 is the next crisp
    // pixel-font size up from 24 (the font only renders 12/24/48).
    const numberSize = evolvedHit ? 48 : 24;

    const shadowText = addPixelText(this, x + 2, y + 2, label, {
      size: numberSize,
      color: PALETTE.inkBlack,
      origin: 0.5,
    }).setDepth(15);
    const text = addPixelText(this, x, y, label, {
      size: numberSize,
      color: isKill || evolvedHit ? PALETTE.lanternYellow : PALETTE.paperWhite,
      origin: 0.5,
    }).setDepth(16);

    this.damageNumbers.push({
      enemyId: enemy.id,
      amount: damage,
      x,
      y,
      timer: DAMAGE_NUMBER_DURATION,
      maxTimer: DAMAGE_NUMBER_DURATION,
      sinceLastHit: 0,
      totalLife: 0,
      text,
      shadowText,
    });
  }

  private spawnDeathBurst(enemy: EnemyEntity): void {
    const spec = deathBurstSpec(enemy.kind);
    const colorsByKind: Record<EnemyKind, number[]> = {
      boss: [0xb03a2e, 0xe8b34b, 0xfbf6e9],
      elite: [0xb03a2e, 0xe8b34b, 0x4e7a5a],
      shooter: [0xe8b34b, 0xb03a2e],
      swift: [0xfbf6e9, 0x8fa8c8],
      lantern: [0xe8b34b, 0xb03a2e, 0xf2e3c6],
      paper: [0xfbf6e9, 0x8fa8c8, 0xb03a2e],
    };
    const colors = colorsByKind[enemy.kind];

    for (let k = 0; k < spec.count; k += 1) {
      if (this.burstParticles.length >= MAX_BURST_PARTICLES) {
        this.burstParticles.shift();
      }
      const angle = (k / spec.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const speed = spec.speedMin + Math.random() * (spec.speedMax - spec.speedMin);
      const maxTimer = spec.lifetimeMin + Math.random() * (spec.lifetimeMax - spec.lifetimeMin);
      this.burstParticles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: spec.size,
        color: colors[k % colors.length],
        timer: maxTimer,
        maxTimer,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 2 * spec.spinMax,
      });
    }
  }

  private damageEnemyAt(
    index: number,
    damage: number,
    sourceX = this.playerX,
    sourceY = this.playerY,
    evolvedHit = false,
  ): void {
    // The boss kill ends the run inside this call (finishRun captures the
    // settlement), but the sword/lantern loops and the dart update may
    // still be iterating — without this guard they would keep killing
    // after settlement and the settlement would undercount.
    // The bossDying half covers the death cinematic: the lethal hit
    // decides the run, so no damage after it may move the settlement
    // counters (kills / maxConcurrent) while the round timer is frozen.
    if (this.ended || this.bossDying) {
      return;
    }
    const enemy = this.enemies[index];
    enemy.hp -= damage;
    enemy.hitFlash = ENEMY_HIT_FLASH_DURATION;

    const kb = applyKnockbackImpulse(
      enemy.knockbackOffsetX,
      enemy.knockbackOffsetY,
      sourceX,
      sourceY,
      enemy.x,
      enemy.y,
      enemy.kind === 'boss',
    );
    enemy.knockbackOffsetX = kb.x;
    enemy.knockbackOffsetY = kb.y;

    const isKill = enemy.hp <= 0;
    playSound(isKill ? 'kill' : 'hit');
    this.spawnDamageNumber(enemy, damage, isKill, evolvedHit);

    if (isKill) {
      this.spawnDeathBurst(enemy);
      if (enemy.kind === 'boss') {
        // Boss kill starts the death cinematic instead of settling at
        // once: the world runs in slow motion while the boss shatters,
        // and the win settles after it (update() calls finishRun).
        // No XP orbs are dropped.
        enemy.sprite.destroy();
        this.enemies.splice(index, 1);
        this.kills += 1;
        this.killsByKind[enemy.kind] += 1;
        this.bossDying = true;
        this.bossDeathTimer = 0;
        // Freeze the settlement counters at the lethal hit (Codex round-3
        // Block): the round timer stops here, so the win settlement must
        // report exactly these values.
        this.bossKillKills = this.kills;
        this.bossKillMaxConcurrent = this.maxConcurrent;
        return;
      }
      if (enemy.kind === 'elite') {
        for (let k = 0; k < ELITE_XP_ORBS; k += 1) {
          this.spawnOrbAt(enemy.x, enemy.y, computeOrbScatterVelocity(k, ELITE_XP_ORBS));
        }
      } else {
        this.spawnOrbAt(enemy.x, enemy.y, computeOrbScatterVelocity(0, 1));
      }
      enemy.sprite.destroy();
      this.enemies.splice(index, 1);
      this.kills += 1;
      this.killsByKind[enemy.kind] += 1;
    }
  }

  private gainXp(amount: number): void {
    // No level-ups during the boss-death cinematic: the modal would fight
    // the win settlement for the screen.
    if (this.bossDying) {
      return;
    }
    this.xp += amount;
    const needed = xpNeededForLevel(this.level);
    if (!this.isLevelUpOpen && !this.ended && this.xp >= needed) {
      this.xp -= needed;
      this.level += 1;
      this.openLevelUpModal();
    }
  }

  private openLevelUpModal(): void {
    this.isLevelUpOpen = true;
    playSound('levelUp');
    this.isDragging = false;
    this.activeDragPointerId = null;
    this.joystickAlpha = 0;

    const options = generateChoices(this.stats);
    const modal = this.add.container(0, 0).setDepth(30);

    const backdrop = this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x10182b)
      .setInteractive();
    modal.add(backdrop);

    const panelFrame = this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 912, 440, 0x1b2a4a)
      .setStrokeStyle(2, 0xc9973f);
    modal.add(panelFrame);

    modal.add(
      addPixelText(this, ARENA_WIDTH / 2 + 2, 106 + 2, `升至 Lv.${this.level} · 三选一`, {
        size: 48,
        color: PALETTE.inkBlack,
        origin: 0.5,
      }),
    );
    modal.add(
      addPixelText(this, ARENA_WIDTH / 2, 106, `升至 Lv.${this.level} · 三选一`, {
        size: 48,
        color: PALETTE.lanternYellow,
        origin: 0.5,
      }),
    );

    modal.add(
      addPixelText(this, ARENA_WIDTH / 2, 162, '点击一项强化以继续守夜', {
        size: 24,
        color: PALETTE.candleLight,
        origin: 0.5,
      }),
    );

    this.activeChoices = [];
    // Input grace period: the modal pops up while the player is still
    // moving/tapping, so an instant tap would pick a card by accident.
    // Cards render dimmed and ignore input for the first 400ms.
    this.levelUpInputLocked = true;
    const cards: Phaser.GameObjects.Rectangle[] = [];
    options.forEach((opt, idx) => {
      const cx = CHOICE_CARD_X[idx];
      const cy = CHOICE_CARD_Y;
      const badge = CATEGORY_LABEL[opt.category];
      const isEvolution = opt.category === 'evolution';
      const baseFill = isEvolution ? 0x2e2118 : 0x10182b;
      const hoverFill = isEvolution ? 0x5a3a22 : 0x2e4a73;
      const baseStroke = isEvolution ? 0xe8b34b : 0xc9973f;
      const strokeWidth = isEvolution ? 4 : 2;

      const card = this.add
        .rectangle(cx, cy, CHOICE_CARD_W, CHOICE_CARD_H, baseFill)
        .setStrokeStyle(strokeWidth, baseStroke)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0.55);
      cards.push(card);

      const badgeText = addPixelText(this, cx, cy - 74, badge.text, {
        size: 24,
        color: badge.color,
        origin: 0.5,
      });

      const titleText = addPixelText(
        this,
        cx,
        cy - 26,
        wrapPixelText(opt.title, CHOICE_CARD_W - 24, 24),
        {
          size: 24,
          color: PALETTE.paperWhite,
          origin: 0.5,
          align: 1,
        },
      );

      const descText = addPixelText(
        this,
        cx,
        cy + 44,
        wrapPixelText(opt.description, CHOICE_CARD_W - 24, 24),
        {
          size: 24,
          color: PALETTE.candleLight,
          origin: 0.5,
          align: 1,
          lineSpacing: 6,
        },
      );

      card.on('pointerover', () => {
        card.setFillStyle(hoverFill);
        card.setStrokeStyle(strokeWidth, 0xe8b34b);
      });
      card.on('pointerout', () => {
        card.setFillStyle(baseFill);
        card.setStrokeStyle(strokeWidth, baseStroke);
      });
      card.on('pointerdown', () => {
        if (this.levelUpInputLocked) {
          return;
        }
        this.chooseOption(opt);
      });

      modal.add([card, badgeText, titleText, descText]);
      this.activeChoices.push({ id: opt.id, title: opt.title, x: cx, y: cy });
    });

    this.time.delayedCall(400, () => {
      // The modal may already be gone (debug setHp/setTimeLeft can end the
      // run while it is open); only restore cards that still exist.
      if (!this.levelUpModal) {
        return;
      }
      this.levelUpInputLocked = false;
      for (const card of cards) {
        card.setAlpha(1);
      }
    });

    this.levelUpModal = modal;
  }

  private chooseOption(choice: ChoiceOption): void {
    const hadLantern = Boolean(this.stats.weapons.lantern_fire);
    this.stats = applyChoice(this.stats, choice);

    if (!hadLantern && this.stats.weapons.lantern_fire) {
      this.lanternActiveRemaining = this.stats.weapons.lantern_fire.duration;
      this.lanternTickTimer = 0;
      this.lanternCooldownRemaining = 0;
    }

    if (choice.category === 'evolution' && choice.weaponId) {
      this.showBanner(`武器进化 · ${EVOLUTION_DEFS[choice.weaponId].name}`, 'evolution');
    }

    this.levelUpModal?.destroy(true);
    this.levelUpModal = null;
    this.activeChoices = [];
    this.isLevelUpOpen = false;
    this.updateHud();
  }

  private updateHud(): void {
    const hpRatio = Phaser.Math.Clamp(this.stats.hp / this.stats.maxHp, 0, 1);
    this.hpBarFill.setSize(110 * hpRatio, 16);
    this.hpText.setText(`HP ${Math.ceil(this.stats.hp)}/${this.stats.maxHp}`);

    this.timerText.setText(formatTime(this.timeLeft));

    this.levelText.setText(`Lv.${this.level}`);
    const needed = xpNeededForLevel(this.level);
    const xpRatio = Phaser.Math.Clamp(this.xp / needed, 0, 1);
    this.xpBarFill.setSize(120 * xpRatio, 14);
    this.killsText.setText(`击杀 ${this.kills}`);

    const loadout = WEAPON_ORDER.filter((id) => Boolean(this.stats.weapons[id]))
      .map((id) => {
        const weapon = this.stats.weapons[id]!;
        return `${displayWeaponName(weapon)} Lv.${weapon.level}`;
      })
      .join(' · ');
    this.loadoutText.setText(loadout);
    this.loadoutBg.setSize(Math.max(120, Math.round(this.loadoutText.width) + 18), 30);
  }

  private renderWorld(): void {
    const g = this.worldGfx;
    g.clear();

    // Lantern fire pixel ring
    const lantern = this.stats.weapons.lantern_fire;
    if (lantern && this.lanternActiveRemaining > 0) {
      const frameIdx = Math.floor(this.lanternAnimTimer / 0.14) % 2 === 0 ? 1 : 2;
      const ringKey = lantern.evolved
        ? `lantern_ring_${frameIdx}_evolved`
        : `lantern_ring_${frameIdx}`;
      this.lanternRingSprite
        .setTexture(ringKey)
        .setPosition(Math.round(this.playerX), Math.round(this.playerY))
        .setDisplaySize(Math.round(lantern.range * 2), Math.round(lantern.range * 2))
        .setVisible(true);
    } else {
      this.lanternRingSprite.setVisible(false);
    }

    // XP orbs (with render-only scatter offset & hop arc during initial scatter)
    for (const orb of this.orbs) {
      const hopY =
        orb.scatterTimer > 0 && orb.scatterMaxTimer > 0
          ? -Math.sin((1 - orb.scatterTimer / orb.scatterMaxTimer) * Math.PI) * orb.hopPeak
          : 0;
      const renderPos = computeClampedRenderPos(
        orb.x,
        orb.y,
        orb.scatterOffsetX,
        orb.scatterOffsetY + hopY,
        PLAYER_RADIUS,
      );
      orb.sprite.setPosition(Math.round(renderPos.x), Math.round(renderPos.y));
    }

    // Enemies + crisp pixel HP bars (render-only knockback & hit scale pop)
    for (const enemy of this.enemies) {
      const baseKey = `enemy_${enemy.kind}`;
      const texKey = enemy.hitFlash > 0 ? `${baseKey}_hit` : baseKey;
      const halfWidth =
        enemy.kind === 'boss'
          ? BOSS_RENDER_HALF_WIDTH
          : enemy.kind === 'elite'
            ? 44
            : ENEMY_RENDER_HALF_WIDTH;
      const renderPos = computeClampedRenderPos(
        enemy.x,
        enemy.y,
        enemy.knockbackOffsetX,
        enemy.knockbackOffsetY,
        halfWidth,
      );
      const baseSize = enemy.kind === 'boss' ? 128 : enemy.kind === 'elite' ? 88 : 64;
      const hitScale =
        enemy.hitFlash > 0 ? (enemy.kind === 'boss' ? 1.06 : enemy.kind === 'elite' ? 1.09 : 1.12) : 1;
      const displaySize = Math.round(baseSize * hitScale);

      enemy.sprite
        .setTexture(texKey)
        .setPosition(Math.round(renderPos.x), Math.round(renderPos.y))
        .setDisplaySize(displaySize, displaySize)
        .setFlipX(this.playerX < enemy.x);

      if (enemy.kind === 'boss' || enemy.kind === 'elite' || enemy.hp < enemy.maxHp) {
        const w = enemy.kind === 'boss' ? 48 : enemy.kind === 'elite' ? 36 : 24;
        const yOffset = enemy.kind === 'boss' ? 44 : enemy.kind === 'elite' ? 36 : 26;
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        const barX = Math.round(renderPos.x - w / 2);
        const barY = Math.round(renderPos.y - yOffset);
        g.fillStyle(0x10182b, 1);
        g.fillRect(barX - 1, barY - 1, w + 2, 6);
        g.fillStyle(0xb03a2e, 1);
        g.fillRect(barX, barY, Math.max(1, Math.round(w * ratio)), 4);
      }
    }

    // Enemy bolts + 3-segment fading pixel trail
    for (const bolt of this.enemyBolts) {
      bolt.sprite.setPosition(Math.round(bolt.x), Math.round(bolt.y));
      const speed = Math.hypot(bolt.vx, bolt.vy) || 1;
      const bx = -bolt.vx / speed;
      const by = -bolt.vy / speed;
      const trailSpecs: readonly [number, number, number, number][] = [
        [7, 6, 0xe8b34b, 0.65],
        [14, 4, 0xb03a2e, 0.42],
        [21, 3, 0xb03a2e, 0.22],
      ];
      for (const [dist, sz, color, alpha] of trailSpecs) {
        const tx = Math.round(bolt.x + bx * dist - sz / 2);
        const ty = Math.round(bolt.y + by * dist - sz / 2);
        g.fillStyle(color, alpha);
        g.fillRect(tx, ty, sz, sz);
      }
    }

    // Death burst pixel fragments (tumble as they fly, shrink as they fade)
    for (const p of this.burstParticles) {
      const alpha = Math.max(0, p.timer / p.maxTimer);
      const sz = Math.max(2, Math.round(p.size * (0.5 + 0.5 * alpha)));
      g.fillStyle(p.color, alpha);
      g.save();
      g.translateCanvas(Math.round(p.x), Math.round(p.y));
      g.rotateCanvas(p.rot);
      g.fillRect(Math.round(-sz / 2), Math.round(-sz / 2), sz, sz);
      g.restore();
    }

    // Player sprite (hit flash -> 2-frame sword swing -> 2-frame walk -> idle)
    const swingPose = computeSwingPose(
      this.playerSwingTimer,
      this.playerSwingAngle,
      this.playerFacingLeft,
    );
    let playerTex = 'player_idle';
    if (this.playerHitFlash > 0) {
      playerTex = 'player_hit';
    } else if (swingPose.active) {
      playerTex = swingPose.textureKey;
    } else if (this.playerMoving) {
      playerTex = Math.floor(this.playerWalkTimer / 0.125) % 2 === 0
        ? 'player_walk_1'
        : 'player_walk_2';
    }
    this.playerSprite
      .setTexture(playerTex)
      .setPosition(Math.round(this.playerX), Math.round(this.playerY))
      .setFlipX(swingPose.active ? swingPose.flipX : this.playerFacingLeft)
      .setRotation(swingPose.active ? swingPose.rotation : 0);

    // Subtle crimson screen flash when player takes contact damage
    this.playerDamageFlashRect.setAlpha(
      this.playerScreenFlash > 0
        ? (this.playerScreenFlash / PLAYER_SCREEN_FLASH_DURATION) * PLAYER_SCREEN_FLASH_MAX_ALPHA
        : 0,
    );

    // Coin darts
    for (const dart of this.darts) {
      dart.sprite.setPosition(Math.round(dart.x), Math.round(dart.y));
    }

    // Virtual joystick overlay (translucent pixel art with fade-in/out & full-tilt highlight)
    const jg = this.joystickGfx;
    jg.clear();
    jg.setAlpha(this.joystickAlpha);
    if (this.joystickAlpha > 0.01 && !this.isLevelUpOpen && !this.ended) {
      const dims = this.getJoystickDimensions();
      const joy = computeJoystickInput(
        this.dragCurrentX - this.dragOriginX,
        this.dragCurrentY - this.dragOriginY,
        dims.deadzone,
        dims.maxDistance,
      );
      const isMaxed = this.isDragging && joy.speedFactor >= 1 - 1e-6;
      const ox = Math.round(this.dragOriginX);
      const oy = Math.round(this.dragOriginY);
      const kx = Math.round(this.dragOriginX + joy.knobOffsetX);
      const ky = Math.round(this.dragOriginY + joy.knobOffsetY);
      const radius = Math.round(dims.maxDistance);
      const deadzone = Math.round(dims.deadzone);
      const knobRadius = Math.max(6, Math.round(dims.knobRadius));
      const r = Math.round(knobRadius * (1 - 0.14 * this.joystickAlpha));
      const discAlpha = (isMaxed ? 0.68 : 0.62) - 0.08 * (1 - this.joystickAlpha);
      const innerRadius = radius - Math.round(knobRadius * 0.5);
      const centerMarkerRadius = Math.round(deadzone * 0.5);

      jg.fillStyle(isMaxed ? 0x1b2a4a : 0x10182b, discAlpha);
      jg.fillCircle(ox, oy, radius);

      jg.lineStyle(4, 0x17120c, 0.9);
      jg.strokeCircle(ox, oy, radius);
      jg.lineStyle(2, isMaxed ? 0xe8b34b : 0x8fa8c8, isMaxed ? 1.0 : 0.88);
      jg.strokeCircle(ox, oy, radius);

      jg.lineStyle(1, isMaxed ? 0xc9973f : 0x4e739e, isMaxed ? 0.9 : 0.7);
      jg.strokeCircle(ox, oy, innerRadius);

      jg.fillStyle(isMaxed ? 0xf2e3c6 : 0x8fa8c8, isMaxed ? 0.7 : 0.6);
      jg.fillCircle(ox, oy, centerMarkerRadius);

      jg.fillStyle(isMaxed ? 0xe8b34b : 0xc9973f, isMaxed ? 1.0 : 0.98);
      jg.fillCircle(kx, ky, r);
      jg.lineStyle(2, isMaxed ? 0xfbf6e9 : 0x17120c, 1.0);
      jg.strokeCircle(kx, ky, r);

      if (this.isDragging && joy.speedFactor > 0) {
        const ux = joy.dx;
        const uy = joy.dy;
        const vx = -joy.dy;
        const vy = joy.dx;
        const tipX = Math.round(kx + 0.46 * r * ux);
        const tipY = Math.round(ky + 0.46 * r * uy);
        const tail1X = Math.round(kx - 0.24 * r * ux + 0.3 * r * vx);
        const tail1Y = Math.round(ky - 0.24 * r * uy + 0.3 * r * vy);
        const tail2X = Math.round(kx - 0.24 * r * ux - 0.3 * r * vx);
        const tail2Y = Math.round(ky - 0.24 * r * uy - 0.3 * r * vy);
        jg.lineStyle(2, 0x17120c, 1.0);
        jg.lineBetween(tail1X, tail1Y, tipX, tipY);
        jg.lineBetween(tail2X, tail2Y, tipX, tipY);
      }
    }
  }

  private finishRun(won: boolean, winReason: 'dawn' | 'boss' = 'dawn'): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.isDragging = false;
    this.activeDragPointerId = null;
    this.joystickAlpha = 0;
    this.joystickGfx.clear();
    this.clearBossBanner();
    for (const dn of this.damageNumbers) {
      dn.text.destroy();
      dn.shadowText.destroy();
    }
    this.damageNumbers = [];
    for (const bolt of this.enemyBolts) {
      bolt.sprite.destroy();
    }
    this.enemyBolts = [];
    this.burstParticles = [];
    this.playerScreenFlash = 0;
    this.playerDamageFlashRect.setAlpha(0);
    this.levelUpModal?.destroy(true);
    this.levelUpModal = null;
    this.isLevelUpOpen = false;

    const settlement: SettlementData = {
      won,
      // A boss-kill win ends the run early, so it records the actual
      // elapsed time instead of the full 180s dawn win.
      survivedSeconds:
        winReason === 'boss'
          ? Math.min(ROUND_DURATION_SECONDS, Math.round(this.elapsedSeconds))
          : won
            ? ROUND_DURATION_SECONDS
            : Math.min(ROUND_DURATION_SECONDS, Math.round(this.elapsedSeconds)),
      kills: this.kills,
      killsByKind: { ...this.killsByKind },
      level: this.level,
      maxConcurrent: this.maxConcurrent,
      winReason: won ? winReason : undefined,
    };
    this.scene.start('GameOverScene', settlement);
  }
}
