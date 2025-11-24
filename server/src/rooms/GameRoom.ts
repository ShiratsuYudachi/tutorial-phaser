import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, Player, Bullet, InputData, Entity, Bed, Block, InventoryItem } from "../shared/Schema";
import { GAME_CONFIG, WALLS, COLLISION_CATEGORIES, WEAPON_CONFIG, BLOCK_CONFIG, INVENTORY_SIZE, EntityType, TeamType, ItemType, WeaponItem, BlockItem, isWeapon, isBlock, SHOP_TRADES, ITEM_DEFINITIONS } from "../shared/Constants";
import { Agent } from "../entities/Agent";
import { PlayerAgent } from "../entities/PlayerAgent";

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
            const player = this.state.entities.get(client.sessionId) as Player;
            if (player && player.inputQueue && !player.isDead) {
                player.inputQueue.push(input);
            }
        });

        // Inventory Actions
        this.onMessage("inventory_action", (client, data: any) => {
            const player = this.state.entities.get(client.sessionId) as Player;
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

        // Shop Trade
        this.onMessage("shop_trade", (client, data: { tradeId: string }) => {
            const player = this.state.entities.get(client.sessionId) as Player;
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

        // Simulation Loop
        this.setSimulationInterval((deltaTime) => {
            this.elapsedTime += deltaTime;
            while (this.elapsedTime >= this.fixedTimeStep) {
                this.elapsedTime -= this.fixedTimeStep;
                this.fixedTick(this.fixedTimeStep);
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
                const targetSessionId = otherBody.label.split('_')[1].trim();
                if (bullet.ownerId === targetSessionId) return; // 不能打自己

                const targetPlayer = this.state.entities.get(targetSessionId) as Player;
                if (targetPlayer && !targetPlayer.isDead) {
                    // 扣血
                    targetPlayer.hp -= bullet.damage;
                    console.log(`Player ${targetSessionId} hit by ${bullet.ownerId}, HP: ${targetPlayer.hp}/${targetPlayer.maxHP}`);
                    
                    // 检查死亡
                    this.checkPlayerDeath(targetSessionId);
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
    
    checkPlayerDeath(sessionId: string) {
        const player = this.state.entities.get(sessionId) as Player;
        if (!player) return;
        
        if (player.hp <= 0 && !player.isDead) {
            player.isDead = true;
            console.log(`Player ${sessionId} (${player.teamId}) died!`);
            
            // 隐藏玩家（通过Agent）
            const agent = this.agents.get(sessionId);
            if (agent && agent.body) {
                // 移动到地图外
                Matter.Body.setPosition(agent.body, { x: -1000, y: -1000 });
                Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
            }
            
            // 开始重生倒计时
            this.startRespawn(sessionId);
        }
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
        // 1. Logic Update (Behaviors)
        this.agents.forEach(agent => agent.update(deltaTime));

        // 2. Physics Update
        Matter.Engine.update(this.engine, deltaTime);

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

    onJoin(client: Client) {
        console.log(client.sessionId, "joined!");
        
        // 分配队伍：第一个玩家=红队，第二个玩家=蓝队
        const teamId = this.teamAssignments.length === 0 ? TeamType.RED : TeamType.BLUE;
        this.teamAssignments.push(client.sessionId);
        
        const player = new Player();
        player.type = EntityType.PLAYER;
        player.teamId = teamId;
        player.hp = GAME_CONFIG.playerMaxHP;
        player.maxHP = GAME_CONFIG.playerMaxHP;
        player.isDead = false;
        player.respawnTime = 0;
        
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
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        
        console.log(`Spawning player ${client.sessionId} (${teamId} team) at ${spawnPos.x}, ${spawnPos.y}`);

        this.state.entities.set(client.sessionId, player);

        // Create Agent
        const agent = new PlayerAgent(
            client.sessionId, 
            this.engine.world, 
            player, 
            (ownerId, pos, aimAngle, weaponType) => {
                this.spawnBullet(ownerId, pos, aimAngle, weaponType);
            },
            (playerId, x, y, blockType) => {
                this.placeBlock(playerId, x, y, blockType);
            }
        );
        this.agents.set(client.sessionId, agent);
    }

    onLeave(client: Client) {
        console.log(client.sessionId, "left!");
        const agent = this.agents.get(client.sessionId);
        if (agent) {
            agent.destroy();
            this.agents.delete(client.sessionId);
        }
        this.state.entities.delete(client.sessionId);
    }
}
