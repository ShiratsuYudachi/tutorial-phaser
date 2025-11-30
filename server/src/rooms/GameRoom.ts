import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, Player, Bullet, InputData, Entity, Bed, Block, InventoryItem, DroppedItem, ResourceGenerator, RematchPlayer } from "../shared/Schema";
import { GAME_CONFIG, COLLISION_CATEGORIES, WEAPON_CONFIG, MELEE_CONFIG, BLOCK_CONFIG, INVENTORY_SIZE, EntityType, TeamType, ItemType, WeaponItem, BlockItem, isWeapon, isBlock, isAmmo, isMelee, SHOP_TRADES, ITEM_DEFINITIONS, DROPPED_ITEM_CONFIG, RESOURCE_GENERATOR_CONFIG, GENERATOR_LOOT_TABLES } from "../shared/Constants";
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
    
    // Notification cooldown tracking (sessionId -> lastNotificationTime)
    lastInventoryFullNotification = new Map<string, number>();
    
    // TNT Explosions tracking
    // { blockId: { explodeTime: number, sourceId: string } }
    tntExplosions = new Map<string, { explodeTime: number, sourceId: string }>();
    
    // 队伍分配
    teamAssignments: string[] = []; // 按加入顺序: [红队sessionId, 蓝队sessionId]

    onCreate(options: { username?: string }) {
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

        // 2. Create Diamond Blocks (replacing walls)
        // Original wall positions converted to diamond blocks
        const wallAreas = [
            // 左侧障碍物
            { x: 200, y: 150, width: 50, height: 150 },
            { x: 200, y: 400, width: 50, height: 150 },
            // 右侧障碍物（对称）
            { x: 550, y: 150, width: 50, height: 150 },
            { x: 550, y: 400, width: 50, height: 150 },
            // 中央障碍物
            { x: 375, y: 275, width: 50, height: 50 },
            // 四周的墙壁
            { x: 400, y: -25, width: 800, height: 50 }, // 上
            { x: 400, y: 625, width: 800, height: 50 }, // 下
            { x: -25, y: 300, width: 50, height: 600 }, // 左
            { x: 825, y: 300, width: 50, height: 600 }, // 右
        ];
        
        wallAreas.forEach(area => {
            this.createDiamondBlocksInArea(area.x, area.y, area.width, area.height);
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

        // Chat System
        this.onMessage("chat_message", (client, data: { text: string }) => {
            const activeCharacterId = this.getActiveCharacterId(client.sessionId);
            if (!activeCharacterId) return;
            
            const player = this.state.entities.get(activeCharacterId) as Player;
            if (!player) return;

            const text = data.text.trim();
            if (text.length === 0) return;

            // Command Handling
            if (text.startsWith('/')) {
                const args = text.slice(1).split(' ');
                const command = args[0].toLowerCase();

                if (command === 'cheat') {
                    // Enable cheat mode for both characters of this player
                    const char1Id = `${client.sessionId}_1`;
                    const char2Id = `${client.sessionId}_2`;
                    
                    [char1Id, char2Id].forEach(id => {
                        const char = this.state.entities.get(id) as Player;
                        if (char) {
                            char.damageMultiplier = 100; // 100x damage
                            
                            // Give unlimited gold (as currency, not inventory)
                            char.gold = 9999;
                            
                            // Give unlimited items in inventory
                            const giveItem = (itemType: string, amount: number) => {
                                let found = false;
                                for (const item of char.inventory) {
                                    if (item.itemId === itemType) {
                                        item.count = amount;
                                        found = true;
                                        break;
                                    }
                                }
                                if (!found) {
                                    // Find empty slot
                                    for (const item of char.inventory) {
                                        if (item.itemId === ItemType.EMPTY) {
                                            item.itemId = itemType;
                                            item.count = amount;
                                            break;
                                        }
                                    }
                                }
                            };
                            
                            giveItem(ItemType.DIAMOND, 9999);
                            giveItem(ItemType.FIREBALL_AMMO, 9999); // Unlimited ammo too
                        }
                    });
                    
                    // Update team gold display
                    this.updateTeamGold();
                    
                    // Send private confirmation
                    client.send("chat_message", {
                        sender: "System",
                        text: "Cheat mode enabled! (100x Damage, Unlimited Resources)",
                        teamId: "system"
                    });

                    // Broadcast notification to teammates
                    this.clients.forEach(otherClient => {
                        const otherActiveId = this.getActiveCharacterId(otherClient.sessionId);
                        if (otherActiveId) {
                            const otherPlayer = this.state.entities.get(otherActiveId) as Player;
                            // Send to teammates (including self)
                            if (otherPlayer && otherPlayer.teamId === player.teamId) {
                                otherClient.send("notification", {
                                    text: `${player.username || "Player"} enabled CHEAT MODE!`,
                                    color: "#ff0000"
                                });
                            }
                        }
                    });
                }
                return;
            }

            // Team Chat Logic
            // Broadcast only to teammates
            this.clients.forEach(otherClient => {
                const otherActiveId = this.getActiveCharacterId(otherClient.sessionId);
                if (otherActiveId) {
                    const otherPlayer = this.state.entities.get(otherActiveId) as Player;
                    if (otherPlayer && otherPlayer.teamId === player.teamId) {
                        otherClient.send("chat_message", {
                            sender: player.username || "Player",
                            text: text,
                            teamId: player.teamId
                        });
                    }
                }
            });
        });

    // Inventory Actions
    this.onMessage("inventory_action", (client, data: { type: string; index?: number; fromIndex?: number; toIndex?: number }) => {
        const activeCharacterId = this.getActiveCharacterId(client.sessionId);
        if (!activeCharacterId) return;
        const player = this.state.entities.get(activeCharacterId) as Player;
        if (!player) return;

        if (data.type === "select" && typeof data.index === 'number') {
            const slotIndex = data.index;
            if (slotIndex >= 0 && slotIndex < player.inventory.length) {
                player.selectedSlot = slotIndex;
                console.log(`Player ${client.sessionId} selected slot ${slotIndex}`);
            }
        } else if (data.type === "swap" && typeof data.fromIndex === 'number' && typeof data.toIndex === 'number') {
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

            // Check if player has enough gold (gold is now a currency, not inventory item)
            if (trade.cost.itemType !== ItemType.GOLD_INGOT) {
                console.warn(`Shop trade: Only gold currency is supported for purchases`);
                return;
            }
            
            if (player.gold < trade.cost.count) {
                console.warn(`Shop trade: Player doesn't have enough gold. Has ${player.gold}, needs ${trade.cost.count}`);
                client.send("notification", {
                    text: "Not enough gold!",
                    color: "#ff4444"
                });
                return;
            }

            // Check if there's enough space for the reward items BEFORE deducting
            const rewardItemDef = ITEM_DEFINITIONS[trade.reward.itemType];
            let spaceAvailable = 0;
            
            // Calculate space in existing stacks
            for (let i = 0; i < player.inventory.length; i++) {
                const item = player.inventory[i];
                if (item && item.itemId === trade.reward.itemType && item.count < rewardItemDef.maxStack) {
                    spaceAvailable += rewardItemDef.maxStack - item.count;
                }
            }
            
            // Calculate space in empty slots
            for (let i = 0; i < player.inventory.length; i++) {
                const item = player.inventory[i];
                if (item && item.itemId === ItemType.EMPTY) {
                    spaceAvailable += rewardItemDef.maxStack;
                }
            }
            
            // If not enough space, reject the trade and notify player
            if (spaceAvailable < trade.reward.count) {
                console.warn(`Shop trade: Inventory full! Cannot fit ${trade.reward.count} items, only ${spaceAvailable} space available`);
                client.send("notification", {
                    text: "Inventory Full! Cannot purchase item.",
                    color: "#ff4444"
                });
                return;
            }

            // Deduct gold from player's currency
            player.gold -= trade.cost.count;
            console.log(`Deducted ${trade.cost.count} gold. Remaining: ${player.gold}`);

            // Add reward items to inventory
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

            // Update team gold after purchase (gold was spent)
            this.updateTeamGold();

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
            const rematchPlayer = new RematchPlayer();
            rematchPlayer.isReady = true;
            this.state.rematchReady.set(client.sessionId, rematchPlayer);
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

        // Create resource generators
        // 红队基地生成器（靠近红床 x=80）
        this.createResourceGenerator('base_gold_generator', 120, 250, 'base');      // 红队金矿
        this.createResourceGenerator('base_resource_generator', 120, 350, 'base');  // 红队资源矿
        
        // 蓝队基地生成器（靠近蓝床 x=720）
        this.createResourceGenerator('base_gold_generator', 680, 250, 'base');      // 蓝队金矿
        this.createResourceGenerator('base_resource_generator', 680, 350, 'base');  // 蓝队资源矿
        
        // 中央生成器（地图中心 x=400）- 高价值争夺点
        this.createResourceGenerator('center_gold_generator', 400, 300, 'center');     // 中央金矿（最高产出）
        this.createResourceGenerator('center_resource_generator', 400, 200, 'center'); // 中央资源矿上
        this.createResourceGenerator('center_resource_generator', 400, 400, 'center'); // 中央资源矿下

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
            this.checkTNTExplosions();
            
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

            // --- ENDER PEARL LOGIC ---
            if (bullet.weaponType === ItemType.ENDER_PEARL) {
                // Ignore self-collision
                if (otherBody.label === `player_${bullet.ownerId}`) return;

                const owner = this.state.entities.get(bullet.ownerId) as Player;
                if (owner && !owner.isDead) {
                     const agent = this.agents.get(bullet.ownerId);
                     if (agent) {
                         // Teleport!
                         Matter.Body.setPosition(agent.body, { x: bulletBody.position.x, y: bulletBody.position.y });
                         Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
                         
                         console.log(`Teleported player ${bullet.ownerId}`);
                     }
                }
                this.removeBullet(bulletId);
                return; // Skip other collision logic
            }

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
                    
                    // 追踪伤害统计
                    if (shooter) {
                        shooter.damageDealt += bullet.damage;
                    }
                    
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
            player.isActive = false; // Mark as inactive on death
            player.deaths++; // 追踪死亡
            console.log(`Player ${sessionId} (${player.teamId}) died!`);
            
            const agent = this.agents.get(sessionId);
            if (agent && agent.body) {
                Matter.Body.setPosition(agent.body, { x: -1000, y: -1000 });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
            }
            
            // Auto-switch control to another alive character if available
            if (player.ownerSessionId) {
                let switched = false;
                for (const [id, entity] of this.state.entities) {
                    if (entity.type === EntityType.PLAYER && id !== sessionId) {
                        const other = entity as Player;
                        if (other.ownerSessionId === player.ownerSessionId && !other.isDead) {
                            other.isActive = true;
                            switched = true;
                            console.log(`Auto-switched active character for ${player.ownerSessionId} to ${id}`);
                            break;
                        }
                    }
                }
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
                console.log('★★★ Countdown finished! Creating new room for rematch... ★★★');
                this.state.rematchCountdown = 0;
                this.createRematchRoom();
                return; // Skip this tick after creating new room
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
        
        // 6. Check for players out of bounds - instant death
        this.checkOutOfBounds();
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
                mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.BED | COLLISION_CATEGORIES.BLOCK
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
    
    // Helper function to create diamond blocks in an area (replacing walls)
    createDiamondBlocksInArea(areaX: number, areaY: number, areaWidth: number, areaHeight: number) {
        const gridSize = GAME_CONFIG.gridSize;
        const blockType = ItemType.DIAMOND;
        
        // Calculate grid positions
        const startX = Math.floor(areaX / gridSize) * gridSize;
        const startY = Math.floor(areaY / gridSize) * gridSize;
        const endX = Math.ceil((areaX + areaWidth) / gridSize) * gridSize;
        const endY = Math.ceil((areaY + areaHeight) / gridSize) * gridSize;
        
        // Create blocks in grid pattern
        for (let x = startX; x < endX; x += gridSize) {
            for (let y = startY; y < endY; y += gridSize) {
                const gridX = x;
                const gridY = y;
                
                // Create block entity
                const blockId = Math.random().toString(36).substr(2, 9);
                const block = new Block();
                block.type = EntityType.BLOCK;
                block.x = gridX;
                block.y = gridY;
                block.blockType = blockType;
                
                const blockConfig = BLOCK_CONFIG[blockType];
                block.hp = blockConfig.maxHP;
                block.maxHP = blockConfig.maxHP;
                
                this.state.entities.set(blockId, block);
                
                // Create physics body
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
            }
        }
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
        
        // --- TNT Logic ---
        if (blockType === ItemType.TNT) {
            this.tntExplosions.set(blockId, {
                explodeTime: Date.now() + GAME_CONFIG.tntFuseTime,
                sourceId: playerId
            });
            console.log(`TNT placed by ${playerId}, exploding in ${GAME_CONFIG.tntFuseTime}ms`);
        }
        
        // 消耗方块
        item.count = count - 1;
        if (item.count <= 0) {
            item.itemId = ItemType.EMPTY;
            item.count = 0;
        }
        
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
    
    /**
     * 执行近战攻击
     */
    performMeleeAttack(attackerId: string, position: { x: number, y: number }, angle: number) {
        const attacker = this.state.entities.get(attackerId) as Player;
        if (!attacker || attacker.isDead) return;
        
        const meleeConfig = MELEE_CONFIG[ItemType.SWORD];
        const range = meleeConfig.range;
        const damage = meleeConfig.damage;
        const knockback = meleeConfig.knockback;
        
        // 计算攻击扇形区域（60度扇形）
        const halfAngle = Math.PI / 6; // 30度
        
        // 查找范围内的目标
        this.agents.forEach((agent, targetId) => {
            if (targetId === attackerId) return; // 不攻击自己
            
            const target = agent.schema as Player;
            if (!target || target.isDead) return;
            
            // 计算距离
            const dx = agent.body.position.x - position.x;
            const dy = agent.body.position.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > range) return; // 超出范围
            
            // 计算目标角度
            const targetAngle = Math.atan2(dy, dx);
            
            // 检查是否在攻击扇形内
            let angleDiff = targetAngle - angle;
            // 规范化角度差到 -PI 到 PI
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            if (Math.abs(angleDiff) > halfAngle) return; // 不在扇形内
            
            // 命中！造成伤害
            target.hp -= damage;
            attacker.damageDealt += damage;
            
            console.log(`Melee hit! ${attackerId} -> ${targetId}, damage: ${damage}, remaining HP: ${target.hp}`);
            
            // 击退效果
            const knockbackX = Math.cos(angle) * knockback;
            const knockbackY = Math.sin(angle) * knockback;
            Matter.Body.setVelocity(agent.body, { x: knockbackX, y: knockbackY });
            
            // 检查死亡
            const died = this.checkPlayerDeath(targetId);
            if (died) {
                attacker.kills++;
                this.addKillFeed(attackerId, targetId);
            }
        });
        
        // 近战也可以攻击床
        this.state.entities.forEach((entity, entityId) => {
            if (entity.type !== EntityType.BED) return;
            
            const bed = entity as Bed;
            if (bed.hp <= 0) return;
            if (bed.teamId === attacker.teamId) return; // 不攻击自己队的床
            
            // 计算距离
            const dx = bed.x - position.x;
            const dy = bed.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > range + 30) return; // 床比较大，范围稍微宽松
            
            // 命中床
            bed.hp -= damage;
            
            // 追踪伤害统计
            attacker.damageDealt += damage;
            
            console.log(`Melee hit bed ${bed.teamId}! HP: ${bed.hp}/${bed.maxHP}`);
            
            if (bed.hp <= 0) {
                bed.hp = 0;
                console.log(`Bed ${bed.teamId} DESTROYED by melee!`);
                const bedBody = this.bedBodies.get(entityId);
                if (bedBody) {
                    Matter.Composite.remove(this.engine.world, bedBody);
                    this.bedBodies.delete(entityId);
                }
            }
        });
        
        // 近战攻击方块
        this.state.entities.forEach((entity, entityId) => {
            if (entity.type !== EntityType.BLOCK) return;
            
            const block = entity as Block;
            if (block.hp <= 0) return;
            
            // 计算距离
            const dx = block.x - position.x;
            const dy = block.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > range + 20) return; // 方块范围稍微宽松
            
            // 命中方块
            block.hp -= damage;
            console.log(`Melee hit block ${entityId}! HP: ${block.hp}/${block.maxHP}`);
            
            if (block.hp <= 0) {
                this.removeBlock(entityId);
            }
        });
    }

    /**
     * Check for players outside map boundaries and kill them instantly
     */
    checkOutOfBounds() {
        const margin = 50; // Small margin outside the visible map
        const minX = -margin;
        const maxX = this.state.mapWidth + margin;
        const minY = -margin;
        const maxY = this.state.mapHeight + margin;
        
        this.agents.forEach((agent, playerId) => {
            const player = this.state.entities.get(playerId) as Player;
            if (!player || player.isDead) return;
            
            const x = agent.body.position.x;
            const y = agent.body.position.y;
            
            if (x < minX || x > maxX || y < minY || y > maxY) {
                console.log(`Player ${playerId} out of bounds at (${x}, ${y}) - killing instantly`);
                
                // Instant death - set HP to 0
                player.hp = 0;
                player.isDead = true;
                player.deaths++;
                
                // Move body to off-screen
                Matter.Body.setPosition(agent.body, { x: -1000, y: -1000 });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
                
                // Add to kill feed (death by environment)
                this.addKillFeed(null, player, "fell off the map");
                
                // Start respawn process
                this.startRespawn(playerId);
            }
        });
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

    onJoin(client: Client, options: { username?: string }) {
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
        player.lastMeleeTime = 0;
        player.isMeleeAttacking = false;
        player.meleeAngle = 0;
        
        // Set initial gold as currency (not inventory item)
        player.gold = GAME_CONFIG.initialGold;
        
        // Initialize inventory (HOTBAR)
        // Melee attack is built-in (not an inventory item)
        // 1: Arrow (ammo)
        // 2: Wood (block)
        // 3: Stone (block)
        // 4: Diamond (block)
        // 5-9: empty
        
        const createItem = (id: string, count: number) => {
            const item = new InventoryItem();
            item.itemId = id;
            item.count = count;
            return item;
        };

        
        // Fill initial inventory items (no sword - melee is built-in, no gold - gold is currency)
        player.inventory.push(createItem(ItemType.ARROW, GAME_CONFIG.initialAmmo[ItemType.ARROW]));  // Initial arrows
        player.inventory.push(createItem(ItemType.WOOD, GAME_CONFIG.initialBlocks[ItemType.WOOD]));
        player.inventory.push(createItem(ItemType.STONE, GAME_CONFIG.initialBlocks[ItemType.STONE]));
        player.inventory.push(createItem(ItemType.DIAMOND, GAME_CONFIG.initialBlocks[ItemType.DIAMOND]));

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
            () => this.state, 
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
            },
            (playerId, position, angle) => {
                this.performMeleeAttack(playerId, position, angle);
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
        
        // 禁止丢弃永久武器（剑）
        if (item.itemId === ItemType.SWORD) {
            console.warn(`Cannot drop permanent weapon: ${item.itemId}`);
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
     * Add item to player's inventory (or gold to currency)
     */
    pickupItem(player: Player, dropId: string, drop: DroppedItem) {
        // Special handling for gold - add directly to player's gold currency
        if (drop.itemType === ItemType.GOLD_INGOT) {
            player.gold += drop.count;
            this.state.entities.delete(dropId);
            console.log(`Player picked up ${drop.count} gold. Total: ${player.gold}`);
            this.updateTeamGold();
            return;
        }
        
        const itemDef = ITEM_DEFINITIONS[drop.itemType as ItemType];
        let remaining = drop.count;
        const originalCount = drop.count;

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
        } else if (remaining === originalCount) {
            // Nothing could be picked up - inventory completely full
            // Rate limit notifications (max once per 2 seconds per player)
            const now = Date.now();
            const lastNotification = this.lastInventoryFullNotification.get(player.ownerSessionId) || 0;
            
            if (now - lastNotification > 2000) {
                const client = this.clients.find(c => c.sessionId === player.ownerSessionId);
                if (client) {
                    client.send("notification", {
                        text: "Inventory Full!",
                        color: "#ff4444"
                    });
                }
                this.lastInventoryFullNotification.set(player.ownerSessionId, now);
            }
            console.log(`Player could not pick up ${drop.itemType} - inventory full`);
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
     * @param generatorType - The type of loot table to use
     * @param x - X position
     * @param y - Y position  
     * @param locationType - 'base' or 'center' to determine spawn rate
     */
    createResourceGenerator(generatorType: string, x: number, y: number, locationType: 'base' | 'center' = 'base'): string {
        const genId = `generator_${Math.random().toString(36).substr(2, 9)}`;
        const generator = new ResourceGenerator();
        generator.type = EntityType.RESOURCE_GENERATOR;
        generator.generatorType = generatorType;
        generator.locationType = locationType;
        generator.x = x;
        generator.y = y;
        generator.lastSpawnTime = Date.now();
        generator.nearbyDropCount = 0;

        this.state.entities.set(genId, generator);
        console.log(`Created ${locationType} resource generator: ${genId} (${generatorType}) at (${x}, ${y})`);

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
                
                // 根据位置类型获取配置
                const config = generator.locationType === 'center' 
                    ? RESOURCE_GENERATOR_CONFIG.center 
                    : RESOURCE_GENERATOR_CONFIG.base;

                // Check if it's time to spawn
                if (now - generator.lastSpawnTime >= config.spawnInterval) {
                    // Count nearby drops
                    const nearbyCount = this.countNearbyDrops(generator.x, generator.y, config.spawnRadius);

                    if (nearbyCount < config.maxDropsNearby) {
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
        
        // 获取正确的配置
        const config = generator.locationType === 'center' 
            ? RESOURCE_GENERATOR_CONFIG.center 
            : RESOURCE_GENERATOR_CONFIG.base;

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
                const distance = Math.random() * config.spawnRadius;
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
    
    addKillFeed(killerId: string | null, victimOrId: string | Player, environmentMessage?: string) {
        // Get victim player
        let victim: Player | null = null;
        let victimId: string = "";
        
        if (typeof victimOrId === "string") {
            victim = this.state.entities.get(victimOrId) as Player;
            victimId = victimOrId;
        } else {
            victim = victimOrId;
            victimId = victim.ownerSessionId || "";
        }
        
        if (!victim) return;
        
        const victimName = victim.username || victimId;
        let killMessage: string;
        
        if (killerId === null || environmentMessage) {
            // Environmental death
            killMessage = `${victimName} ${environmentMessage || "died"}`;
        } else {
            const killer = this.state.entities.get(killerId) as Player;
            if (!killer) return;
            
            // Track team kills
            if (killer.teamId === TeamType.RED) {
                this.state.redKills++;
            } else if (killer.teamId === TeamType.BLUE) {
                this.state.blueKills++;
            }
            
            const killerName = killer.username || killerId;
            killMessage = `${killerName} eliminated ${victimName}`;
        }
        
        this.state.killFeed.push(killMessage);
        if (this.state.killFeed.length > 5) {
            this.state.killFeed.shift();
        }
        
        console.log(killMessage);
    }
    
    /**
     * Update team gold totals by summing all players' gold
     */
    updateTeamGold() {
        let redGold = 0;
        let blueGold = 0;
        
        this.state.entities.forEach((entity) => {
            if (entity instanceof Player) {
                const player = entity as Player;
                // Sum gold from player's currency field
                if (player.teamId === TeamType.RED) {
                    redGold += player.gold;
                } else if (player.teamId === TeamType.BLUE) {
                    blueGold += player.gold;
                }
            }
        });
        
        this.state.redGold = redGold;
        this.state.blueGold = blueGold;
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
            const playerState = this.state.rematchReady.get(sessionId);
            const isReady = playerState ? playerState.isReady : false;
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


    checkTNTExplosions() {
        const now = Date.now();
        const explodedIds: string[] = [];
        
        for (const [blockId, data] of this.tntExplosions.entries()) {
            if (now >= data.explodeTime) {
                const block = this.state.entities.get(blockId) as Block;
                if (block) {
                    this.createExplosion(block.x, block.y, GAME_CONFIG.tntExplosionRadius, GAME_CONFIG.tntDamage, data.sourceId);
                    
                    // Destroy the TNT block itself
                    this.removeBlock(blockId);
                    explodedIds.push(blockId);
                } else {
                    // Block already destroyed (maybe by another explosion)
                    explodedIds.push(blockId);
                }
            }
        }
        
        // Cleanup triggered explosions
        explodedIds.forEach(id => this.tntExplosions.delete(id));
    }
    
    createExplosion(x: number, y: number, radius: number, damage: number, sourceId: string) {
        console.log(`Explosion at ${x}, ${y} radius ${radius}`);
        
        // Broadcast explosion effect to clients (using a special message or just rely on state changes)
        // For visuals, we can send a message
        this.broadcast("explosion", { x, y, radius });
        
        // Find entities in range
        // 1. Players
        this.state.entities.forEach((entity, id) => {
            if (entity instanceof Player && !entity.isDead) {
                const dx = entity.x - x;
                const dy = entity.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= radius) {
                    // Damage falloff? Let's keep it simple first: full damage
                    // Or linear falloff: damage * (1 - distance/radius)
                    const damageFactor = 1 - (distance / radius) * 0.5; // Min 50% damage at edge
                    const actualDamage = Math.floor(damage * damageFactor);
                    
                    entity.hp -= actualDamage;
                    console.log(`Player ${id} hit by explosion: -${actualDamage} HP`);
                    
                    // Knockback
                    const angle = Math.atan2(dy, dx);
                    const knockbackForce = GAME_CONFIG.tntKnockback * damageFactor;
                    
            const agent = this.agents.get(id);
                    if (agent && agent.body) {
                        Matter.Body.setVelocity(agent.body, {
                            x: Math.cos(angle) * knockbackForce,
                            y: Math.sin(angle) * knockbackForce
                        });
                    }
                    
                    // Track damage/kills
                    const sourcePlayer = this.state.entities.get(sourceId) as Player;
                    if (sourcePlayer && sourceId !== id) {
                        sourcePlayer.damageDealt += actualDamage;
                    }
                    
                    // Check death
                    if (this.checkPlayerDeath(id) && sourcePlayer && sourceId !== id) {
                        sourcePlayer.kills++;
                        this.addKillFeed(sourceId, id);
                    }
                }
            } else if (entity instanceof Block && entity.hp > 0) {
                 // 2. Blocks (Destroy destructible blocks)
                 const dx = entity.x - x;
                 const dy = entity.y - y;
                 const distance = Math.sqrt(dx * dx + dy * dy);
                 
                 if (distance <= radius) {
                     // Deal massive damage to blocks to destroy them
                     entity.hp -= 1000;
                     if (entity.hp <= 0) {
                         // If it's a TNT block that hasn't exploded yet, trigger it immediately (chain reaction)
                         // But with a small delay to look cool? Or instant?
                         // For now, just destroy it. If we want chain reaction, we'd need to check type
                         if ((entity as Block).blockType === ItemType.TNT) {
                             // Chain reaction!
                             // We can either trigger it now or let the loop handle it
                             // If we destroy it here, removeBlock calls state.delete, so the loop won't find it
                             // So we should manually trigger explosion for it?
                             // Simpler: Just let it be destroyed for now. 
                             // To implement chain reaction: 
                             // Check if it's in tntExplosions map, if so, set its time to NOW.
                             const tntData = this.tntExplosions.get(id);
                             if (tntData) {
                                 tntData.explodeTime = Date.now(); // Explode next tick
                                 // Don't destroy it yet, let the loop handle it
                                 entity.hp = 1; // Keep it alive for one tick
                                 return; 
                             }
                         }
                         
                         this.removeBlock(id);
                     }
                 }
            } else if (entity instanceof Bed) {
                // 3. Beds (Optional: can TNT destroy beds?)
                // Let's say yes for now
                const dx = entity.x - x;
                const dy = entity.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= radius) {
                    entity.hp -= damage;
                    console.log(`Bed ${entity.teamId} hit by explosion: -${damage} HP`);
                    
                    if (entity.hp <= 0) {
                        // Handle bed destruction
                         const bedId = `bed_${entity.teamId}`;
                         const bedBody = this.bedBodies.get(bedId);
                        if (bedBody) {
                            Matter.Composite.remove(this.engine.world, bedBody);
                            this.bedBodies.delete(bedId);
                        }
                        console.log(`Bed ${entity.teamId} DESTROYED by TNT!`);
                    }
                }
            }
        });
    }

    createRematchRoom() {
        console.log('Creating new room for rematch...');
        
        // Collect all player information
        const teamAssignments: { sessionId: string; username: string; team: string }[] = [];
        
        for (const client of this.clients) {
            // Find player entity to get team and username
            let playerTeam = '';
            let playerUsername = '';
            
            this.state.entities.forEach((entity, id) => {
                if (entity.type === EntityType.PLAYER) {
                    const player = entity as Player;
                    if (player.ownerSessionId === client.sessionId) {
                        playerTeam = player.teamId;
                        playerUsername = player.username || `Player_${client.sessionId.substring(0, 8)}`;
                    }
                }
            });
            
            if (playerTeam) {
                teamAssignments.push({
                    sessionId: client.sessionId,
                    username: playerUsername,
                    team: playerTeam
                });
            }
        }
        
        console.log('Rematch team assignments:', teamAssignments);
        
        // Notify all clients to join new game room
        this.broadcast("rematch_starting", {
            roomId: "game_room",
            teams: teamAssignments
        });
        
        // Close current room after a delay to allow clients to receive the message
        setTimeout(() => {
            console.log('Closing current room for rematch...');
            this.disconnect();
        }, 1000);
    }
}
