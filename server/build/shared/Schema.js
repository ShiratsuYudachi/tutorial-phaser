var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, MapSchema } from "@colyseus/schema";
export class Entity extends Schema {
}
__decorate([
    type("number")
], Entity.prototype, "x", void 0);
__decorate([
    type("number")
], Entity.prototype, "y", void 0);
export class HealthEntity extends Entity {
}
__decorate([
    type("number")
], HealthEntity.prototype, "hp", void 0);
__decorate([
    type("number")
], HealthEntity.prototype, "maxHP", void 0);
export class Player extends HealthEntity {
    constructor() {
        super(...arguments);
        this.lastShootTime = 0;
        this.inputQueue = [];
    }
}
__decorate([
    type("number")
], Player.prototype, "x", void 0);
__decorate([
    type("number")
], Player.prototype, "y", void 0);
__decorate([
    type("number")
], Player.prototype, "tick", void 0);
__decorate([
    type("number")
], Player.prototype, "lastShootTime", void 0);
export class Bullet extends Entity {
}
__decorate([
    type("number")
], Bullet.prototype, "velocityX", void 0);
__decorate([
    type("number")
], Bullet.prototype, "velocityY", void 0);
__decorate([
    type("string")
], Bullet.prototype, "ownerId", void 0);
export class Block extends HealthEntity {
}
export class Bed extends HealthEntity {
}
__decorate([
    type("string")
], Bed.prototype, "teamId", void 0);
export class GameState extends Schema {
    constructor() {
        super(...arguments);
        this.players = new MapSchema();
        this.bullets = new MapSchema();
    }
}
__decorate([
    type("number")
], GameState.prototype, "mapWidth", void 0);
__decorate([
    type("number")
], GameState.prototype, "mapHeight", void 0);
__decorate([
    type({ map: Player })
], GameState.prototype, "players", void 0);
__decorate([
    type({ map: Bullet })
], GameState.prototype, "bullets", void 0);
