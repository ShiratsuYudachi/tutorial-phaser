
import { Schema, type, MapSchema } from "@colyseus/schema";

export interface InputData {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    shoot: boolean;
    tick: number;
}

export class Player extends Schema {
    @type("number") x: number;
    @type("number") y: number;
    @type("number") tick: number;
    @type("number") lastShootTime: number = 0;
    
    inputQueue: InputData[] = [];
}

export class Bullet extends Schema {
    @type("number") x: number;
    @type("number") y: number;
    @type("number") velocityX: number;
    @type("number") velocityY: number;
    @type("string") ownerId: string;
}

export class GameState extends Schema {
    @type("number") mapWidth: number;
    @type("number") mapHeight: number;
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Bullet }) bullets = new MapSchema<Bullet>();
}
