import { Behavior } from "./Behavior";
import { Player, InputData } from "../shared/Schema";
import { applyInput } from "../shared/GameLogic";
import { WEAPON_CONFIG, MELEE_CONFIG, ITEM_DEFINITIONS, ItemType, WeaponItem, BlockItem, AmmoItem, isAmmo, isMelee, isBlock, AMMO_TO_WEAPON } from "../shared/Constants";

export class PlayerControlBehavior extends Behavior<Player> {
    update(deltaTime: number) {
        const player = this.agent.schema;
        if (!player || !player.isActive) return;

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

            // 2. Handle Drop Item (Q key)
            if (input.dropItem && this.onDropItem) {
                const sessionId = (this.agent as any).sessionId;
                this.onDropItem(sessionId, player.selectedSlot, input.mouseX, input.mouseY);
            }

            // 3. Handle Right Click - Melee Attack (always available)
            if (input.isRightDown) {
                const now = Date.now();
                const meleeConfig = MELEE_CONFIG[ItemType.SWORD];
                
                if (now - player.lastMeleeTime > meleeConfig.attackRate) {
                    // Calculate melee attack angle
                    const meleeAngle = Math.atan2(
                        input.mouseY - this.agent.body.position.y,
                        input.mouseX - this.agent.body.position.x
                    );
                    
                    // Trigger melee attack
                    if (this.onMeleeAttack) {
                        const sessionId = (this.agent as any).sessionId;
                        this.onMeleeAttack(sessionId, this.agent.body.position, meleeAngle);
                    }
                    
                    player.lastMeleeTime = now;
                    player.isMeleeAttacking = true;
                    player.meleeAngle = meleeAngle;
                    
                    // Reset melee animation after a short delay
                    setTimeout(() => {
                        player.isMeleeAttacking = false;
                    }, 200);
                }
            }

            // 4. Handle Left Click - Ranged Attack or Place Block
            if (input.isDown) {
                // Check what's in the current slot
                const slotItem = player.inventory.at(player.selectedSlot);
                if (slotItem && slotItem.itemId && slotItem.count > 0) {
                    const itemId = slotItem.itemId as ItemType;
                    
                    if (isAmmo(itemId)) {
                        // --- AMMO/RANGED ATTACK LOGIC ---
                        const weaponType = AMMO_TO_WEAPON[itemId];
                        const now = Date.now();
                        const weaponConfig = WEAPON_CONFIG[weaponType];
                        const fireRate = weaponConfig ? weaponConfig.fireRate : 500;

                        if (now - player.lastShootTime > fireRate) {
                            // Calculate aim angle from player to mouse
                            const aimAngle = Math.atan2(
                                input.mouseY - this.agent.body.position.y, 
                                input.mouseX - this.agent.body.position.x
                            );
                            
                            // Consume ammo
                            slotItem.count -= 1;
                            if (slotItem.count <= 0) {
                                slotItem.itemId = ItemType.EMPTY;
                                slotItem.count = 0;
                            }
                            
                            this.spawnBullet(player, this.agent.body.position, aimAngle, weaponType);
                            player.lastShootTime = now;
                        }
                    } else if (isBlock(itemId)) {
                        // --- BLOCK LOGIC ---
                        if (this.onPlaceBlock) {
                            const sessionId = (this.agent as any).sessionId;
                            this.onPlaceBlock(
                                sessionId, 
                                input.mouseX, 
                                input.mouseY, 
                                itemId
                            );
                        }
                    }
                    // Note: Melee weapons (SWORD) and other items do nothing on left click
                }
            }
        }
    }

    spawnBullet(player: Player, position: { x: number, y: number }, aimAngle: number, weaponType: WeaponItem) {
        if (this.onShoot) {
            const sessionId = (this.agent as any).sessionId;
            this.onShoot(sessionId, position, aimAngle, weaponType);
        }
    }

    onShoot: (ownerId: string, position: { x: number, y: number }, aimAngle: number, weaponType: WeaponItem) => void;
    onPlaceBlock: (playerId: string, x: number, y: number, blockType: BlockItem) => void;
    onDropItem: (playerId: string, slotIndex: number, mouseX: number, mouseY: number) => void;
    onMeleeAttack: (playerId: string, position: { x: number, y: number }, angle: number) => void;
}
