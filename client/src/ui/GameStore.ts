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

    // Singleton instance
    static instance = new GameStore();

    constructor() {
        this.client = new Client(BACKEND_URL);
    }

    async connect() {
        try {
            this.room = await this.client.joinOrCreate<GameState>("game_room", {});
            this.currentPlayerId = this.room.sessionId;
            console.log("GameStore connected to room:", this.room.name);
            
            // Ensure state is available before setting up listeners
            if (this.room.state && this.room.state.entities) {
                this.setupStateListeners();
            } else {
                console.log("GameStore: waiting for state...");
                this.room.onStateChange.once((state) => {
                    console.log("GameStore: state received", state);
                    this.setupStateListeners();
                    this.notify();
                });
            }

            this.notify();
            return this.room;
        } catch (e) {
            console.error("GameStore join error", e);
            throw e;
        }
    }

    setupStateListeners() {
        if (!this.room) return;
        
        // Listen for player changes to notify UI
        // Cast to any to bypass type check errors for onAdd if necessary, 
        // though MapSchema should have onAdd.
        const entities = this.room.state.entities as any;
        
        if (entities && entities.onAdd) {
            entities.onAdd((entity: any, sessionId: string) => {
                if (sessionId === this.currentPlayerId) {
                     // Notify immediately when player is added
                     this.notify();
    
                     const player = entity;
                     
                     // Listen to property changes (like selectedSlot)
                     if (player.onChange) {
                        player.onChange(() => this.notify());
                     }
    
                     // Listen to inventory changes
                     if (player.inventory) {
                         const inventory = player.inventory as any;
                         
                         if (inventory.onAdd) inventory.onAdd(() => this.notify());
                         if (inventory.onRemove) inventory.onRemove(() => this.notify());
                         if (inventory.onChange) inventory.onChange(() => this.notify());
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
        if (!this.room) {
            console.warn("GameStore: Room is undefined");
            return null;
        }
        if (!this.room.state) {
            console.warn("GameStore: Room state is undefined");
            return null;
        }
        if (!this.currentPlayerId) {
            console.warn("GameStore: currentPlayerId is undefined");
            return null;
        }
        // Add safety check for entities map being available
        if (!this.room.state.entities) {
            console.warn("GameStore: entities map is undefined");
            return null;
        }
        
        const player = this.room.state.entities.get(this.currentPlayerId);
        if (!player) {
            console.warn(`GameStore: Player entity not found for ID ${this.currentPlayerId}`);
        }
        
        return player as Player | null;
    }
}

export const gameStore = GameStore.instance;

export function useCurrentPlayer() {
    const [, setTick] = useState(0);

    useEffect(() => {
        const update = () => {
            setTick(t => t + 1);
            console.log("GameStore updated. Current player:", gameStore.currentPlayer?.inventory);
        };
        // Initial sync check if needed, but subscribe handles future updates.
        // If we want to ensure we have the latest immediately:
        // update(); 
        return gameStore.subscribe(update);
    }, []);

    return gameStore.currentPlayer;
}
