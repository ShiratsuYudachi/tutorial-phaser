import Phaser from "phaser";
import { Room, Client, getStateCallbacks } from "colyseus.js";
import { BACKEND_URL } from "../backend";

import type { GameState } from "../../../server/src/shared/Schema";
import { Player, Bullet, Block, Bed, Entity, DroppedItem, ResourceGenerator } from "../../../server/src/shared/Schema";
import { GAME_CONFIG, WEAPON_CONFIG, BLOCK_CONFIG, INVENTORY_SIZE, ITEM_DEFINITIONS, ItemType, WeaponItem, BlockItem, isWeapon, isBlock, SHOP_INTERACTION_RANGE, RESOURCE_GENERATOR_CONFIG } from "../../../server/src/shared/Constants";
import { InputData } from "../../../server/src/shared/Schema";

import { gameStore } from "../ui/GameStore";
import { DroppedItemRenderer } from "./DroppedItemRenderer";

export class GameScene extends Phaser.Scene {
    room: Room<GameState>;
    
    // 统一管理所有可视对象 (id -> GameObject)
    entityVisuals = new Map<string, Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle>();

    currentPlayerId: string;
    cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    mousePointer: Phaser.Input.Pointer;
    
    // Movement Keys
    wKey: Phaser.Input.Keyboard.Key;
    aKey: Phaser.Input.Keyboard.Key;
    sKey: Phaser.Input.Keyboard.Key;
    dKey: Phaser.Input.Keyboard.Key;

    // Inventory Keys (1-9)
    inventoryKeys: Phaser.Input.Keyboard.Key[] = [];

    // Drop Item Key (Q)
    qKey: Phaser.Input.Keyboard.Key;
    
    // Melee Attack Key (E)
    eKey: Phaser.Input.Keyboard.Key;
    
    // Switch Character Key (Tab)
    tabKey: Phaser.Input.Keyboard.Key;

    // Chat Key (T)
    tKey: Phaser.Input.Keyboard.Key;

    // Dropped Item Renderer
    droppedItemRenderer: DroppedItemRenderer;

    // UI Elements
    // REMOVED Phaser Inventory UI Elements
    
    // Preview
    blockPreview: Phaser.GameObjects.Rectangle;
    gridGraphics: Phaser.GameObjects.Graphics;
    isGridDrawn: boolean = false;  // Track if grid is already drawn
    
    // Audio
    bowShootSound: Phaser.Sound.BaseSound;
    fireballShootSound: Phaser.Sound.BaseSound;
    dartShootSound: Phaser.Sound.BaseSound;
    placeBlockSound: Phaser.Sound.BaseSound;
    lastMouseDown: boolean = false;
    
    // New UI Elements for game phases and stats
    redAirWall: Phaser.GameObjects.Graphics;
    blueAirWall: Phaser.GameObjects.Graphics;
    // Timer and Kill Feed now handled by React UI (see client/src/ui/App.tsx)
    lastKillFeedLength: number = 0;
    lastGamePhase: string = '';
    // End Game Screen now handled by React UI (see client/src/ui/App.tsx)
    lastPlayerHP: Map<string, number> = new Map();
    
    inputPayload: InputData = {
        left: false, right: false, up: false, down: false,
        tick: 0, 
        isDown: false,
        isRightDown: false,  // 右键近战攻击
        mouseX: 0,
        mouseY: 0
    };

    currentTick: number = 0;
    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;
    
    // 近战攻击相关
    meleeSound: Phaser.Sound.BaseSound;
    meleeSwingGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();

    constructor() { super({ key: "game" }); }

    preload() {
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
        
        // 生成近战挥砍音效
        const meleeBuffer = this.generateMeleeSound();
        if (meleeBuffer && this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.cache.audio.add('melee', meleeBuffer);
        }
    }
    
    generateMeleeSound(): AudioBuffer | null {
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
        
        const audioContext = this.sound.context;
        const sampleRate = audioContext.sampleRate;
        const duration = 0.15;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        // 挥砍音效：从高频到低频的快速扫频 + 金属碰撞声
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const progress = t / duration;
            
            // 扫频：从1000Hz到200Hz
            const freq = 1000 - progress * 800;
            const sweep = Math.sin(2 * Math.PI * freq * t) * 0.4;
            
            // 金属碰撞声（高频）
            const metalFreq = 2500;
            const metal = Math.sin(2 * Math.PI * metalFreq * t) * Math.exp(-t * 50) * 0.3;
            
            // 噪音（增加质感）
            const noise = (Math.random() * 2 - 1) * 0.2 * Math.exp(-t * 20);
            
            // 包络
            const envelope = Math.exp(-t * 15);
            
            data[i] = (sweep + metal + noise) * envelope * 0.3;
        }
        
        return buffer;
    }
    
    generateWeaponSound(frequency: number, duration: number, decay: number): AudioBuffer | null {
        if (!(this.sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
        
        const audioContext = this.sound.context;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * decay);
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
        const duration = 0.08;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        const frequency = 800;
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 40);
            data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.2;
        }
        
        return buffer;
    }

    async create() {
        this.createMap();
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        
        this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        
        // Initialize inventory keys (1-9)
        const keyCodes = [
            Phaser.Input.Keyboard.KeyCodes.ONE,
            Phaser.Input.Keyboard.KeyCodes.TWO,
            Phaser.Input.Keyboard.KeyCodes.THREE,
            Phaser.Input.Keyboard.KeyCodes.FOUR,
            Phaser.Input.Keyboard.KeyCodes.FIVE,
            Phaser.Input.Keyboard.KeyCodes.SIX,
            Phaser.Input.Keyboard.KeyCodes.SEVEN,
            Phaser.Input.Keyboard.KeyCodes.EIGHT,
            Phaser.Input.Keyboard.KeyCodes.NINE
        ];

        for (let i = 0; i < 9; i++) {
             this.inventoryKeys.push(this.input.keyboard.addKey(keyCodes[i]));
        }

        // Drop item key (Q)
        this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

        // Melee attack key (E)
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        // Switch Character Key (Tab)
        this.tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        this.input.keyboard.addCapture('TAB'); // Prevent browser default

        // Chat Key (T)
        this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
        // We don't capture T so it can be typed in chat, but we need to handle the open trigger carefully

        this.mousePointer = this.input.activePointer;
        
        // 禁用右键菜单，让右键可以用于近战攻击
        this.input.mouse.disableContextMenu();
        
        // Initialize dropped item renderer
        this.droppedItemRenderer = new DroppedItemRenderer(this);
        
        await this.connect();
        this.cameras.main.setBounds(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
        this.cameras.main.setZoom(2);
        // Disable built-in follow lerp for custom smooth transition
        // this.cameras.main.setLerp(0, 0);
        
        // UI Initialization
        // this.createInventoryUI(); // Removed
        
        // Preview elements - Block placement preview
        this.blockPreview = this.add.rectangle(0, 0, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, 0x00ff00, 0.5);
        this.blockPreview.setStrokeStyle(4, 0x00ff00);
        this.blockPreview.setVisible(false);
        this.blockPreview.setDepth(100);  // Very high depth to always be visible
        
        this.gridGraphics = this.add.graphics();
        this.gridGraphics.setDepth(45);  // Higher depth to be visible above blocks
        this.gridGraphics.setVisible(false);
        // Pre-draw grid to avoid performance issues on first use
        this.drawGrid();
        this.isGridDrawn = true;
        
        // Create Air Walls
        this.redAirWall = this.add.graphics().setDepth(5);
        this.blueAirWall = this.add.graphics().setDepth(5);

        // Timer, Kill Feed, and End Game Screen are now handled by React UI
        // See client/src/ui/App.tsx
        
        this.createSoundEffects();
    }
    
    createSoundEffects() {
        // 创建弓箭音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.bowShootSound = this.sound.add('bow_shoot', { volume: 0.35, rate: 1 });
        }
        
        // 创建火球音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.fireballShootSound = this.sound.add('fireball_shoot', { volume: 0.4, rate: 1 });
        }
        
        // 创建飞镖音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.dartShootSound = this.sound.add('dart_shoot', { volume: 0.3, rate: 1 });
        }
        
        // 创建放置方块音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.placeBlockSound = this.sound.add('place', { volume: 0.4, rate: 1.2 });
        }
        
        // 创建近战音效
        if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
            this.meleeSound = this.sound.add('melee', { volume: 0.5, rate: 1 });
        }
    }
    
    playMeleeSound() {
        if (this.meleeSound) {
            this.meleeSound.play();
        }
    }
    
    playWeaponSound(weaponType: WeaponItem) {
        switch(weaponType) {
            case ItemType.BOW: if (this.bowShootSound) this.bowShootSound.play(); break;
            case ItemType.FIREBALL: if (this.fireballShootSound) this.fireballShootSound.play(); break;
            case ItemType.DART: if (this.dartShootSound) this.dartShootSound.play(); break;
        }
    }

    createMap() {
        this.add.rectangle(GAME_CONFIG.mapWidth / 2, GAME_CONFIG.mapHeight / 2,
            GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight).setStrokeStyle(4, 0xffffff);
    }

    async connect() {
        try {
            // Connect via GameStore and wait for it to be ready
            this.room = await gameStore.connect();
            
            // GameStore has already set up its own listeners
            // We just need to set up Phaser-specific visual listeners
            
            const state = this.room.state;
            const $ = getStateCallbacks(this.room);

            $(state).entities.onAdd((entity, id) => {
                let visual;
                
                if (entity instanceof Player || entity.type === 'player') {
                    visual = this.createPlayer(entity as Player, id);
                } else if (entity instanceof Bullet || entity.type === 'bullet') {
                    visual = this.createBullet(entity as Bullet);
                    
                    const bullet = entity as Bullet;
                    if (bullet.ownerId === this.currentPlayerId) {
                        this.playWeaponSound(bullet.weaponType as WeaponItem);
                    }
                } else if (entity instanceof Block || entity.type === 'block') {
                    visual = this.createBlock(entity as Block);
                } else if (entity instanceof Bed || entity.type === 'bed') {
                    visual = this.createBed(entity as Bed);
                } else if (entity.type === 'dropped_item') {
                    const drop = entity as DroppedItem;
                    visual = this.createDroppedItem(drop);
                } else if (entity.type === 'resource_generator') {
                    const generator = entity as ResourceGenerator;
                    visual = this.createResourceGenerator(generator);
                }

                if (visual) {
                    this.entityVisuals.set(id, visual);

                    $(entity).onChange(() => {
                        visual.setData('serverX', entity.x);
                        visual.setData('serverY', entity.y);
                        
                        if ((entity instanceof Player || entity.type === 'player') && visual instanceof Phaser.GameObjects.Container) {
                            const p = entity as Player;
                            this.updatePlayerVisuals(visual, p, id);
                        }
                        
                        if ((entity instanceof Bed || entity.type === 'bed') && visual instanceof Phaser.GameObjects.Container) {
                            this.updateHealthBar(visual, entity as Bed);
                            this.updateBedAlpha(visual, entity as Bed);
                        }
                        
                        if ((entity instanceof Block || entity.type === 'block') && visual instanceof Phaser.GameObjects.Container) {
                            this.updateBlockHealthBar(visual, entity as Block);
                        }
                        
                        if ((entity instanceof Bullet || entity.type === 'bullet') && visual instanceof Phaser.GameObjects.Container) {
                            const bullet = entity as Bullet;
                            // Update rotation for arrows (not for spinning knives or fireballs)
                            if (bullet.weaponType === ItemType.BOW) {
                                const angle = Math.atan2(bullet.velocityY, bullet.velocityX);
                                visual.setRotation(angle);
                            }
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
        const container = this.add.container(player.x, player.y);
        const shipContainer = this.add.container(0, 0);
        const ship = this.add.graphics();
        const color = player.teamId === 'red' ? 0xff0000 : 0x0000ff;

        ship.fillStyle(color, 1);
        ship.fillTriangle(15, 0, -10, -10, -10, 10);

        shipContainer.add(ship);
        
        // 添加剑的可视化
        const swordContainer = this.add.container(12, 0);  // 剑的位置在玩家前方
        const sword = this.add.graphics();
        
        // 剑的形状：刀刃 + 护手 + 剑柄
        sword.fillStyle(0xC0C0C0, 1);  // 银色刀刃
        sword.fillRect(0, -2, 20, 4);  // 刀刃主体
        sword.fillStyle(0xFFD700, 1);  // 金色护手
        sword.fillRect(-2, -4, 4, 8);  // 护手
        sword.fillStyle(0x8B4513, 1);  // 棕色剑柄
        sword.fillRect(-8, -2, 6, 4);  // 剑柄
        sword.fillStyle(0xFFFFFF, 1);  // 白色剑尖
        sword.fillTriangle(20, 0, 20, -2, 25, 0);
        sword.fillTriangle(20, 0, 20, 2, 25, 0);
        
        swordContainer.add(sword);
        swordContainer.setVisible(true);
        shipContainer.add(swordContainer);
        
        container.setData('swordContainer', swordContainer);
        
        // 近战挥砍动画容器
        const meleeSwing = this.add.graphics();
        meleeSwing.setVisible(false);
        container.add(meleeSwing);
        container.setData('meleeSwing', meleeSwing);
        container.setData('lastMeleeState', false);

        container.add(shipContainer);
        container.setData('shipContainer', shipContainer);

        const healthBarBg = this.add.rectangle(0, -30, 40, 5, 0x000000);
        const healthBarFg = this.add.rectangle(0, -30, 40, 5, 0x00ff00);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        container.setData('healthBarFg', healthBarFg);
        container.setData('maxHP', player.maxHP);

        const respawnText = this.add.text(0, 0, '', {
            fontSize: '14px',
            color: '#ffff00',
            align: 'center'
        }).setOrigin(0.5);
        container.add(respawnText);
        container.setData('respawnText', respawnText);

        // Selection Highlight (Yellow Ring)
        const highlight = this.add.graphics();
        highlight.lineStyle(2, 0xffff00, 1);
        highlight.strokeCircle(0, 0, 25);
        highlight.setVisible(false);
        container.add(highlight);
        container.setData('highlight', highlight);

        if (player.ownerSessionId === this.room.sessionId && player.isActive) {
            this.currentPlayerId = id;
            this.cameras.main.startFollow(container, false, 0.1, 0.1);
            highlight.setVisible(true);
        }

        return container;
    }
    
    updatePlayerVisuals(container: Phaser.GameObjects.Container, player: Player, id: string) {
        this.updateHealthBar(container, player);
        
        // Track HP for damage numbers
        const lastHP = this.lastPlayerHP.get(id);
        if (lastHP !== undefined && lastHP > player.hp) {
            const damage = lastHP - player.hp;
            this.showDamageNumber(container.x, container.y, damage);
        }
        this.lastPlayerHP.set(id, player.hp);
        
        // Update Highlight
        const highlight = container.getData('highlight') as Phaser.GameObjects.Graphics;
        if (highlight) {
            const isMyActiveChar = player.ownerSessionId === this.room.sessionId && player.isActive;
            highlight.setVisible(isMyActiveChar);
        }
        
        // 处理近战攻击动画
        const lastMeleeState = container.getData('lastMeleeState') as boolean;
        const meleeSwing = container.getData('meleeSwing') as Phaser.GameObjects.Graphics;
        const swordContainer = container.getData('swordContainer') as Phaser.GameObjects.Container;
        
        if (player.isMeleeAttacking && !lastMeleeState && meleeSwing) {
            // 开始近战动画
            const meleeAngle = player.meleeAngle;
            
            // 播放近战音效（只为自己播放）
            if (player.ownerSessionId === this.room.sessionId && player.isActive) {
                this.playMeleeSound();
            }
            
            // 绘制挥砍弧线
            meleeSwing.clear();
            meleeSwing.lineStyle(4, 0xFFFFFF, 0.8);
            
            // 绘制一个弧形的挥砍轨迹
            const startAngle = meleeAngle - Math.PI / 4;
            const endAngle = meleeAngle + Math.PI / 4;
            const radius = 45;
            
            meleeSwing.beginPath();
            meleeSwing.arc(0, 0, radius, startAngle, endAngle, false);
            meleeSwing.strokePath();
            
            // 添加挥砍特效（发光的剑气）
            meleeSwing.lineStyle(2, 0xFFFF00, 0.6);
            meleeSwing.beginPath();
            meleeSwing.arc(0, 0, radius + 5, startAngle, endAngle, false);
            meleeSwing.strokePath();
            
            meleeSwing.setVisible(true);
            
            // 剑的挥动动画
            if (swordContainer) {
                this.tweens.add({
                    targets: swordContainer,
                    angle: { from: -45, to: 45 },
                    duration: 150,
                    ease: 'Power2',
                    yoyo: true
                });
            }
            
            // 淡出动画
            this.tweens.add({
                targets: meleeSwing,
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    meleeSwing.setVisible(false);
                    meleeSwing.setAlpha(1);
                }
            });
        }
        container.setData('lastMeleeState', player.isMeleeAttacking);

        // Camera Follow Logic
        if (player.ownerSessionId === this.room.sessionId && player.isActive) {
            if (this.currentPlayerId !== id) {
                this.currentPlayerId = id;
                
                // Smooth transition
                this.cameras.main.stopFollow();
                this.cameras.main.pan(container.x, container.y, 500, 'Power2', true, (camera, progress) => {
                    if (progress === 1) {
                        this.cameras.main.startFollow(container, false, 0.1, 0.1);
                    }
                });
            }
        }
    }
    
    updateHealthBar(container: Phaser.GameObjects.Container, entity: Player | Bed) {
        const healthBarFg = container.getData('healthBarFg');
        const maxHP = container.getData('maxHP');
        const respawnText = container.getData('respawnText');
        
        if (healthBarFg && maxHP) {
            const hpPercent = Math.max(0, entity.hp / maxHP);
            healthBarFg.scaleX = hpPercent;
            
            if (hpPercent > 0.5) {
                healthBarFg.setFillStyle(0x00ff00);
            } else if (hpPercent > 0.25) {
                healthBarFg.setFillStyle(0xffff00);
            } else {
                healthBarFg.setFillStyle(0xff0000);
            }
        }
        
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
        const alpha = 0.2 + (hpPercent * 0.8);
        container.setAlpha(alpha);
        
        if (bed.hp <= 0) {
            container.setVisible(false);
        }
    }
    
    updateBlockHealthBar(container: Phaser.GameObjects.Container, block: Block) {
        const healthBarFg = container.getData('healthBarFg');
        const blockRect = container.getData('blockRect');
        const maxHP = container.getData('maxHP');
        
        if (healthBarFg && maxHP) {
            const hpPercent = Math.max(0, block.hp / maxHP);
            healthBarFg.scaleX = hpPercent;
            
            // Keep neutral gray color
            healthBarFg.setFillStyle(0x888888);
            
            if (blockRect) {
                const alpha = 0.3 + (hpPercent * 0.7);
                blockRect.setAlpha(alpha);
            }
        }
    }

    createBullet(bullet: Bullet) {
        const weaponType = bullet.weaponType as WeaponItem;
        const container = this.add.container(bullet.x, bullet.y);
        container.setDepth(10);

        switch (weaponType) {
            case ItemType.BOW: {
                // Arrow - triangle pointing forward with tail
                const arrowHead = this.add.triangle(8, 0, 0, -4, 0, 4, 12, 0, 0x8B4513);
                const arrowShaft = this.add.rectangle(0, 0, 16, 2, 0xA0522D);
                const arrowFletch = this.add.triangle(-8, 0, -12, -3, -12, 3, -6, 0, 0xFFFFFF);
                
                container.add([arrowShaft, arrowHead, arrowFletch]);
                
                // Calculate rotation based on velocity
                const angle = Math.atan2(bullet.velocityY, bullet.velocityX);
                container.setRotation(angle);
                break;
            }
            
            case ItemType.FIREBALL: {
                // Fireball - glowing circle with flame effect
                const core = this.add.circle(0, 0, 6, 0xFF4500);
                const glow1 = this.add.circle(0, 0, 8, 0xFF6347).setAlpha(0.6);
                const glow2 = this.add.circle(0, 0, 10, 0xFFFF00).setAlpha(0.3);
                
                container.add([glow2, glow1, core]);
                
                // Add pulsing animation
                this.tweens.add({
                    targets: [glow1, glow2],
                    scaleX: 1.2,
                    scaleY: 1.2,
                    alpha: 0.3,
                    duration: 300,
                    yoyo: true,
                    repeat: -1
                });
                break;
            }
            
            case ItemType.DART: {
                // Dart/Knife - diamond shape
                const blade = this.add.triangle(6, 0, 0, -3, 0, 3, 8, 0, 0xC0C0C0);
                const handle = this.add.rectangle(-2, 0, 6, 2, 0x654321);
                const tip = this.add.circle(8, 0, 1, 0xFFFFFF);
                
                container.add([handle, blade, tip]);
                
                // Calculate rotation and add spin
                const angle = Math.atan2(bullet.velocityY, bullet.velocityX);
                container.setRotation(angle);
                
                // Add spinning animation
                this.tweens.add({
                    targets: container,
                    angle: container.angle + 360,
                    duration: 500,
                    repeat: -1,
                    ease: 'Linear'
                });
                break;
            }
            
            default: {
                // Fallback - simple colored circle
                const color = 0xffff00;
                const circle = this.add.circle(0, 0, GAME_CONFIG.bulletRadius, color);
                container.add(circle);
                break;
            }
        }

        return container;
    }

    createBlock(block: Block) {
        const container = this.add.container(block.x, block.y);
        const blockType = block.blockType as BlockItem;
        const color = BLOCK_CONFIG[blockType]?.color || 0x884400;
        
        const blockRect = this.add.rectangle(0, 0, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, color);
        container.add(blockRect);
        
        // Neutral blocks - use gray health bar
        const healthBarColor = 0x888888;
        
        const healthBarBg = this.add.rectangle(0, -25, GAME_CONFIG.blockSize, 4, 0x000000);
        const healthBarFg = this.add.rectangle(0, -25, GAME_CONFIG.blockSize, 4, healthBarColor);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        container.setData('healthBarFg', healthBarFg);
        container.setData('blockRect', blockRect);
        container.setData('maxHP', block.maxHP);
        
        return container;
    }

    createBed(bed: Bed) {
        const container = this.add.container(bed.x, bed.y);
        const color = bed.teamId === 'red' ? 0xff0000 : 0x0000ff;
        const bedRect = this.add.rectangle(0, 0, 60, 40, color);
        container.add(bedRect);
        
        const healthBarBg = this.add.rectangle(0, -30, 60, 5, 0x000000);
        const healthBarFg = this.add.rectangle(0, -30, 60, 5, 0x00ff00);
        healthBarFg.setOrigin(0.5, 0.5);
        
        container.add(healthBarBg);
        container.add(healthBarFg);
        
        container.setData('healthBarFg', healthBarFg);
        container.setData('maxHP', bed.maxHP);
        
        return container;
    }

    update(time: number, delta: number): void {
        if (!this.room) return;

        // Open Chat (T key)
        if (Phaser.Input.Keyboard.JustDown(this.tKey)) {
            if (!gameStore.isChatOpen) {
                gameStore.toggleChat(true);
                // Clear the input buffer to prevent 't' from being typed immediately
                // React will handle focus.
            }
        }

        // Update timers and UI
        this.updateTimers();
        this.updateAirWalls();
        this.updateKillFeed();
        
        // Check for game end (handled by React UI now)
        if (this.room.state.gamePhase === 'ended' && this.lastGamePhase !== 'ended') {
            this.showEndGame();
        }
        
        this.lastGamePhase = this.room.state.gamePhase;

        this.elapsedTime += delta;
        while (this.elapsedTime >= this.fixedTimeStep) {
            this.elapsedTime -= this.fixedTimeStep;
            this.fixedTick();
        }

        const t = 0.2;
        this.entityVisuals.forEach((visual, id) => {
            if (visual.getData('serverX') !== undefined) {
                visual.x = Phaser.Math.Linear(visual.x, visual.getData('serverX'), t);
                visual.y = Phaser.Math.Linear(visual.y, visual.getData('serverY'), t);
            }
        });

        // Check if player is near their team's bed
        this.checkNearBed();
        
        // Rotate player visual (disabled when game ended)
        if (!this.room.state.isFrozen) {
            const playerVisual = this.entityVisuals.get(this.currentPlayerId);
            if (playerVisual && playerVisual instanceof Phaser.GameObjects.Container) {
                const shipContainer = playerVisual.getData('shipContainer');
                if (shipContainer) {
                    const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                    const angle = Phaser.Math.Angle.Between(playerVisual.x, playerVisual.y, worldPoint.x, worldPoint.y);
                    shipContainer.rotation = angle;
                }
            }
        }

        // UI Update & Preview - Block placement preview (runs every frame)
        const player = this.room.state.entities.get(this.currentPlayerId) as Player;
        if (player && player.inventory) {
            // Determine if we should show block preview
            const selectedSlotIndex = player.selectedSlot;
            // Convert ArraySchema to array for proper access
            const inventoryArray = Array.from(player.inventory);
            const selectedItem = inventoryArray[selectedSlotIndex];
            // Check if item is valid and not empty
            const isValidItem = selectedItem && selectedItem.itemId && selectedItem.itemId !== ItemType.EMPTY;
            const isBlockItem = isValidItem && isBlock(selectedItem.itemId as ItemType);
            
            // Debug: log once per second
            if (Math.floor(time / 1000) !== Math.floor((time - delta) / 1000)) {
                console.log('Block Preview Debug:', {
                    selectedSlotIndex,
                    selectedItemId: selectedItem?.itemId,
                    selectedItemCount: selectedItem?.count,
                    isValidItem,
                    isBlockItem,
                    inventoryLength: inventoryArray.length
                });
            }
            
            if (isBlockItem) {
                 // Block Preview Logic - Always show grid when holding blocks
                 if (!this.isGridDrawn) {
                     this.drawGrid();
                     this.isGridDrawn = true;
                 }
                 this.gridGraphics.setVisible(true);
                 
                 // Get mouse position in world coordinates
                 const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                 const gridSize = GAME_CONFIG.gridSize;
                 const gridX = Math.round(worldPoint.x / gridSize) * gridSize;
                 const gridY = Math.round(worldPoint.y / gridSize) * gridSize;
                 
                 // Get player visual for distance check
                 const playerVisual = this.entityVisuals.get(this.currentPlayerId);
                 if (playerVisual) {
                     const distance = Math.sqrt((gridX - playerVisual.x) ** 2 + (gridY - playerVisual.y) ** 2);
                     const inRange = distance <= GAME_CONFIG.maxPlaceRange;
                     
                     // Check if position is already occupied by another block
                     let isOccupied = false;
                     this.room.state.entities.forEach((entity: Entity) => {
                         if (entity.type === 'block') {
                             const dx = Math.abs(entity.x - gridX);
                             const dy = Math.abs(entity.y - gridY);
                             if (dx < gridSize / 2 && dy < gridSize / 2) {
                                 isOccupied = true;
                             }
                         }
                     });
                     
                     // Update preview position
                     this.blockPreview.setPosition(gridX, gridY);
                     const blockColor = ITEM_DEFINITIONS[selectedItem.itemId]?.color || 0xffffff;
                     
                     // Green = can place, Red = cannot place
                     const canPlace = inRange && selectedItem.count > 0 && !isOccupied;
                     if (canPlace) {
                         this.blockPreview.setFillStyle(blockColor, 0.6);
                         this.blockPreview.setStrokeStyle(4, 0x00ff00);
                     } else {
                         this.blockPreview.setFillStyle(0xff0000, 0.4);
                         this.blockPreview.setStrokeStyle(4, 0xff0000);
                     }
                     this.blockPreview.setVisible(true);
                 }
            } else {
                 this.gridGraphics.setVisible(false);
                 this.blockPreview.setVisible(false);
            }
        } else {
            // No player or inventory, hide preview
            this.gridGraphics.setVisible(false);
            this.blockPreview.setVisible(false);
        }
    }
    
    drawGrid() {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0xffffff, 0.2);  // More visible white lines
        
        const gridSize = GAME_CONFIG.gridSize;
        const mapWidth = GAME_CONFIG.mapWidth;
        const mapHeight = GAME_CONFIG.mapHeight;
        
        for (let x = 0; x <= mapWidth; x += gridSize) {
            this.gridGraphics.lineBetween(x, 0, x, mapHeight);
        }
        
        for (let y = 0; y <= mapHeight; y += gridSize) {
            this.gridGraphics.lineBetween(0, y, mapWidth, y);
        }
    }

    fixedTick() {
        this.currentTick++;
        
        // Safety check: ensure room and state are ready
        if (!this.room || !this.room.state || !this.room.state.entities) {
            return;
        }
        
        // Freeze inputs if game ended
        if (this.room.state.isFrozen) {
            return;
        }
        
        // Freeze inputs if chat is open
        if (gameStore.isChatOpen) {
            return;
        }
        
        const player = this.room.state.entities.get(this.currentPlayerId) as Player;
        if (!player || player.isDead) {
            return;
        }

        this.inputPayload.left = this.cursorKeys.left.isDown || this.aKey.isDown;
        this.inputPayload.right = this.cursorKeys.right.isDown || this.dKey.isDown;
        this.inputPayload.up = this.cursorKeys.up.isDown || this.wKey.isDown;
        this.inputPayload.down = this.cursorKeys.down.isDown || this.sKey.isDown;
        this.inputPayload.tick = this.currentTick;
        
        // Slot Switching
        this.inputPayload.selectedSlot = undefined;
        for (let i = 0; i < this.inventoryKeys.length; i++) {
            if (Phaser.Input.Keyboard.JustDown(this.inventoryKeys[i])) {
                this.inputPayload.selectedSlot = i; // 0-8
                break;
            }
        }
        
        // Drop Item (Q key)
        this.inputPayload.dropItem = Phaser.Input.Keyboard.JustDown(this.qKey);

        // Switch Character (Tab key)
        if (Phaser.Input.Keyboard.JustDown(this.tabKey)) {
            this.room.send("switch_character");
        }
        
        // Action Inputs
        const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
        this.inputPayload.isDown = this.mousePointer.leftButtonDown();  // 左键 - 远程攻击/放置方块
        this.inputPayload.isRightDown = this.eKey.isDown;  // E键 - 近战攻击
        this.inputPayload.mouseX = worldPoint.x;
        this.inputPayload.mouseY = worldPoint.y;
        
        // Client-side prediction for sound (simplified)
        // Actual sound is triggered by logic, but for place block sound we might want immediate feedback?
        // The original code had immediate feedback for place block. Let's keep it simple for now.
        // If we really want immediate sound we need to check local state + cooldowns.
        // Leaving it to server events/state updates for now to ensure sync.

        this.room.send(0, this.inputPayload);
        
        this.lastMouseDown = this.mousePointer.isDown;
    }

    checkNearBed() {
        const player = gameStore.currentPlayer;
        if (!player || !this.room || !this.room.state) return;

        // Find the player's team bed
        let teamBed: Bed | null = null;
        this.room.state.entities.forEach((entity) => {
            if (entity.type === 'bed') {
                const bed = entity as Bed;
                if (bed.teamId === player.teamId) {
                    teamBed = bed;
                }
            }
        });

        if (!teamBed) {
            gameStore.setNearBed(false);
            return;
        }

        // Calculate distance
        const dx = player.x - teamBed.x;
        const dy = player.y - teamBed.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        gameStore.setNearBed(distance <= SHOP_INTERACTION_RANGE);
    }

    createDroppedItem(drop: DroppedItem): Phaser.GameObjects.Container {
        const container = this.droppedItemRenderer.createDroppedItem(
            drop.itemType as ItemType,
            drop.count,
            drop.x,
            drop.y
        );

        // Listen for count changes
        const updateCount = () => {
            this.droppedItemRenderer.updateCount(container, drop.count);
        };

        // Note: Colyseus onChange for primitive properties
        // We'll update count via the main onChange handler in onAdd

        return container;
    }

    createResourceGenerator(generator: ResourceGenerator): Phaser.GameObjects.Container {
        const container = this.add.container(generator.x, generator.y);

        // Create visual representation
        const size = RESOURCE_GENERATOR_CONFIG.generatorRadius;
        
        // Base circle
        const base = this.add.circle(0, 0, size, RESOURCE_GENERATOR_CONFIG.generatorColor, 0.6);
        
        // Rotating outer ring
        const ring = this.add.graphics();
        ring.lineStyle(3, RESOURCE_GENERATOR_CONFIG.generatorColor, 1);
        ring.strokeCircle(0, 0, size + 5);
        
        // Center glow
        const glow = this.add.circle(0, 0, size * 0.6, 0xffffff, 0.4);
        
        container.add([base, ring, glow]);

        // Add pulsing animation
        this.tweens.add({
            targets: glow,
            alpha: 0.1,
            scale: 1.2,
            duration: 1500,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Add rotation animation to ring
        this.tweens.add({
            targets: ring,
            angle: 360,
            duration: 4000,
            ease: 'Linear',
            repeat: -1
        });

        // Add text label
        const label = this.add.text(0, -size - 15, 
            generator.generatorType === 'gold_generator' ? 'Gold' : 'Resources',
            {
                fontSize: '12px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setOrigin(0.5);
        container.add(label);

        return container;
    }

    updateTimers() {
        if (!this.room || !this.room.state) return;
        
        const state = this.room.state;
        const currentTime = Date.now();
        const totalElapsed = currentTime - state.gameStartTime;
        const totalRemaining = Math.max(0, GAME_CONFIG.totalGameDuration - totalElapsed);
        
        // Total Timer
        const totalSeconds = Math.ceil(totalRemaining / 1000);
        const totalMins = Math.floor(totalSeconds / 60);
        const totalSecs = totalSeconds % 60;
        const totalTimeStr = `${totalMins}:${totalSecs.toString().padStart(2, '0')}`;
        
        // Phase Timer
        const phaseRemaining = Math.max(0, state.phaseEndTime - currentTime);
        const phaseSeconds = Math.ceil(phaseRemaining / 1000);
        const phaseMins = Math.floor(phaseSeconds / 60);
        const phaseSecs = phaseSeconds % 60;
        const phaseTimeStr = `${phaseMins}:${phaseSecs.toString().padStart(2, '0')}`;
        
        // Phase Name and Color
        let phaseName = '🏗️ BUILDING PHASE';
        let phaseColor = '#ffff00';
        
        switch (state.gamePhase) {
            case 'building':
                phaseName = '🏗️ BUILDING PHASE';
                phaseColor = '#ffff00';
                break;
            case 'combat':
                phaseName = '⚔️ COMBAT PHASE';
                phaseColor = '#ff0000';
                break;
            case 'deathmatch':
                phaseName = '💀 DEATHMATCH!';
                phaseColor = '#ff00ff';
                break;
            case 'ended':
                phaseName = 'GAME ENDED';
                phaseColor = '#888888';
                break;
        }
        
        // Update React UI via GameStore
        gameStore.updateTimer({
            totalTime: totalTimeStr,
            phaseTime: phaseTimeStr,
            phaseName: phaseName,
            phaseColor: phaseColor
        });
    }

    updateAirWalls() {
        if (!this.room || !this.room.state) return;
        
        if (this.room.state.gamePhase === 'building') {
            // Show air walls
            this.redAirWall.clear();
            this.redAirWall.lineStyle(3, 0x00ff00, 0.6);
            this.redAirWall.fillStyle(0x00ff00, 0.1);
            this.redAirWall.strokeCircle(
                GAME_CONFIG.redBedPos.x,
                GAME_CONFIG.redBedPos.y,
                GAME_CONFIG.buildingPhaseRadius
            );
            this.redAirWall.fillCircle(
                GAME_CONFIG.redBedPos.x,
                GAME_CONFIG.redBedPos.y,
                GAME_CONFIG.buildingPhaseRadius
            );
            
            this.blueAirWall.clear();
            this.blueAirWall.lineStyle(3, 0x00ff00, 0.6);
            this.blueAirWall.fillStyle(0x00ff00, 0.1);
            this.blueAirWall.strokeCircle(
                GAME_CONFIG.blueBedPos.x,
                GAME_CONFIG.blueBedPos.y,
                GAME_CONFIG.buildingPhaseRadius
            );
            this.blueAirWall.fillCircle(
                GAME_CONFIG.blueBedPos.x,
                GAME_CONFIG.blueBedPos.y,
                GAME_CONFIG.buildingPhaseRadius
            );
        } else {
            // Hide air walls
            this.redAirWall.clear();
            this.blueAirWall.clear();
        }
    }

    updateKillFeed() {
        if (!this.room || !this.room.state) return;
        
        const killFeed = this.room.state.killFeed;
        
        if (killFeed.length !== this.lastKillFeedLength) {
            this.lastKillFeedLength = killFeed.length;
            
            // Get the latest message and add to GameStore
            if (killFeed.length > 0) {
                const latestMessage = killFeed[killFeed.length - 1];
                gameStore.addKillFeedMessage(latestMessage);
            }
        }
    }

    showEndGame() {
        if (!this.room || !this.room.state) return;
        
        const winner = this.room.state.winner;
        
        // Collect player stats
        const playerStats: Array<{
            id: string;
            username: string;
            kills: number;
            deaths: number;
            damage: number;
            teamId: string;
        }> = [];
        this.room.state.entities.forEach((entity: Entity, id: string) => {
            // Use type check instead of instanceof (Colyseus client Schema objects may not be true instances)
            if (entity.type === 'player') {
                const player = entity as Player;
                playerStats.push({
                    id,
                    username: player.username || id.substring(0, 8),
                    kills: player.kills || 0,
                    deaths: player.deaths || 0,
                    damage: player.damageDealt || 0,
                    teamId: player.teamId
                });
            }
        });
        
        // Send data to React UI via GameStore
        gameStore.setGameEnded(true, winner, playerStats);
    }

    showDamageNumber(x: number, y: number, damage: number) {
        const damageText = this.add.text(x, y, `-${damage}`, {
            fontSize: '18px',
            color: '#ff0000',
            stroke: '#000000',
            strokeThickness: 3,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(150);
        
        this.tweens.add({
            targets: damageText,
            y: y - 40,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => damageText.destroy()
        });
    }
}
