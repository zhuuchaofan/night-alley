/**
 * Headless balance simulator for Night Alley (夜巷).
 *
 * Mirrors the core loop in `src/scenes/GameScene.ts` without Phaser:
 * - Fixed tick `dt = 1 / 30` (30 Hz) over `ROUND_DURATION_SECONDS` (180s = 5400 ticks).
 * - Exact constants/formulas imported from `src/game/balance.ts` and `src/game/choices.ts`.
 * - Enemy separation (20px min distance): uses a 24px uniform spatial hash grid
 *   instead of the 6-attacker contact cap approximation. Because `CELL_SIZE = 24 > 20 = ENEMY_RADIUS * 2`,
 *   checking the 3x3 neighborhood guarantees exact pairwise separation parity with `GameScene.ts`
 *   in O(n) average time with zero per-tick allocations.
 *
 * Player movement AI (kiting):
 * - Scans all active enemies; accumulates an inverse-square flee vector over enemies within 200px.
 * - Adds gentle wall-margin avoidance within 60px of playable bounds so kiting curves along edges
 *   instead of pinning into corners.
 * - If any enemy is within 120px, prioritizes fleeing along the flee vector.
 * - Otherwise moves toward the nearest XP orb within 300px (or drifts toward arena center),
 *   blending lightly with any 120-200px flee pressure.
 *
 * Level-up choice priority:
 *   new:coin_dart > new:lantern_fire > upg:peach_sword:damage >
 *   lowest-level existing weapon damage > upg:coin_dart:count > upg:lantern_fire:range >
 *   stat:damage > stat:hp (when hp < 50% maxHp) > upg:peach_sword:speed >
 *   stat:speed > stat:pickup > stat:hp (when hp >= 50% maxHp).
 */

import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BOSS_SPAWN_ELAPSED_SECONDS,
  BOSS_STATS,
  BOSS_XP_ORBS,
  createInitialPlayerStats,
  enemyStatsAt,
  HUD_HEIGHT,
  MAX_ENEMIES,
  ORB_PULL_SPEED,
  ORB_RADIUS,
  PLAYER_RADIUS,
  ROUND_DURATION_SECONDS,
  SPAWN_MARGIN,
  spawnIntervalAt,
  XP_PER_ORB,
  xpNeededForLevel,
  type PlayerStats,
} from '../../src/game/balance.ts';
import {
  applyChoice,
  generateChoices,
  type ChoiceOption,
} from '../../src/game/choices.ts';

export const SIM_DT = 1 / 30;
export const SIM_TOTAL_STEPS = ROUND_DURATION_SECONDS * 30;
export const TRAJECTORY_INTERVAL_SECONDS = 10;
const TRAJECTORY_STEP_INTERVAL = TRAJECTORY_INTERVAL_SECONDS * 30;
const TRAJECTORY_POINTS = ROUND_DURATION_SECONDS / TRAJECTORY_INTERVAL_SECONDS + 1;

const CELL_SIZE = 48;
const GRID_OFFSET = 2;
const GRID_COLS = 26;
const GRID_ROWS = 16;

const ARENA_CENTER_X = ARENA_WIDTH / 2;
const ARENA_CENTER_Y = (ARENA_HEIGHT + HUD_HEIGHT) / 2;
const PLAY_MIN_X = PLAYER_RADIUS;
const PLAY_MAX_X = ARENA_WIDTH - PLAYER_RADIUS;
const PLAY_MIN_Y = HUD_HEIGHT + PLAYER_RADIUS;
const PLAY_MAX_Y = ARENA_HEIGHT - PLAYER_RADIUS;

export interface SimConfig {
  runs: number;
  seed: number;
}

export interface RunResult {
  won: boolean;
  survivedSeconds: number;
  kills: number;
  level: number;
  maxConcurrent: number;
  bossSpawned: boolean;
  bossKilled: boolean;
  hpTrajectory: number[];
}

export interface SimSummary {
  runs: number;
  seed: number;
  winRate: number;
  avgSurvivedSeconds: number;
  avgKills: number;
  avgLevel: number;
  avgMaxConcurrent: number;
  avgHpAt30s: number;
  bossSpawnedCount: number;
  bossKilledCount: number;
  bossKillRate: number;
  bossKillRateWhenSpawned: number;
  avgHpTrajectory: number[];
  results: RunResult[];
}

interface EnemyEntity {
  kind: 'normal' | 'boss';
  x: number;
  y: number;
  radius: number;
  hp: number;
  speed: number;
  contactDamage: number;
  attackCooldown: number;
  attackCooldownRemaining: number;
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

/** Deterministic mulberry32 PRNG returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function normalizeAngleDiff(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

/** Score and pick the highest-priority level-up option (lower score = higher priority). */
export function pickUpgradeChoice(stats: PlayerStats, options: ChoiceOption[]): ChoiceOption {
  let best = options[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const opt of options) {
    let score = 100;
    if (opt.id === 'new:coin_dart') {
      score = 1;
    } else if (opt.id === 'new:lantern_fire') {
      score = 2;
    } else if (opt.id === 'upg:peach_sword:damage') {
      score = 3;
    } else if (opt.category === 'weapon_upgrade' && opt.upgradeKind === 'damage' && opt.weaponId) {
      const level = stats.weapons[opt.weaponId]?.level ?? 1;
      score = 4 + level * 0.01;
    } else if (opt.id === 'upg:coin_dart:count') {
      score = 5;
    } else if (opt.id === 'upg:lantern_fire:range') {
      score = 6;
    } else if (opt.id === 'stat:damage') {
      score = 7;
    } else if (opt.id === 'stat:hp') {
      score = stats.hp < stats.maxHp * 0.5 ? 8 : 12;
    } else if (opt.id === 'upg:peach_sword:speed') {
      score = 9;
    } else if (opt.id === 'stat:speed') {
      score = 10;
    } else if (opt.id === 'stat:pickup') {
      score = 11;
    }

    if (score < bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  return best;
}

/** Run a single 180-second survival simulation with the given seed. */
export function runSingleSim(seed: number): RunResult {
  const rng = createRng(seed);

  let stats = createInitialPlayerStats();
  let playerX = ARENA_CENTER_X;
  let playerY = ARENA_CENTER_Y;

  let level = 1;
  let xp = 0;
  let kills = 0;
  let maxConcurrent = 0;
  let bossSpawned = false;
  let bossKilled = false;

  const enemies: EnemyEntity[] = [];
  const orbs: OrbEntity[] = [];
  const darts: DartEntity[] = [];

  let spawnTimer = 0.4;
  let swordCooldown = 0;
  let dartCooldown = 0;
  let lanternActiveRemaining = 0;
  let lanternTickTimer = 0;
  let lanternCooldownRemaining = 0;

  const gridHead = new Int16Array(GRID_COLS * GRID_ROWS);
  const gridNext = new Int16Array(MAX_ENEMIES + 4);

  const hpTrajectory = new Array<number>(TRAJECTORY_POINTS).fill(0);
  hpTrajectory[0] = stats.hp;

  const gainXp = (amount: number): void => {
    xp += amount;
    while (xp >= xpNeededForLevel(level)) {
      xp -= xpNeededForLevel(level);
      level += 1;
      const hadLantern = Boolean(stats.weapons.lantern_fire);
      const options = generateChoices(stats, rng);
      const picked = pickUpgradeChoice(stats, options);
      stats = applyChoice(stats, picked);

      if (!hadLantern && stats.weapons.lantern_fire) {
        lanternActiveRemaining = stats.weapons.lantern_fire.duration;
        lanternTickTimer = 0;
        lanternCooldownRemaining = 0;
      }
    }
  };

  const damageEnemyAt = (index: number, damage: number): void => {
    const enemy = enemies[index];
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      if (enemy.kind === 'boss') {
        bossKilled = true;
        for (let k = 0; k < BOSS_XP_ORBS; k += 1) {
          const angle = (k / BOSS_XP_ORBS) * Math.PI * 2 + rng() * 0.25;
          const dist = 10 + rng() * 32;
          orbs.push({
            x: clamp(enemy.x + Math.cos(angle) * dist, PLAY_MIN_X, PLAY_MAX_X),
            y: clamp(enemy.y + Math.sin(angle) * dist, PLAY_MIN_Y, PLAY_MAX_Y),
          });
        }
      } else {
        orbs.push({ x: enemy.x, y: enemy.y });
      }
      enemies.splice(index, 1);
      kills += 1;
    }
  };

  const updatePlayerMovement = (dt: number): void => {
    let hasEnemyWithin120 = false;
    let hasEnemyWithin200 = false;
    let fleeX = 0;
    let fleeY = 0;

    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      const dx = playerX - e.x;
      const dy = playerY - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 200) {
        hasEnemyWithin200 = true;
        if (dist <= 120) {
          hasEnemyWithin120 = true;
        }
        const safeDist = Math.max(dist, 8);
        const weight = 1 / (safeDist * safeDist);
        if (dist > 0.001) {
          fleeX += (dx / dist) * weight;
          fleeY += (dy / dist) * weight;
        } else {
          const cx = ARENA_CENTER_X - playerX;
          const cy = ARENA_CENTER_Y - playerY;
          const cDist = Math.hypot(cx, cy);
          if (cDist > 0.001) {
            fleeX += (cx / cDist) * weight;
            fleeY += (cy / cDist) * weight;
          } else {
            fleeX += weight;
          }
        }
      }
    }

    // Gentle wall repulsion within 60px of playable bounds to keep kiting along edges fluid.
    const wallMargin = 60;
    const dLeft = playerX - PLAY_MIN_X;
    if (dLeft < wallMargin) {
      const safe = Math.max(dLeft, 8);
      fleeX += 0.5 / (safe * safe);
    }
    const dRight = PLAY_MAX_X - playerX;
    if (dRight < wallMargin) {
      const safe = Math.max(dRight, 8);
      fleeX -= 0.5 / (safe * safe);
    }
    const dTop = playerY - PLAY_MIN_Y;
    if (dTop < wallMargin) {
      const safe = Math.max(dTop, 8);
      fleeY += 0.5 / (safe * safe);
    }
    const dBottom = PLAY_MAX_Y - playerY;
    if (dBottom < wallMargin) {
      const safe = Math.max(dBottom, 8);
      fleeY -= 0.5 / (safe * safe);
    }

    let moveX = 0;
    let moveY = 0;

    if (hasEnemyWithin120) {
      const fleeLen = Math.hypot(fleeX, fleeY);
      if (fleeLen > 1e-9) {
        moveX = fleeX / fleeLen;
        moveY = fleeY / fleeLen;
      } else {
        const cx = ARENA_CENTER_X - playerX;
        const cy = ARENA_CENTER_Y - playerY;
        const cDist = Math.hypot(cx, cy);
        if (cDist > 0.001) {
          moveX = cx / cDist;
          moveY = cy / cDist;
        }
      }
    } else {
      let nearestOrb: OrbEntity | null = null;
      let nearestOrbDist = 300;
      for (let i = 0; i < orbs.length; i += 1) {
        const orb = orbs[i];
        const dist = Math.hypot(orb.x - playerX, orb.y - playerY);
        if (dist <= nearestOrbDist) {
          nearestOrbDist = dist;
          nearestOrb = orb;
        }
      }

      let goalX = 0;
      let goalY = 0;
      if (nearestOrb) {
        const dx = nearestOrb.x - playerX;
        const dy = nearestOrb.y - playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) {
          goalX = dx / dist;
          goalY = dy / dist;
        }
      } else {
        const cx = ARENA_CENTER_X - playerX;
        const cy = ARENA_CENTER_Y - playerY;
        const cDist = Math.hypot(cx, cy);
        if (cDist > 8) {
          goalX = cx / cDist;
          goalY = cy / cDist;
        }
      }

      if (hasEnemyWithin200) {
        const fleeLen = Math.hypot(fleeX, fleeY);
        if (fleeLen > 1e-9) {
          const fnx = fleeX / fleeLen;
          const fny = fleeY / fleeLen;
          const bx = fnx * 0.5 + goalX;
          const by = fny * 0.5 + goalY;
          const bLen = Math.hypot(bx, by);
          if (bLen > 1e-9) {
            moveX = bx / bLen;
            moveY = by / bLen;
          }
        } else {
          moveX = goalX;
          moveY = goalY;
        }
      } else {
        moveX = goalX;
        moveY = goalY;
      }
    }

    if (moveX !== 0 || moveY !== 0) {
      playerX = clamp(playerX + moveX * stats.speed * dt, PLAY_MIN_X, PLAY_MAX_X);
      playerY = clamp(playerY + moveY * stats.speed * dt, PLAY_MIN_Y, PLAY_MAX_Y);
    }
  };

  const randomEdgePoint = (): { x: number; y: number } => {
    const edge = Math.floor(rng() * 4);
    if (edge === 0) {
      return { x: rng() * ARENA_WIDTH, y: -SPAWN_MARGIN };
    }
    if (edge === 1) {
      return { x: ARENA_WIDTH + SPAWN_MARGIN, y: rng() * ARENA_HEIGHT };
    }
    if (edge === 2) {
      return { x: rng() * ARENA_WIDTH, y: ARENA_HEIGHT + SPAWN_MARGIN };
    }
    return { x: -SPAWN_MARGIN, y: rng() * ARENA_HEIGHT };
  };

  const updateSpawning = (dt: number, elapsedSeconds: number): void => {
    if (!bossSpawned && elapsedSeconds >= BOSS_SPAWN_ELAPSED_SECONDS) {
      bossSpawned = true;
      const { x, y } = randomEdgePoint();
      enemies.push({
        kind: 'boss',
        x,
        y,
        radius: BOSS_STATS.radius,
        hp: BOSS_STATS.maxHp,
        speed: BOSS_STATS.speed,
        contactDamage: BOSS_STATS.contactDamage,
        attackCooldown: BOSS_STATS.attackCooldown,
        attackCooldownRemaining: 0,
      });
      if (enemies.length > maxConcurrent) {
        maxConcurrent = enemies.length;
      }
    }

    spawnTimer -= dt;
    while (spawnTimer <= 0) {
      spawnTimer += spawnIntervalAt(elapsedSeconds);
      if (enemies.length < MAX_ENEMIES) {
        const { x, y } = randomEdgePoint();
        const template = enemyStatsAt(elapsedSeconds);
        enemies.push({
          kind: 'normal',
          x,
          y,
          radius: template.radius,
          hp: template.maxHp,
          speed: template.speed,
          contactDamage: template.contactDamage,
          attackCooldown: template.attackCooldown,
          attackCooldownRemaining: 0,
        });
        if (enemies.length > maxConcurrent) {
          maxConcurrent = enemies.length;
        }
      }
    }
  };

  const updateEnemies = (dt: number): boolean => {
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      const dx = playerX - enemy.x;
      const dy = playerY - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        enemy.x += (dx / dist) * enemy.speed * dt;
        enemy.y += (dy / dist) * enemy.speed * dt;
      }
      if (enemy.attackCooldownRemaining > 0) {
        enemy.attackCooldownRemaining = Math.max(0, enemy.attackCooldownRemaining - dt);
      }
    }

    // 48px uniform spatial hash grid covering pairwise separation up to boss+boss (48px).
    gridHead.fill(-1);
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      const cx = clamp(Math.floor(e.x / CELL_SIZE) + GRID_OFFSET, 0, GRID_COLS - 1);
      const cy = clamp(Math.floor(e.y / CELL_SIZE) + GRID_OFFSET, 0, GRID_ROWS - 1);
      const cell = cy * GRID_COLS + cx;
      gridNext[i] = gridHead[cell];
      gridHead[cell] = i;
    }

    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      const cx = clamp(Math.floor(a.x / CELL_SIZE) + GRID_OFFSET, 0, GRID_COLS - 1);
      const cy = clamp(Math.floor(a.y / CELL_SIZE) + GRID_OFFSET, 0, GRID_ROWS - 1);
      const minCy = cy > 0 ? cy - 1 : 0;
      const maxCy = cy < GRID_ROWS - 1 ? cy + 1 : GRID_ROWS - 1;
      const minCx = cx > 0 ? cx - 1 : 0;
      const maxCx = cx < GRID_COLS - 1 ? cx + 1 : GRID_COLS - 1;

      for (let ny = minCy; ny <= maxCy; ny += 1) {
        const rowOffset = ny * GRID_COLS;
        for (let nx = minCx; nx <= maxCx; nx += 1) {
          let j = gridHead[rowOffset + nx];
          while (j !== -1) {
            if (j > i) {
              const b = enemies[j];
              const minDist = a.radius + b.radius;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy);
              if (dist < minDist) {
                const push = (minDist - dist) * 0.5;
                const pushX = dist > 0.001 ? dx / dist : 1;
                const pushY = dist > 0.001 ? dy / dist : 0;
                a.x -= pushX * push;
                a.y -= pushY * push;
                b.x += pushX * push;
                b.y += pushY * push;
              }
            }
            j = gridNext[j];
          }
        }
      }
    }

    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      const touchDist = PLAYER_RADIUS + enemy.radius;
      const dist = Math.hypot(playerX - enemy.x, playerY - enemy.y);
      if (dist <= touchDist && enemy.attackCooldownRemaining <= 0) {
        stats.hp = Math.max(0, stats.hp - enemy.contactDamage);
        enemy.attackCooldownRemaining = enemy.attackCooldown;
        if (stats.hp <= 0) {
          return false;
        }
      }
    }

    return true;
  };

  const updateWeapons = (dt: number): void => {
    const sword = stats.weapons.peach_sword;
    if (sword) {
      swordCooldown = Math.max(0, swordCooldown - dt);
      if (swordCooldown <= 0) {
        let nearest: EnemyEntity | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < enemies.length; i += 1) {
          const enemy = enemies[i];
          const dist = Math.hypot(enemy.x - playerX, enemy.y - playerY);
          if (dist <= sword.range + enemy.radius && dist <= bestDist) {
            bestDist = dist;
            nearest = enemy;
          }
        }

        if (nearest) {
          const angle = Math.atan2(nearest.y - playerY, nearest.x - playerX);
          const halfArcRad = ((sword.arcDeg / 2) * Math.PI) / 180;
          const dmg = sword.damage * stats.damageMultiplier;

          for (let i = enemies.length - 1; i >= 0; i -= 1) {
            const enemy = enemies[i];
            const dx = enemy.x - playerX;
            const dy = enemy.y - playerY;
            if (Math.hypot(dx, dy) <= sword.range + enemy.radius) {
              const enemyAngle = Math.atan2(dy, dx);
              if (normalizeAngleDiff(enemyAngle, angle) <= halfArcRad) {
                damageEnemyAt(i, dmg);
              }
            }
          }
          swordCooldown = sword.cooldown;
        }
      }
    }

    const dart = stats.weapons.coin_dart;
    if (dart) {
      dartCooldown = Math.max(0, dartCooldown - dt);
      if (dartCooldown <= 0) {
        const targets: { enemy: EnemyEntity; dist: number }[] = [];
        for (let i = 0; i < enemies.length; i += 1) {
          const enemy = enemies[i];
          const dist = Math.hypot(enemy.x - playerX, enemy.y - playerY);
          if (dist <= dart.range + enemy.radius) {
            targets.push({ enemy, dist });
          }
        }
        targets.sort((a, b) => a.dist - b.dist);

        if (targets.length > 0) {
          const dmg = dart.damage * stats.damageMultiplier;
          for (let i = 0; i < dart.count; i += 1) {
            const target = targets[i % targets.length].enemy;
            let angle = Math.atan2(target.y - playerY, target.x - playerX);
            if (i >= targets.length) {
              const step = Math.floor((i - targets.length) / 2) + 1;
              angle += (i % 2 === 0 ? 1 : -1) * step * 0.14;
            }
            darts.push({
              x: playerX,
              y: playerY,
              vx: Math.cos(angle) * dart.projectileSpeed,
              vy: Math.sin(angle) * dart.projectileSpeed,
              damage: dmg,
              radius: 5,
            });
          }
          dartCooldown = dart.cooldown;
        }
      }
    }

    const lantern = stats.weapons.lantern_fire;
    if (lantern) {
      if (lanternActiveRemaining > 0) {
        lanternActiveRemaining -= dt;
        lanternTickTimer -= dt;
        while (lanternTickTimer <= 0) {
          lanternTickTimer += lantern.tickInterval;
          const dmg = lantern.damage * stats.damageMultiplier;
          for (let i = enemies.length - 1; i >= 0; i -= 1) {
            const enemy = enemies[i];
            if (Math.hypot(enemy.x - playerX, enemy.y - playerY) <= lantern.range + enemy.radius) {
              damageEnemyAt(i, dmg);
            }
          }
        }
        if (lanternActiveRemaining <= 0) {
          lanternActiveRemaining = 0;
          lanternCooldownRemaining = lantern.cooldown;
        }
      } else {
        lanternCooldownRemaining -= dt;
        if (lanternCooldownRemaining <= 0) {
          lanternActiveRemaining = lantern.duration;
          lanternTickTimer = 0;
        }
      }
    }
  };

  const updateDarts = (dt: number): void => {
    for (let i = darts.length - 1; i >= 0; i -= 1) {
      const dart = darts[i];
      dart.x += dart.vx * dt;
      dart.y += dart.vy * dt;

      if (
        dart.x < -40 ||
        dart.x > ARENA_WIDTH + 40 ||
        dart.y < HUD_HEIGHT - 40 ||
        dart.y > ARENA_HEIGHT + 40
      ) {
        darts.splice(i, 1);
        continue;
      }

      for (let j = enemies.length - 1; j >= 0; j -= 1) {
        const enemy = enemies[j];
        if (Math.hypot(enemy.x - dart.x, enemy.y - dart.y) <= dart.radius + enemy.radius) {
          damageEnemyAt(j, dart.damage);
          darts.splice(i, 1);
          break;
        }
      }
    }
  };

  const updateOrbs = (dt: number): void => {
    const collectRadius = PLAYER_RADIUS + ORB_RADIUS + 2;
    for (let i = orbs.length - 1; i >= 0; i -= 1) {
      const orb = orbs[i];
      const dx = playerX - orb.x;
      const dy = playerY - orb.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= collectRadius) {
        orbs.splice(i, 1);
        gainXp(XP_PER_ORB);
        continue;
      }

      if (dist <= stats.pickupRadius) {
        const stepDist = Math.min(dist, ORB_PULL_SPEED * dt);
        orb.x += (dx / dist) * stepDist;
        orb.y += (dy / dist) * stepDist;
      }
    }
  };

  for (let step = 1; step <= SIM_TOTAL_STEPS; step += 1) {
    const elapsedSeconds = step * SIM_DT;
    if (step === SIM_TOTAL_STEPS) {
      hpTrajectory[TRAJECTORY_POINTS - 1] = stats.hp;
      return {
        won: true,
        survivedSeconds: ROUND_DURATION_SECONDS,
        kills,
        level,
        maxConcurrent,
        bossSpawned,
        bossKilled,
        hpTrajectory,
      };
    }

    updatePlayerMovement(SIM_DT);
    updateSpawning(SIM_DT, elapsedSeconds);
    if (!updateEnemies(SIM_DT)) {
      return {
        won: false,
        survivedSeconds: elapsedSeconds,
        kills,
        level,
        maxConcurrent,
        bossSpawned,
        bossKilled,
        hpTrajectory,
      };
    }
    updateWeapons(SIM_DT);
    updateDarts(SIM_DT);
    updateOrbs(SIM_DT);

    if (step % TRAJECTORY_STEP_INTERVAL === 0) {
      hpTrajectory[step / TRAJECTORY_STEP_INTERVAL] = stats.hp;
    }
  }

  return {
    won: true,
    survivedSeconds: ROUND_DURATION_SECONDS,
    kills,
    level,
    maxConcurrent,
    bossSpawned,
    bossKilled,
    hpTrajectory,
  };
}

/** Run a batch of N simulations derived from the base seed and aggregate statistics. */
export function runSimBatch(config: Partial<SimConfig> = {}): SimSummary {
  const runs = config.runs ?? 200;
  const seed = config.seed ?? 1;

  const results: RunResult[] = [];
  let wins = 0;
  let totalSurvived = 0;
  let totalKills = 0;
  let totalLevel = 0;
  let totalMaxConcurrent = 0;
  let bossSpawnedCount = 0;
  let bossKilledCount = 0;
  const hpSums = new Array<number>(TRAJECTORY_POINTS).fill(0);

  for (let i = 0; i < runs; i += 1) {
    const runSeed = (Math.imul(seed >>> 0, 2654435761) + Math.imul(i + 1, 2246822519)) >>> 0;
    const res = runSingleSim(runSeed);
    results.push(res);

    if (res.won) wins += 1;
    if (res.bossSpawned) bossSpawnedCount += 1;
    if (res.bossKilled) bossKilledCount += 1;
    totalSurvived += res.survivedSeconds;
    totalKills += res.kills;
    totalLevel += res.level;
    totalMaxConcurrent += res.maxConcurrent;
    for (let t = 0; t < TRAJECTORY_POINTS; t += 1) {
      hpSums[t] += res.hpTrajectory[t];
    }
  }

  const avgHpTrajectory = hpSums.map((sum) => (runs > 0 ? sum / runs : 0));

  return {
    runs,
    seed,
    winRate: runs > 0 ? (wins / runs) * 100 : 0,
    avgSurvivedSeconds: runs > 0 ? totalSurvived / runs : 0,
    avgKills: runs > 0 ? totalKills / runs : 0,
    avgLevel: runs > 0 ? totalLevel / runs : 0,
    avgMaxConcurrent: runs > 0 ? totalMaxConcurrent / runs : 0,
    avgHpAt30s: avgHpTrajectory[3] ?? 0,
    bossSpawnedCount,
    bossKilledCount,
    bossKillRate: runs > 0 ? (bossKilledCount / runs) * 100 : 0,
    bossKillRateWhenSpawned: bossSpawnedCount > 0 ? (bossKilledCount / bossSpawnedCount) * 100 : 0,
    avgHpTrajectory,
    results,
  };
}

/** Format a SimSummary into readable ASCII tables for stdout. */
export function formatSimSummary(summary: SimSummary): string {
  const lines: string[] = [];
  lines.push(`=== Night Alley Headless Balance Sim (${summary.runs} runs, seed=${summary.seed}) ===`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Runs | ${summary.runs} |`);
  lines.push(`| Win Rate | ${summary.winRate.toFixed(1)}% |`);
  lines.push(`| Avg Survived (s) | ${summary.avgSurvivedSeconds.toFixed(2)} |`);
  lines.push(`| Avg Kills | ${summary.avgKills.toFixed(2)} |`);
  lines.push(`| Avg Level | ${summary.avgLevel.toFixed(2)} |`);
  lines.push(`| Avg Max Concurrent | ${summary.avgMaxConcurrent.toFixed(2)} |`);
  lines.push(`| Avg HP @ 30s | ${summary.avgHpAt30s.toFixed(2)} |`);
  lines.push(
    `| Boss Kill Rate | ${summary.bossKillRate.toFixed(1)}% (${summary.bossKilledCount}/${summary.runs}; ${summary.bossKillRateWhenSpawned.toFixed(1)}% of ${summary.bossSpawnedCount} spawned) |`,
  );
  lines.push('');
  lines.push('Avg HP Trajectory (every 10s, dead=0):');
  lines.push('| Time (s) | Avg HP |');
  lines.push('| --- | --- |');
  for (let i = 0; i < summary.avgHpTrajectory.length; i += 1) {
    lines.push(`| ${i * TRAJECTORY_INTERVAL_SECONDS}s | ${summary.avgHpTrajectory[i].toFixed(2)} |`);
  }
  return lines.join('\n');
}
