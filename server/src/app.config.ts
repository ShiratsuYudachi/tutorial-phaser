
import config from "@colyseus/tools";
import { Server } from "@colyseus/core";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";

/**
 * Import your Room files
 */
import { GameRoom } from "./rooms/GameRoom";
import { LobbyRoom } from "./rooms/LobbyRoom";
import { AuthService } from "./services/AuthService";

let gameServerRef: Server;
let latencySimulationMs: number = 0;

export default config({
    options: {
        // devMode: true,
    },

    initializeGameServer: (gameServer) => {
        /**
         * Define your room handlers:
         */
        gameServer.define('game_room', GameRoom);
        gameServer.define('lobby_room', LobbyRoom);

        //
        // keep gameServer reference, so we can
        // call `.simulateLatency()` later through an http route
        //
        gameServerRef = gameServer;
    },

    initializeExpress: (app) => {
        // Enable CORS for all routes
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });
        
        // Parse JSON bodies
        app.use(require('express').json());

        /**
         * Auth endpoints
         */
        app.post("/api/register", (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) {
                return res.status(400).json({ success: false, message: 'Username and password are required' });
            }
            const result = AuthService.register(username, password);
            res.json(result);
        });

        app.post("/api/login", (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) {
                return res.status(400).json({ success: false, message: 'Username and password are required' });
            }
            const result = AuthService.login(username, password);
            res.json(result);
        });

        app.get("/api/user/:userId", (req, res) => {
            const user = AuthService.getUser(req.params.userId);
            if (user) {
                // Don't expose passwordHash
                const { passwordHash, ...safeUser } = user;
                res.json({ success: true, user: safeUser });
            } else {
                res.status(404).json({ success: false, message: 'User not found' });
            }
        });

        app.get("/api/leaderboard", (req, res) => {
            const users = AuthService.getAllUsers()
                .map(u => ({
                    username: u.username,
                    totalKills: u.totalKills,
                    totalDeaths: u.totalDeaths,
                    gamesPlayed: u.gamesPlayed
                }))
                .sort((a, b) => b.totalKills - a.totalKills)
                .slice(0, 10);
            res.json({ success: true, leaderboard: users });
        });

        /**
         * Bind your custom express routes here:
         */
        app.get("/hello", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        // these latency methods are for development purpose only.
        app.get("/latency", (req, res) => res.json(latencySimulationMs));
        app.get("/simulate-latency/:milliseconds", (req, res) => {
            latencySimulationMs = parseInt(req.params.milliseconds || "100");

            // enable latency simulation
            gameServerRef.simulateLatency(latencySimulationMs);

            res.json({ success: true });
        });

        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }

        /**
         * Bind @colyseus/monitor
         * It is recommended to protect this route with a password.
         * Read more: https://docs.colyseus.io/tools/monitor/
         */
        app.use("/colyseus", monitor());
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});
