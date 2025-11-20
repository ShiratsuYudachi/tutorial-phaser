
import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, Player, Bullet, InputData } from "../shared/Schema";
import { GAME_CONFIG, WALLS, COLLISION_CATEGORIES } from "../shared/Constants";
import { applyInput } from "../shared/GameLogic";

export class GameRoom extends Room<GameState> {
    fixedTimeStep = 1000 / 60;
    elapsedTime = 0;

    engine: Matter.Engine;
    
    // 映射: sessionId -> Matter.Body
    playerBodies = new Map<string, Matter.Body>();
    bulletBodies = new Map<string, Matter.Body>();

    onCreate(options: any) {
        this.setState(new GameState());
        this.state.mapWidth = GAME_CONFIG.mapWidth;
        this.state.mapHeight = GAME_CONFIG.mapHeight;

        // 1. 初始化物理引擎
        this.engine = Matter.Engine.create();
        this.engine.gravity.y = 0; // 顶视角，无重力

        // 2. 创建墙体
        WALLS.forEach(wall => {
            // Matter.Bodies.rectangle 使用中心点，而我们的 WALLS 使用左上角
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

        // 3. 监听碰撞
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => this.handleCollision(pair.bodyA, pair.bodyB));
        });

        // 处理输入
        this.onMessage(0, (client, input: InputData) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.inputQueue.push(input);
            }
        });

        // 模拟循环
        this.setSimulationInterval((deltaTime) => {
            this.elapsedTime += deltaTime;
            while (this.elapsedTime >= this.fixedTimeStep) {
                this.elapsedTime -= this.fixedTimeStep;
                this.fixedTick(this.fixedTimeStep);
            }
        });
    }

    handleCollision(bodyA: Matter.Body, bodyB: Matter.Body) {
        // 简单的逻辑：检测子弹
        const isBulletA = bodyA.label.startsWith('bullet_');
        const isBulletB = bodyB.label.startsWith('bullet_');

        if (isBulletA || isBulletB) {
            const bulletBody = isBulletA ? bodyA : bodyB;
            const otherBody = isBulletA ? bodyB : bodyA;
            
            const bulletId = bulletBody.label.split('_')[1];

            // 获取子弹对象以检查 owner
            const bullet = this.state.bullets.get(bulletId);
            if (!bullet) return; // 已经处理过了

            // 如果撞到玩家
            if (otherBody.label.startsWith('player_')) {
                const targetSessionId = otherBody.label.split('_')[1];
                
                // 防止打到自己
                if (bullet.ownerId === targetSessionId) return;

                console.log(`Player ${targetSessionId} hit by ${bullet.ownerId}`);
                this.respawnPlayer(targetSessionId);
            }

            // 无论撞到什么（墙或人），子弹都销毁
            this.removeBullet(bulletId);
        }
    }

    fixedTick(deltaTime: number) {
        // 1. 应用输入
        this.state.players.forEach((player, sessionId) => {
            const body = this.playerBodies.get(sessionId);
            if (!body) return;

            // Matter.Body.setAngle(body, 0); // 锁定旋转

            let input: InputData;
            while (input = player.inputQueue.shift()) {
                applyInput(body, input);
                player.tick = input.tick;

                if (input.shoot) {
                    const now = Date.now();
                    if (now - player.lastShootTime > GAME_CONFIG.fireRate) {
                        this.spawnBullet(sessionId, body.position);
                        player.lastShootTime = now;
                    }
                }
            }
        });

        // 2. 物理步进
        Matter.Engine.update(this.engine, deltaTime);

        // 3. 同步状态：物理世界 -> State
        this.state.players.forEach((player, sessionId) => {
            const body = this.playerBodies.get(sessionId);
            if (body) {
                player.x = body.position.x;
                player.y = body.position.y;
            }
        });

        this.state.bullets.forEach((bullet, bulletId) => {
            const body = this.bulletBodies.get(bulletId);
            if (body) {
                bullet.x = body.position.x;
                bullet.y = body.position.y;
                
                // 简单的边界检查
                if (bullet.x < 0 || bullet.x > this.state.mapWidth || 
                    bullet.y < 0 || bullet.y > this.state.mapHeight) {
                    this.removeBullet(bulletId);
                }
            }
        });
    }

    createPlayerBody(sessionId: string, x: number, y: number) {
        const body = Matter.Bodies.circle(x, y, GAME_CONFIG.playerRadius, {
            label: `player_${sessionId}`,
            frictionAir: 0.1, // 增加空气阻力，让玩家松手后会停下来
            collisionFilter: {
                category: COLLISION_CATEGORIES.PLAYER,
                mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.BULLET | COLLISION_CATEGORIES.PLAYER // 允许玩家互挤
            }
        });
        Matter.Composite.add(this.engine.world, body);
        this.playerBodies.set(sessionId, body);
    }

    spawnBullet(ownerId: string, position: {x: number, y: number}) {
        const bulletId = Math.random().toString(36).substr(2, 9);
        const bullet = new Bullet();
        bullet.x = position.x;
        bullet.y = position.y;
        bullet.ownerId = ownerId;
        
        // 为了简单，暂时默认向右射击
        // 实际上应该根据 Input 中的鼠标角度，或者玩家移动方向
        const angle = 0; 
        const velocityX = Math.cos(angle) * GAME_CONFIG.bulletSpeed;
        const velocityY = Math.sin(angle) * GAME_CONFIG.bulletSpeed;

        bullet.velocityX = velocityX;
        bullet.velocityY = velocityY;

        this.state.bullets.set(bulletId, bullet);

        const body = Matter.Bodies.circle(position.x, position.y, GAME_CONFIG.bulletRadius, {
            label: `bullet_${bulletId}`,
            isSensor: true, // 传感器模式：只检测碰撞，不产生物理推挤
            frictionAir: 0,
            collisionFilter: {
                category: COLLISION_CATEGORIES.BULLET,
                mask: COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.PLAYER
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
        this.state.bullets.delete(bulletId);
    }

    respawnPlayer(sessionId: string) {
        const body = this.playerBodies.get(sessionId);
        if (body) {
            const x = Math.random() * this.state.mapWidth;
            const y = Math.random() * this.state.mapHeight;
            
            // Matter.js 重置位置和速度
            Matter.Body.setPosition(body, { x, y });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
    }

    onJoin(client: Client) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        
        const x = Math.random() * this.state.mapWidth;
        const y = Math.random() * this.state.mapHeight;
        
        player.x = x;
        player.y = y;
        
        this.state.players.set(client.sessionId, player);
        this.createPlayerBody(client.sessionId, x, y);
    }

    onLeave(client: Client) {
        console.log(client.sessionId, "left!");
        const body = this.playerBodies.get(client.sessionId);
        if (body) {
            Matter.Composite.remove(this.engine.world, body);
            this.playerBodies.delete(client.sessionId);
        }
        this.state.players.delete(client.sessionId);
    }
}
