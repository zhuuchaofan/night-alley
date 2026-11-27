import Phaser from 'phaser';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  createInitialPlayerStats,
  ENEMY_COLOR,
  ENEMY_RADIUS,
  enemyStatsAt,
  formatTime,
  HUD_HEIGHT,
  MAX_ENEMIES,
  ORB_PULL_SPEED,
  ORB_RADIUS,
  PLAYER_COLOR,
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

const FONT_FAMILY = 'monospace, sans-serif';

interface EnemyEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  attackCooldown: number;
  attackCooldownRemaining: number;
  hitFlash: number;
}

interface OrbEntity {
  x: number;
  y: number;
}

interface DartEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
}

interface SlashEffect {
  x: number;
  y: number;
  angle: number;
  range: number;
  arcRad: number;
  timer: number;
  maxTimer: number;
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

const CHOICE_CARD_X = [200, 480, 760];
const CHOICE_CARD_Y = 295;
const CHOICE_CARD_W = 240;
const CHOICE_CARD_H = 180;

const CATEGORY_LABEL: Record<ChoiceOption['category'], { text: string; color: string }> = {
  new_weapon: { text: '新武器', color: '#e8b34b' },
  weapon_upgrade: { text: '武器强化', color: '#6ec4ff' },
  stat: { text: '属性提升', color: '#56d4a0' },
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

  private level = 1;
  private xp = 0;
  private kills = 0;
  private elapsedSeconds = 0;
  private timeLeft = ROUND_DURATION_SECONDS;
  private maxConcurrent = 0;
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

  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private killsText!: Phaser.GameObjects.Text;
  private loadoutText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetRunState();
    this.drawArenaFloor();

    this.worldGfx = this.add.graphics().setDepth(10);
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

    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.elapsedSeconds = 0;
    this.timeLeft = ROUND_DURATION_SECONDS;
    this.maxConcurrent = 0;
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

    this.isDragging = false;
    this.isLevelUpOpen = false;
    this.activeChoices = [];
    this.levelUpModal = null;
  }

  private drawArenaFloor(): void {
    const floor = this.add.graphics().setDepth(0);
    floor.fillStyle(0x14101c, 1);
    floor.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    floor.lineStyle(1, 0x1f192c, 1);
    for (let x = 0; x <= ARENA_WIDTH; x += 48) {
      floor.lineBetween(x, HUD_HEIGHT, x, ARENA_HEIGHT);
    }
    for (let y = HUD_HEIGHT; y <= ARENA_HEIGHT; y += 48) {
      floor.lineBetween(0, y, ARENA_WIDTH, y);
    }
  }

  private createHud(): void {
    this.add
      .rectangle(ARENA_WIDTH / 2, HUD_HEIGHT / 2, ARENA_WIDTH, HUD_HEIGHT, 0x1b1526)
      .setDepth(20);
    this.add
      .rectangle(ARENA_WIDTH / 2, HUD_HEIGHT, ARENA_WIDTH, 2, 0x3b2f52)
      .setDepth(20);

    // Left: HP bar + label
    this.add.rectangle(16, 22, 160, 16, 0x2a2038).setOrigin(0, 0.5).setDepth(21);
    this.hpBarFill = this.add.rectangle(16, 22, 160, 16, 0xd9534f).setOrigin(0, 0.5).setDepth(22);
    this.hpText = this.add
      .text(186, 22, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f2e3c6',
      })
      .setOrigin(0, 0.5)
      .setDepth(22);

    // Center: countdown
    this.timerText = this.add
      .text(ARENA_WIDTH / 2, 22, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#e8b34b',
      })
      .setOrigin(0.5)
      .setDepth(22);

    // Right: level + XP bar + kills
    this.levelText = this.add
      .text(622, 22, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#56d4a0',
      })
      .setOrigin(0, 0.5)
      .setDepth(22);

    this.add.rectangle(684, 22, 132, 12, 0x2a2038).setOrigin(0, 0.5).setDepth(21);
    this.xpBarFill = this.add.rectangle(684, 22, 0, 12, 0x56d4a0).setOrigin(0, 0.5).setDepth(22);

    this.killsText = this.add
      .text(944, 22, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f2e3c6',
      })
      .setOrigin(1, 0.5)
      .setDepth(22);

    this.loadoutText = this.add
      .text(14, ARENA_HEIGHT - 14, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#9a8fb5',
      })
      .setOrigin(0, 1)
      .setDepth(20);
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

    if (this.keys) {
      if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;
    }

    if (dx === 0 && dy === 0 && this.isDragging) {
      const dragX = this.dragCurrentX - this.dragOriginX;
      const dragY = this.dragCurrentY - this.dragOriginY;
      const dist = Math.hypot(dragX, dragY);
      if (dist > 8) {
        dx = dragX / dist;
        dy = dragY / dist;
      }
    } else if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    if (dx !== 0 || dy !== 0) {
      this.playerX = Phaser.Math.Clamp(
        this.playerX + dx * this.stats.speed * dt,
        PLAYER_RADIUS,
        ARENA_WIDTH - PLAYER_RADIUS,
      );
      this.playerY = Phaser.Math.Clamp(
        this.playerY + dy * this.stats.speed * dt,
        HUD_HEIGHT + PLAYER_RADIUS,
        ARENA_HEIGHT - PLAYER_RADIUS,
      );
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
    this.enemies.push({
      x,
      y,
      hp: template.maxHp,
      maxHp: template.maxHp,
      speed: template.speed,
      contactDamage: template.contactDamage,
      attackCooldown: template.attackCooldown,
      attackCooldownRemaining: 0,
      hitFlash: 0,
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

    // Simple pairwise separation so enemies do not stack on top of each other
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

          this.slashes.push({
            x: this.playerX,
            y: this.playerY,
            angle,
            range: sword.range,
            arcRad: (sword.arcDeg * Math.PI) / 180,
            timer: 0.18,
            maxTimer: 0.18,
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
            this.darts.push({
              x: this.playerX,
              y: this.playerY,
              vx: Math.cos(angle) * dart.projectileSpeed,
              vy: Math.sin(angle) * dart.projectileSpeed,
              damage: dmg,
              radius: 5,
            });
          }
          this.dartCooldown = dart.cooldown;
        }
      }
    }

    const lantern = this.stats.weapons.lantern_fire;
    if (lantern) {
      if (this.lanternActiveRemaining > 0) {
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

      if (
        dart.x < -40 ||
        dart.x > ARENA_WIDTH + 40 ||
        dart.y < HUD_HEIGHT - 40 ||
        dart.y > ARENA_HEIGHT + 40
      ) {
        this.darts.splice(i, 1);
        continue;
      }

      const hitRadius = dart.radius + ENEMY_RADIUS;
      for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = this.enemies[j];
        if (Math.hypot(enemy.x - dart.x, enemy.y - dart.y) <= hitRadius) {
          this.damageEnemyAt(j, dart.damage);
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
      this.slashes[i].timer -= dt;
      if (this.slashes[i].timer <= 0) {
        this.slashes.splice(i, 1);
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
      this.orbs.push({ x: enemy.x, y: enemy.y });
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
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x0b0812, 0.75)
      .setInteractive();
    modal.add(backdrop);

    modal.add(
      this.add
        .text(ARENA_WIDTH / 2, 118, `升至 Lv.${this.level} · 三选一`, {
          fontFamily: FONT_FAMILY,
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#f2e3c6',
        })
        .setOrigin(0.5),
    );

    modal.add(
      this.add
        .text(ARENA_WIDTH / 2, 154, '点击一项强化以继续守夜', {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: '#9a8fb5',
        })
        .setOrigin(0.5),
    );

    this.activeChoices = [];
    options.forEach((opt, idx) => {
      const cx = CHOICE_CARD_X[idx];
      const cy = CHOICE_CARD_Y;
      const badge = CATEGORY_LABEL[opt.category];

      const card = this.add
        .rectangle(cx, cy, CHOICE_CARD_W, CHOICE_CARD_H, 0x221b30)
        .setStrokeStyle(2, 0xc9973f)
        .setInteractive({ useHandCursor: true });

      const badgeText = this.add
        .text(cx, cy - 58, badge.text, {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          fontStyle: 'bold',
          color: badge.color,
        })
        .setOrigin(0.5);

      const titleText = this.add
        .text(cx, cy - 18, opt.title, {
          fontFamily: FONT_FAMILY,
          fontSize: '19px',
          fontStyle: 'bold',
          color: '#f2e3c6',
          align: 'center',
          wordWrap: { width: CHOICE_CARD_W - 24 },
        })
        .setOrigin(0.5);

      const descText = this.add
        .text(cx, cy + 36, opt.description, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: '#d4cde0',
          align: 'center',
          wordWrap: { width: CHOICE_CARD_W - 28 },
        })
        .setOrigin(0.5);

      card.on('pointerover', () => {
        card.setFillStyle(0x312645);
        card.setStrokeStyle(2, 0xe8b34b);
      });
      card.on('pointerout', () => {
        card.setFillStyle(0x221b30);
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
    this.hpBarFill.width = 160 * hpRatio;
    this.hpText.setText(`HP ${Math.ceil(this.stats.hp)}/${this.stats.maxHp}`);

    this.timerText.setText(formatTime(this.timeLeft));

    this.levelText.setText(`Lv.${this.level}`);
    const needed = xpNeededForLevel(this.level);
    const xpRatio = Phaser.Math.Clamp(this.xp / needed, 0, 1);
    this.xpBarFill.width = 132 * xpRatio;
    this.killsText.setText(`击杀 ${this.kills}`);

    const loadout = WEAPON_ORDER.filter((id) => Boolean(this.stats.weapons[id]))
      .map((id) => `${WEAPON_DEFS[id].name} Lv.${this.stats.weapons[id]!.level}`)
      .join(' · ');
    this.loadoutText.setText(loadout);
  }

  private renderWorld(): void {
    const g = this.worldGfx;
    g.clear();

    // Lantern fire aura
    const lantern = this.stats.weapons.lantern_fire;
    if (lantern && this.lanternActiveRemaining > 0) {
      g.fillStyle(0xe86f3a, 0.16);
      g.fillCircle(this.playerX, this.playerY, lantern.range);
      g.lineStyle(2, 0xf0934b, 0.55);
      g.strokeCircle(this.playerX, this.playerY, lantern.range);
    }

    // XP orbs
    for (const orb of this.orbs) {
      g.fillStyle(0x56d4a0, 1);
      g.fillCircle(orb.x, orb.y, ORB_RADIUS);
    }

    // Enemies ("纸人影")
    for (const enemy of this.enemies) {
      g.fillStyle(enemy.hitFlash > 0 ? 0xffffff : ENEMY_COLOR, 1);
      g.fillCircle(enemy.x, enemy.y, ENEMY_RADIUS);
      if (enemy.hp < enemy.maxHp) {
        const w = 18;
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        g.fillStyle(0x2a2038, 1);
        g.fillRect(enemy.x - w / 2, enemy.y - ENEMY_RADIUS - 6, w, 3);
        g.fillStyle(0xe06c75, 1);
        g.fillRect(enemy.x - w / 2, enemy.y - ENEMY_RADIUS - 6, w * ratio, 3);
      }
    }

    // Player
    g.fillStyle(this.playerHitFlash > 0 ? 0xff6b6b : PLAYER_COLOR, 1);
    g.fillCircle(this.playerX, this.playerY, PLAYER_RADIUS);
    g.lineStyle(2, 0xfff2cc, 0.9);
    g.strokeCircle(this.playerX, this.playerY, PLAYER_RADIUS);

    // Peach sword slash arcs
    for (const slash of this.slashes) {
      const alpha = (slash.timer / slash.maxTimer) * 0.5;
      g.fillStyle(0xf5d06b, alpha);
      g.slice(
        slash.x,
        slash.y,
        slash.range,
        slash.angle - slash.arcRad / 2,
        slash.angle + slash.arcRad / 2,
        false,
      );
      g.fillPath();
    }

    // Coin darts
    for (const dart of this.darts) {
      g.fillStyle(0xf0b949, 1);
      g.fillCircle(dart.x, dart.y, dart.radius);
      g.fillStyle(0x14101c, 1);
      g.fillRect(dart.x - 1.5, dart.y - 1.5, 3, 3);
    }

    // Pointer drag guide
    if (this.isDragging && !this.isLevelUpOpen) {
      g.lineStyle(2, 0xe8b34b, 0.35);
      g.strokeCircle(this.dragOriginX, this.dragOriginY, 24);
      g.lineBetween(this.dragOriginX, this.dragOriginY, this.dragCurrentX, this.dragCurrentY);
      g.fillStyle(0xe8b34b, 0.45);
      g.fillCircle(this.dragCurrentX, this.dragCurrentY, 8);
    }
  }

  private finishRun(won: boolean): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.isDragging = false;
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
