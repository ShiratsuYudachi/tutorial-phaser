
// 武器类型枚举
export enum WeaponType {
    BOW = 'bow',        // 弓箭 - 中等射程、中等伤害
    FIREBALL = 'fireball', // 火球 - 长射程、高伤害
    DART = 'dart'       // 飞镖 - 短射程、低伤害、高攻速
}

// 方块类型枚举
export enum BlockType {
    WOOD = 'wood',      // 木制方块 - HP 50
    STONE = 'stone',    // 石制方块 - HP 100
    DIAMOND = 'diamond' // 钻石方块 - HP 200
}


export const INVENTORY_SIZE = 9;


// 统一物品定义
export const ITEM_DEFINITIONS: Record<string, { type: 'weapon' | 'block', maxStack: number, name: string, color: number }> = {
    [WeaponType.BOW]: { type: 'weapon', maxStack: 1, name: 'Bow', color: 0xffff00 },
    [WeaponType.FIREBALL]: { type: 'weapon', maxStack: 1, name: 'Fireball', color: 0xff4500 },
    [WeaponType.DART]: { type: 'weapon', maxStack: 1, name: 'Dart', color: 0x00ffff },
    [BlockType.WOOD]: { type: 'block', maxStack: 64, name: 'Wood', color: 0x8B4513 },
    [BlockType.STONE]: { type: 'block', maxStack: 64, name: 'Stone', color: 0x808080 },
    [BlockType.DIAMOND]: { type: 'block', maxStack: 64, name: 'Diamond', color: 0x00CED1 }
};

// 武器配置
export const WEAPON_CONFIG = {
    [WeaponType.BOW]: {
        damage: 20,
        fireRate: 500,  // ms
        bulletSpeed: 10,
        color: 0xffff00, // 黄色
        name: '弓箭'
    },
    [WeaponType.FIREBALL]: {
        damage: 35,
        fireRate: 1000,  // ms (更慢)
        bulletSpeed: 8,
        color: 0xff4500, // 橙红色
        name: '火球'
    },
    [WeaponType.DART]: {
        damage: 10,
        fireRate: 200,   // ms (更快)
        bulletSpeed: 12,
        color: 0x00ffff, // 青色
        name: '飞镖'
    }
};

// 方块配置
export const BLOCK_CONFIG = {
    [BlockType.WOOD]: {
        maxHP: 50,
        color: 0x8B4513, // 棕色
        name: '木制方块'
    },
    [BlockType.STONE]: {
        maxHP: 100,
        color: 0x808080, // 灰色
        name: '石制方块'
    },
    [BlockType.DIAMOND]: {
        maxHP: 200,
        color: 0x00CED1, // 钻石蓝
        name: '钻石方块'
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
        [BlockType.WOOD]: 20,
        [BlockType.STONE]: 10,
        [BlockType.DIAMOND]: 5
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
