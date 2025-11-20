import { Agent } from "./Agent";
import { PlayerControlBehavior } from "../behaviors/PlayerControlBehavior";
import { SyncTransformBehavior } from "../behaviors/SyncTransformBehavior";
import Matter from "matter-js";
import { GAME_CONFIG, COLLISION_CATEGORIES } from "../shared/Constants";
export class PlayerAgent extends Agent {
    constructor(sessionId, world, schema, onShoot) {
        super(world, schema);
        this.sessionId = sessionId;
        // Create Body
        this.body = Matter.Bodies.circle(schema.x, schema.y, GAME_CONFIG.playerRadius, {
            label: `player_${sessionId}`,
            frictionAir: 0.1,
            collisionFilter: {
                category: COLLISION_CATEGORIES.PLAYER,
                mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.BULLET | COLLISION_CATEGORIES.PLAYER
            }
        });
        Matter.Composite.add(this.world, this.body);
        // Add Behaviors
        const controlBehavior = new PlayerControlBehavior(this);
        controlBehavior.onShoot = (ownerId, pos) => onShoot(this.sessionId, pos); // Use the sessionId from Agent
        this.addBehavior(controlBehavior);
        this.addBehavior(new SyncTransformBehavior(this));
    }
}
