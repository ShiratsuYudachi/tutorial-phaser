
// 统一物品ID枚举
export enum ItemType {
    // 特殊物品
    EMPTY = 'empty',
    
    // 货币
    GOLD_INGOT = 'gold_ingot',
    
    // 武器
    BOW = 'bow',
    FIREBALL = 'fireball',
    DART = 'dart',
    
    // 方块
    WOOD = 'wood',
    STONE = 'stone',
    DIAMOND = 'diamond'
}

// 精确的类型别名
export type WeaponItem = ItemType.BOW | ItemType.FIREBALL | ItemType.DART;
export type BlockItem = ItemType.WOOD | ItemType.STONE | ItemType.DIAMOND;
export type CurrencyItem = ItemType.GOLD_INGOT;
export type EmptyItem = ItemType.EMPTY;

// 武器集合
export const WEAPONS = new Set<WeaponItem>([
    ItemType.BOW,
    ItemType.FIREBALL,
    ItemType.DART
]);

// 方块集合
export const BLOCKS = new Set<BlockItem>([
    ItemType.WOOD,
    ItemType.STONE,
    ItemType.DIAMOND
]);

// 货币集合
export const CURRENCIES = new Set<CurrencyItem>([
    ItemType.GOLD_INGOT
]);

// 辅助函数（带类型守卫）
export const isWeapon = (itemId: ItemType): itemId is WeaponItem => WEAPONS.has(itemId as WeaponItem);
export const isBlock = (itemId: ItemType): itemId is BlockItem => BLOCKS.has(itemId as BlockItem);
export const isCurrency = (itemId: ItemType): itemId is CurrencyItem => CURRENCIES.has(itemId as CurrencyItem);
export const isEmpty = (itemId: ItemType): itemId is EmptyItem => itemId === ItemType.EMPTY;

// 向后兼容的类型别名（可以逐步移除）
export const WeaponType = {
    BOW: ItemType.BOW,
    FIREBALL: ItemType.FIREBALL,
    DART: ItemType.DART
} as const;

export const BlockType = {
    WOOD: ItemType.WOOD,
    STONE: ItemType.STONE,
    DIAMOND: ItemType.DIAMOND
} as const;

export const SpecialItemType = {
    EMPTY: ItemType.EMPTY
} as const;


// 实体类型枚举
export enum EntityType {
    PLAYER = 'player',
    BULLET = 'bullet',
    BLOCK = 'block',
    BED = 'bed'
}

// 队伍类型枚举
export enum TeamType {
    RED = 'red',
    BLUE = 'blue'
}

export const INVENTORY_SIZE = 9;

// 统一物品定义
export const ITEM_DEFINITIONS: Record<ItemType, { maxStack: number, name: string, color: number, icon: string }> = {
    [ItemType.EMPTY]: { maxStack: 0, name: 'Empty', color: 0x000000, icon: '' },
    [ItemType.GOLD_INGOT]: { maxStack: 64, name: 'Gold Ingot', color: 0xFFD700, icon: 'game-icons:gold-bar' },
    [ItemType.BOW]: { maxStack: 1, name: 'Bow', color: 0xffff00, icon: 'game-icons:bow-arrow' },
    [ItemType.FIREBALL]: { maxStack: 1, name: 'Fireball', color: 0xff4500, icon: 'game-icons:fireball' },
    [ItemType.DART]: { maxStack: 1, name: 'Dart', color: 0x00ffff, icon: 'game-icons:thrown-daggers' },
    [ItemType.WOOD]: { maxStack: 64, name: 'Wood', color: 0x8B4513, icon: 'game-icons:wood-pile' },
    [ItemType.STONE]: { maxStack: 64, name: 'Stone', color: 0x808080, icon: 'game-icons:stone-block' },
    [ItemType.DIAMOND]: { maxStack: 64, name: 'Diamond', color: 0x00CED1, icon: 'game-icons:diamond' }
};

// 武器配置
export const WEAPON_CONFIG: Record<ItemType, { damage: number, fireRate: number, bulletSpeed: number, color: number, name: string }> = {
    [ItemType.BOW]: {
        damage: 20,
        fireRate: 500,  // ms
        bulletSpeed: 10,
        color: 0xffff00, // 黄色
        name: '弓箭'
    },
    [ItemType.FIREBALL]: {
        damage: 35,
        fireRate: 1000,  // ms (更慢)
        bulletSpeed: 8,
        color: 0xff4500, // 橙红色
        name: '火球'
    },
    [ItemType.DART]: {
        damage: 10,
        fireRate: 200,   // ms (更快)
        bulletSpeed: 12,
        color: 0x00ffff, // 青色
        name: '飞镖'
    }
} as any; // Type assertion to allow partial record

// 方块配置
export const BLOCK_CONFIG: Record<ItemType, { maxHP: number, color: number, name: string }> = {
    [ItemType.WOOD]: {
        maxHP: 50,
        color: 0x8B4513, // 棕色
        name: '木制方块'
    },
    [ItemType.STONE]: {
        maxHP: 100,
        color: 0x808080, // 灰色
        name: '石制方块'
    },
    [ItemType.DIAMOND]: {
        maxHP: 200,
        color: 0x00CED1, // 钻石蓝
        name: '钻石方块'
    }
} as any; // Type assertion to allow partial record

export const GAME_CONFIG = {
    mapWidth: 800,
    mapHeight: 600,
    playerSpeed: 4,
    bulletSpeed: 10,
    fireRate: 500, // ms
    playerRadius: 20,
    bulletRadius: 5,
    wallSize: 50,

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
        [ItemType.WOOD]: 20,
        [ItemType.STONE]: 10,
        [ItemType.DIAMOND]: 5
    }
};

// Matter.js 碰撞位掩码 (Bit Mask)
// 必须是 2 的幂: 1, 2, 4, 8, 16...
export const COLLISION_CATEGORIES = {
    WALL: 1,
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
    // 武器交易
    {
        id: 'buy_bow',
        cost: { itemType: ItemType.GOLD_INGOT, count: 2 },
        reward: { itemType: ItemType.BOW, count: 1 },
        name: 'Buy Bow',
        description: 'A reliable ranged weapon'
    },
    {
        id: 'buy_fireball',
        cost: { itemType: ItemType.GOLD_INGOT, count: 5 },
        reward: { itemType: ItemType.FIREBALL, count: 1 },
        name: 'Buy Fireball',
        description: 'Powerful but slow projectile'
    },
    {
        id: 'buy_dart',
        cost: { itemType: ItemType.GOLD_INGOT, count: 3 },
        reward: { itemType: ItemType.DART, count: 1 },
        name: 'Buy Dart',
        description: 'Fast and cheap weapon'
    },
    
    // 方块交易
    {
        id: 'buy_wood_8',
        cost: { itemType: ItemType.GOLD_INGOT, count: 1 },
        reward: { itemType: ItemType.WOOD, count: 8 },
        name: 'Buy Wood (8x)',
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
    }
];

// 商店交互距离
export const SHOP_INTERACTION_RANGE = 100; // 玩家与床的距离

// 对称地图障碍物
export const WALLS = [
    // 左侧障碍物
    { x: 200, y: 150, width: 50, height: 150 },
    { x: 200, y: 400, width: 50, height: 150 },

    // 右侧障碍物（对称）
    { x: 550, y: 150, width: 50, height: 150 },
    { x: 550, y: 400, width: 50, height: 150 },

    // 中央障碍物
    { x: 375, y: 275, width: 50, height: 50 },

    // 四周的墙壁
    { x: 400, y: -25, width: 800, height: 50 }, // 上
    { x: 400, y: 625, width: 800, height: 50 }, // 下
    { x: -25, y: 300, width: 50, height: 600 }, // 左
    { x: 825, y: 300, width: 50, height: 600 }, // 右
];
