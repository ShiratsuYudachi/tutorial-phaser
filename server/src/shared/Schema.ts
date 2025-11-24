
import { Schema, type, MapSchema } from "@colyseus/schema";

export interface InputData {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    shoot: boolean;
    tick: number;
    aimAngle: number; // 瞄准角度（弧度）
    switchWeapon?: number; // 切换武器 (1, 2, 3)
    buildMode?: boolean; // 建造模式开关
    placeBlock?: { x: number, y: number, blockType: string }; // 放置方块
    switchBlockType?: number; // 切换方块类型 (1, 2, 3)
}

export class Entity extends Schema {
    @type("string") type: string;
    @type("number") x: number;
    @type("number") y: number;
}

export class HealthEntity extends Entity {
    @type("number") hp: number;
    @type("number") maxHP: number;
}

export class Player extends HealthEntity {
    @type("number") tick: number;
    @type("number") lastShootTime: number = 0;
    @type("string") teamId: string; // "red" 或 "blue"
    @type("boolean") isDead: boolean = false;
    @type("number") respawnTime: number = 0; // 重生倒计时
    @type("string") currentWeapon: string = 'bow'; // 当前武器类型
    
    // 背包系统
    @type({ map: "number" }) inventory = new MapSchema<number>(); // blockType -> count
    @type("string") selectedBlockType: string = 'wood'; // 当前选中的方块类型
    @type("boolean") inBuildMode: boolean = false; // 是否在建造模式

    inputQueue: InputData[] = [];
}

export class Bullet extends Entity {
    @type("number") velocityX: number;
    @type("number") velocityY: number;
    @type("string") ownerId: string;
    @type("number") damage: number; // 伤害值
    @type("string") weaponType: string = 'bow'; // 武器类型
}

export class Block extends HealthEntity {
    @type("string") blockType: string = 'wood'; // 方块类型
    @type("string") teamId: string; // 队伍ID
}

export class Bed extends HealthEntity {
    @type("string") teamId: string;
}

export class GameState extends Schema {
    @type("number") mapWidth: number;
    @type("number") mapHeight: number;
    @type({ map: Entity }) entities = new MapSchema<Entity>();
}
