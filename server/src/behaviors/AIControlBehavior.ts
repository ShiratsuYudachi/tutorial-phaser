import { Behavior } from "./Behavior";
import { Player, GameState, InputData, Entity } from "../shared/Schema";
import { EntityType, isAmmo, AMMO_TO_WEAPON, GAME_CONFIG } from "../shared/Constants";

export class AIControlBehavior extends Behavior<Player> {
    getGameState: () => GameState;

    constructor(agent: any, getGameState: () => GameState) {
        super(agent);
        this.getGameState = getGameState;
    }

    update(deltaTime: number) {
        const player = this.agent.schema;
        if (!player || player.isActive || player.isDead) return; // Only control inactive, living players

        const state = this.getGameState();
        if (!state) return;

        // Initialize empty input
        const input: InputData = {
            left: false,
            right: false,
            up: false,
            down: false,
            tick: Date.now(),
            isDown: false,
            isRightDown: false,
            mouseX: player.x, // Default to looking at self
            mouseY: player.y,
            selectedSlot: undefined,
            dropItem: false
        };

        // 1. Follow Leader (Active Player of same owner)
        const leader = this.findLeader(player, state);
        if (leader) {
            this.followTarget(player, leader, input);
        }

        // 2. Combat (Shoot nearest enemy)
        this.handleCombat(player, state, input);

        // Push input to queue to be processed by PlayerControlBehavior
        player.inputQueue.push(input);
    }

    findLeader(me: Player, state: GameState): Player | null {
        if (!me.ownerSessionId) return null;
        
        for (const [id, entity] of state.entities) {
            if (entity.type === EntityType.PLAYER && id !== (this.agent as any).sessionId) {
                const other = entity as Player;
                // Find the active character owned by the same player
                if (other.ownerSessionId === me.ownerSessionId && other.isActive && !other.isDead) {
                    return other;
                }
            }
        }
        return null;
    }

    followTarget(me: Player, target: Entity, input: InputData) {
        const dx = target.x - me.x;
        const dy = target.y - me.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const followDistance = 120; // Maintain some distance
        
        if (dist > followDistance) {
            // Simple 8-direction movement
            if (Math.abs(dx) > 20) {
                if (dx > 0) input.right = true;
                else input.left = true;
            }
            
            if (Math.abs(dy) > 20) {
                if (dy > 0) input.down = true;
                else input.up = true;
            }
        }
    }

    handleCombat(me: Player, state: GameState, input: InputData) {
        // 1. Find a weapon (first ammo item)
        let weaponSlot = -1;
        for (let i = 0; i < me.inventory.length; i++) {
            const item = me.inventory[i];
            if (item && item.itemId && isAmmo(item.itemId as any) && item.count > 0) {
                weaponSlot = i;
                break;
            }
        }

        if (weaponSlot === -1) return; // No weapon found

        // 2. Find nearest enemy
        // 70% of camera FOV. Camera zoom is 2, map is 800x600.
        // Visible width is 400. 70% is 280.
        const range = 280;
        let nearestEnemy: Player | null = null;
        let nearestDist = range;

        for (const [id, entity] of state.entities) {
            if (entity.type === EntityType.PLAYER) {
                const other = entity as Player;
                if (other.teamId !== me.teamId && !other.isDead) {
                    const dist = Math.sqrt((other.x - me.x) ** 2 + (other.y - me.y) ** 2);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestEnemy = other;
                    }
                }
            }
        }

        // 3. Attack
        if (nearestEnemy) {
            // Select the weapon slot
            input.selectedSlot = weaponSlot;
            
            // Aim at enemy
            input.mouseX = nearestEnemy.x;
            input.mouseY = nearestEnemy.y;
            
            // Shoot
            input.isDown = true;
        }
    }
}

