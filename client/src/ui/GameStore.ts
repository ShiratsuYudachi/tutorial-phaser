import { Client, Room } from "colyseus.js";
import { GameState, Player } from "../../../server/src/shared/Schema";
import { BACKEND_URL } from "../backend";
import { useState, useEffect } from "react";

type Listener = () => void;

class GameStore {
    client: Client;
    room?: Room<GameState>;
    currentPlayerId?: string;
    listeners: Set<Listener> = new Set();
    isReady: boolean = false;
    private connectPromise?: Promise<Room<GameState>>;
    
    // Shop state
    isShopOpen: boolean = false;
    isNearBed: boolean = false;

    // Singleton instance
    static instance = new GameStore();

    constructor() {
        this.client = new Client(BACKEND_URL);
    }

    async connect() {
        // Prevent multiple connections
        if (this.connectPromise) {
            return this.connectPromise;
        }

        this.connectPromise = (async () => {
            try {
                this.room = await this.client.joinOrCreate<GameState>("game_room", {});
                // this.currentPlayerId = this.room.sessionId; // Removed: determined by active character
                console.log("GameStore connected to room:", this.room.name);
                
                // Wait for state to be ready
                await this.waitForState();
                
                // Setup listeners after state is ready
                this.setupStateListeners();
                
                this.isReady = true;
                console.log("GameStore is ready");
                this.notify();
                
                return this.room;
            } catch (e) {
                console.error("GameStore join error", e);
                throw e;
            }
        })();

        return this.connectPromise;
    }

    private async waitForState(): Promise<void> {
        if (!this.room) return;

        // If state and entities are already available, return immediately
        if (this.room.state && this.room.state.entities) {
            console.log("GameStore: state already available");
            return;
        }

        // Otherwise, wait for the first state change
        return new Promise((resolve) => {
            console.log("GameStore: waiting for state...");
            this.room!.onStateChange.once((state) => {
                console.log("GameStore: state received", state);
                resolve();
            });
        });
    }

    setupStateListeners() {
        if (!this.room || !this.room.state) return;
        
        console.log("GameStore: setting up listeners");
        
        // Listen for any state change to notify UI
        this.room.onStateChange((state) => {
            this.notify();
        });

        // Helper to setup player listeners
        const setupPlayerListeners = (player: any, id: string) => {
             // Listen to property changes
             if (player.onChange) {
                player.onChange(() => {
                    if (player.isActive && this.currentPlayerId !== id) {
                        this.currentPlayerId = id;
                        this.notify();
                    }
                    console.log("GameStore: player changed");
                    this.notify();
                });
             }

             // Listen to inventory changes
             if (player.inventory) {
                 const inventory = player.inventory as any;
                 
                 if (inventory.onAdd) inventory.onAdd(() => {
                     console.log("GameStore: inventory item added");
                     this.notify();
                 });
                 if (inventory.onRemove) inventory.onRemove(() => {
                     console.log("GameStore: inventory item removed");
                     this.notify();
                 });
                 if (inventory.onChange) inventory.onChange(() => {
                     console.log("GameStore: inventory changed");
                     this.notify();
                 });
             }
        };

        // 1. Check existing entities for active player
        this.room.state.entities.forEach((entity: any, id: string) => {
            if (entity.type === 'player' && entity.ownerSessionId === this.room!.sessionId) {
                setupPlayerListeners(entity, id);
                if (entity.isActive) {
                    this.currentPlayerId = id;
                    console.log("GameStore: Found initial active player", id);
                    this.notify();
                }
            }
        });

        // 2. Listen for new entities
        const entities = this.room.state.entities as any;
        
        if (entities && entities.onAdd) {
            entities.onAdd((entity: any, id: string) => {
                console.log("GameStore: entity added", id);
                
                if (entity.type === 'player' && entity.ownerSessionId === this.room!.sessionId) {
                     setupPlayerListeners(entity, id);
                     if (entity.isActive) {
                         this.currentPlayerId = id;
                         this.notify();
                     }
                }
            });
        }
    }

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    get currentPlayer() {
        if (!this.isReady) {
            return null;
        }
        if (!this.room || !this.room.state || !this.currentPlayerId) {
            return null;
        }
        if (!this.room.state.entities) {
            return null;
        }
        
        const player = this.room.state.entities.get(this.currentPlayerId);
        return player as Player | null;
    }

    // Shop methods
    openShop() {
        this.isShopOpen = true;
        this.notify();
    }

    closeShop() {
        this.isShopOpen = false;
        this.notify();
    }

    setNearBed(isNear: boolean) {
        if (this.isNearBed !== isNear) {
            this.isNearBed = isNear;
            this.notify();
        }
    }

    executeTrade(tradeId: string) {
        if (this.room) {
            this.room.send("shop_trade", { tradeId });
        }
    }
}

export const gameStore = GameStore.instance;

export function useCurrentPlayer() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const update = () => {
            setTick(t => t + 1);
        };
        return gameStore.subscribe(update);
    }, []);

    return gameStore.currentPlayer;
}

export function useGameStoreReady() {
    const [isReady, setIsReady] = useState(gameStore.isReady);

    useEffect(() => {
        const update = () => {
            setIsReady(gameStore.isReady);
        };
        return gameStore.subscribe(update);
    }, []);

    return isReady;
}

export function useShopState() {
    const [isOpen, setIsOpen] = useState(gameStore.isShopOpen);
    const [isNearBed, setIsNearBed] = useState(gameStore.isNearBed);

    useEffect(() => {
        const update = () => {
            setIsOpen(gameStore.isShopOpen);
            setIsNearBed(gameStore.isNearBed);
        };
        return gameStore.subscribe(update);
    }, []);

    return { isOpen, isNearBed };
}
