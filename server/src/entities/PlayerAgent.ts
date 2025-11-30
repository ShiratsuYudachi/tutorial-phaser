import { Agent } from "./Agent";
import { Player, GameState } from "../shared/Schema";
import { PlayerControlBehavior } from "../behaviors/PlayerControlBehavior";
import { SyncTransformBehavior } from "../behaviors/SyncTransformBehavior";
import { AIControlBehavior } from "../behaviors/AIControlBehavior";
import Matter from "matter-js";
import { GAME_CONFIG, COLLISION_CATEGORIES, WeaponItem, BlockItem } from "../shared/Constants";

export class PlayerAgent extends Agent<Player> {
    sessionId: string;

    constructor(
        sessionId: string, 
        world: Matter.World, 
        schema: Player,
        getGameState: () => GameState,
        onShoot: (ownerId: string, pos: { x: number, y: number }, aimAngle: number, weaponType: WeaponItem) => void,
        onPlaceBlock: (playerId: string, x: number, y: number, blockType: BlockItem) => void,
        onDropItem: (playerId: string, slotIndex: number, mouseX: number, mouseY: number) => void,
        onMeleeAttack: (playerId: string, position: { x: number, y: number }, angle: number) => void
    ) {
        super(world, schema);
        this.sessionId = sessionId;

        // Create Body
        this.body = Matter.Bodies.circle(schema.x, schema.y, GAME_CONFIG.playerRadius, {
            label: `player_${sessionId}`,
            frictionAir: 0.1,
            collisionFilter: {
                category: COLLISION_CATEGORIES.PLAYER,
                mask: COLLISION_CATEGORIES.BULLET | COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BLOCK
            }
        });
        Matter.Composite.add(this.world, this.body);

        // Add Behaviors
        const controlBehavior = new PlayerControlBehavior(this);
        controlBehavior.onShoot = (ownerId, pos, aimAngle, weaponType) => onShoot(this.sessionId, pos, aimAngle, weaponType);
        controlBehavior.onPlaceBlock = (playerId, x, y, blockType) => onPlaceBlock(this.sessionId, x, y, blockType);
        controlBehavior.onDropItem = (playerId, slotIndex, mouseX, mouseY) => onDropItem(this.sessionId, slotIndex, mouseX, mouseY);
        controlBehavior.onMeleeAttack = (playerId, position, angle) => onMeleeAttack(this.sessionId, position, angle);

        this.addBehavior(new AIControlBehavior(this, getGameState));
        this.addBehavior(controlBehavior);
        this.addBehavior(new SyncTransformBehavior(this));
    }
}
