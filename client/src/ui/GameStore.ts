import { Client, Room, getStateCallbacks } from "colyseus.js";
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

    // Timer state
    totalTime: string = '4:00';
    phaseTime: string = '0:30';
    phaseName: string = '🏗️ BUILDING PHASE';
    phaseColor: string = '#ffff00';

    // Kill feed
    killFeed: string[] = [];

    // Game ended state
    isGameEnded: boolean = false;
    gameWinner: string = '';
    playerStats: Array<{
        id: string;
        username: string;
        kills: number;
        deaths: number;
        damage: number;
        teamId: string;
    }> = [];
    
    // Rematch state
    rematchReady: Map<string, boolean> = new Map();
    rematchCountdown: number = 0;
    mySessionId: string = '';

    // Chat state
    chatMessages: Array<{ sender: string; text: string; teamId: string }> = [];
    isChatOpen: boolean = false;

    // Notification state
    notifications: Array<{ id: string; text: string; color: string }> = [];

    // Singleton instance
    static instance = new GameStore();

    constructor() {
        this.client = new Client(BACKEND_URL);
    }

    async connect(options?: { username?: string; userId?: string }) {
        // Prevent multiple connections
        if (this.connectPromise) {
            return this.connectPromise;
        }

        // Get player info from window if available
        const playerInfo = (window as any).playerInfo || {};
        const joinOptions = {
            username: options?.username || playerInfo.username || 'Guest',
            userId: options?.userId || playerInfo.userId || ''
        };

        this.connectPromise = (async () => {
            try {
                this.room = await this.client.joinOrCreate<GameState>("game_room", joinOptions);
                this.mySessionId = this.room.sessionId;
                console.log("GameStore connected to room:", this.room.name, "as", joinOptions.username);
                
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
        
        // Use the new getStateCallbacks API for proper state change tracking
        const $ = getStateCallbacks(this.room);
        
        // Listen for any state change to notify UI
        this.room.onStateChange((state) => {
            this.notify();
        });

        // Helper to setup player listeners
        const setupPlayerListeners = (player: any, id: string) => {
             // Listen to property changes
             $(player).onChange(() => {
                 if (player.isActive && this.currentPlayerId !== id) {
                     this.currentPlayerId = id;
                     this.notify();
                 }
                 console.log("GameStore: player changed");
                 this.notify();
             });

             // Listen to inventory changes using $ callbacks
             if (player.inventory) {
                 $(player.inventory).onAdd(() => {
                     console.log("GameStore: inventory item added");
                     this.notify();
                 });
                 $(player.inventory).onRemove(() => {
                     console.log("GameStore: inventory item removed");
                     this.notify();
                 });
                 $(player.inventory).onChange(() => {
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
        $(this.room.state).entities.onAdd((entity: any, id: string) => {
            console.log("GameStore: entity added", id);
            
            if (entity.type === 'player' && entity.ownerSessionId === this.room!.sessionId) {
                 setupPlayerListeners(entity, id);
                 if (entity.isActive) {
                     this.currentPlayerId = id;
                     this.notify();
                 }
            }
        });
        
        // 3. Sync existing rematchReady values first
        const state = this.room.state as any;
        if (state.rematchReady) {
            state.rematchReady.forEach((value: boolean, sessionId: string) => {
                console.log('GameStore: initial sync rematchReady', sessionId, '=', value);
                this.rematchReady.set(sessionId, value);
            });
        }
        
        // 4. Listen for rematch state changes using the correct $ callbacks API
        $(this.room.state).rematchReady.onAdd((value: boolean, sessionId: string) => {
            console.log('GameStore: rematchReady.onAdd', sessionId, '=', value);
            this.rematchReady.set(sessionId, value);
            this.notify();
        });
        
        $(this.room.state).rematchReady.onChange((value: boolean, sessionId: string) => {
            console.log('GameStore: rematchReady.onChange', sessionId, '=', value);
            this.rematchReady.set(sessionId, value);
            this.notify();
        });
        
        $(this.room.state).rematchReady.onRemove((value: boolean, sessionId: string) => {
            console.log('GameStore: rematchReady.onRemove', sessionId);
            this.rematchReady.delete(sessionId);
            this.notify();
        });
        
        // 5. Listen for countdown changes
        $(this.room.state).listen("rematchCountdown", (value: number) => {
            console.log('GameStore: rematchCountdown changed', this.rematchCountdown, '->', value);
            this.rematchCountdown = value;
            this.notify();
        });
        
        // 6. Listen for chat messages
        this.room.onMessage("chat_message", (message: { sender: string; text: string; teamId: string }) => {
            console.log("GameStore: received chat message", message);
            this.chatMessages.push(message);
            if (this.chatMessages.length > 50) {
                this.chatMessages.shift();
            }
            this.notify();
        });

        // 7. Listen for notifications
        this.room.onMessage("notification", (data: { text: string; color: string }) => {
            console.log("GameStore: received notification", data);
            this.addNotification(data.text, data.color);
        });
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

    // Timer methods
    updateTimer(data: { totalTime: string; phaseTime: string; phaseName: string; phaseColor: string }) {
        this.totalTime = data.totalTime;
        this.phaseTime = data.phaseTime;
        this.phaseName = data.phaseName;
        this.phaseColor = data.phaseColor;
        this.notify();
    }

    // Kill feed methods
    addKillFeedMessage(message: string) {
        this.killFeed = [...this.killFeed.slice(-4), message];
        this.notify();
    }

    clearKillFeed() {
        this.killFeed = [];
        this.notify();
    }

    // Game ended methods
    setGameEnded(ended: boolean, winner?: string, playerStats?: Array<any>) {
        this.isGameEnded = ended;
        if (winner) {
            this.gameWinner = winner;
        }
        if (playerStats) {
            this.playerStats = playerStats;
        }
        // Close shop when game ends
        if (ended && this.isShopOpen) {
            this.isShopOpen = false;
        }
        // Clear rematch state when new game ends
        if (ended) {
            this.rematchReady.clear();
            this.rematchCountdown = 0;
        }
        this.notify();
    }
    
    // Rematch methods
    sendReadyForRematch() {
        console.log('===== sendReadyForRematch called =====');
        console.log('  mySessionId:', this.mySessionId);
        console.log('  room exists:', !!this.room);
        
        if (this.room) {
            const gamePhase = (this.room.state as any)?.gamePhase;
            console.log('  Current gamePhase:', gamePhase);
            
            if (gamePhase !== 'ended') {
                console.warn('  WARNING: Game not ended yet! gamePhase =', gamePhase);
                console.warn('  Message may be ignored by server');
            }
            
            console.log('  Sending "ready_for_rematch" message...');
            this.room.send("ready_for_rematch");
            console.log('  ✅ Message sent successfully');
            
            // Immediately check if it was added to local state
            setTimeout(() => {
                const isReady = this.rematchReady.get(this.mySessionId);
                console.log('  After 100ms, myReady =', isReady);
                if (!isReady) {
                    console.error('  ❌ WARNING: rematchReady not updated after 100ms!');
                    console.error('  This suggests the server may not have processed the message');
                }
            }, 100);
        } else {
            console.error('  ❌ ERROR: No room available!');
        }
    }
    
    // Chat methods
    toggleChat(isOpen?: boolean) {
        this.isChatOpen = isOpen !== undefined ? isOpen : !this.isChatOpen;
        this.notify();
    }

    sendChatMessage(text: string) {
        if (this.room) {
            this.room.send("chat_message", { text });
        }
    }

    // Notification methods
    addNotification(text: string, color: string = '#ffffff') {
        const id = Math.random().toString(36).substr(2, 9);
        this.notifications.push({ id, text, color });
        this.notify();
        
        setTimeout(() => {
            this.notifications = this.notifications.filter(n => n.id !== id);
            this.notify();
        }, 3000);
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

export function useGameTimer() {
    const [totalTime, setTotalTime] = useState(gameStore.totalTime);
    const [phaseTime, setPhaseTime] = useState(gameStore.phaseTime);
    const [phaseName, setPhaseName] = useState(gameStore.phaseName);
    const [phaseColor, setPhaseColor] = useState(gameStore.phaseColor);

    useEffect(() => {
        const update = () => {
            setTotalTime(gameStore.totalTime);
            setPhaseTime(gameStore.phaseTime);
            setPhaseName(gameStore.phaseName);
            setPhaseColor(gameStore.phaseColor);
        };
        return gameStore.subscribe(update);
    }, []);

    return { totalTime, phaseTime, phaseName, phaseColor };
}

export function useKillFeed() {
    const [killFeed, setKillFeed] = useState(gameStore.killFeed);

    useEffect(() => {
        const update = () => {
            setKillFeed([...gameStore.killFeed]);
        };
        return gameStore.subscribe(update);
    }, []);

    return killFeed;
}

export function useGameEnded() {
    const [isGameEnded, setIsGameEnded] = useState(gameStore.isGameEnded);

    useEffect(() => {
        const update = () => {
            setIsGameEnded(gameStore.isGameEnded);
        };
        return gameStore.subscribe(update);
    }, []);

    return isGameEnded;
}

export function useGameEndData() {
    const [data, setData] = useState({
        winner: gameStore.gameWinner,
        playerStats: gameStore.playerStats
    });

    useEffect(() => {
        const update = () => {
            setData({
                winner: gameStore.gameWinner,
                playerStats: gameStore.playerStats
            });
        };
        return gameStore.subscribe(update);
    }, []);

    return data;
}

export function useRematchState() {
    const [state, setState] = useState({
        rematchReady: new Map(gameStore.rematchReady),
        rematchCountdown: gameStore.rematchCountdown,
        mySessionId: gameStore.mySessionId
    });

    useEffect(() => {
        const update = () => {
            setState({
                rematchReady: new Map(gameStore.rematchReady),
                rematchCountdown: gameStore.rematchCountdown,
                mySessionId: gameStore.mySessionId
            });
        };
        return gameStore.subscribe(update);
    }, []);

    return state;
}

export function useChatState() {
    const [isOpen, setIsOpen] = useState(gameStore.isChatOpen);
    const [messages, setMessages] = useState(gameStore.chatMessages);

    useEffect(() => {
        const update = () => {
            setIsOpen(gameStore.isChatOpen);
            setMessages([...gameStore.chatMessages]);
        };
        return gameStore.subscribe(update);
    }, []);

    return { isOpen, messages };
}

export function useNotifications() {
    const [notifications, setNotifications] = useState(gameStore.notifications);

    useEffect(() => {
        const update = () => {
            setNotifications([...gameStore.notifications]);
        };
        return gameStore.subscribe(update);
    }, []);

    return notifications;
}

export function useTeamKills() {
    const [kills, setKills] = useState({ redKills: 0, blueKills: 0 });

    useEffect(() => {
        const update = () => {
            if (gameStore.room?.state) {
                const state = gameStore.room.state as any;
                setKills({
                    redKills: state.redKills || 0,
                    blueKills: state.blueKills || 0
                });
            }
        };
        return gameStore.subscribe(update);
    }, []);

    return kills;
}

export function useTeamGold() {
    const [gold, setGold] = useState({ redGold: 0, blueGold: 0 });

    useEffect(() => {
        const update = () => {
            if (gameStore.room?.state) {
                const state = gameStore.room.state as any;
                setGold({
                    redGold: state.redGold || 0,
                    blueGold: state.blueGold || 0
                });
            }
        };
        return gameStore.subscribe(update);
    }, []);

    return gold;
}
