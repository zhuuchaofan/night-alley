import {
  createInitialWeapon,
  PlayerStats,
  WEAPON_DEFS,
  WEAPON_ORDER,
  WeaponId,
  WeaponState,
} from './balance.ts';

export type ChoiceCategory = 'new_weapon' | 'weapon_upgrade' | 'stat';

export interface ChoiceOption {
  id: string;
  category: ChoiceCategory;
  title: string;
  description: string;
  weaponId?: WeaponId;
  upgradeKind?: 'damage' | 'speed' | 'count' | 'range';
  statKind?: 'damage' | 'speed' | 'hp' | 'pickup';
}

const NEW_WEAPON_DESC: Record<WeaponId, string> = {
  peach_sword: '近战弧形挥砍最近敌人',
  coin_dart: '向 320 范围内最近敌人发射铜钱镖',
  lantern_fire: '周期灼烧周围 90 范围内敌人',
};

const WEAPON_UPGRADE_OPTIONS: Record<WeaponId, ChoiceOption[]> = {
  peach_sword: [
    {
      id: 'upg:peach_sword:damage',
      category: 'weapon_upgrade',
      title: '桃木剑 · 锐利',
      description: '桃木剑伤害 +30%',
      weaponId: 'peach_sword',
      upgradeKind: 'damage',
    },
    {
      id: 'upg:peach_sword:speed',
      category: 'weapon_upgrade',
      title: '桃木剑 · 疾挥',
      description: '桃木剑攻速 +20%',
      weaponId: 'peach_sword',
      upgradeKind: 'speed',
    },
  ],
  coin_dart: [
    {
      id: 'upg:coin_dart:damage',
      category: 'weapon_upgrade',
      title: '铜钱镖 · 沉重',
      description: '铜钱镖伤害 +30%',
      weaponId: 'coin_dart',
      upgradeKind: 'damage',
    },
    {
      id: 'upg:coin_dart:count',
      category: 'weapon_upgrade',
      title: '铜钱镖 · 连发',
      description: '铜钱镖数量 +1',
      weaponId: 'coin_dart',
      upgradeKind: 'count',
    },
  ],
  lantern_fire: [
    {
      id: 'upg:lantern_fire:damage',
      category: 'weapon_upgrade',
      title: '灯笼火 · 烈焰',
      description: '灯笼火每跳伤害 +30%',
      weaponId: 'lantern_fire',
      upgradeKind: 'damage',
    },
    {
      id: 'upg:lantern_fire:range',
      category: 'weapon_upgrade',
      title: '灯笼火 · 盛燃',
      description: '灯笼火灼烧范围 +30%',
      weaponId: 'lantern_fire',
      upgradeKind: 'range',
    },
  ],
};

const STAT_OPTIONS: ChoiceOption[] = [
  {
    id: 'stat:damage',
    category: 'stat',
    title: '聚气 · 破邪',
    description: '全局伤害 +20%',
    statKind: 'damage',
  },
  {
    id: 'stat:speed',
    category: 'stat',
    title: '轻身 · 踏巷',
    description: '移速 +15%',
    statKind: 'speed',
  },
  {
    id: 'stat:hp',
    category: 'stat',
    title: '固本 · 养神',
    description: '血量上限 +10 并回复 10',
    statKind: 'hp',
  },
  {
    id: 'stat:pickup',
    category: 'stat',
    title: '引魂 · 拾珠',
    description: '拾取范围 +40%',
    statKind: 'pickup',
  },
];

/** Build the full candidate pool for level-up choices given current player stats. */
export function buildChoicePool(stats: PlayerStats): ChoiceOption[] {
  const pool: ChoiceOption[] = [];

  for (const weaponId of WEAPON_ORDER) {
    if (stats.weapons[weaponId]) {
      pool.push(...WEAPON_UPGRADE_OPTIONS[weaponId]);
    } else {
      pool.push({
        id: `new:${weaponId}`,
        category: 'new_weapon',
        title: `新武器 · ${WEAPON_DEFS[weaponId].name}`,
        description: NEW_WEAPON_DESC[weaponId],
        weaponId,
      });
    }
  }

  pool.push(...STAT_OPTIONS);
  return pool;
}

/** Pick `count` distinct options uniformly at random from the current pool. */
export function generateChoices(
  stats: PlayerStats,
  rng: () => number = Math.random,
  count = 3,
): ChoiceOption[] {
  const pool = buildChoicePool(stats);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Purely apply a chosen level-up option to `stats` and return updated stats. */
export function applyChoice(stats: PlayerStats, choice: ChoiceOption): PlayerStats {
  const weapons: Partial<Record<WeaponId, WeaponState>> = {};
  for (const id of WEAPON_ORDER) {
    const existing = stats.weapons[id];
    if (existing) {
      weapons[id] = { ...existing };
    }
  }

  const next: PlayerStats = {
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: stats.speed,
    pickupRadius: stats.pickupRadius,
    damageMultiplier: stats.damageMultiplier,
    weapons,
  };

  if (choice.category === 'new_weapon' && choice.weaponId) {
    next.weapons[choice.weaponId] = createInitialWeapon(choice.weaponId);
    return next;
  }

  if (choice.category === 'weapon_upgrade' && choice.weaponId && choice.upgradeKind) {
    const weapon = next.weapons[choice.weaponId];
    if (!weapon) {
      return next;
    }
    weapon.level += 1;
    if (choice.upgradeKind === 'damage') {
      weapon.damage *= 1.3;
    } else if (choice.upgradeKind === 'speed') {
      weapon.cooldown /= 1.2;
    } else if (choice.upgradeKind === 'count') {
      weapon.count += 1;
    } else if (choice.upgradeKind === 'range') {
      weapon.range *= 1.3;
    }
    return next;
  }

  if (choice.category === 'stat') {
    if (choice.statKind === 'damage') {
      next.damageMultiplier *= 1.2;
    } else if (choice.statKind === 'speed') {
      next.speed *= 1.15;
    } else if (choice.statKind === 'hp') {
      next.maxHp += 10;
      next.hp = Math.min(next.maxHp, next.hp + 10);
    } else if (choice.statKind === 'pickup') {
      next.pickupRadius *= 1.4;
    }
  }

  return next;
}
