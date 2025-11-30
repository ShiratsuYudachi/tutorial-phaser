
// 统一物品ID枚举
export enum ItemType {
    // 特殊物品
    EMPTY = 'empty',
    
    // 货币
    GOLD_INGOT = 'gold_ingot',
    
    // 近战武器（永久）
    SWORD = 'sword',
    
    // 弹药（消耗品）
    ARROW = 'arrow',
    FIREBALL_AMMO = 'fireball_ammo',
    DART_AMMO = 'dart_ammo',
    
    // 投掷物
    ENDER_PEARL = 'ender_pearl',

    // 爆炸物
    TNT = 'tnt',
    
    // 方块
    WOOD = 'wood',
    STONE = 'stone',
    DIAMOND = 'diamond',
    
    // 旧的武器类型（保留用于兼容，实际不再作为物品）
    BOW = 'bow',
    FIREBALL = 'fireball',
    DART = 'dart'
}

// 精确的类型别名
export type AmmoItem = ItemType.ARROW | ItemType.FIREBALL_AMMO | ItemType.DART_AMMO | ItemType.ENDER_PEARL;
export type MeleeItem = ItemType.SWORD;
export type BlockItem = ItemType.WOOD | ItemType.STONE | ItemType.DIAMOND | ItemType.TNT;
export type CurrencyItem = ItemType.GOLD_INGOT;
export type EmptyItem = ItemType.EMPTY;
// 保留旧类型用于子弹类型标识
export type WeaponItem = ItemType.BOW | ItemType.FIREBALL | ItemType.DART | ItemType.ENDER_PEARL;

// 弹药集合
export const AMMO = new Set<AmmoItem>([
    ItemType.ARROW,
    ItemType.FIREBALL_AMMO,
    ItemType.DART_AMMO,
    ItemType.ENDER_PEARL
]);

// 近战武器集合
export const MELEE = new Set<MeleeItem>([
    ItemType.SWORD
]);

// 方块集合
export const BLOCKS = new Set<BlockItem>([
    ItemType.WOOD,
    ItemType.STONE,
    ItemType.DIAMOND,
    ItemType.TNT
]);

// 货币集合
export const CURRENCIES = new Set<CurrencyItem>([
    ItemType.GOLD_INGOT
]);

// 弹药到武器类型的映射（用于射击时确定子弹类型）
export const AMMO_TO_WEAPON: Record<AmmoItem, WeaponItem> = {
    [ItemType.ARROW]: ItemType.BOW,
    [ItemType.FIREBALL_AMMO]: ItemType.FIREBALL,
    [ItemType.DART_AMMO]: ItemType.DART,
    [ItemType.ENDER_PEARL]: ItemType.ENDER_PEARL
};

// 辅助函数（带类型守卫）
export const isAmmo = (itemId: ItemType): itemId is AmmoItem => AMMO.has(itemId as AmmoItem);
export const isMelee = (itemId: ItemType): itemId is MeleeItem => MELEE.has(itemId as MeleeItem);
export const isBlock = (itemId: ItemType): itemId is BlockItem => BLOCKS.has(itemId as BlockItem);
export const isCurrency = (itemId: ItemType): itemId is CurrencyItem => CURRENCIES.has(itemId as CurrencyItem);
export const isEmpty = (itemId: ItemType): itemId is EmptyItem => itemId === ItemType.EMPTY;
// 保留旧函数用于兼容
export const isWeapon = (itemId: ItemType): itemId is WeaponItem => 
    itemId === ItemType.BOW || itemId === ItemType.FIREBALL || itemId === ItemType.DART;

// 向后兼容的类型别名（可以逐步移除）
export const WeaponType = {
    BOW: ItemType.BOW,
    FIREBALL: ItemType.FIREBALL,
    DART: ItemType.DART
} as const;

export const AmmoType = {
    ARROW: ItemType.ARROW,
    FIREBALL_AMMO: ItemType.FIREBALL_AMMO,
    DART_AMMO: ItemType.DART_AMMO
} as const;

export const MeleeType = {
    SWORD: ItemType.SWORD
} as const;

export const BlockType = {
    WOOD: ItemType.WOOD,
    STONE: ItemType.STONE,
    DIAMOND: ItemType.DIAMOND,
    TNT: ItemType.TNT
} as const;

export const SpecialItemType = {
    EMPTY: ItemType.EMPTY
} as const;


// 实体类型枚举
export enum EntityType {
    PLAYER = 'player',
    BULLET = 'bullet',
    BLOCK = 'block',
    BED = 'bed',
    DROPPED_ITEM = 'dropped_item',
    RESOURCE_GENERATOR = 'resource_generator'
}

// 队伍类型枚举
export enum TeamType {
    RED = 'red',
    BLUE = 'blue'
}

export const INVENTORY_SIZE = 9;

// 掉落物视觉配置
export interface DroppedItemVisual {
    // 当前使用几何图形
    shape: 'circle' | 'square' | 'diamond' | 'hexagon';
    size: number; // 主体大小
    glowSize: number; // 光晕大小
    // 未来可以添加：
    // texture?: string; // PNG 素材路径
    // spriteKey?: string; // Phaser 纹理键
}

// 统一物品定义
export const ITEM_DEFINITIONS: Record<ItemType, { 
    maxStack: number, 
    name: string, 
    color: number, 
    icon: string,
    droppedVisual: DroppedItemVisual 
}> = {
    [ItemType.EMPTY]: { 
        maxStack: 0, name: 'Empty', color: 0x000000, icon: '',
        droppedVisual: { shape: 'circle', size: 7, glowSize: 11 }
    },
    [ItemType.GOLD_INGOT]: { 
        maxStack: 64, name: 'Gold Ingot', color: 0xFFD700, icon: 'game-icons:gold-bar',
        droppedVisual: { shape: 'hexagon', size: 9, glowSize: 12 }
    },
    // 近战武器
    [ItemType.SWORD]: { 
        maxStack: 1, name: 'Sword', color: 0xC0C0C0, icon: 'game-icons:broadsword',
        droppedVisual: { shape: 'diamond', size: 10, glowSize: 14 }
    },
    // 弹药
    [ItemType.ARROW]: { 
        maxStack: 64, name: 'Arrow', color: 0x8B4513, icon: 'game-icons:arrow-cluster',
        droppedVisual: { shape: 'diamond', size: 7, glowSize: 11 }
    },
    [ItemType.FIREBALL_AMMO]: { 
        maxStack: 32, name: 'Fireball', color: 0xff4500, icon: 'game-icons:fireball',
        droppedVisual: { shape: 'circle', size: 9, glowSize: 15 }
    },
    [ItemType.DART_AMMO]: { 
        maxStack: 64, name: 'Dart', color: 0x00ffff, icon: 'game-icons:thrown-daggers',
        droppedVisual: { shape: 'diamond', size: 7, glowSize: 11 }
    },
    [ItemType.ENDER_PEARL]: { 
        maxStack: 16, name: 'Ender Pearl', color: 0x8B00FF, icon: 'game-icons:glass-ball',
        droppedVisual: { shape: 'circle', size: 6, glowSize: 10 }
    },
    // 方块
    [ItemType.WOOD]: { 
        maxStack: 64, name: 'Wood', color: 0x8B4513, icon: 'game-icons:wood-pile',
        droppedVisual: { shape: 'square', size: 9, glowSize: 12 }
    },
    [ItemType.STONE]: { 
        maxStack: 64, name: 'Stone', color: 0x808080, icon: 'game-icons:stone-block',
        droppedVisual: { shape: 'square', size: 9, glowSize: 12 }
    },
    [ItemType.DIAMOND]: { 
        maxStack: 64, name: 'Diamond', color: 0x00CED1, icon: 'game-icons:cut-diamond',
        droppedVisual: { shape: 'diamond', size: 10, glowSize: 14 }
    },
    [ItemType.TNT]: { 
        maxStack: 16, name: 'TNT', color: 0xFF0000, icon: 'game-icons:dynamite',
        droppedVisual: { shape: 'square', size: 10, glowSize: 14 }
    },
    // 旧武器类型（保留用于兼容，实际显示为弹药）
    [ItemType.BOW]: { 
        maxStack: 1, name: 'Bow', color: 0xffff00, icon: 'game-icons:bow-arrow',
        droppedVisual: { shape: 'diamond', size: 10, glowSize: 14 }
    },
    [ItemType.FIREBALL]: { 
        maxStack: 1, name: 'Fireball Staff', color: 0xff4500, icon: 'game-icons:fireball',
        droppedVisual: { shape: 'circle', size: 9, glowSize: 15 }
    },
    [ItemType.DART]: { 
        maxStack: 1, name: 'Dart Thrower', color: 0x00ffff, icon: 'game-icons:thrown-daggers',
        droppedVisual: { shape: 'diamond', size: 7, glowSize: 11 }
    }
};

// 远程武器配置（子弹类型）
export const WEAPON_CONFIG: Record<WeaponItem, { damage: number, fireRate: number, bulletSpeed: number, color: number, name: string }> = {
    [ItemType.BOW]: {
        damage: 15,       // 降低伤害，鼓励更多交战
        fireRate: 600,    // ms
        bulletSpeed: 10,
        color: 0xffff00,
        name: '弓箭'
    },
    [ItemType.FIREBALL]: {
        damage: 30,       // 高伤害
        fireRate: 1200,   // ms (更慢)
        bulletSpeed: 7,
        color: 0xff4500,
        name: '火球'
    },
    [ItemType.DART]: {
        damage: 8,        // 低伤害
        fireRate: 180,    // ms (更快)
        bulletSpeed: 14,
        color: 0x00ffff,
        name: '飞镖'
    },
    [ItemType.ENDER_PEARL]: {
        damage: 0,        // 无伤害
        fireRate: 1000,   // ms
        bulletSpeed: 12,
        color: 0x8B00FF,
        name: '末影珍珠'
    }
};

// 近战武器配置
export const MELEE_CONFIG = {
    [ItemType.SWORD]: {
        damage: 20,           // 近战伤害
        attackRate: 450,      // 攻击间隔 (ms)
        range: 55,            // 攻击范围 (像素)
        knockback: 12,        // 击退力度
        color: 0xC0C0C0,
        name: '铁剑'
    }
};

// 方块配置
export const BLOCK_CONFIG: Record<BlockItem, { maxHP: number, color: number, name: string }> = {
    [ItemType.WOOD]: {
        maxHP: 40,        // 降低耐久
        color: 0x8B4513,
        name: '木制方块'
    },
    [ItemType.STONE]: {
        maxHP: 80,        // 降低耐久
        color: 0x808080,
        name: '石制方块'
    },
    [ItemType.DIAMOND]: {
        maxHP: 150,       // 降低耐久
        color: 0x00CED1,
        name: '钻石方块'
    },
    [ItemType.TNT]: {
        maxHP: 20,        // 极低耐久，易被诱爆
        color: 0xFF0000,
        name: 'TNT'
    }
};

export const GAME_CONFIG = {
    mapWidth: 800,
    mapHeight: 600,
    playerSpeed: 4,
    bulletSpeed: 10,
    fireRate: 500, // ms
    playerRadius: 20,
    bulletRadius: 5,

    // 战斗系统配置
    playerMaxHP: 100,
    bedMaxHP: 50,
    bulletDamage: 20,
    respawnTime: 3000, // 3秒重生时间 (ms)

    // 队伍出生点
    redTeamSpawn: { x: 150, y: 300 },
    blueTeamSpawn: { x: 650, y: 300 },

    // 床的位置（左右两边中心）
    redBedPos: { x: 80, y: 300 },
    blueBedPos: { x: 720, y: 300 },

    // 建造系统配置
    blockSize: 40,          // 方块大小
    gridSize: 40,           // 网格大小
    maxPlaceRange: 150,     // 最大放置距离
    initialBlocks: {        // 初始方块数量
        [ItemType.WOOD]: 12,
        [ItemType.STONE]: 6,
        [ItemType.DIAMOND]: 2
    },
    
    // 初始弹药数量
    initialAmmo: {
        [ItemType.ARROW]: 20,
        [ItemType.FIREBALL_AMMO]: 0,
        [ItemType.DART_AMMO]: 0
    },
    
    // 初始金币
    initialGold: 6,
    
    // 游戏阶段配置（4分钟总时长）
    buildingPhaseDuration: 10000,    // 10秒建造期 (ms)
    combatPhaseDuration: 180000,     // 3分钟战斗期 (ms)
    deathmatchPhaseDuration: 30000,  // 30秒死斗期 (ms)
    totalGameDuration: 240000,       // 4分钟总时长 (ms)
    
    // 击退效果配置
    knockbackForce: 15,              // 击退力度
    
    // 建造期限制
    buildingPhaseRadius: 200,        // 建造期玩家只能在床附近200px范围内活动
    
    // TNT 配置
    tntFuseTime: 3000,      // 3秒引信
    tntExplosionRadius: 120, // 爆炸半径
    tntDamage: 80,          // 爆炸伤害
    tntKnockback: 25,       // 爆炸击退
};

// Matter.js 碰撞位掩码 (Bit Mask)
// 必须是 2 的幂: 1, 2, 4, 8, 16...
export const COLLISION_CATEGORIES = {
    PLAYER: 2,
    BULLET: 4,
    BED: 8,
    BLOCK: 16
};

// 商店交易配置
export interface ShopTrade {
    id: string;
    cost: { itemType: ItemType, count: number };
    reward: { itemType: ItemType, count: number };
    name: string;
    description: string;
}

export const SHOP_TRADES: ShopTrade[] = [
    // 弹药交易 - 量大便宜
    {
        id: 'buy_arrow_16',
        cost: { itemType: ItemType.GOLD_INGOT, count: 1 },
        reward: { itemType: ItemType.ARROW, count: 16 },
        name: 'Buy Arrows (16x)',
        description: 'Basic ranged ammunition'
    },
    {
        id: 'buy_arrow_48',
        cost: { itemType: ItemType.GOLD_INGOT, count: 2 },
        reward: { itemType: ItemType.ARROW, count: 48 },
        name: 'Buy Arrows (48x)',
        description: 'Bulk arrow pack'
    },
    {
        id: 'buy_fireball_6',
        cost: { itemType: ItemType.GOLD_INGOT, count: 2 },
        reward: { itemType: ItemType.FIREBALL_AMMO, count: 6 },
        name: 'Buy Fireballs (6x)',
        description: 'High damage projectiles'
    },
    {
        id: 'buy_fireball_16',
        cost: { itemType: ItemType.GOLD_INGOT, count: 4 },
        reward: { itemType: ItemType.FIREBALL_AMMO, count: 16 },
        name: 'Buy Fireballs (16x)',
        description: 'Bulk fireball pack'
    },
    {
        id: 'buy_dart_24',
        cost: { itemType: ItemType.GOLD_INGOT, count: 1 },
        reward: { itemType: ItemType.DART_AMMO, count: 24 },
        name: 'Buy Darts (24x)',
        description: 'Fast throwing knives'
    },
    {
        id: 'buy_dart_64',
        cost: { itemType: ItemType.GOLD_INGOT, count: 2 },
        reward: { itemType: ItemType.DART_AMMO, count: 64 },
        name: 'Buy Darts (64x)',
        description: 'Bulk dart pack'
    },
    
    {
        id: 'buy_ender_pearl',
        cost: { itemType: ItemType.GOLD_INGOT, count: 4 },
        reward: { itemType: ItemType.ENDER_PEARL, count: 1 },
        name: 'Buy Ender Pearl',
        description: 'Teleports you to where it lands'
    },

    // 方块交易 - 便宜大量
    {
        id: 'buy_wood_10',
        cost: { itemType: ItemType.GOLD_INGOT, count: 1 },
        reward: { itemType: ItemType.WOOD, count: 10 },
        name: 'Buy Wood (10x)',
        description: 'Basic building material'
    },
    {
        id: 'buy_stone_8',
        cost: { itemType: ItemType.GOLD_INGOT, count: 2 },
        reward: { itemType: ItemType.STONE, count: 8 },
        name: 'Buy Stone (8x)',
        description: 'Stronger building material'
    },
    {
        id: 'buy_diamond_4',
        cost: { itemType: ItemType.GOLD_INGOT, count: 4 },
        reward: { itemType: ItemType.DIAMOND, count: 4 },
        name: 'Buy Diamond (4x)',
        description: 'Strongest building material'
    },
    {
        id: 'buy_tnt',
        cost: { itemType: ItemType.GOLD_INGOT, count: 3 },
        reward: { itemType: ItemType.TNT, count: 1 },
        name: 'Buy TNT',
        description: 'Explodes after 3 seconds'
    }
];

// 商店交互距离
export const SHOP_INTERACTION_RANGE = 100; // 玩家与床的距离

// 掉落物配置
export const DROPPED_ITEM_CONFIG = {
    pickupRange: 40, // 拾取距离
    despawnTime: 300000, // 5分钟后消失 (ms)
    mergeRange: 30, // 相同物品合并距离
    physicsRadius: 10, // 碰撞体积半径
    floatSpeed: 0.5, // 浮动速度
    floatHeight: 5 // 浮动高度
};

// 资源生成器配置
export const RESOURCE_GENERATOR_CONFIG = {
    // 基地生成器配置
    base: {
        spawnInterval: 5000,  // 5秒生成一次
        spawnRadius: 50,
        maxDropsNearby: 8,
    },
    // 中央生成器配置
    center: {
        spawnInterval: 4000,  // 4秒生成一次（更快）
        spawnRadius: 50,
        maxDropsNearby: 10,
    },
    // 通用配置
    generatorRadius: 20,
    generatorColor: 0x00ff00
};

// 资源生成器生成表
export interface GeneratorLootTable {
    itemType: ItemType;
    count: { min: number, max: number };
    weight: number; // 权重
}

export const GENERATOR_LOOT_TABLES: Record<string, GeneratorLootTable[]> = {
    // 基地金矿（靠近床）
    'base_gold_generator': [
        { itemType: ItemType.GOLD_INGOT, count: { min: 3, max: 4 }, weight: 1 }
    ],
    // 中央金矿（地图中心，高产出）
    'center_gold_generator': [
        { itemType: ItemType.GOLD_INGOT, count: { min: 5, max: 7 }, weight: 1 }
    ],
    // 基地资源矿
    'base_resource_generator': [
        { itemType: ItemType.WOOD, count: { min: 3, max: 5 }, weight: 3 },
        { itemType: ItemType.STONE, count: { min: 2, max: 3 }, weight: 2 },
        { itemType: ItemType.DIAMOND, count: { min: 1, max: 1 }, weight: 1 }
    ],
    // 中央资源矿（更丰富）
    'center_resource_generator': [
        { itemType: ItemType.WOOD, count: { min: 4, max: 6 }, weight: 3 },
        { itemType: ItemType.STONE, count: { min: 2, max: 4 }, weight: 2 },
        { itemType: ItemType.DIAMOND, count: { min: 1, max: 2 }, weight: 1 }
    ],
    // 兼容旧配置
    'gold_generator': [
        { itemType: ItemType.GOLD_INGOT, count: { min: 3, max: 4 }, weight: 1 }
    ],
    'resource_generator': [
        { itemType: ItemType.WOOD, count: { min: 3, max: 5 }, weight: 3 },
        { itemType: ItemType.STONE, count: { min: 2, max: 3 }, weight: 2 },
        { itemType: ItemType.DIAMOND, count: { min: 1, max: 1 }, weight: 1 }
    ]
};

