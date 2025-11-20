
import Phaser from "phaser";
import { Room, Client, getStateCallbacks } from "colyseus.js";
import { BACKEND_URL } from "../backend";

import type { GameState } from "../../../server/src/shared/Schema";
import { Player, Bullet, Block, Bed, Entity } from "../../../server/src/shared/Schema";
import { GAME_CONFIG, WALLS } from "../../../server/src/shared/Constants";
import { InputData } from "../../../server/src/shared/Schema";

export class GameScene extends Phaser.Scene {
    room: Room<GameState>;

    // 统一管理所有可视对象 (id -> GameObject)
    entityVisuals = new Map<string, Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle>();

    currentPlayerId: string;
    cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    spaceKey: Phaser.Input.Keyboard.Key;

    inputPayload: InputData = {
        left: false, right: false, up: false, down: false,
        shoot: false, tick: 0,
    };

    currentTick: number = 0;
    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;

    constructor() { super({ key: "game" }); }

    preload() {
        // No assets to preload for now
    }

    async create() {
        this.createMap();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        await this.connect();
        this.cameras.main.setBounds(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
    }

    createMap() {
        this.add.rectangle(GAME_CONFIG.mapWidth / 2, GAME_CONFIG.mapHeight / 2,
            GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight).setStrokeStyle(4, 0xffffff);

        const graphics = this.add.graphics();
        graphics.fillStyle(0x888888, 1);
        WALLS.forEach(wall => graphics.fillRect(wall.x, wall.y, wall.width, wall.height));
    }

    async connect() {
        const client = new Client(BACKEND_URL);
        try {
            this.room = await client.joinOrCreate<GameState>("game_room", {});
            const state = this.room.state;
            const $ = getStateCallbacks(this.room);

            // 使用 $ 语法监听 entities 集合
            $(state).entities.onAdd((entity, id) => {
                let visual;

                // --- 1. 判断类型并创建 ---
                if (entity instanceof Player) {
                    visual = this.createPlayer(entity, id);
                } else if (entity instanceof Bullet) {
                    visual = this.createBullet(entity);
                } else if (entity instanceof Block) {
                    visual = this.createBlock(entity);
                } else if (entity instanceof Bed) {
                    visual = this.createBed(entity);
                }

                if (visual) {
                    this.entityVisuals.set(id, visual);

                    // --- 2. 监听数据变化 (统一处理位置同步) ---
                    $(entity).onChange(() => {
                        visual.setData('serverX', entity.x);
                        visual.setData('serverY', entity.y);
                    });
                }
            });

            $(state).entities.onRemove((entity, id) => {
                const visual = this.entityVisuals.get(id);
                if (visual) {
                    visual.destroy();
                    this.entityVisuals.delete(id);
                }
            });

        } catch (e) {
            console.error("Join error", e);
        }
    }

    createPlayer(player: Player, id: string) {
        const container = this.add.container(player.x, player.y);

        // Draw a simple triangle ship
        const ship = this.add.graphics();

        // Color based on ID (self vs others)
        const color = (id === this.room.sessionId) ? 0x00ff00 : 0xff0000;

        ship.fillStyle(color, 1);
        // Draw a triangle pointing right (0 degrees)
        // Tip: (0,0) is center. 
        // Points: Tip(15, 0), BackLeft(-10, -10), BackRight(-10, 10)
        ship.fillTriangle(15, 0, -10, -10, -10, 10);

        container.add(ship);

        if (id === this.room.sessionId) {
            this.currentPlayerId = id;
            this.cameras.main.startFollow(container);
        }

        return container;
    }

    createBullet(bullet: Bullet) {
        return this.add.circle(bullet.x, bullet.y, GAME_CONFIG.bulletRadius, 0xffff00);
    }

    createBlock(block: Block) {
        // 假设 block 是正方形
        return this.add.rectangle(block.x, block.y, 40, 40, 0x884400);
    }

    createBed(bed: Bed) {
        return this.add.rectangle(bed.x, bed.y, 60, 40, 0x0000ff);
    }

    update(time: number, delta: number): void {
        if (!this.room) return;

        // Fixed Tick Loop
        this.elapsedTime += delta;
        while (this.elapsedTime >= this.fixedTimeStep) {
            this.elapsedTime -= this.fixedTimeStep;
            this.fixedTick();
        }

        // Interpolation Loop
        const t = 0.2;
        this.entityVisuals.forEach((visual, id) => {
            // 对所有实体进行插值
            if (visual.getData('serverX') !== undefined) {
                visual.x = Phaser.Math.Linear(visual.x, visual.getData('serverX'), t);
                visual.y = Phaser.Math.Linear(visual.y, visual.getData('serverY'), t);
            }
        });
    }

    fixedTick() {
        this.currentTick++;

        this.inputPayload.left = this.cursorKeys.left.isDown;
        this.inputPayload.right = this.cursorKeys.right.isDown;
        this.inputPayload.up = this.cursorKeys.up.isDown;
        this.inputPayload.down = this.cursorKeys.down.isDown;
        this.inputPayload.shoot = this.spaceKey.isDown;
        this.inputPayload.tick = this.currentTick;

        this.room.send(0, this.inputPayload);
    }
}
