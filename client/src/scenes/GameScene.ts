import Phaser from "phaser";
import { Room, Client, getStateCallbacks } from "colyseus.js";
import { BACKEND_URL } from "../backend";

import type { GameState } from "../../../server/src/shared/Schema";
import { Player, Bullet, Block, Bed, Entity } from "../../../server/src/shared/Schema";
import { GAME_CONFIG, WALLS, WEAPON_CONFIG, BLOCK_CONFIG, INVENTORY_SIZE, ITEM_DEFINITIONS, ItemType, WeaponItem, BlockItem, isWeapon, isBlock, SHOP_INTERACTION_RANGE } from "../../../server/src/shared/Constants";
import { InputData } from "../../../server/src/shared/Schema";

import { gameStore } from "../ui/GameStore";

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

    // UI Elements
    // REMOVED Phaser Inventory UI Elements
    
    // Preview
    blockPreview: Phaser.GameObjects.Rectangle;
    gridGraphics: Phaser.GameObjects.Graphics;
    
    // Audio
    bowShootSound: Phaser.Sound.BaseSound;
    fireballShootSound: Phaser.Sound.BaseSound;
    dartShootSound: Phaser.Sound.BaseSound;
    placeBlockSound: Phaser.Sound.BaseSound;
    lastMouseDown: boolean = false;
    
    inputPayload: InputData = {
        left: false, right: false, up: false, down: false,
        tick: 0, 
        isDown: false,
        mouseX: 0,
        mouseY: 0
    };

    currentTick: number = 0;
    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;

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

        this.mousePointer = this.input.activePointer;
        await this.connect();
        this.cameras.main.setBounds(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
        
        // UI Initialization
        // this.createInventoryUI(); // Removed
        
        // Preview elements
        this.blockPreview = this.add.rectangle(0, 0, GAME_CONFIG.blockSize, GAME_CONFIG.blockSize, 0xffffff, 0.5);
        this.blockPreview.setStrokeStyle(2, 0xffffff);
        this.blockPreview.setVisible(false);
        this.blockPreview.setDepth(50);
        
        this.gridGraphics = this.add.graphics();
        this.gridGraphics.setDepth(1);
        this.gridGraphics.setVisible(false);
        
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

        const graphics = this.add.graphics();
        graphics.fillStyle(0x888888, 1);
        WALLS.forEach(wall => graphics.fillRect(wall.x, wall.y, wall.width, wall.height));
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
                }

                if (visual) {
                    this.entityVisuals.set(id, visual);

                    $(entity).onChange(() => {
                        visual.setData('serverX', entity.x);
                        visual.setData('serverY', entity.y);
                        
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
        const container = this.add.container(player.x, player.y);
        const shipContainer = this.add.container(0, 0);
        const ship = this.add.graphics();
        const color = player.teamId === 'red' ? 0xff0000 : 0x0000ff;

        ship.fillStyle(color, 1);
        ship.fillTriangle(15, 0, -10, -10, -10, 10);

        shipContainer.add(ship);
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
        const color = WEAPON_CONFIG[weaponType]?.color || 0xffff00;
        return this.add.circle(bullet.x, bullet.y, GAME_CONFIG.bulletRadius, color);
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
        
        // Rotate player visual
        const playerVisual = this.entityVisuals.get(this.currentPlayerId);
        if (playerVisual && playerVisual instanceof Phaser.GameObjects.Container) {
            const shipContainer = playerVisual.getData('shipContainer');
            if (shipContainer) {
                const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                const angle = Phaser.Math.Angle.Between(playerVisual.x, playerVisual.y, worldPoint.x, worldPoint.y);
                shipContainer.rotation = angle;
            }
        }

        // UI Update & Preview
        const player = this.room.state.entities.get(this.currentPlayerId) as Player;
        if (player) {
            // this.updateInventoryUI(player); // Removed
            
            // Determine if we should show block preview
            const selectedSlotIndex = player.selectedSlot;
            const selectedItem = player.inventory[selectedSlotIndex];
            // Check if item is valid and not empty
            const isValidItem = selectedItem && selectedItem.itemId && selectedItem.itemId !== ItemType.EMPTY;
            const itemDef = isValidItem ? ITEM_DEFINITIONS[selectedItem.itemId] : null;
            
            if (isValidItem && isBlock(selectedItem.itemId as ItemType)) {
                 // Block Preview Logic
                 this.gridGraphics.setVisible(true);
                 this.drawGrid();
                 
                 const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
                 const gridSize = GAME_CONFIG.gridSize;
                 const gridX = Math.round(worldPoint.x / gridSize) * gridSize;
                 const gridY = Math.round(worldPoint.y / gridSize) * gridSize;
                 
                 if (playerVisual) {
                     const distance = Math.sqrt((gridX - playerVisual.x) ** 2 + (gridY - playerVisual.y) ** 2);
                     const inRange = distance <= GAME_CONFIG.maxPlaceRange;
                     
                     this.blockPreview.setPosition(gridX, gridY);
                     const blockColor = ITEM_DEFINITIONS[selectedItem.itemId]?.color || 0xffffff;
                     
                     if (inRange && selectedItem.count > 0) {
                         this.blockPreview.setFillStyle(blockColor, 0.5);
                         this.blockPreview.setStrokeStyle(2, 0x00ff00);
                     } else {
                         this.blockPreview.setFillStyle(blockColor, 0.3);
                         this.blockPreview.setStrokeStyle(2, 0xff0000);
                     }
                     this.blockPreview.setVisible(true);
                 }
            } else {
                 this.gridGraphics.setVisible(false);
                 this.blockPreview.setVisible(false);
            }
        }
    }
    
    drawGrid() {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0x888888, 0.3);
        
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
        
        // Action Inputs
        const worldPoint = this.cameras.main.getWorldPoint(this.mousePointer.x, this.mousePointer.y);
        this.inputPayload.isDown = this.mousePointer.isDown;
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
}
