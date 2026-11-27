import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  createInitialPlayerStats,
  ENEMY_RADIUS,
  enemyStatsAt,
  formatTime,
  HUD_HEIGHT,
  MAX_ENEMIES,
  ORB_PULL_SPEED,
  ORB_RADIUS,
  PLAYER_RADIUS,
  PlayerStats,
  ROUND_DURATION_SECONDS,
  SPAWN_MARGIN,
  spawnIntervalAt,
  WEAPON_DEFS,
  WEAPON_ORDER,
  XP_PER_ORB,
  xpNeededForLevel,
} from '../game/balance.ts';
import { applyChoice, ChoiceOption, generateChoices } from '../game/choices.ts';
import { DebugChoiceInfo, registerDebugHook, SettlementData } from '../game/debug.ts';
import {
  computeJoystickInput,
  JOYSTICK_DEADZONE_PX,
  JOYSTICK_MAX_DISTANCE_PX,
} from '../game/joystick.ts';
import { addPixelText, wrapPixelText } from '../game/pixelFont.ts';
import { buildNightAlleyBackdrop, ensureGameTextures, PALETTE } from '../game/pixelart.ts';
import { computeSlashPlacement } from '../game/slash.ts';

type EnemyKind = 'paper' | 'lantern';

interface EnemyEntity {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  attackCooldown: number;
  attackCooldownRemaining: number;
  hitFlash: number;
  sprite: Phaser.GameObjects.Image;
}

interface OrbEntity {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
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
  private playerFacingLeft = false;
  private playerWalkTimer = 0;
  private playerMoving = false;

  private level = 1;
  private xp = 0;
  private kills = 0;
  private elapsedSeconds = 0;
  private timeLeft = ROUND_DURATION_SECONDS;
  private maxConcurrent = 0;
  private enemySpawnCount = 0;
  private ended = false;

  private enemies: EnemyEntity[] = [];
  private orbs: OrbEntity[] = [];
  private darts: DartEntity[] = [];
  private slashes: SlashEffect[] = [];

  private spawnTimer = 0.4;
  private swordCooldown = 0;
  private dartCooldown = 0;
  private lanternActiveRemaining = 0;
  private lanternTickTimer = 0;
  private lanternCooldownRemaining = 0;
  private lanternAnimTimer = 0;

  private isDragging = false;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private dragCurrentX = 0;
  private dragCurrentY = 0;

  private isLevelUpOpen = false;
  private activeChoices: DebugChoiceInfo[] = [];
  private levelUpModal: Phaser.GameObjects.Container | null = null;

  private keys: MovementKeys | null = null;
  private worldGfx!: Phaser.GameObjects.Graphics;
  private joystickGfx!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Image;
  private lanternRingSprite!: Phaser.GameObjects.Image;

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
    this.playerFacingLeft = false;
    this.playerWalkTimer = 0;
    this.playerMoving = false;

    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.elapsedSeconds = 0;
    this.timeLeft = ROUND_DURATION_SECONDS;
    this.maxConcurrent = 0;
    this.enemySpawnCount = 0;
    this.ended = false;

    this.enemies = [];
    this.orbs = [];
    this.darts = [];
    this.slashes = [];

    this.spawnTimer = 0.4;
    this.swordCooldown = 0;
    this.dartCooldown = 0;
    this.lanternActiveRemaining = 0;
    this.lanternTickTimer = 0;
    this.lanternCooldownRemaining = 0;
    this.lanternAnimTimer = 0;

    this.isDragging = false;
    this.isLevelUpOpen = false;
    this.activeChoices = [];
    this.levelUpModal = null;
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

  private setupInputs(): void {
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
      this.isDragging = true;
      this.dragOriginX = pointer.x;
      this.dragOriginY = pointer.y;
      this.dragCurrentX = pointer.x;
      this.dragCurrentY = pointer.y;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) {
        return;
      }
      this.dragCurrentX = pointer.x;
      this.dragCurrentY = pointer.y;
    });

    const stopDrag = (): void => {
      this.isDragging = false;
    };
    this.input.on('pointerup', stopDrag);
    this.input.on('pointerupoutside', stopDrag);
  }

  private registerSceneDebugHook(): void {
    registerDebugHook({
      getState: () => ({
        scene: 'GameScene',
        hp: Math.round(this.stats.hp * 100) / 100,
        maxHp: this.stats.maxHp,
        level: this.level,
        xp: this.xp,
        kills: this.kills,
        timeLeft: Math.round(this.timeLeft * 1000) / 1000,
        enemies: this.enemies.length,
        maxConcurrent: this.maxConcurrent,
        weapons: WEAPON_ORDER.filter((id) => Boolean(this.stats.weapons[id])),
        playerX: Math.round(this.playerX * 100) / 100,
        playerY: Math.round(this.playerY * 100) / 100,
        isLevelUpOpen: this.isLevelUpOpen,
        levelUpChoices: this.activeChoices.map((c) => ({ ...c })),
        slashes: this.slashes.map((slash) => ({
          x: Math.round(slash.sprite.x * 100) / 100,
          y: Math.round(slash.sprite.y * 100) / 100,
          rotation: Math.round(slash.sprite.rotation * 10000) / 10000,
          displayWidth: Math.round(slash.sprite.displayWidth * 100) / 100,
          displayHeight: Math.round(slash.sprite.displayHeight * 100) / 100,
        })),
        settlement: null,
      }),
      addXp: (n: number) => {
        if (!this.ended && n > 0) {
          this.gainXp(n);
          this.updateHud();
        }
      },
      setTimeLeft: (s: number) => {
        if (this.ended) {
          return;
        }
        this.timeLeft = Math.max(0, s);
        this.elapsedSeconds = Math.max(0, ROUND_DURATION_SECONDS - this.timeLeft);
        this.updateHud();
        if (this.timeLeft <= 0) {
          this.finishRun(true);
        }
      },
      setHp: (n: number) => {
        if (this.ended) {
          return;
        }
        this.stats.hp = Math.max(0, Math.min(this.stats.maxHp, n));
        this.updateHud();
        if (this.stats.hp <= 0) {
          this.finishRun(false);
        }
      },
      spawnEnemyNearPlayer: () => {
        if (this.ended || this.enemies.length >= MAX_ENEMIES) {
          return;
        }
        const offsetX = this.playerX + 55 <= ARENA_WIDTH - ENEMY_RADIUS ? 55 : -55;
        this.spawnEnemyAt(this.playerX + offsetX, this.playerY);
        this.renderWorld();
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.ended) {
      return;
    }

    const dt = Math.min(delta / 1000, 0.25);

    if (!this.isLevelUpOpen) {
      this.elapsedSeconds += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.finishRun(true);
        return;
      }

      this.updatePlayerMovement(dt);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      if (this.ended) {
        return;
      }
      this.updateWeapons(dt);
      this.updateDarts(dt);
      this.updateOrbs(dt);
      this.updateEffects(dt);
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
      const joy = computeJoystickInput(
        this.dragCurrentX - this.dragOriginX,
        this.dragCurrentY - this.dragOriginY,
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
  }

  private updateSpawning(dt: number): void {
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += spawnIntervalAt(this.elapsedSeconds);
      if (this.enemies.length < MAX_ENEMIES) {
        const edge = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        if (edge === 0) {
          x = Math.random() * ARENA_WIDTH;
          y = -SPAWN_MARGIN;
        } else if (edge === 1) {
          x = ARENA_WIDTH + SPAWN_MARGIN;
          y = Math.random() * ARENA_HEIGHT;
        } else if (edge === 2) {
          x = Math.random() * ARENA_WIDTH;
          y = ARENA_HEIGHT + SPAWN_MARGIN;
        } else {
          x = -SPAWN_MARGIN;
          y = Math.random() * ARENA_HEIGHT;
        }
        this.spawnEnemyAt(x, y);
      }
    }
  }

  private spawnEnemyAt(x: number, y: number): void {
    const template = enemyStatsAt(this.elapsedSeconds);
    const kind: EnemyKind = this.enemySpawnCount % 3 === 1 ? 'lantern' : 'paper';
    this.enemySpawnCount += 1;

    const texKey = kind === 'lantern' ? 'enemy_lantern' : 'enemy_paper';
    const sprite = this.add.image(x, y, texKey).setDepth(9);

    this.enemies.push({
      kind,
      x,
      y,
      hp: template.maxHp,
      maxHp: template.maxHp,
      speed: template.speed,
      contactDamage: template.contactDamage,
      attackCooldown: template.attackCooldown,
      attackCooldownRemaining: 0,
      hitFlash: 0,
      sprite,
    });
    if (this.enemies.length > this.maxConcurrent) {
      this.maxConcurrent = this.enemies.length;
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const dx = this.playerX - enemy.x;
      const dy = this.playerY - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.y += (dy / dist) * enemy.speed * dt;
      }
      if (enemy.attackCooldownRemaining > 0) {
        enemy.attackCooldownRemaining = Math.max(0, enemy.attackCooldownRemaining - dt);
      }
      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      }
    }

    const minDist = ENEMY_RADIUS * 2;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const b = this.enemies[j];
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

    const touchDist = PLAYER_RADIUS + ENEMY_RADIUS;
    for (const enemy of this.enemies) {
      const dist = Math.hypot(this.playerX - enemy.x, this.playerY - enemy.y);
      if (dist <= touchDist && enemy.attackCooldownRemaining <= 0) {
        this.stats.hp = Math.max(0, this.stats.hp - enemy.contactDamage);
        enemy.attackCooldownRemaining = enemy.attackCooldown;
        this.playerHitFlash = 0.12;
        if (this.stats.hp <= 0) {
          this.finishRun(false);
          return;
        }
      }
    }
  }

  private updateWeapons(dt: number): void {
    const sword = this.stats.weapons.peach_sword;
    if (sword) {
      this.swordCooldown = Math.max(0, this.swordCooldown - dt);
      if (this.swordCooldown <= 0) {
        const nearest = this.findNearestEnemy(sword.range + ENEMY_RADIUS);
        if (nearest) {
          const angle = Math.atan2(nearest.y - this.playerY, nearest.x - this.playerX);
          const halfArcRad = ((sword.arcDeg / 2) * Math.PI) / 180;
          const dmg = sword.damage * this.stats.damageMultiplier;
          const maxReach = sword.range + ENEMY_RADIUS;

          for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
            const enemy = this.enemies[i];
            const dx = enemy.x - this.playerX;
            const dy = enemy.y - this.playerY;
            if (Math.hypot(dx, dy) <= maxReach) {
              const enemyAngle = Math.atan2(dy, dx);
              if (normalizeAngleDiff(enemyAngle, angle) <= halfArcRad) {
                this.damageEnemyAt(i, dmg);
              }
            }
          }

          const placement = computeSlashPlacement(
            this.playerX,
            this.playerY,
            angle,
            sword.range,
            sword.arcDeg,
          );
          const slashSprite = this.add
            .image(placement.x, placement.y, 'slash_arc')
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
          .filter((item) => item.dist <= dart.range + ENEMY_RADIUS)
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
              .image(this.playerX, this.playerY, 'coin_dart')
              .setDisplaySize(24, 24)
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
          const reach = lantern.range + ENEMY_RADIUS;
          for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
            const enemy = this.enemies[i];
            if (Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY) <= reach) {
              this.damageEnemyAt(i, dmg);
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

      const hitRadius = dart.radius + ENEMY_RADIUS;
      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        if (Math.hypot(enemy.x - dart.x, enemy.y - dart.y) <= hitRadius) {
          this.damageEnemyAt(j, dart.damage);
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
      const dx = this.playerX - orb.x;
      const dy = this.playerY - orb.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= collectRadius) {
        orb.sprite.destroy();
        this.orbs.splice(i, 1);
        this.gainXp(XP_PER_ORB);
        continue;
      }

      if (dist <= this.stats.pickupRadius) {
        const step = Math.min(dist, ORB_PULL_SPEED * dt);
        orb.x += (dx / dist) * step;
        orb.y += (dy / dist) * step;
      }
    }
  }

  private updateEffects(dt: number): void {
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
  }

  private findNearestEnemy(maxRange: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestDist = maxRange;
    for (const enemy of this.enemies) {
      const dist = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      if (dist <= bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  private damageEnemyAt(index: number, damage: number): void {
    const enemy = this.enemies[index];
    enemy.hp -= damage;
    enemy.hitFlash = 0.08;
    if (enemy.hp <= 0) {
      const orbSprite = this.add
        .image(enemy.x, enemy.y, 'xp_orb')
        .setDisplaySize(28, 28)
        .setDepth(7);
      this.orbs.push({ x: enemy.x, y: enemy.y, sprite: orbSprite });
      enemy.sprite.destroy();
      this.enemies.splice(index, 1);
      this.kills += 1;
    }
  }

  private gainXp(amount: number): void {
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
    this.isDragging = false;

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
    options.forEach((opt, idx) => {
      const cx = CHOICE_CARD_X[idx];
      const cy = CHOICE_CARD_Y;
      const badge = CATEGORY_LABEL[opt.category];

      const card = this.add
        .rectangle(cx, cy, CHOICE_CARD_W, CHOICE_CARD_H, 0x10182b)
        .setStrokeStyle(2, 0xc9973f)
        .setInteractive({ useHandCursor: true });

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
        card.setFillStyle(0x2e4a73);
        card.setStrokeStyle(2, 0xe8b34b);
      });
      card.on('pointerout', () => {
        card.setFillStyle(0x10182b);
        card.setStrokeStyle(2, 0xc9973f);
      });
      card.on('pointerdown', () => {
        this.chooseOption(opt);
      });

      modal.add([card, badgeText, titleText, descText]);
      this.activeChoices.push({ id: opt.id, title: opt.title, x: cx, y: cy });
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
      .map((id) => `${WEAPON_DEFS[id].name} Lv.${this.stats.weapons[id]!.level}`)
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
      const ringKey = Math.floor(this.lanternAnimTimer / 0.14) % 2 === 0
        ? 'lantern_ring_1'
        : 'lantern_ring_2';
      this.lanternRingSprite
        .setTexture(ringKey)
        .setPosition(Math.round(this.playerX), Math.round(this.playerY))
        .setDisplaySize(Math.round(lantern.range * 2), Math.round(lantern.range * 2))
        .setVisible(true);
    } else {
      this.lanternRingSprite.setVisible(false);
    }

    // XP orbs
    for (const orb of this.orbs) {
      orb.sprite.setPosition(Math.round(orb.x), Math.round(orb.y));
    }

    // Enemies + crisp pixel HP bars
    for (const enemy of this.enemies) {
      const baseKey = enemy.kind === 'lantern' ? 'enemy_lantern' : 'enemy_paper';
      const texKey = enemy.hitFlash > 0 ? `${baseKey}_hit` : baseKey;
      enemy.sprite
        .setTexture(texKey)
        .setPosition(Math.round(enemy.x), Math.round(enemy.y))
        .setFlipX(this.playerX < enemy.x);

      if (enemy.hp < enemy.maxHp) {
        const w = 24;
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        const barX = Math.round(enemy.x - w / 2);
        const barY = Math.round(enemy.y - 26);
        g.fillStyle(0x10182b, 1);
        g.fillRect(barX - 1, barY - 1, w + 2, 6);
        g.fillStyle(0xb03a2e, 1);
        g.fillRect(barX, barY, Math.max(1, Math.round(w * ratio)), 4);
      }
    }

    // Player sprite (standing vs 2-frame walk, facing direction, hit flash)
    let playerTex = 'player_idle';
    if (this.playerHitFlash > 0) {
      playerTex = 'player_hit';
    } else if (this.playerMoving) {
      playerTex = Math.floor(this.playerWalkTimer / 0.125) % 2 === 0
        ? 'player_walk_1'
        : 'player_walk_2';
    }
    this.playerSprite
      .setTexture(playerTex)
      .setPosition(Math.round(this.playerX), Math.round(this.playerY))
      .setFlipX(this.playerFacingLeft);

    // Coin darts
    for (const dart of this.darts) {
      dart.sprite.setPosition(Math.round(dart.x), Math.round(dart.y));
    }

    // Virtual joystick overlay (shown only while actively dragging)
    const jg = this.joystickGfx;
    jg.clear();
    if (this.isDragging && !this.isLevelUpOpen && !this.ended) {
      const joy = computeJoystickInput(
        this.dragCurrentX - this.dragOriginX,
        this.dragCurrentY - this.dragOriginY,
      );
      const ox = Math.round(this.dragOriginX);
      const oy = Math.round(this.dragOriginY);
      const kx = Math.round(this.dragOriginX + joy.knobOffsetX);
      const ky = Math.round(this.dragOriginY + joy.knobOffsetY);

      jg.lineStyle(4, 0x10182b, 1);
      jg.strokeCircle(ox, oy, JOYSTICK_MAX_DISTANCE_PX);
      jg.lineStyle(2, 0x8fa8c8, 1);
      jg.strokeCircle(ox, oy, JOYSTICK_MAX_DISTANCE_PX);

      jg.fillStyle(0x4e739e, 1);
      jg.fillCircle(ox, oy, JOYSTICK_DEADZONE_PX);

      jg.lineStyle(2, 0x4e739e, 1);
      jg.lineBetween(ox, oy, kx, ky);

      jg.fillStyle(0xe8b34b, 1);
      jg.fillCircle(kx, ky, 14);
      jg.lineStyle(2, 0x17120c, 1);
      jg.strokeCircle(kx, ky, 14);
      jg.fillStyle(0xfbf6e9, 1);
      jg.fillCircle(kx - 3, ky - 3, 4);
    }
  }

  private finishRun(won: boolean): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.isDragging = false;
    this.joystickGfx.clear();
    this.levelUpModal?.destroy(true);
    this.levelUpModal = null;
    this.isLevelUpOpen = false;

    const settlement: SettlementData = {
      won,
      survivedSeconds: won
        ? ROUND_DURATION_SECONDS
        : Math.min(ROUND_DURATION_SECONDS, Math.round(this.elapsedSeconds)),
      kills: this.kills,
      level: this.level,
      maxConcurrent: this.maxConcurrent,
    };
    this.scene.start('GameOverScene', settlement);
  }
}
