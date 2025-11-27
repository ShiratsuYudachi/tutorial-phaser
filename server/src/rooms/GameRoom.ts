import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, Player, Bullet, InputData, Entity, Bed, Block, InventoryItem, DroppedItem, ResourceGenerator } from "../shared/Schema";
import { GAME_CONFIG, WALLS, COLLISION_CATEGORIES, WEAPON_CONFIG, BLOCK_CONFIG, INVENTORY_SIZE, EntityType, TeamType, ItemType, WeaponItem, BlockItem, isWeapon, isBlock, SHOP_TRADES, ITEM_DEFINITIONS, DROPPED_ITEM_CONFIG, RESOURCE_GENERATOR_CONFIG, GENERATOR_LOOT_TABLES } from "../shared/Constants";
import { Agent } from "../entities/Agent";
import { PlayerAgent } from "../entities/PlayerAgent";
import { AuthService } from "../services/AuthService";

export class GameRoom extends Room<GameState> {
    fixedTimeStep = 1000 / 60;
    elapsedTime = 0;

    engine: Matter.Engine;

    agents = new Map<string, Agent>();
    bulletBodies = new Map<string, Matter.Body>();
    bedBodies = new Map<string, Matter.Body>(); // 存储床的物理体
    blockBodies = new Map<string, Matter.Body>(); // 存储方块的物理体
    
    // 队伍分配
    teamAssignments: string[] = []; // 按加入顺序: [红队sessionId, 蓝队sessionId]

    onCreate(options: any) {
        this.setState(new GameState());
        this.state.mapWidth = GAME_CONFIG.mapWidth;
        this.state.mapHeight = GAME_CONFIG.mapHeight;
        
        // 初始化游戏阶段
        this.state.gamePhase = "building";
        this.state.gameStartTime = Date.now();
        this.state.phaseEndTime = Date.now() + GAME_CONFIG.buildingPhaseDuration;
        this.state.winner = "";
        this.state.isFrozen = false;

        // 1. Initialize Physics
        this.engine = Matter.Engine.create();
        this.engine.gravity.y = 0; // Top-down, no gravity

        // 2. Create Walls
        WALLS.forEach(wall => {
            const centerX = wall.x + wall.width / 2;
            const centerY = wall.y + wall.height / 2;

            const body = Matter.Bodies.rectangle(centerX, centerY, wall.width, wall.height, {
                isStatic: true,
                label: 'wall',
                collisionFilter: {
                    category: COLLISION_CATEGORIES.WALL
                }
            });
            Matter.Composite.add(this.engine.world, body);
        });
        
        // 3. Create Beds
        this.createBed(TeamType.RED, GAME_CONFIG.redBedPos.x, GAME_CONFIG.redBedPos.y);
        this.createBed(TeamType.BLUE, GAME_CONFIG.blueBedPos.x, GAME_CONFIG.blueBedPos.y);

        // 4. Collision Events
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => this.handleCollision(pair.bodyA, pair.bodyB));
        });

        // Handle Input
        this.onMessage(0, (client, input: InputData) => {
            const activeCharacterId = this.getActiveCharacterId(client.sessionId);
            if (!activeCharacterId) return;

            const player = this.state.entities.get(activeCharacterId) as Player;
            if (player && player.inputQueue && !player.isDead) {
                player.inputQueue.push(input);
            }
        });

        this.onMessage("switch_character", (client) => {
            const char1Id = `${client.sessionId}_1`;
            const char2Id = `${client.sessionId}_2`;
            
            const char1 = this.state.entities.get(char1Id) as Player;
            const char2 = this.state.entities.get(char2Id) as Player;
            
            if (char1 && char2) {
                char1.isActive = !char1.isActive;
                char2.isActive = !char2.isActive;
                console.log(`Player ${client.sessionId} switched character. Active: ${char1.isActive ? char1Id : char2Id}`);
            }
        });

        // Inventory Actions
        this.onMessage("inventory_action", (client, data: any) => {
            const activeCharacterId = this.getActiveCharacterId(client.sessionId);
            if (!activeCharacterId) return;
            const player = this.state.entities.get(activeCharacterId) as Player;
            if (!player) return;

            if (data.type === "select") {
                const slotIndex = data.index;
                if (slotIndex >= 0 && slotIndex < player.inventory.length) {
                    player.selectedSlot = slotIndex;
                    console.log(`Player ${client.sessionId} selected slot ${slotIndex}`);
                }
            } else if (data.type === "swap") {
                const { fromIndex, toIndex } = data;
                
                // Validate indices
                if (fromIndex < 0 || fromIndex >= player.inventory.length ||
                    toIndex < 0 || toIndex >= player.inventory.length) {
                    console.warn(`Invalid swap indices: ${fromIndex} -> ${toIndex}`);
                    return;
                }
                
                // Get items (may be undefined for empty slots)
                const itemA = player.inventory[fromIndex];
                const itemB = player.inventory[toIndex];
                
                console.log(`Swapping slots ${fromIndex} -> ${toIndex}`, {
                    from: itemA ? `${itemA.itemId} x${itemA.count}` : 'empty',
                    to: itemB ? `${itemB.itemId} x${itemB.count}` : 'empty'
                });
                
                // Swap items (works even if one or both are undefined/empty)
                player.inventory[fromIndex] = itemB;
                player.inventory[toIndex] = itemA;
                
                console.log(`Swap complete`);
            }
        });

        // Drop Item (from UI drag-and-drop)
        this.onMessage("drop_item", (client, data: { slotIndex: number }) => {
            const activeCharacterId = this.getActiveCharacterId(client.sessionId);
            if (!activeCharacterId) return;
            const player = this.state.entities.get(activeCharacterId) as Player;
            if (!player) return;

            this.dropItemFromSlot(activeCharacterId, player, data.slotIndex);
        });

        // Shop Trade
        this.onMessage("shop_trade", (client, data: { tradeId: string }) => {
            const activeCharacterId = this.getActiveCharacterId(client.sessionId);
            if (!activeCharacterId) return;
            const player = this.state.entities.get(activeCharacterId) as Player;
            if (!player) {
                console.warn(`Shop trade: Player ${client.sessionId} not found`);
                return;
            }

            // Find the trade configuration
            const trade = SHOP_TRADES.find(t => t.id === data.tradeId);
            if (!trade) {
                console.warn(`Shop trade: Invalid trade ID ${data.tradeId}`);
                return;
            }

            console.log(`Player ${client.sessionId} attempting trade: ${trade.name}`);

            // Check if player has enough of the cost item
            let totalCostItemCount = 0;
            const costItemSlots: number[] = [];
            
            for (let i = 0; i < player.inventory.length; i++) {
                const item = player.inventory[i];
                if (item && item.itemId === trade.cost.itemType) {
                    totalCostItemCount += item.count;
                    costItemSlots.push(i);
                }
            }

            if (totalCostItemCount < trade.cost.count) {
                console.warn(`Shop trade: Player doesn't have enough ${trade.cost.itemType}. Has ${totalCostItemCount}, needs ${trade.cost.count}`);
                return;
            }

            // Deduct cost items
            let remainingCost = trade.cost.count;
            for (const slotIndex of costItemSlots) {
                if (remainingCost <= 0) break;
                
                const item = player.inventory[slotIndex];
                if (!item) continue;

                const deductAmount = Math.min(item.count, remainingCost);
                item.count -= deductAmount;
                remainingCost -= deductAmount;

                // If count reaches 0, replace with empty item
                if (item.count <= 0) {
                    const emptyItem = new InventoryItem();
                    emptyItem.itemId = ItemType.EMPTY;
                    emptyItem.count = 0;
                    player.inventory[slotIndex] = emptyItem;
                }
            }

            // Add reward items to inventory
            const rewardItemDef = ITEM_DEFINITIONS[trade.reward.itemType];
            let remainingReward = trade.reward.count;

            // First, try to stack with existing items
            for (let i = 0; i < player.inventory.length && remainingReward > 0; i++) {
                const item = player.inventory[i];
                if (item && item.itemId === trade.reward.itemType && item.count < rewardItemDef.maxStack) {
                    const addAmount = Math.min(remainingReward, rewardItemDef.maxStack - item.count);
                    item.count += addAmount;
                    remainingReward -= addAmount;
                }
            }

            // Then, fill empty slots
            for (let i = 0; i < player.inventory.length && remainingReward > 0; i++) {
                const item = player.inventory[i];
                if (item && item.itemId === ItemType.EMPTY) {
                    const addAmount = Math.min(remainingReward, rewardItemDef.maxStack);
                    item.itemId = trade.reward.itemType;
                    item.count = addAmount;
                    remainingReward -= addAmount;
                }
            }

            if (remainingReward > 0) {
                console.warn(`Shop trade: Could not fit all reward items. ${remainingReward} items lost.`);
            }

            console.log(`Shop trade complete: ${trade.name}`);
        });

        // Rematch System
        this.onMessage("ready_for_rematch", (client) => {
            console.log('===== ready_for_rematch received =====');
            console.log('  Client sessionId:', client.sessionId);
            console.log('  Current gamePhase:', this.state.gamePhase);
            console.log('  Current rematchReady:', Array.from(this.state.rematchReady.entries()));
            console.log('  Current rematchCountdown:', this.state.rematchCountdown);
            
            if (this.state.gamePhase !== 'ended') {
                console.log(`  ERROR: Game not ended, ignoring ready from ${client.sessionId}`);
                return;
            }

            // Mark player as ready
            this.state.rematchReady.set(client.sessionId, true);
            console.log(`  SUCCESS: ${client.sessionId} marked as ready`);
            console.log('  Updated rematchReady:', Array.from(this.state.rematchReady.entries()));

            // Check if all players are ready
            const allReady = this.checkAllPlayersReady();
            console.log('  All ready result:', allReady);
            
            if (allReady && this.state.rematchCountdown <= 0) {
                console.log('  ★★★ Starting countdown from 3... ★★★');
                this.state.rematchCountdown = 3;
                console.log('  rematchCountdown set to:', this.state.rematchCountdown);
            }
        });

        // Create resource generators for testing
        this.createResourceGenerator('gold_generator', 400, 150);
        this.createResourceGenerator('resource_generator', 400, 450);

        // Simulation Loop
        this.setSimulationInterval((deltaTime) => {
            this.elapsedTime += deltaTime;
            while (this.elapsedTime >= this.fixedTimeStep) {
                this.elapsedTime -= this.fixedTimeStep;
                this.fixedTick(this.fixedTimeStep);
            }

            // Run slower updates (every frame, not every fixed step)
            this.checkItemPickup();
            this.updateResourceGenerators();
            
            // Cleanup old items every 60 seconds
            if (Math.random() < 0.001) { // ~1% chance per frame = ~60 times/min at 60fps
                this.cleanupDroppedItems();
            }
        });
    }
    
    createBed(teamId: string, x: number, y: number) {
        const bedId = `bed_${teamId}`;
        const bed = new Bed();
        bed.type = EntityType.BED;
        bed.teamId = teamId;
        bed.x = x;
        bed.y = y;
        bed.hp = GAME_CONFIG.bedMaxHP;
        bed.maxHP = GAME_CONFIG.bedMaxHP;
        
        this.state.entities.set(bedId, bed);
        
        // 创建床的物理碰撞体
        const body = Matter.Bodies.rectangle(x, y, 60, 40, {
            isStatic: true,
            label: `bed_${teamId}`,
            collisionFilter: {
                category: COLLISION_CATEGORIES.BED,
                mask: COLLISION_CATEGORIES.BULLET
            }
        });
        Matter.Composite.add(this.engine.world, body);
        this.bedBodies.set(bedId, body);
        
        console.log(`Created ${teamId} bed at ${x}, ${y} with physics body`);
    }
    
    getBed(teamId: string): Bed | undefined {
        const bedId = `bed_${teamId}`;
        return this.state.entities.get(bedId) as Bed;
    }

    handleCollision(bodyA: Matter.Body, bodyB: Matter.Body) {
        const isBulletA = bodyA.label.startsWith('bullet_');
        const isBulletB = bodyB.label.startsWith('bullet_');

        if (isBulletA || isBulletB) {
            const bulletBody = isBulletA ? bodyA : bodyB;
            const otherBody = isBulletA ? bodyB : bodyA;

            const bulletId = bulletBody.label.split('_')[1].trim();
            const bullet = this.state.entities.get(bulletId) as Bullet;
            if (!bullet) return;

            // 子弹击中玩家
            if (otherBody.label.startsWith('player_')) {
                const targetCharacterId = otherBody.label.substring(7);

                if (bullet.ownerId === targetCharacterId) return;

                const targetPlayer = this.state.entities.get(targetCharacterId) as Player;
                const shooterPlayer = this.state.entities.get(bullet.ownerId) as Player;
                
                if (targetPlayer && !targetPlayer.isDead) {
                    // 扣血
                    targetPlayer.hp -= bullet.damage;
                    
                    // 追踪伤害
                    if (shooterPlayer) {
                        shooterPlayer.damageDealt += bullet.damage;
                    }
                    
                    console.log(`Player ${targetCharacterId} hit by ${bullet.ownerId}, HP: ${targetPlayer.hp}/${targetPlayer.maxHP}`);
                    
                    // 击退效果
                    const knockbackAngle = Math.atan2(bullet.velocityY, bullet.velocityX);
                    const knockbackForce = GAME_CONFIG.knockbackForce;
                    const knockbackX = Math.cos(knockbackAngle) * knockbackForce;
                    const knockbackY = Math.sin(knockbackAngle) * knockbackForce;
                    Matter.Body.setVelocity(otherBody, { x: knockbackX, y: knockbackY });
                    
                    // 检查死亡
                    const died = this.checkPlayerDeath(targetCharacterId);
                    if (died && shooterPlayer) {
                        // 追踪击杀
                        shooterPlayer.kills++;
                        this.addKillFeed(bullet.ownerId, targetCharacterId);
                    }
                }
            }
            
            // 子弹击中床
            if (otherBody.label.startsWith('bed_')) {
                const teamId = otherBody.label.split('_')[1].trim();
                const bedId = `bed_${teamId}`;
                const bed = this.state.entities.get(bedId) as Bed;
                
                if (bed && bed.hp > 0) {
                    // 不能打自己队伍的床
                    const shooter = this.state.entities.get(bullet.ownerId) as Player;
                    if (shooter && shooter.teamId === teamId) return;
                    
                    // 扣血
                    bed.hp -= bullet.damage;
                    console.log(`Bed ${teamId} hit, HP: ${bed.hp}/${bed.maxHP}`);
                    
                    // 床被破坏
                    if (bed.hp <= 0) {
                        bed.hp = 0;
                        console.log(`Bed ${teamId} DESTROYED!`);
                        // 移除床的物理体
                        const bedBody = this.bedBodies.get(bedId);
                        if (bedBody) {
                            Matter.Composite.remove(this.engine.world, bedBody);
                            this.bedBodies.delete(bedId);
                        }
                    }
                }
            }
            
            // 子弹击中方块
            if (otherBody.label.startsWith('block_')) {
                const blockId = otherBody.label.split('_')[1].trim();
                const block = this.state.entities.get(blockId) as Block;
                
                if (block && block.hp > 0) {
                    // Removed friendly fire check as requested: anyone can destroy blocks
                    
                    // 扣血
                    block.hp -= bullet.damage;
                    console.log(`Block ${blockId} hit by ${bullet.ownerId}, HP: ${block.hp}/${block.maxHP}`);
                    
                    // 方块被破坏
                    if (block.hp <= 0) {
                        this.removeBlock(blockId);
                    }
                }
            }

            this.removeBullet(bulletId);
        }
    }
    
    checkPlayerDeath(sessionId: string): boolean {
        const player = this.state.entities.get(sessionId) as Player;
        if (!player) return false;
        
        if (player.hp <= 0 && !player.isDead) {
            player.isDead = true;
            player.deaths++; // 追踪死亡
            console.log(`Player ${sessionId} (${player.teamId}) died!`);
            
            const agent = this.agents.get(sessionId);
            if (agent && agent.body) {
                Matter.Body.setPosition(agent.body, { x: -1000, y: -1000 });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
            }
            
            this.startRespawn(sessionId);
            return true;
        }
        return false;
    }
    
    startRespawn(sessionId: string) {
        const player = this.state.entities.get(sessionId) as Player;
        if (!player) return;
        
        const bed = this.getBed(player.teamId);
        if (bed && bed.hp > 0) {
            // 床还在，可以重生
            player.respawnTime = GAME_CONFIG.respawnTime;
            console.log(`Player ${sessionId} will respawn in ${GAME_CONFIG.respawnTime}ms`);
        } else {
            // 床被破坏，无法重生
            console.log(`Player ${sessionId} cannot respawn - bed destroyed!`);
            player.respawnTime = -1; // -1 表示无法重生
        }
    }

    fixedTick(deltaTime: number) {
        // 0. Update Game Phase
        this.updateGamePhase();
        
        // 0.5. Handle Rematch Countdown
        if (this.state.rematchCountdown > 0) {
            const oldCountdown = this.state.rematchCountdown;
            this.state.rematchCountdown -= deltaTime / 1000; // Convert to seconds
            
            // Log every second
            if (Math.floor(oldCountdown) !== Math.floor(this.state.rematchCountdown)) {
                console.log(`Rematch countdown: ${Math.ceil(this.state.rematchCountdown)}...`);
            }
            
            if (this.state.rematchCountdown <= 0) {
                console.log('★★★ Countdown finished! Resetting game... ★★★');
                this.state.rematchCountdown = 0;
                this.resetGame();
                return; // Skip this tick after reset
            }
        }
        
        // Skip gameplay if frozen
        if (this.state.isFrozen) {
            return;
        }
        
        // 1. Logic Update (Behaviors)
        this.agents.forEach(agent => agent.update(deltaTime));

        // 2. Physics Update
        Matter.Engine.update(this.engine, deltaTime);
        
        // 2.5. Enforce building phase restrictions
        if (this.state.gamePhase === "building") {
            this.enforceBuildingPhaseRestrictions();
        }

        // 3. Post Update (Sync)
        this.agents.forEach(agent => agent.postUpdate(deltaTime));

        // 4. Sync Bullets
        this.bulletBodies.forEach((body, bulletId) => {
            const bullet = this.state.entities.get(bulletId) as Bullet;
            if (bullet) {
                bullet.x = body.position.x;
                bullet.y = body.position.y;

                if (bullet.x < 0 || bullet.x > this.state.mapWidth ||
                    bullet.y < 0 || bullet.y > this.state.mapHeight) {
                    this.removeBullet(bulletId);
                }
            }
        });
        
        // 5. Update Respawn Timers
        this.state.entities.forEach((entity, id) => {
            if (entity instanceof Player && entity.isDead && entity.respawnTime > 0) {
                entity.respawnTime -= deltaTime;
                if (entity.respawnTime <= 0) {
                    this.respawnPlayer(id);
                }
            }
        });
    }

    spawnBullet(ownerId: string, position: { x: number, y: number }, aimAngle: number, weaponType: WeaponItem) {
        const player = this.state.entities.get(ownerId) as Player;
        if (!player) return;
        
        // 获取当前武器配置（现在类型安全，不需要 as keyof）
        const weaponConfig = WEAPON_CONFIG[weaponType] || WEAPON_CONFIG[ItemType.BOW];
        
        const bulletId = Math.random().toString(36).substr(2, 9);
        const bullet = new Bullet();
        bullet.type = EntityType.BULLET;
        bullet.x = position.x;
        bullet.y = position.y;
        bullet.ownerId = ownerId;
        bullet.damage = weaponConfig.damage;
        bullet.weaponType = weaponType;

        // 使用瞄准角度和武器速度
        const velocityX = Math.cos(aimAngle) * weaponConfig.bulletSpeed;
        const velocityY = Math.sin(aimAngle) * weaponConfig.bulletSpeed;

        bullet.velocityX = velocityX;
        bullet.velocityY = velocityY;

        this.state.entities.set(bulletId, bullet);

        const body = Matter.Bodies.circle(position.x, position.y, GAME_CONFIG.bulletRadius, {
            label: `bullet_${bulletId}`,
            isSensor: true,
            frictionAir: 0,
            collisionFilter: {
                category: COLLISION_CATEGORIES.BULLET,
                mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BED | COLLISION_CATEGORIES.BLOCK
            }
        });

        Matter.Body.setVelocity(body, { x: velocityX, y: velocityY });
        Matter.Composite.add(this.engine.world, body);
        this.bulletBodies.set(bulletId, body);
    }

    removeBullet(bulletId: string) {
        const body = this.bulletBodies.get(bulletId);
        if (body) {
            Matter.Composite.remove(this.engine.world, body);
            this.bulletBodies.delete(bulletId);
        }
        this.state.entities.delete(bulletId);
    }
    
    placeBlock(playerId: string, x: number, y: number, blockType: BlockItem) {
        const player = this.state.entities.get(playerId) as Player;
        if (!player) return;
        
        // Find the specific slot index where the item is (so we subtract from the correct stack)
        // Or since we just checked what was selected in behavior, we can trust selectedSlot
        const slotIndex = player.selectedSlot;
        const item = player.inventory.at(slotIndex);
        
        if (!item || item.itemId !== blockType || item.count <= 0) {
             console.log(`Player ${playerId} has no ${blockType} blocks in slot ${slotIndex}`);
             return;
        }

        const count = item.count;
        
        // 对齐到网格
        const gridSize = GAME_CONFIG.gridSize;
        const gridX = Math.round(x / gridSize) * gridSize;
        const gridY = Math.round(y / gridSize) * gridSize;
        
        // 检查距离
        const distance = Math.sqrt((gridX - player.x) ** 2 + (gridY - player.y) ** 2);
        if (distance > GAME_CONFIG.maxPlaceRange) {
            console.log(`Block too far: ${distance} > ${GAME_CONFIG.maxPlaceRange}`);
            return;
        }
        
        // 检查位置是否已有方块（简单碰撞检测）
        const existingBlock = Array.from(this.blockBodies.values()).find(body => {
            const dx = Math.abs(body.position.x - gridX);
            const dy = Math.abs(body.position.y - gridY);
            return dx < gridSize / 2 && dy < gridSize / 2;
        });
        
        if (existingBlock) {
            console.log(`Position occupied: ${gridX}, ${gridY}`);
            return;
        }
        
        // 创建方块
        const blockId = Math.random().toString(36).substr(2, 9);
        const block = new Block();
        block.type = EntityType.BLOCK;
        block.x = gridX;
        block.y = gridY;
        block.blockType = blockType;
        // Removed teamId assignment
        
        const blockConfig = BLOCK_CONFIG[blockType];
        block.hp = blockConfig.maxHP;
        block.maxHP = blockConfig.maxHP;
        
        this.state.entities.set(blockId, block);
        
        // 创建物理体
        const body = Matter.Bodies.rectangle(gridX, gridY, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, {
            isStatic: true,
            label: `block_${blockId}`,
            collisionFilter: {
                category: COLLISION_CATEGORIES.BLOCK,
                mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BULLET
            }
        });
        
        Matter.Composite.add(this.engine.world, body);
        this.blockBodies.set(blockId, body);
        
        // 消耗方块
        item.count = count - 1;
        
        console.log(`Placed ${blockType} block at ${gridX}, ${gridY}. Remaining: ${item.count}`);
    }
    
    removeBlock(blockId: string) {
        const block = this.state.entities.get(blockId) as Block;
        if (!block) return;
        
        console.log(`Block ${blockId} destroyed`);
        
        // 移除物理体
        const body = this.blockBodies.get(blockId);
        if (body) {
            Matter.Composite.remove(this.engine.world, body);
            this.blockBodies.delete(blockId);
        }
        
        // 移除实体
        this.state.entities.delete(blockId);
    }

    respawnPlayer(sessionId: string) {
        const player = this.state.entities.get(sessionId) as Player;
        if (!player) return;
        
        const bed = this.getBed(player.teamId);
        if (!bed || bed.hp <= 0) {
            console.log(`Cannot respawn ${sessionId} - bed destroyed`);
            return;
        }
        
        // 重生
        player.isDead = false;
        player.hp = player.maxHP;
        player.respawnTime = 0;
        
        const agent = this.agents.get(sessionId);
        if (agent && agent.body) {
            // 根据队伍重生在对应位置
            const spawnPos = player.teamId === TeamType.RED ? GAME_CONFIG.redTeamSpawn : GAME_CONFIG.blueTeamSpawn;
            Matter.Body.setPosition(agent.body, { x: spawnPos.x, y: spawnPos.y });
            Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
        }
        
        console.log(`Player ${sessionId} (${player.teamId}) respawned at team spawn`);
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        
        const username = options.username || "Guest";
        
        const teamId = this.teamAssignments.length === 0 ? TeamType.RED : TeamType.BLUE;
        this.teamAssignments.push(client.sessionId);
        
        this.createCharacter(client, teamId, 1, true, username);
        this.createCharacter(client, teamId, 2, false, username);
    }

    createCharacter(client: Client, teamId: string, index: number, isActive: boolean, username: string) {
        const characterId = `${client.sessionId}_${index}`;
        const player = new Player();
        player.type = EntityType.PLAYER;
        player.teamId = teamId;
        player.hp = GAME_CONFIG.playerMaxHP;
        player.maxHP = GAME_CONFIG.playerMaxHP;
        player.isDead = false;
        player.respawnTime = 0;
        player.ownerSessionId = client.sessionId;
        player.isActive = isActive;
        player.username = username;
        player.kills = 0;
        player.deaths = 0;
        player.damageDealt = 0;
        
        // 初始化背包 (HOTBAR)
        // 1: Bow (Weapon)
        // 2: Fireball (Weapon)
        // 3: Dart (Weapon)
        // 4: Wood (Block x 20)
        // 5: Stone (Block x 10)
        // 6: Diamond (Block x 5)
        
        const createItem = (id: string, count: number) => {
            const item = new InventoryItem();
            item.itemId = id;
            item.count = count;
            return item;
        };

        
        // Fill initial inventory items
        player.inventory.push(createItem(ItemType.BOW, 1));
        player.inventory.push(createItem(ItemType.FIREBALL, 1));
        player.inventory.push(createItem(ItemType.DART, 1));
        player.inventory.push(createItem(ItemType.WOOD, GAME_CONFIG.initialBlocks[ItemType.WOOD]));
        player.inventory.push(createItem(ItemType.STONE, GAME_CONFIG.initialBlocks[ItemType.STONE]));
        player.inventory.push(createItem(ItemType.DIAMOND, GAME_CONFIG.initialBlocks[ItemType.DIAMOND]));
        player.inventory.push(createItem(ItemType.GOLD_INGOT, 10)); // Initial gold for testing

        // Fill remaining slots with empty items
        while (player.inventory.length < INVENTORY_SIZE) {
            player.inventory.push(createItem(ItemType.EMPTY, 0));
        }
        
        player.selectedSlot = 0;

        // 根据队伍设置出生点
        const spawnPos = teamId === TeamType.RED ? GAME_CONFIG.redTeamSpawn : GAME_CONFIG.blueTeamSpawn;
        player.x = spawnPos.x + (index - 1) * 50;
        player.y = spawnPos.y;
        
        console.log(`Spawning character ${characterId} (${teamId} team) at ${player.x}, ${player.y}`);

        this.state.entities.set(characterId, player);

        // Create Agent
        const agent = new PlayerAgent(
            characterId, 
            this.engine.world, 
            player, 
            (ownerId, pos, aimAngle, weaponType) => {
                this.spawnBullet(ownerId, pos, aimAngle, weaponType);
            },
            (playerId, x, y, blockType) => {
                this.placeBlock(playerId, x, y, blockType);
            },
            (playerId, slotIndex, mouseX, mouseY) => {
                const player = this.state.entities.get(playerId) as Player;
                if (player) {
                    this.dropItemFromSlot(playerId, player, slotIndex, mouseX, mouseY);
                }
            }
        );
        this.agents.set(characterId, agent);
    }

    onLeave(client: Client) {
        console.log(client.sessionId, "left!");
        
        const char1Id = `${client.sessionId}_1`;
        const char2Id = `${client.sessionId}_2`;

        [char1Id, char2Id].forEach(id => {
            const agent = this.agents.get(id);
            if (agent) {
                agent.destroy();
                this.agents.delete(id);
            }
            this.state.entities.delete(id);
        });
    }

    // ============ Dropped Item System ============

    /**
     * Drop an item from player's inventory slot
     * By default drops 1 item, or entire stack if dropAll is true
     * Uses mouse position to determine drop direction (like shooting)
     */
    dropItemFromSlot(sessionId: string, player: Player, slotIndex: number, mouseX?: number, mouseY?: number, dropAll: boolean = false) {
        if (slotIndex < 0 || slotIndex >= player.inventory.length) {
            console.warn(`Invalid drop slot index: ${slotIndex}`);
            return;
        }

        const item = player.inventory[slotIndex];
        if (!item || item.itemId === ItemType.EMPTY || item.count <= 0) {
            console.warn(`Cannot drop empty slot ${slotIndex}: itemId=${item?.itemId}, count=${item?.count}`);
            return;
        }

        // Save item info before modifying
        const itemType = item.itemId as ItemType;
        const dropCount = dropAll ? item.count : 1;

        // Calculate drop direction
        let dropAngle = 0;
        const dropDistance = 80; // Distance to avoid immediate pickup

        if (mouseX !== undefined && mouseY !== undefined) {
            // Use mouse position to calculate direction (like shooting)
            dropAngle = Math.atan2(mouseY - player.y, mouseX - player.x);
        } else {
            // Fallback: use player's movement direction
            const agent = this.agents.get(sessionId);
            if (agent && agent.body) {
                const velocity = agent.body.velocity;
                const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

                if (speed > 0.5) {
                    // Player is moving, drop in movement direction
                    dropAngle = Math.atan2(velocity.y, velocity.x);
                } else {
                    // Player is stationary, drop downward
                    dropAngle = Math.PI / 2;
                }
            } else {
                // Fallback: drop downward
                dropAngle = Math.PI / 2;
            }
        }

        // Calculate drop position
        const dropX = player.x + Math.cos(dropAngle) * dropDistance;
        const dropY = player.y + Math.sin(dropAngle) * dropDistance;

        console.log(`Player dropping ${dropCount}x ${itemType} from slot ${slotIndex} towards mouse (${mouseX}, ${mouseY}), angle: ${dropAngle.toFixed(2)}`);
        this.spawnDroppedItem(itemType, dropCount, dropX, dropY);

        // Deduct from inventory
        item.count -= dropCount;
        if (item.count <= 0) {
            // Clear the inventory slot
            item.itemId = ItemType.EMPTY;
            item.count = 0;
        }
    }

    /**
     * Spawn a dropped item in the world
     */
    spawnDroppedItem(itemType: ItemType, count: number, x: number, y: number): string {
        // Check if there's a nearby dropped item of the same type to merge with
        const mergeTarget = this.findNearbyDroppedItem(itemType, x, y, DROPPED_ITEM_CONFIG.mergeRange);
        
        if (mergeTarget) {
            // Merge with existing drop
            mergeTarget.count += count;
            console.log(`Merged drop: ${itemType} now has ${mergeTarget.count}`);
            return mergeTarget.type; // Return existing ID
        }

        // Create new dropped item
        const dropId = `drop_${Math.random().toString(36).substr(2, 9)}`;
        const droppedItem = new DroppedItem();
        droppedItem.type = EntityType.DROPPED_ITEM;
        droppedItem.itemType = itemType;
        droppedItem.count = count;
        droppedItem.x = x;
        droppedItem.y = y;
        droppedItem.spawnTime = Date.now();

        this.state.entities.set(dropId, droppedItem);
        console.log(`Spawned dropped item: ${dropId} (${count}x ${itemType})`);

        return dropId;
    }

    /**
     * Find nearby dropped item of the same type
     */
    findNearbyDroppedItem(itemType: ItemType, x: number, y: number, range: number): DroppedItem | null {
        let closest: DroppedItem | null = null;
        let closestDist = range;

        this.state.entities.forEach((entity) => {
            if (entity.type === EntityType.DROPPED_ITEM) {
                const drop = entity as DroppedItem;
                if (drop.itemType === itemType) {
                    const dx = drop.x - x;
                    const dy = drop.y - y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < closestDist) {
                        closest = drop;
                        closestDist = dist;
                    }
                }
            }
        });

        return closest;
    }

    /**
     * Check and handle item pickup for all players
     */
    checkItemPickup() {
        this.state.entities.forEach((entity, playerId) => {
            if (entity.type === EntityType.PLAYER) {
                const player = entity as Player;
                if (player.isDead) return;

                // Find nearby dropped items
                const nearbyDrops: Array<{ id: string, drop: DroppedItem, distance: number }> = [];

                this.state.entities.forEach((otherEntity, dropId) => {
                    if (otherEntity.type === EntityType.DROPPED_ITEM) {
                        const drop = otherEntity as DroppedItem;
                        const dx = drop.x - player.x;
                        const dy = drop.y - player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance <= DROPPED_ITEM_CONFIG.pickupRange) {
                            nearbyDrops.push({ id: dropId, drop, distance });
                        }
                    }
                });

                // Pick up the closest item
                if (nearbyDrops.length > 0) {
                    nearbyDrops.sort((a, b) => a.distance - b.distance);
                    const { id, drop } = nearbyDrops[0];
                    this.pickupItem(player, id, drop);
                }
            }
        });
    }

    /**
     * Add item to player's inventory
     */
    pickupItem(player: Player, dropId: string, drop: DroppedItem) {
        const itemDef = ITEM_DEFINITIONS[drop.itemType as ItemType];
        let remaining = drop.count;

        // Try to stack with existing items
        for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
            const slot = player.inventory[i];
            if (slot && slot.itemId === drop.itemType && slot.count < itemDef.maxStack) {
                const addAmount = Math.min(remaining, itemDef.maxStack - slot.count);
                slot.count += addAmount;
                remaining -= addAmount;
            }
        }

        // Fill empty slots
        for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
            const slot = player.inventory[i];
            if (slot && slot.itemId === ItemType.EMPTY) {
                const addAmount = Math.min(remaining, itemDef.maxStack);
                slot.itemId = drop.itemType;
                slot.count = addAmount;
                remaining -= addAmount;
            }
        }

        if (remaining === 0) {
            // Fully picked up
            this.state.entities.delete(dropId);
            console.log(`Player picked up ${drop.count}x ${drop.itemType}`);
        } else {
            // Partially picked up
            drop.count = remaining;
            console.log(`Player partially picked up ${drop.itemType}, ${remaining} remaining`);
        }
    }

    /**
     * Clean up old dropped items
     */
    cleanupDroppedItems() {
        const now = Date.now();
        const toDelete: string[] = [];

        this.state.entities.forEach((entity, id) => {
            if (entity.type === EntityType.DROPPED_ITEM) {
                const drop = entity as DroppedItem;
                if (now - drop.spawnTime > DROPPED_ITEM_CONFIG.despawnTime) {
                    toDelete.push(id);
                }
            }
        });

        toDelete.forEach(id => {
            this.state.entities.delete(id);
            console.log(`Despawned old dropped item: ${id}`);
        });
    }

    // ============ Resource Generator System ============

    /**
     * Create a resource generator
     */
    createResourceGenerator(generatorType: string, x: number, y: number): string {
        const genId = `generator_${Math.random().toString(36).substr(2, 9)}`;
        const generator = new ResourceGenerator();
        generator.type = EntityType.RESOURCE_GENERATOR;
        generator.generatorType = generatorType;
        generator.x = x;
        generator.y = y;
        generator.lastSpawnTime = Date.now();
        generator.nearbyDropCount = 0;

        this.state.entities.set(genId, generator);
        console.log(`Created resource generator: ${genId} (${generatorType}) at (${x}, ${y})`);

        return genId;
    }

    /**
     * Update all resource generators
     */
    updateResourceGenerators() {
        const now = Date.now();

        this.state.entities.forEach((entity, genId) => {
            if (entity.type === EntityType.RESOURCE_GENERATOR) {
                const generator = entity as ResourceGenerator;

                // Check if it's time to spawn
                if (now - generator.lastSpawnTime >= RESOURCE_GENERATOR_CONFIG.spawnInterval) {
                    // Count nearby drops
                    const nearbyCount = this.countNearbyDrops(generator.x, generator.y, RESOURCE_GENERATOR_CONFIG.spawnRadius);

                    if (nearbyCount < RESOURCE_GENERATOR_CONFIG.maxDropsNearby) {
                        this.generateResource(generator);
                        generator.lastSpawnTime = now;
                    }
                }
            }
        });
    }

    /**
     * Generate a resource from a generator
     */
    generateResource(generator: ResourceGenerator) {
        const lootTable = GENERATOR_LOOT_TABLES[generator.generatorType];
        if (!lootTable) return;

        // Weighted random selection
        const totalWeight = lootTable.reduce((sum, entry) => sum + entry.weight, 0);
        let random = Math.random() * totalWeight;

        for (const entry of lootTable) {
            random -= entry.weight;
            if (random <= 0) {
                // Selected this entry
                const count = Math.floor(Math.random() * (entry.count.max - entry.count.min + 1)) + entry.count.min;
                
                // Spawn at random position around generator
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * RESOURCE_GENERATOR_CONFIG.spawnRadius;
                const x = generator.x + Math.cos(angle) * distance;
                const y = generator.y + Math.sin(angle) * distance;

                this.spawnDroppedItem(entry.itemType, count, x, y);
                break;
            }
        }
    }

    /**
     * Count dropped items near a position
     */
    countNearbyDrops(x: number, y: number, range: number): number {
        let count = 0;

        this.state.entities.forEach((entity) => {
            if (entity.type === EntityType.DROPPED_ITEM) {
                const drop = entity as DroppedItem;
                const dx = drop.x - x;
                const dy = drop.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= range) {
                    count++;
                }
            }
        });

        return count;
    }

    getActiveCharacterId(sessionId: string): string | undefined {
        for (const [id, entity] of this.state.entities) {
            if (entity instanceof Player && entity.ownerSessionId === sessionId && entity.isActive) {
                return id;
            }
        }
        return undefined;
    }
    
    updateGamePhase() {
        if (this.state.gamePhase === "ended") return;
        
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.state.gameStartTime;
        
        if (this.state.gamePhase === "building" && elapsedTime >= GAME_CONFIG.buildingPhaseDuration) {
            this.state.gamePhase = "combat";
            this.state.phaseEndTime = currentTime + GAME_CONFIG.combatPhaseDuration;
            console.log("Game phase: BUILDING -> COMBAT");
        } else if (this.state.gamePhase === "combat" && elapsedTime >= GAME_CONFIG.buildingPhaseDuration + GAME_CONFIG.combatPhaseDuration) {
            this.state.gamePhase = "deathmatch";
            this.state.phaseEndTime = currentTime + GAME_CONFIG.deathmatchPhaseDuration;
            this.destroyAllBeds();
            console.log("Game phase: COMBAT -> DEATHMATCH");
        } else if (this.state.gamePhase === "deathmatch" && elapsedTime >= GAME_CONFIG.totalGameDuration) {
            this.endGame();
        }
        
        if (this.state.gamePhase === "combat" || this.state.gamePhase === "deathmatch") {
            this.checkWinCondition();
        }
    }
    
    destroyAllBeds() {
        const redBed = this.getBed(TeamType.RED);
        const blueBed = this.getBed(TeamType.BLUE);
        
        if (redBed && redBed.hp > 0) {
            redBed.hp = 0;
            const redBedId = `bed_${TeamType.RED}`;
            const bedBody = this.bedBodies.get(redBedId);
            if (bedBody) {
                Matter.Composite.remove(this.engine.world, bedBody);
                this.bedBodies.delete(redBedId);
            }
        }
        
        if (blueBed && blueBed.hp > 0) {
            blueBed.hp = 0;
            const blueBedId = `bed_${TeamType.BLUE}`;
            const bedBody = this.bedBodies.get(blueBedId);
            if (bedBody) {
                Matter.Composite.remove(this.engine.world, bedBody);
                this.bedBodies.delete(blueBedId);
            }
        }
    }
    
    checkWinCondition() {
        const redBed = this.getBed(TeamType.RED);
        const blueBed = this.getBed(TeamType.BLUE);
        
        let redAlive = 0;
        let blueAlive = 0;
        
        this.state.entities.forEach((entity) => {
            if (entity instanceof Player && !entity.isDead) {
                if (entity.teamId === TeamType.RED) redAlive++;
                if (entity.teamId === TeamType.BLUE) blueAlive++;
            }
        });
        
        if ((!redBed || redBed.hp <= 0) && redAlive === 0) {
            this.state.winner = TeamType.BLUE;
            this.endGame();
            return;
        }
        
        if ((!blueBed || blueBed.hp <= 0) && blueAlive === 0) {
            this.state.winner = TeamType.RED;
            this.endGame();
            return;
        }
    }
    
    endGame() {
        if (this.state.gamePhase === "ended") return;
        
        this.state.gamePhase = "ended";
        this.state.isFrozen = true; // Freeze game
        
        if (!this.state.winner) {
            const redBed = this.getBed(TeamType.RED);
            const blueBed = this.getBed(TeamType.BLUE);
            
            const redHP = redBed ? redBed.hp : 0;
            const blueHP = blueBed ? blueBed.hp : 0;
            
            if (redHP > blueHP) {
                this.state.winner = TeamType.RED;
            } else if (blueHP > redHP) {
                this.state.winner = TeamType.BLUE;
            } else {
                let redAlive = 0;
                let blueAlive = 0;
                
                this.state.entities.forEach((entity) => {
                    if (entity instanceof Player && !entity.isDead) {
                        if (entity.teamId === TeamType.RED) redAlive++;
                        if (entity.teamId === TeamType.BLUE) blueAlive++;
                    }
                });
                
                if (redAlive > blueAlive) {
                    this.state.winner = TeamType.RED;
                } else if (blueAlive > redAlive) {
                    this.state.winner = TeamType.BLUE;
                } else {
                    this.state.winner = "draw";
                }
            }
        }
        
        console.log(`Game ended! Winner: ${this.state.winner}`);
    }
    
    addKillFeed(killerId: string, victimId: string) {
        const killer = this.state.entities.get(killerId) as Player;
        const victim = this.state.entities.get(victimId) as Player;
        
        if (!killer || !victim) return;
        
        const killerName = killer.username || killerId;
        const victimName = victim.username || victimId;
        const killMessage = `${killerName} eliminated ${victimName}`;
        
        this.state.killFeed.push(killMessage);
        if (this.state.killFeed.length > 5) {
            this.state.killFeed.shift();
        }
        
        console.log(killMessage);
    }
    
    enforceBuildingPhaseRestrictions() {
        this.agents.forEach((agent) => {
            const player = agent.schema as Player;
            if (!player || player.isDead) return;
            
            const bedPos = player.teamId === TeamType.RED ? GAME_CONFIG.redBedPos : GAME_CONFIG.blueBedPos;
            const dx = agent.body.position.x - bedPos.x;
            const dy = agent.body.position.y - bedPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > GAME_CONFIG.buildingPhaseRadius) {
                const angle = Math.atan2(dy, dx);
                const newX = bedPos.x + Math.cos(angle) * GAME_CONFIG.buildingPhaseRadius;
                const newY = bedPos.y + Math.sin(angle) * GAME_CONFIG.buildingPhaseRadius;
                Matter.Body.setPosition(agent.body, { x: newX, y: newY });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
            }
        });
    }

    checkAllPlayersReady(): boolean {
        // Get all active session IDs from connected clients
        const activeSessions: string[] = [];
        
        // In Colyseus, this.clients is an array-like structure
        for (const client of this.clients) {
            activeSessions.push(client.sessionId);
        }
        
        console.log('checkAllPlayersReady:');
        console.log('  Active sessions:', activeSessions);
        console.log('  Ready map entries:', Array.from(this.state.rematchReady.entries()));
        console.log('  Number of active sessions:', activeSessions.length);
        
        // Need at least one player
        if (activeSessions.length === 0) {
            console.log('  No active sessions');
            return false;
        }
        
        // Check if all players are ready
        let allReady = true;
        for (const sessionId of activeSessions) {
            const isReady = this.state.rematchReady.get(sessionId);
            console.log(`  Checking ${sessionId}: ready = ${isReady}`);
            if (!isReady) {
                allReady = false;
            }
        }
        
        if (allReady) {
            console.log('  ✓ All players ready!');
        } else {
            console.log('  ✗ Not all players ready');
        }
        
        return allReady;
    }

    resetGame() {
        console.log('Resetting game for rematch...');
        
        // Reset game state
        this.state.gamePhase = 'building';
        this.state.gameStartTime = Date.now();
        this.state.phaseEndTime = Date.now() + GAME_CONFIG.buildingPhaseDuration;
        this.state.winner = '';
        this.state.isFrozen = false;
        this.state.rematchReady.clear();
        this.state.rematchCountdown = 0;
        this.state.killFeed.clear();

        // Remove all entities except players
        const playersToKeep = new Map<string, Player>();
        this.state.entities.forEach((entity, id) => {
            if (entity.type === EntityType.PLAYER) {
                playersToKeep.set(id, entity as Player);
            }
        });
        
        // Clear entities
        this.state.entities.clear();
        
        // Helper to create inventory item
        const createItem = (id: string, count: number) => {
            const item = new InventoryItem();
            item.itemId = id;
            item.count = count;
            return item;
        };
        
        // Re-add players with reset stats
        playersToKeep.forEach((player, id) => {
            player.hp = 100;
            player.maxHP = 100;
            player.isDead = false;
            player.respawnTime = 0;
            player.kills = 0;
            player.deaths = 0;
            player.damageDealt = 0;
            player.lastShootTime = 0;
            
            // Clear inventory and give initial items
            player.inventory.clear();
            player.inventory.push(createItem(ItemType.BOW, 1));
            player.inventory.push(createItem(ItemType.FIREBALL, 1));
            player.inventory.push(createItem(ItemType.DART, 1));
            player.inventory.push(createItem(ItemType.WOOD, GAME_CONFIG.initialBlocks[ItemType.WOOD]));
            player.inventory.push(createItem(ItemType.STONE, GAME_CONFIG.initialBlocks[ItemType.STONE]));
            player.inventory.push(createItem(ItemType.DIAMOND, GAME_CONFIG.initialBlocks[ItemType.DIAMOND]));
            player.inventory.push(createItem(ItemType.GOLD_INGOT, 10));
            
            // Fill remaining slots with empty items
            while (player.inventory.length < INVENTORY_SIZE) {
                player.inventory.push(createItem(ItemType.EMPTY, 0));
            }
            player.selectedSlot = 0;
            
            // Reset position to spawn
            const spawnPos = player.teamId === TeamType.RED ? GAME_CONFIG.redTeamSpawn : GAME_CONFIG.blueTeamSpawn;
            // Get character index from id (format: sessionId_1 or sessionId_2)
            const charIndex = parseInt(id.split('_')[1]) || 1;
            player.x = spawnPos.x + (charIndex - 1) * 50;
            player.y = spawnPos.y;
            
            // Reset physics body
            const agent = this.agents.get(id);
            if (agent) {
                Matter.Body.setPosition(agent.body, { x: player.x, y: player.y });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
            }
            
            this.state.entities.set(id, player);
        });

        // Remove all bullets
        this.bulletBodies.forEach((body, id) => {
            Matter.Composite.remove(this.engine.world, body);
        });
        this.bulletBodies.clear();

        // Remove all blocks
        this.blockBodies.forEach((body, id) => {
            Matter.Composite.remove(this.engine.world, body);
        });
        this.blockBodies.clear();

        // Recreate beds (old ones were cleared with entities)
        this.createBed(TeamType.RED, GAME_CONFIG.redBedPos.x, GAME_CONFIG.redBedPos.y);
        this.createBed(TeamType.BLUE, GAME_CONFIG.blueBedPos.x, GAME_CONFIG.blueBedPos.y);

        console.log('Game reset complete!');
    }
}
