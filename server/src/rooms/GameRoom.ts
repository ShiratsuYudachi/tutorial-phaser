
import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, Player, Bullet, InputData, Entity } from "../shared/Schema";
import { GAME_CONFIG, WALLS, COLLISION_CATEGORIES } from "../shared/Constants";
import { Agent } from "../entities/Agent";
import { PlayerAgent } from "../entities/PlayerAgent";

export class GameRoom extends Room<GameState> {
    fixedTimeStep = 1000 / 60;
    elapsedTime = 0;

    engine: Matter.Engine;

    agents = new Map<string, Agent>();
    bulletBodies = new Map<string, Matter.Body>();

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

        // 3. Collision Events
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => this.handleCollision(pair.bodyA, pair.bodyB));
        });

        // Handle Input
        this.onMessage(0, (client, input: InputData) => {
            const player = this.state.entities.get(client.sessionId) as Player;
            if (player && player.inputQueue) {
                player.inputQueue.push(input);
            }
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

    handleCollision(bodyA: Matter.Body, bodyB: Matter.Body) {
        const isBulletA = bodyA.label.startsWith('bullet_');
        const isBulletB = bodyB.label.startsWith('bullet_');

        if (isBulletA || isBulletB) {
            const bulletBody = isBulletA ? bodyA : bodyB;
            const otherBody = isBulletA ? bodyB : bodyA;

            const bulletId = bulletBody.label.split('_')[1];
            const bullet = this.state.entities.get(bulletId) as Bullet;
            if (!bullet) return;

            if (otherBody.label.startsWith('player_')) {
                const targetSessionId = otherBody.label.split('_')[1];
                if (bullet.ownerId === targetSessionId) return;

                console.log(`Player ${targetSessionId} hit by ${bullet.ownerId} `);
                this.respawnPlayer(targetSessionId);
            }

            this.removeBullet(bulletId);
        }
    }

    fixedTick(deltaTime: number) {
        // 1. Logic Update (Behaviors)
        this.agents.forEach(agent => agent.update(deltaTime));

        // 2. Physics Update
        Matter.Engine.update(this.engine, deltaTime);

        // 3. Post Update (Sync)
        this.agents.forEach(agent => agent.postUpdate(deltaTime));

        // Sync Bullets (Legacy/Simple way for now)
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
    }

    spawnBullet(ownerId: string, position: { x: number, y: number }) {
        const bulletId = Math.random().toString(36).substr(2, 9);
        const bullet = new Bullet();
        bullet.type = 'bullet';
        bullet.x = position.x;
        bullet.y = position.y;
        bullet.ownerId = ownerId;

        // Default shooting right for now
        const angle = 0;
        const velocityX = Math.cos(angle) * GAME_CONFIG.bulletSpeed;
        const velocityY = Math.sin(angle) * GAME_CONFIG.bulletSpeed;

        bullet.velocityX = velocityX;
        bullet.velocityY = velocityY;

        this.state.entities.set(bulletId, bullet);

        const body = Matter.Bodies.circle(position.x, position.y, GAME_CONFIG.bulletRadius, {
            label: `bullet_${bulletId} `,
            isSensor: true,
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
        this.state.entities.delete(bulletId);
    }

    respawnPlayer(sessionId: string) {
        const agent = this.agents.get(sessionId);
        if (agent && agent.body) {
            const x = Math.random() * this.state.mapWidth;
            const y = Math.random() * this.state.mapHeight;

            Matter.Body.setPosition(agent.body, { x, y });
            Matter.Body.setVelocity(agent.body, { x: 0, y: 0 });
        }
    }

    onJoin(client: Client) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        player.type = 'player';

        const x = Math.random() * this.state.mapWidth;
        const y = Math.random() * this.state.mapHeight;

        player.x = x;
        player.y = y;
        console.log(`Spawning player ${client.sessionId} at ${x}, ${y}`);

        this.state.entities.set(client.sessionId, player);

        // Create Agent
        const agent = new PlayerAgent(client.sessionId, this.engine.world, player, (ownerId, pos) => {
            this.spawnBullet(ownerId, pos);
        });
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

