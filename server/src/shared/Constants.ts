
export const GAME_CONFIG = {
    mapWidth: 800,
    mapHeight: 600,
    playerSpeed: 4,
    bulletSpeed: 10,
    fireRate: 500, // ms
    playerRadius: 20,
    bulletRadius: 5,
    wallSize: 50
};

// Matter.js 碰撞位掩码 (Bit Mask)
// 必须是 2 的幂: 1, 2, 4, 8, 16...
export const COLLISION_CATEGORIES = {
    WALL: 1,
    PLAYER: 2,
    BULLET: 4
};

export const WALLS = [
    { x: 200, y: 200, width: 50, height: 200 },
    { x: 500, y: 100, width: 200, height: 50 },
    { x: 400, y: 400, width: 100, height: 100 },
    // 四周的墙壁
    { x: 400, y: -25, width: 800, height: 50 }, // 上
    { x: 400, y: 625, width: 800, height: 50 }, // 下
    { x: -25, y: 300, width: 50, height: 600 }, // 左
    { x: 825, y: 300, width: 50, height: 600 }, // 右
];
