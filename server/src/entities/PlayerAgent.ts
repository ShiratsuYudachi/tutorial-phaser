import { Agent } from "./Agent";
import { Player } from "../shared/Schema";
import { PlayerControlBehavior } from "../behaviors/PlayerControlBehavior";
import { SyncTransformBehavior } from "../behaviors/SyncTransformBehavior";
import Matter from "matter-js";
import { GAME_CONFIG, COLLISION_CATEGORIES, BlockType } from "../shared/Constants";

export class PlayerAgent extends Agent<Player> {
    sessionId: string;

    constructor(
        sessionId: string, 
        world: Matter.World, 
        schema: Player, 
        onShoot: (ownerId: string, pos: { x: number, y: number }, aimAngle: number) => void,
        onPlaceBlock: (playerId: string, x: number, y: number, blockType: BlockType) => void
    ) {
        super(world, schema);
        this.sessionId = sessionId;

        // Create Body
        this.body = Matter.Bodies.circle(schema.x, schema.y, GAME_CONFIG.playerRadius, {
            label: `player_${sessionId}`,
            frictionAir: 0.1,
            collisionFilter: {
                category: COLLISION_CATEGORIES.PLAYER,
                mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.BULLET | COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BLOCK
            }
        });
        Matter.Composite.add(this.world, this.body);

        // Add Behaviors
        const controlBehavior = new PlayerControlBehavior(this);
        controlBehavior.onShoot = (ownerId, pos, aimAngle) => onShoot(this.sessionId, pos, aimAngle);
        controlBehavior.onPlaceBlock = (playerId, x, y, blockType) => onPlaceBlock(this.sessionId, x, y, blockType);

        this.addBehavior(controlBehavior);
        this.addBehavior(new SyncTransformBehavior(this));
    }
}
