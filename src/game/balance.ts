export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 540;
export const HUD_HEIGHT = 44;
export const ROUND_DURATION_SECONDS = 180;
export const SPAWN_MARGIN = 30;
export const MAX_ENEMIES = 65;

export const PLAYER_MAX_HP = 30;
export const PLAYER_SPEED = 160;
export const PLAYER_RADIUS = 12;
export const PLAYER_COLOR = 0xe8b34b;
export const PLAYER_PICKUP_RADIUS = 60;

export const XP_PER_ORB = 1;
export const ORB_RADIUS = 4;
export const ORB_PULL_SPEED = 420;

export const ENEMY_BASE_HP = 8;
export const ENEMY_HP_STEP_SECONDS = 30;
export const ENEMY_BASE_SPEED = 55;
export const ENEMY_SPEED_MAX_BONUS = 0.4;
export const ENEMY_CONTACT_DAMAGE = 2;
export const ENEMY_ATTACK_COOLDOWN = 0.5;
export const ENEMY_RADIUS = 10;
export const ENEMY_COLOR = 0x9a8fb5;

export const BOSS_SPAWN_ELAPSED_SECONDS = 150;
export const BOSS_MAX_HP = 120;
export const BOSS_SPEED = 85;
export const BOSS_CONTACT_DAMAGE = 4;
export const BOSS_ATTACK_COOLDOWN = 1.75;
export const BOSS_RADIUS = 24;
export const BOSS_XP_ORBS = 20;

export type WeaponId = 'peach_sword' | 'coin_dart' | 'lantern_fire';

export const WEAPON_ORDER: WeaponId[] = ['peach_sword', 'coin_dart', 'lantern_fire'];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  cooldown: number;
  range: number;
  arcDeg: number;
  damage: number;
  count: number;
  projectileSpeed: number;
  duration: number;
  tickInterval: number;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  peach_sword: {
    id: 'peach_sword',
    name: '桃木剑',
    cooldown: 0.8,
    range: 90,
    arcDeg: 100,
    damage: 6,
    count: 1,
    projectileSpeed: 0,
    duration: 0,
    tickInterval: 0,
  },
  coin_dart: {
    id: 'coin_dart',
    name: '铜钱镖',
    cooldown: 1.2,
    range: 320,
    arcDeg: 0,
    damage: 5,
    count: 1,
    projectileSpeed: 420,
    duration: 0,
    tickInterval: 0,
  },
  lantern_fire: {
    id: 'lantern_fire',
    name: '灯笼火',
    cooldown: 2.0,
    range: 90,
    arcDeg: 0,
    damage: 1.5,
    count: 1,
    projectileSpeed: 0,
    duration: 2.0,
    tickInterval: 0.5,
  },
};

export const EVOLUTION_MIN_LEVEL = 5;

export interface EvolutionDef {
  name: string;
  damageMultiplier: number;
  arcDegBonus?: number;
  countBonus?: number;
  rangeMultiplier?: number;
}

export const EVOLUTION_DEFS: Record<WeaponId, EvolutionDef> = {
  peach_sword: {
    name: '破魔法剑',
    damageMultiplier: 2,
    arcDegBonus: 40,
  },
  coin_dart: {
    name: '九连钱镖',
    damageMultiplier: 1.5,
    countBonus: 2,
  },
  lantern_fire: {
    name: '照夜魂灯',
    damageMultiplier: 2,
    rangeMultiplier: 1.5,
  },
};

export interface WeaponState {
  id: WeaponId;
  level: number;
  evolved: boolean;
  cooldown: number;
  range: number;
  arcDeg: number;
  damage: number;
  count: number;
  projectileSpeed: number;
  duration: number;
  tickInterval: number;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  speed: number;
  pickupRadius: number;
  damageMultiplier: number;
  weapons: Partial<Record<WeaponId, WeaponState>>;
}

export interface EnemyStats {
  maxHp: number;
  speed: number;
  contactDamage: number;
  attackCooldown: number;
  radius: number;
}

export const BOSS_STATS: Readonly<EnemyStats> = {
  maxHp: BOSS_MAX_HP,
  speed: BOSS_SPEED,
  contactDamage: BOSS_CONTACT_DAMAGE,
  attackCooldown: BOSS_ATTACK_COOLDOWN,
  radius: BOSS_RADIUS,
};

/** XP required to advance from `level` to `level + 1`. */
export function xpNeededForLevel(level: number): number {
  return 5 + level * 3;
}

/** Spawn interval (seconds) at `elapsedSeconds`. */
export function spawnIntervalAt(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  return Math.max(0.35, 1.2 - t * 0.004);
}

/** Enemy attributes at `elapsedSeconds`. */
export function enemyStatsAt(elapsedSeconds: number): EnemyStats {
  const t = Math.max(0, elapsedSeconds);
  return {
    maxHp: ENEMY_BASE_HP + Math.floor(t / ENEMY_HP_STEP_SECONDS),
    speed: ENEMY_BASE_SPEED * (1 + (t / ROUND_DURATION_SECONDS) * ENEMY_SPEED_MAX_BONUS),
    contactDamage: ENEMY_CONTACT_DAMAGE,
    attackCooldown: ENEMY_ATTACK_COOLDOWN,
    radius: ENEMY_RADIUS,
  };
}

/** Create initial runtime state for a weapon. */
export function createInitialWeapon(id: WeaponId): WeaponState {
  const def = WEAPON_DEFS[id];
  return {
    id: def.id,
    level: 1,
    evolved: false,
    cooldown: def.cooldown,
    range: def.range,
    arcDeg: def.arcDeg,
    damage: def.damage,
    count: def.count,
    projectileSpeed: def.projectileSpeed,
    duration: def.duration,
    tickInterval: def.tickInterval,
  };
}

/** Return the weapon's evolved name when evolved, otherwise its base name. */
export function displayWeaponName(state: WeaponState): string {
  return state.evolved ? EVOLUTION_DEFS[state.id].name : WEAPON_DEFS[state.id].name;
}

/** Create starting player stats with the Peach Wood Sword equipped. */
export function createInitialPlayerStats(): PlayerStats {
  return {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    speed: PLAYER_SPEED,
    pickupRadius: PLAYER_PICKUP_RADIUS,
    damageMultiplier: 1,
    weapons: {
      peach_sword: createInitialWeapon('peach_sword'),
    },
  };
}

/** Format seconds as MM:SS. */
export function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
