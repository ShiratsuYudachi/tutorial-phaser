import { Room, Client } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

// Player in lobby
export class LobbyPlayer extends Schema {
    @type("string") odId: string;
    @type("string") username: string;
    @type("boolean") isReady: boolean = false;
    @type("string") teamPreference: string = "any"; // "red", "blue", or "any"
}

// Lobby state for matchmaking
export class LobbyState extends Schema {
    @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
    @type("number") countdown: number = 0; // Countdown to game start
    @type("number") requiredPlayers: number = 2; // Minimum players to start
    @type("string") status: string = "waiting"; // "waiting", "countdown", "starting"
}

export class LobbyRoom extends Room<LobbyState> {
    private countdownInterval: NodeJS.Timeout | null = null;
    private readonly COUNTDOWN_TIME = 5; // Seconds to countdown before starting
    private readonly MIN_PLAYERS = 2; // Minimum players required

    onCreate(options: any) {
        this.setState(new LobbyState());
        this.state.requiredPlayers = this.MIN_PLAYERS;
        
        // Handle ready toggle
        this.onMessage("toggle_ready", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.isReady = !player.isReady;
                console.log(`Player ${player.username} is now ${player.isReady ? 'ready' : 'not ready'}`);
                this.checkStartCondition();
            }
        });

        // Handle team preference
        this.onMessage("set_team", (client, data: { team: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player && ["red", "blue", "any"].includes(data.team)) {
                player.teamPreference = data.team;
                console.log(`Player ${player.username} prefers team: ${data.team}`);
            }
        });

        // Chat message (optional)
        this.onMessage("chat", (client, data: { message: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                this.broadcast("chat", {
                    username: player.username,
                    message: data.message.substring(0, 200) // Limit message length
                });
            }
        });

        console.log("LobbyRoom created");
    }

    onJoin(client: Client, options: { username?: string; userId?: string }) {
        console.log(`${options.username || client.sessionId} joined the lobby`);
        
        const player = new LobbyPlayer();
        player.username = options.username || `Player_${client.sessionId.substring(0, 4)}`;
        player.isReady = false;
        player.teamPreference = "any";
        
        this.state.players.set(client.sessionId, player);
        
        // Notify all clients
        this.broadcast("player_joined", {
            sessionId: client.sessionId,
            username: player.username
        });
    }

    onLeave(client: Client, consented: boolean) {
        const player = this.state.players.get(client.sessionId);
        const username = player?.username || client.sessionId;
        
        console.log(`${username} left the lobby`);
        this.state.players.delete(client.sessionId);
        
        // Notify all clients
        this.broadcast("player_left", {
            sessionId: client.sessionId,
            username
        });

        // Cancel countdown if not enough players
        if (this.state.players.size < this.MIN_PLAYERS && this.countdownInterval) {
            this.cancelCountdown();
        }

        this.checkStartCondition();
    }

    private checkStartCondition() {
        const players = Array.from(this.state.players.values());
        const allReady = players.every(p => p.isReady);
        const hasEnoughPlayers = players.length >= this.MIN_PLAYERS;

        console.log(`Checking start: ${players.length} players, all ready: ${allReady}`);

        if (allReady && hasEnoughPlayers) {
            // Start countdown
            if (!this.countdownInterval) {
                this.startCountdown();
            }
        } else {
            // Cancel countdown if active
            if (this.countdownInterval) {
                this.cancelCountdown();
            }
        }
    }

    private startCountdown() {
        console.log("Starting countdown...");
        this.state.status = "countdown";
        this.state.countdown = this.COUNTDOWN_TIME;

        this.countdownInterval = setInterval(() => {
            this.state.countdown--;
            console.log(`Countdown: ${this.state.countdown}`);

            if (this.state.countdown <= 0) {
                this.startGame();
            }
        }, 1000);
    }

    private cancelCountdown() {
        console.log("Countdown cancelled");
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        this.state.status = "waiting";
        this.state.countdown = 0;
    }

    private startGame() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.state.status = "starting";
        console.log("Starting game!");

        // Assign teams based on preferences
        const players = Array.from(this.state.players.entries());
        const teamAssignments: { sessionId: string; username: string; team: string }[] = [];
        
        let redCount = 0;
        let blueCount = 0;
        const maxPerTeam = Math.ceil(players.length / 2);

        // First pass: assign players with specific preferences
        for (const [sessionId, player] of players) {
            if (player.teamPreference === "red" && redCount < maxPerTeam) {
                teamAssignments.push({ sessionId, username: player.username, team: "red" });
                redCount++;
            } else if (player.teamPreference === "blue" && blueCount < maxPerTeam) {
                teamAssignments.push({ sessionId, username: player.username, team: "blue" });
                blueCount++;
            }
        }

        // Second pass: assign remaining players
        for (const [sessionId, player] of players) {
            const alreadyAssigned = teamAssignments.find(a => a.sessionId === sessionId);
            if (!alreadyAssigned) {
                if (redCount <= blueCount && redCount < maxPerTeam) {
                    teamAssignments.push({ sessionId, username: player.username, team: "red" });
                    redCount++;
                } else {
                    teamAssignments.push({ sessionId, username: player.username, team: "blue" });
                    blueCount++;
                }
            }
        }

        console.log("Team assignments:", teamAssignments);

        // Notify clients to join game room
        this.broadcast("game_starting", {
            roomId: "game_room",
            teams: teamAssignments
        });

        // Close lobby after a delay
        setTimeout(() => {
            this.disconnect();
        }, 2000);
    }

    onDispose() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        console.log("LobbyRoom disposed");
    }
}
