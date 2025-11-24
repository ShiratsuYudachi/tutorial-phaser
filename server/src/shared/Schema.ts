
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { ItemType, EntityType, TeamType } from "./Constants";

export interface InputData {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    tick: number;
    
    // Unified Action Inputs
    isDown: boolean;         // Mouse is pressed
    mouseX: number;          // World X
    mouseY: number;          // World Y
    selectedSlot?: number;   // 0-8, if user pressed number key
    dropItem?: boolean;      // Q key to drop item
}

export class InventoryItem extends Schema {
    @type("string") itemId: string; // ItemId
    @type("number") count: number;  // Amount
}

export class Entity extends Schema {
    @type("string") type: string; // EntityType
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
    @type("string") teamId: string; // TeamType
    @type("boolean") isDead: boolean = false;
    @type("number") respawnTime: number = 0; // Respawn cooldown
    
    // New Inventory System
    @type([ InventoryItem ]) inventory = new ArraySchema<InventoryItem>();
    @type("number") selectedSlot: number = 0;

    inputQueue: InputData[] = [];
}

export class Bullet extends Entity {
    @type("number") velocityX: number;
    @type("number") velocityY: number;
    @type("string") ownerId: string;
    @type("number") damage: number; // Damage
    @type("string") weaponType: string = ItemType.BOW; // ItemId (weapon)
}

export class Block extends HealthEntity {
    @type("string") blockType: string = ItemType.WOOD; // ItemId (block)
    // No teamId - blocks are neutral
}

export class Bed extends HealthEntity {
    @type("string") teamId: string; // TeamType
}

export class DroppedItem extends Entity {
    @type("string") itemType: string; // ItemType
    @type("number") count: number;
    @type("number") spawnTime: number; // For despawn logic
}

export class ResourceGenerator extends Entity {
    @type("string") generatorType: string; // 'gold_generator' | 'resource_generator'
    @type("number") lastSpawnTime: number = 0;
    @type("number") nearbyDropCount: number = 0;
}

export class GameState extends Schema {
    @type("number") mapWidth: number;
    @type("number") mapHeight: number;
    @type({ map: Entity }) entities = new MapSchema<Entity>();
}
