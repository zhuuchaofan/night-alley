import type { EnemyKind, SpawnEnemyKind, WeaponId } from './balance.ts';

export interface SettlementData {
  won: boolean;
  survivedSeconds: number;
  kills: number;
  level: number;
  maxConcurrent: number;
  /** How a win was earned; absent on a loss. */
  winReason?: 'dawn' | 'boss';
}

export interface DebugChoiceInfo {
  id: string;
  title: string;
  x: number;
  y: number;
}

export interface DebugSlashInfo {
  x: number;
  y: number;
  rotation: number;
  displayWidth: number;
  displayHeight: number;
}

export interface DebugDamageNumberInfo {
  text: string;
  x: number;
  y: number;
  alpha: number;
}

export interface DebugEnemyFeelInfo {
  id: number;
  kind?: EnemyKind;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  hitFlash: number;
  knockbackX: number;
  knockbackY: number;
}

export interface DebugOrbFeelInfo {
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  scattering: boolean;
}

export interface DebugGameFeelInfo {
  playerTexture: string;
  playerSwinging: boolean;
  playerSwingAngle: number;
  playerScreenFlash: number;
  damageNumbers: DebugDamageNumberInfo[];
  burstParticles: number;
  scatteringOrbs: number;
  orbs: DebugOrbFeelInfo[];
  enemies: DebugEnemyFeelInfo[];
}

export interface DebugState {
  scene: 'TitleScene' | 'GameScene' | 'GameOverScene';
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  kills: number;
  timeLeft: number;
  enemies: number;
  enemiesByKind?: Record<string, number>;
  bolts?: { x: number; y: number }[];
  maxConcurrent: number;
  weapons: WeaponId[];
  evolvedWeapons: WeaponId[];
  loadoutText?: string;
  playerX: number;
  playerY: number;
  isLevelUpOpen: boolean;
  levelUpChoices: DebugChoiceInfo[];
  bossSpawned: boolean;
  bossAlive: boolean;
  /** Boss-death slow-motion cinematic in progress. */
  bossDying: boolean;
  /**
   * Settlement counters frozen at the lethal boss hit (null until a boss
   * kill). The round timer stops when the boss starts dying, so the win
   * settlement must report exactly these values; anything higher means a
   * post-lethal kill or spawn leaked in (Codex round-3 Block).
   */
  bossKillKills: number | null;
  bossKillMaxConcurrent: number | null;
  slashes?: DebugSlashInfo[];
  gameFeel?: DebugGameFeelInfo;
  settlement: SettlementData | null;
}

export interface NightAlleyDebug {
  getState(): DebugState;
  addXp(n: number): void;
  setTimeLeft(s: number): void;
  setHp(n: number): void;
  spawnEnemyNearPlayer(): void;
  spawnEnemyKind?(kind: SpawnEnemyKind, offsetX?: number, offsetY?: number): void;
}

declare global {
  interface Window {
    __NIGHT_ALLEY_DEBUG__?: NightAlleyDebug;
  }
}

export function registerDebugHook(hook: NightAlleyDebug): void {
  window.__NIGHT_ALLEY_DEBUG__ = hook;
}
