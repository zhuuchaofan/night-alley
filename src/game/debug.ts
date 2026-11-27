import type { WeaponId } from './balance.ts';

export interface SettlementData {
  won: boolean;
  survivedSeconds: number;
  kills: number;
  level: number;
  maxConcurrent: number;
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

export interface DebugState {
  scene: 'TitleScene' | 'GameScene' | 'GameOverScene';
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  kills: number;
  timeLeft: number;
  enemies: number;
  maxConcurrent: number;
  weapons: WeaponId[];
  playerX: number;
  playerY: number;
  isLevelUpOpen: boolean;
  levelUpChoices: DebugChoiceInfo[];
  slashes?: DebugSlashInfo[];
  settlement: SettlementData | null;
}

export interface NightAlleyDebug {
  getState(): DebugState;
  addXp(n: number): void;
  setTimeLeft(s: number): void;
  setHp(n: number): void;
  spawnEnemyNearPlayer(): void;
}

declare global {
  interface Window {
    __NIGHT_ALLEY_DEBUG__?: NightAlleyDebug;
  }
}

export function registerDebugHook(hook: NightAlleyDebug): void {
  window.__NIGHT_ALLEY_DEBUG__ = hook;
}
