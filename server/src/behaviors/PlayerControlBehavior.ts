import { Behavior } from "./Behavior";
import { Player, InputData } from "../shared/Schema";
import { applyInput } from "../shared/GameLogic";
import { WEAPON_CONFIG, WeaponType, BlockType } from "../shared/Constants";

export class PlayerControlBehavior extends Behavior<Player> {
    update(deltaTime: number) {
        const player = this.agent.schema;
        if (!player) return;

        let input: InputData;
        while (input = player.inputQueue.shift()) {
            applyInput(this.agent.body, input);
            player.tick = input.tick;

            // 处理建造模式切换
            if (input.buildMode !== undefined) {
                player.inBuildMode = input.buildMode;
            }

            // 处理方块类型切换
            if (input.switchBlockType) {
                const blocks = [BlockType.WOOD, BlockType.STONE, BlockType.DIAMOND];
                if (input.switchBlockType >= 1 && input.switchBlockType <= 3) {
                    player.selectedBlockType = blocks[input.switchBlockType - 1];
                }
            }

            // 处理方块放置
            if (input.placeBlock && player.inBuildMode) {
                if (this.onPlaceBlock) {
                    const sessionId = (this.agent as any).sessionId;
                    this.onPlaceBlock(
                        sessionId, 
                        input.placeBlock.x, 
                        input.placeBlock.y, 
                        input.placeBlock.blockType as BlockType
                    );
                }
            }

            // 处理武器切换
            if (input.switchWeapon) {
                const weapons = [WeaponType.BOW, WeaponType.FIREBALL, WeaponType.DART];
                if (input.switchWeapon >= 1 && input.switchWeapon <= 3) {
                    player.currentWeapon = weapons[input.switchWeapon - 1];
                }
            }

            // 只有在非建造模式下才能射击
            if (input.shoot && !player.inBuildMode) {
                const now = Date.now();
                const weaponConfig = WEAPON_CONFIG[player.currentWeapon as WeaponType];
                const fireRate = weaponConfig ? weaponConfig.fireRate : 500;
                
                if (now - player.lastShootTime > fireRate) {
                    this.spawnBullet(player, this.agent.body.position, input.aimAngle);
                    player.lastShootTime = now;
                }
            }
        }
    }

    spawnBullet(player: Player, position: { x: number, y: number }, aimAngle: number) {
        if (this.onShoot) {
            const sessionId = (this.agent as any).sessionId;
            this.onShoot(sessionId, position, aimAngle);
        }
    }

    onShoot: (ownerId: string, position: { x: number, y: number }, aimAngle: number) => void;
    onPlaceBlock: (playerId: string, x: number, y: number, blockType: BlockType) => void;
}
