
import Phaser from "phaser";
import { Room, Client, getStateCallbacks } from "colyseus.js";
import { BACKEND_URL } from "../backend";

// 导入共享类型
import type { GameState } from "../../../server/src/shared/Schema";
import { GAME_CONFIG, WALLS } from "../../../server/src/shared/Constants";
// 不再需要 GameLogic 中的函数，因为客户端不进行计算
import { InputData } from "../../../server/src/shared/Schema"; // InputData 现在在 Schema 中定义

export class GameScene extends Phaser.Scene {
    room: Room<GameState>;

    currentPlayer: Phaser.GameObjects.Container;
    playerEntities: { [sessionId: string]: Phaser.GameObjects.Container } = {};
    bulletEntities: { [id: string]: Phaser.GameObjects.Arc } = {};

    cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    spaceKey: Phaser.Input.Keyboard.Key;

    // 输入状态
    inputPayload: InputData = {
        left: false,
        right: false,
        up: false,
        down: false,
        shoot: false,
        tick: 0,
    };

    currentTick: number = 0;
    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;

    constructor() {
        super({ key: "game" });
    }

    preload() {
        this.load.image('ship_0001', 'assets/ship_0001.png');
    }

    async create() {
        // 1. 绘制地图和墙体
        this.createMap();

        // 2. 设置输入
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // 3. 连接服务器
        await this.connect();

        // 4. 设置摄像机
        this.cameras.main.setBounds(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
    }

    createMap() {
        // 绘制边界
        this.add.rectangle(GAME_CONFIG.mapWidth/2, GAME_CONFIG.mapHeight/2, 
            GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight).setStrokeStyle(4, 0xffffff);

        // 绘制墙体
        const graphics = this.add.graphics();
        graphics.fillStyle(0x888888, 1);
        
        WALLS.forEach(wall => {
            graphics.fillRect(wall.x, wall.y, wall.width, wall.height);
        });
    }

    async connect() {
        const client = new Client(BACKEND_URL);

        try {
            this.room = await client.joinOrCreate<GameState>("game_room", {});
            const state = this.room.state;
            const $ = getStateCallbacks(this.room);

            // --- 监听玩家 ---
            $(state).players.onAdd((player, sessionId) => {
                // 创建玩家容器 (飞船 + 名字)
                const container = this.add.container(player.x, player.y);
                const ship = this.add.image(0, 0, 'ship_0001');
                ship.setOrigin(0.5, 0.5);
                container.add(ship);
                
                // 如果是自己，用绿色标记
                if (sessionId === this.room.sessionId) {
                    ship.setTint(0x00ff00);
                    this.currentPlayer = container;
                    // 摄像机跟随
                    this.cameras.main.startFollow(this.currentPlayer);
                } else {
                    ship.setTint(0xff0000); // 敌人红色
                }

                this.playerEntities[sessionId] = container;

                // 监听位置变化 (所有玩家，包括自己，都使用插值更新)
                $(player).onChange(() => {
                    container.setData('serverX', player.x);
                    container.setData('serverY', player.y);
                });
            });

            $(state).players.onRemove((player, sessionId) => {
                const entity = this.playerEntities[sessionId];
                if (entity) {
                    entity.destroy();
                    delete this.playerEntities[sessionId];
                }
            });

            // --- 监听子弹 ---
            $(state).bullets.onAdd((bullet, id) => {
                // 简单的圆形子弹
                const circle = this.add.circle(bullet.x, bullet.y, GAME_CONFIG.bulletRadius, 0xffff00);
                this.bulletEntities[id] = circle;

                $(bullet).onChange(() => {
                    // 子弹直接插值
                    circle.setData('serverX', bullet.x);
                    circle.setData('serverY', bullet.y);
                });
            });

            $(state).bullets.onRemove((bullet, id) => {
                const entity = this.bulletEntities[id];
                if (entity) {
                    entity.destroy();
                    delete this.bulletEntities[id];
                }
            });

        } catch (e) {
            console.error("Join error", e);
        }
    }

    update(time: number, delta: number): void {
        if (!this.currentPlayer) return;

        this.elapsedTime += delta;
        while (this.elapsedTime >= this.fixedTimeStep) {
            this.elapsedTime -= this.fixedTimeStep;
            this.fixedTick();
        }

        // 插值平滑渲染 (包括自己)
        this.interpolateEntities();
    }

    fixedTick() {
        this.currentTick++;

        // 1. 收集输入
        this.inputPayload.left = this.cursorKeys.left.isDown;
        this.inputPayload.right = this.cursorKeys.right.isDown;
        this.inputPayload.up = this.cursorKeys.up.isDown;
        this.inputPayload.down = this.cursorKeys.down.isDown;
        this.inputPayload.shoot = this.spaceKey.isDown;
        this.inputPayload.tick = this.currentTick;

        // 2. 发送给服务器
        this.room.send(0, this.inputPayload);

        // 3. 客户端预测 (暂时移除)
        // 因为服务端现在使用 Matter.js 物理，客户端简单的线性预测会导致位置不同步和抖动。
        // 暂时采用完全信任服务端 + 插值的模式。
    }

    interpolateEntities() {
        // 插值比例 (0.2 = 20% per frame)
        const t = 0.2;

        // 玩家插值
        for (const sessionId in this.playerEntities) {
            const entity = this.playerEntities[sessionId];
            
            // 确保有目标数据
            if (entity.getData('serverX') !== undefined) {
                entity.x = Phaser.Math.Linear(entity.x, entity.getData('serverX'), t);
                entity.y = Phaser.Math.Linear(entity.y, entity.getData('serverY'), t);
            }
        }

        // 子弹插值
        for (const id in this.bulletEntities) {
            const entity = this.bulletEntities[id];
            if (entity.getData('serverX') !== undefined) {
                entity.x = Phaser.Math.Linear(entity.x, entity.getData('serverX'), t);
                entity.y = Phaser.Math.Linear(entity.y, entity.getData('serverY'), t);
            }
        }
    }
}
