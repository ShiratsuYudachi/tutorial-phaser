import { Behavior } from "./Behavior";
import { Player, InputData } from "../shared/Schema";
import { applyInput } from "../shared/GameLogic";
import { WEAPON_CONFIG, ITEM_DEFINITIONS, BlockType, WeaponType } from "../shared/Constants";

export class PlayerControlBehavior extends Behavior<Player> {
    update(deltaTime: number) {
        const player = this.agent.schema;
        if (!player) return;

        let input: InputData;
        while (input = player.inputQueue.shift()) {
            applyInput(this.agent.body, input);
            player.tick = input.tick;

            // 1. Handle Slot Switching
            if (input.selectedSlot !== undefined) {
                if (input.selectedSlot >= 0 && input.selectedSlot < player.inventory.length) {
                    player.selectedSlot = input.selectedSlot;
                }
            }

            // 2. Handle Item Usage (Shoot or Place)
            // Only if mouse is down
            if (input.isDown) {
                // Check what's in the current slot
                const slotItem = player.inventory.at(player.selectedSlot);
                if (slotItem && slotItem.itemId && slotItem.count > 0) {
                    const itemDef = ITEM_DEFINITIONS[slotItem.itemId];
                    
                    if (itemDef.type === 'weapon') {
                        // --- WEAPON LOGIC ---
                        const now = Date.now();
                        const weaponConfig = WEAPON_CONFIG[slotItem.itemId as WeaponType];
                        const fireRate = weaponConfig ? weaponConfig.fireRate : 500;

                        if (now - player.lastShootTime > fireRate) {
                            // Calculate aim angle from player to mouse
                            const aimAngle = Math.atan2(
                                input.mouseY - this.agent.body.position.y, 
                                input.mouseX - this.agent.body.position.x
                            );
                            
                            this.spawnBullet(player, this.agent.body.position, aimAngle, slotItem.itemId as WeaponType);
                            player.lastShootTime = now;
                        }
                    } else if (itemDef.type === 'block') {
                        // --- BLOCK LOGIC ---
                        if (this.onPlaceBlock) {
                            const sessionId = (this.agent as any).sessionId;
                            this.onPlaceBlock(
                                sessionId, 
                                input.mouseX, 
                                input.mouseY, 
                                slotItem.itemId as BlockType
                            );
                        }
                    }
                }
            }
        }
    }

    spawnBullet(player: Player, position: { x: number, y: number }, aimAngle: number, weaponType: WeaponType) {
        if (this.onShoot) {
            const sessionId = (this.agent as any).sessionId;
            this.onShoot(sessionId, position, aimAngle, weaponType);
        }
    }

    onShoot: (ownerId: string, position: { x: number, y: number }, aimAngle: number, weaponType: WeaponType) => void;
    onPlaceBlock: (playerId: string, x: number, y: number, blockType: BlockType) => void;
}
