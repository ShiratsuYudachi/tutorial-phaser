
import Phaser from "phaser";
import { Room, Client, getStateCallbacks } from "colyseus.js";
import { BACKEND_URL } from "../backend";

import type { GameState } from "../../../server/src/shared/Schema";
import { Player, Bullet, Block, Bed, Entity } from "../../../server/src/shared/Schema";
import { GAME_CONFIG, WALLS, WEAPON_CONFIG, WeaponType, BLOCK_CONFIG, BlockType } from "../../../server/src/shared/Constants";
import { InputData } from "../../../server/src/shared/Schema";

export class GameScene extends Phaser.Scene {
    room: Room<GameState>;

    // 统一管理所有可视对象 (id -> GameObject)
    entityVisuals = new Map<string, Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle>();

    currentPlayerId: string;
    cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    mousePointer: Phaser.Input.Pointer;
    // 添加这4行 ↓
    wKey: Phaser.Input.Keyboard.Key;
    aKey: Phaser.Input.Keyboard.Key;
    sKey: Phaser.Input.Keyboard.Key;
    dKey: Phaser.Input.Keyboard.Key;
    // 武器切换按键
    key1: Phaser.Input.Keyboard.Key;
    key2: Phaser.Input.Keyboard.Key;
    key3: Phaser.Input.Keyboard.Key;
    // 建造模式按键
    bKey: Phaser.Input.Keyboard.Key;
    // 武器UI
    weaponText: Phaser.GameObjects.Text;
    // 建造UI
    inventoryText: Phaser.GameObjects.Text;
    buildModeText: Phaser.GameObjects.Text;
    blockPreview: Phaser.GameObjects.Rectangle;
    gridGraphics: Phaser.GameObjects.Graphics;
    
    // 音效
    bowShootSound: Phaser.Sound.BaseSound;      // 弓箭音效
    fireballShootSound: Phaser.Sound.BaseSound; // 火球音效
    dartShootSound: Phaser.Sound.BaseSound;     // 飞镖音效
    placeBlockSound: Phaser.Sound.BaseSound;
    lastMouseDown: boolean = false; // 追踪上一帧鼠标状态，避免重复播放音效
    
    inputPayload: InputData = {
        left: false, right: false, up: false, down: false,
        shoot: false, tick: 0, aimAngle: 0,
    };

    currentTick: number = 0;
    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;

    constructor() { super({ key: "game" }); }

    preload() {
        // 生成简单的合成音效
        this.generateSoundEffects();
    }
    
    generateSoundEffects() {
        // 生成弓箭音效（中频）
        const bowBuffer = this.generateWeaponSound(600, 0.12, 20);
        if (bowBuffer && this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.cache.audio.add('bow_shoot', bowBuffer);
        }
        
        // 生成火球音效（低频、更长）
        const fireballBuffer = this.generateWeaponSound(300, 0.18, 15);
        if (fireballBuffer && this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.cache.audio.add('fireball_shoot', fireballBuffer);
        }
        
        // 生成飞镖音效（高频、短促）
        const dartBuffer = this.generateWeaponSound(1200, 0.08, 35);
        if (dartBuffer && this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.cache.audio.add('dart_shoot', dartBuffer);
        }
        
        // 生成放置方块音效
        const placeBuffer = this.generatePlaceSound();
        if (placeBuffer && this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.cache.audio.add('place', placeBuffer);
        }
    }
    
    generateWeaponSound(frequency: number, duration: number, decay: number): AudioBuffer | null {
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
        
        const audioContext = this.sound.context;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        // 生成武器音效（正弦波 + 白噪音 + 衰减）
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * decay); // 可调节衰减速度
            
            // 混合正弦波和噪音
            const tone = Math.sin(2 * Math.PI * frequency * t) * 0.5;
            const noise = (Math.random() * 2 - 1) * 0.3;
            
            data[i] = (tone + noise) * envelope * 0.25;
        }
        
        return buffer;
    }
    
    generatePlaceSound(): AudioBuffer | null {
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
        
        const audioContext = this.sound.context;
        const sampleRate = audioContext.sampleRate;
        const duration = 0.08; // 0.08秒
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        // 生成放置方块音效（简单的"咔"声）
        const frequency = 800; // 800Hz
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 40); // 快速衰减
            data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.2;
        }
        
        return buffer;
    }

    async create() {
        this.createMap();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        // 添加这4行 ↓
        this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        // 武器切换按键
        this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        // 建造模式按键
        this.bKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
        
        this.mousePointer = this.input.activePointer;
        await this.connect();
        this.cameras.main.setBounds(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
        
        // 创建武器UI（固定在屏幕上）
        this.weaponText = this.add.text(10, 10, '', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0).setDepth(100);
        
        // 创建背包UI
        this.inventoryText = this.add.text(10, 50, '', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0).setDepth(100);
        
        // 创建建造模式提示
        this.buildModeText = this.add.text(10, 110, '', {
            fontSize: '16px',
            color: '#ffff00',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0).setDepth(100);
        
        // 创建方块预览（初始隐藏）
        this.blockPreview = this.add.rectangle(0, 0, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, 0xffffff, 0.5);
        this.blockPreview.setStrokeStyle(2, 0xffffff);
        this.blockPreview.setVisible(false);
        this.blockPreview.setDepth(50);
        
        // 创建网格线（初始隐藏）
        this.gridGraphics = this.add.graphics();
        this.gridGraphics.setDepth(1);
        this.gridGraphics.setVisible(false);
        
        // 创建音效（使用Web Audio API生成简单音效）
        this.createSoundEffects();
    }
    
    createSoundEffects() {
        // 创建弓箭音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.bowShootSound = this.sound.add('bow_shoot', {
                volume: 0.35,
                rate: 1
            });
        }
        
        // 创建火球音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.fireballShootSound = this.sound.add('fireball_shoot', {
                volume: 0.4,
                rate: 1
            });
        }
        
        // 创建飞镖音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.dartShootSound = this.sound.add('dart_shoot', {
                volume: 0.3,
                rate: 1
            });
        }
        
        // 创建放置方块音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.placeBlockSound = this.sound.add('place', {
                volume: 0.4,
                rate: 1.2
            });
        }
    }
    
    playWeaponSound(weaponType: WeaponType) {
        // 根据武器类型播放对应音效
        switch(weaponType) {
            case WeaponType.BOW:
                if (this.bowShootSound) {
                    this.bowShootSound.play();
                }
                break;
            case WeaponType.FIREBALL:
                if (this.fireballShootSound) {
                    this.fireballShootSound.play();
                }
                break;
            case WeaponType.DART:
                if (this.dartShootSound) {
                    this.dartShootSound.play();
                }
                break;
        }
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
            console.log("Connected to room:", this.room.name);
            const state = this.room.state;
            const $ = getStateCallbacks(this.room);

            // 使用 $ 语法监听 entities 集合
            $(state).entities.onAdd((entity, id) => {
                let visual;

                // --- 1. 判断类型并创建 ---
                if (entity instanceof Player || entity.type === 'player') {
                    visual = this.createPlayer(entity as Player, id);
                } else if (entity instanceof Bullet || entity.type === 'bullet') {
                    visual = this.createBullet(entity as Bullet);
                    
                    // 播放射击音效（仅当是当前玩家发射的子弹）
                    const bullet = entity as Bullet;
                    if (bullet.ownerId === this.currentPlayerId) {
                        this.playWeaponSound(bullet.weaponType as WeaponType);
                    }
                } else if (entity instanceof Block || entity.type === 'block') {
                    visual = this.createBlock(entity as Block);
                } else if (entity instanceof Bed || entity.type === 'bed') {
                    visual = this.createBed(entity as Bed);
                }

                if (visual) {
                    this.entityVisuals.set(id, visual);

                    // --- 2. 监听数据变化 (统一处理位置同步) ---
                    $(entity).onChange(() => {
                        visual.setData('serverX', entity.x);
                        visual.setData('serverY', entity.y);
                        
                        // 更新血条
                        if ((entity instanceof Player || entity.type === 'player') && visual instanceof Phaser.GameObjects.Container) {
                            this.updateHealthBar(visual, entity as Player);
                        }
                        
                        if ((entity instanceof Bed || entity.type === 'bed') && visual instanceof Phaser.GameObjects.Container) {
                            this.updateHealthBar(visual, entity as Bed);
                            this.updateBedAlpha(visual, entity as Bed);
                        }
                        
                        if ((entity instanceof Block || entity.type === 'block') && visual instanceof Phaser.GameObjects.Container) {
                            this.updateBlockHealthBar(visual, entity as Block);
                        }
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
        console.log(`Creating player ${id} at ${player.x}, ${player.y}`);
        const container = this.add.container(player.x, player.y);

        // 创建可旋转的三角形容器
        const shipContainer = this.add.container(0, 0);
        const ship = this.add.graphics();

        // Color based on team
        const color = player.teamId === 'red' ? 0xff0000 : 0x0000ff;

        ship.fillStyle(color, 1);
        // Draw a triangle pointing right (0 degrees)
        ship.fillTriangle(15, 0, -10, -10, -10, 10);

        shipContainer.add(ship);
        container.add(shipContainer);
        
        // 保存三角形容器的引用，只旋转它
        container.setData('shipContainer', shipContainer);

        // 创建血条（固定在上方，不旋转）
        const healthBarBg = this.add.rectangle(0, -30, 40, 5, 0x000000);
        const healthBarFg = this.add.rectangle(0, -30, 40, 5, 0x00ff00);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        // 保存血条引用
        container.setData('healthBarFg', healthBarFg);
        container.setData('maxHP', player.maxHP);

        // 创建重生文本（初始隐藏，固定不旋转）
        const respawnText = this.add.text(0, 0, '', {
            fontSize: '14px',
            color: '#ffff00',
            align: 'center'
        }).setOrigin(0.5);
        container.add(respawnText);
        container.setData('respawnText', respawnText);

        if (id === this.room.sessionId) {
            this.currentPlayerId = id;
            this.cameras.main.startFollow(container);
        }

        return container;
    }
    
    updateHealthBar(container: Phaser.GameObjects.Container, entity: Player | Bed) {
        const healthBarFg = container.getData('healthBarFg');
        const maxHP = container.getData('maxHP');
        const respawnText = container.getData('respawnText');
        
        if (healthBarFg && maxHP) {
            const hpPercent = Math.max(0, entity.hp / maxHP);
            healthBarFg.scaleX = hpPercent;
            
            // 根据HP改变颜色
            if (hpPercent > 0.5) {
                healthBarFg.setFillStyle(0x00ff00);
            } else if (hpPercent > 0.25) {
                healthBarFg.setFillStyle(0xffff00);
            } else {
                healthBarFg.setFillStyle(0xff0000);
            }
        }
        
        // 更新重生文本
        if (entity instanceof Player) {
            if (entity.isDead && respawnText) {
                if (entity.respawnTime > 0) {
                    const seconds = Math.ceil(entity.respawnTime / 1000);
                    respawnText.setText(`重生中... ${seconds}s`);
                    respawnText.setVisible(true);
                } else if (entity.respawnTime === -1) {
                    respawnText.setText('无法重生');
                    respawnText.setVisible(true);
                }
            } else if (respawnText) {
                respawnText.setVisible(false);
            }
        }
    }
    
    updateBedAlpha(container: Phaser.GameObjects.Container, bed: Bed) {
        const maxHP = container.getData('maxHP');
        if (!maxHP) return;
        
        const hpPercent = Math.max(0, bed.hp / maxHP);
        
        // 根据HP设置透明度：100%HP=1.0不透明，0%HP=0.2几乎透明
        const alpha = 0.2 + (hpPercent * 0.8);
        container.setAlpha(alpha);
        
        // 如果床被完全破坏，隐藏
        if (bed.hp <= 0) {
            container.setVisible(false);
        }
    }
    
    updateBlockHealthBar(container: Phaser.GameObjects.Container, block: Block) {
        const healthBarFg = container.getData('healthBarFg');
        const blockRect = container.getData('blockRect');
        const maxHP = container.getData('maxHP');
        const teamId = container.getData('teamId');
        
        if (healthBarFg && maxHP) {
            const hpPercent = Math.max(0, block.hp / maxHP);
            healthBarFg.scaleX = hpPercent;
            
            // 保持队伍颜色不变
            const healthBarColor = teamId === 'red' ? 0xff0000 : 0x0000ff;
            healthBarFg.setFillStyle(healthBarColor);
            
            // 根据HP设置方块透明度：100%HP=1.0不透明，0%HP=0.3几乎透明
            if (blockRect) {
                const alpha = 0.3 + (hpPercent * 0.7);
                blockRect.setAlpha(alpha);
            }
        }
    }

    createBullet(bullet: Bullet) {
        // 根据武器类型获取颜色
        const weaponType = bullet.weaponType as WeaponType;
        const color = WEAPON_CONFIG[weaponType]?.color || 0xffff00;
        return this.add.circle(bullet.x, bullet.y, GAME_CONFIG.bulletRadius, color);
    }

    createBlock(block: Block) {
        const container = this.add.container(block.x, block.y);
        
        // 根据方块类型获取颜色
        const blockType = block.blockType as BlockType;
        const color = BLOCK_CONFIG[blockType]?.color || 0x884400;
        
        // 创建方块矩形
        const blockRect = this.add.rectangle(0, 0, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, color);
        container.add(blockRect);
        
        // 根据队伍ID设置血条颜色
        const healthBarColor = block.teamId === 'red' ? 0xff0000 : 0x0000ff;
        
        // 创建血条
        const healthBarBg = this.add.rectangle(0, -25, GAME_CONFIG.blockSize, 4, 0x000000);
        const healthBarFg = this.add.rectangle(0, -25, GAME_CONFIG.blockSize, 4, healthBarColor);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        // 保存引用用于更新
        container.setData('healthBarFg', healthBarFg);
        container.setData('blockRect', blockRect); // 保存方块矩形用于透明度控制
        container.setData('maxHP', block.maxHP);
        container.setData('teamId', block.teamId);
        
        return container;
    }

    createBed(bed: Bed) {
        const container = this.add.container(bed.x, bed.y);
        
        // 床的颜色根据队伍
        const color = bed.teamId === 'red' ? 0xff0000 : 0x0000ff;
        const bedRect = this.add.rectangle(0, 0, 60, 40, color);
        container.add(bedRect);
        
        // 创建血条
        const healthBarBg = this.add.rectangle(0, -30, 60, 5, 0x000000);
        const healthBarFg = this.add.rectangle(0, -30, 60, 5, 0x00ff00);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        // 保存血条引用
        container.setData('healthBarFg', healthBarFg);
        container.setData('maxHP', bed.maxHP);
        
        return container;
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
        
        // 只旋转当前玩家的三角形，不旋转整个Container
        const playerVisual = this.entityVisuals.get(this.currentPlayerId);
        if (playerVisual && playerVisual instanceof Phaser.GameObjects.Container) {
            const shipContainer = playerVisual.getData('shipContainer');
            if (shipContainer) {
                const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                const angle = Phaser.Math.Angle.Between(playerVisual.x, playerVisual.y, worldPoint.x, worldPoint.y);
                // 只旋转三角形，血条和文本不受影响
                shipContainer.rotation = angle;
            }
        }
        
        // 建造模式预览
        const player = this.room.state.entities.get(this.currentPlayerId) as Player;
        if (player && player.inBuildMode && playerVisual) {
            // 显示网格
            this.gridGraphics.setVisible(true);
            this.drawGrid();
            
            // 显示方块预览
            const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
            const gridSize = GAME_CONFIG.gridSize;
            const gridX = Math.round(worldPoint.x / gridSize) * gridSize;
            const gridY = Math.round(worldPoint.y / gridSize) * gridSize;
            
            // 检查距离
            const distance = Math.sqrt((gridX - playerVisual.x) ** 2 + (gridY - playerVisual.y) ** 2);
            const inRange = distance <= GAME_CONFIG.maxPlaceRange;
            
            // 更新预览位置和颜色
            this.blockPreview.setPosition(gridX, gridY);
            
            const blockType = player.selectedBlockType as BlockType;
            const blockColor = BLOCK_CONFIG[blockType]?.color || 0xffffff;
            const blockCount = player.inventory.get(blockType) || 0;
            
            // 有方块且在范围内 = 绿色，否则 = 红色
            if (inRange && blockCount > 0) {
                this.blockPreview.setFillStyle(blockColor, 0.5);
                this.blockPreview.setStrokeStyle(2, 0x00ff00);
            } else {
                this.blockPreview.setFillStyle(blockColor, 0.3);
                this.blockPreview.setStrokeStyle(2, 0xff0000);
            }
            
            this.blockPreview.setVisible(true);
        } else {
            // 非建造模式，隐藏预览
            this.gridGraphics.setVisible(false);
            this.blockPreview.setVisible(false);
        }
    }
    
    drawGrid() {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0x888888, 0.3);
        
        const gridSize = GAME_CONFIG.gridSize;
        const mapWidth = GAME_CONFIG.mapWidth;
        const mapHeight = GAME_CONFIG.mapHeight;
        
        // 垂直线
        for (let x = 0; x <= mapWidth; x += gridSize) {
            this.gridGraphics.lineBetween(x, 0, x, mapHeight);
        }
        
        // 水平线
        for (let y = 0; y <= mapHeight; y += gridSize) {
            this.gridGraphics.lineBetween(0, y, mapWidth, y);
        }
    }

    fixedTick() {
        this.currentTick++;
        
        // 死亡玩家不能输入
        const player = this.room.state.entities.get(this.currentPlayerId) as Player;
        if (player && player.isDead) {
            return;
        }

        this.inputPayload.left = this.cursorKeys.left.isDown || this.aKey.isDown;
        this.inputPayload.right = this.cursorKeys.right.isDown || this.dKey.isDown;
        this.inputPayload.up = this.cursorKeys.up.isDown || this.wKey.isDown;
        this.inputPayload.down = this.cursorKeys.down.isDown || this.sKey.isDown;
        this.inputPayload.tick = this.currentTick;

        // 建造模式切换
        if (Phaser.Input.Keyboard.JustDown(this.bKey)) {
            this.inputPayload.buildMode = !player.inBuildMode;
        } else {
            this.inputPayload.buildMode = undefined;
        }

        // 根据模式处理输入
        if (player.inBuildMode) {
            // 建造模式：方块类型切换
            if (Phaser.Input.Keyboard.JustDown(this.key1)) {
                this.inputPayload.switchBlockType = 1;
            } else if (Phaser.Input.Keyboard.JustDown(this.key2)) {
                this.inputPayload.switchBlockType = 2;
            } else if (Phaser.Input.Keyboard.JustDown(this.key3)) {
                this.inputPayload.switchBlockType = 3;
            } else {
                this.inputPayload.switchBlockType = undefined;
            }
            
            // 放置方块
            if (this.mousePointer.isDown) {
                const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                this.inputPayload.placeBlock = {
                    x: worldPoint.x,
                    y: worldPoint.y,
                    blockType: player.selectedBlockType
                };
                
                // 播放放置音效（仅在鼠标刚按下时）
                if (!this.lastMouseDown && this.placeBlockSound) {
                    this.placeBlockSound.play();
                }
            } else {
                this.inputPayload.placeBlock = undefined;
            }
            
            this.inputPayload.shoot = false;
        } else {
            // 战斗模式：武器切换和射击
            if (Phaser.Input.Keyboard.JustDown(this.key1)) {
                this.inputPayload.switchWeapon = 1;
            } else if (Phaser.Input.Keyboard.JustDown(this.key2)) {
                this.inputPayload.switchWeapon = 2;
            } else if (Phaser.Input.Keyboard.JustDown(this.key3)) {
                this.inputPayload.switchWeapon = 3;
            } else {
                this.inputPayload.switchWeapon = undefined;
            }
            
            this.inputPayload.shoot = this.mousePointer.isDown;
            this.inputPayload.placeBlock = undefined;
        }
        
        // 更新UI
        if (player) {
            // 武器UI
            const weaponType = player.currentWeapon as WeaponType;
            const weaponConfig = WEAPON_CONFIG[weaponType];
            if (weaponConfig) {
                this.weaponText.setText(`当前武器: ${weaponConfig.name}\n[1]弓箭 [2]火球 [3]飞镖`);
            }
            
            // 背包UI
            const woodCount = player.inventory.get(BlockType.WOOD) || 0;
            const stoneCount = player.inventory.get(BlockType.STONE) || 0;
            const diamondCount = player.inventory.get(BlockType.DIAMOND) || 0;
            this.inventoryText.setText(
                `背包: 木${woodCount} 石${stoneCount} 钻${diamondCount}\n` +
                `[1]木制 [2]石制 [3]钻石`
            );
            
            // 建造模式提示
            if (player.inBuildMode) {
                const blockType = player.selectedBlockType as BlockType;
                const blockConfig = BLOCK_CONFIG[blockType];
                this.buildModeText.setText(`建造模式 [B退出]\n当前: ${blockConfig.name}`);
                this.buildModeText.setVisible(true);
            } else {
                this.buildModeText.setText('[B]建造模式');
                this.buildModeText.setVisible(true);
            }
        }
        
        // 计算瞄准角度
        const playerVisual = this.entityVisuals.get(this.currentPlayerId);
        if (playerVisual) {
            const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
            this.inputPayload.aimAngle = Phaser.Math.Angle.Between(
                playerVisual.x, playerVisual.y, 
                worldPoint.x, worldPoint.y
            );
        }

        this.room.send(0, this.inputPayload);
        
        // 更新鼠标状态用于下一帧
        this.lastMouseDown = this.mousePointer.isDown;
    }
}
