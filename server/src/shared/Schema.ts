
import { Schema, type, MapSchema } from "@colyseus/schema";

export interface InputData {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    shoot: boolean;
    tick: number;
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

    inputQueue: InputData[] = [];
}

export class Bullet extends Entity {
    @type("number") velocityX: number;
    @type("number") velocityY: number;
    @type("string") ownerId: string;
}
export class Block extends HealthEntity {

}

export class Bed extends HealthEntity {
    @type("string") teamId: string;
}

export class GameState extends Schema {
    @type("number") mapWidth: number;
    @type("number") mapHeight: number;
    @type({ map: Entity }) entities = new MapSchema<Entity>();
}
