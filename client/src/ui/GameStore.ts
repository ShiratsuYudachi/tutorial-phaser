import { Room } from "colyseus.js";
import type { GameState } from "../../../server/src/shared/Schema";

type Listener = () => void;

class GameStore {
    room?: Room<GameState>;
    currentPlayerId?: string;
    listeners: Set<Listener> = new Set();

    // Singleton instance
    static instance = new GameStore();

    setRoom(room: Room<GameState>, playerId: string) {
        this.room = room;
        this.currentPlayerId = playerId;
        this.notify();
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
        if (!this.room || !this.room.state || !this.currentPlayerId) return null;
        // Add safety check for entities map being available
        if (!this.room.state.entities) return null;
        return this.room.state.entities.get(this.currentPlayerId);
    }
}

export const gameStore = GameStore.instance;

