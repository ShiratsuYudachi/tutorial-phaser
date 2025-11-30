
import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { BACKEND_HTTP_URL } from "./backend";
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { FrontPage } from './ui/FrontPage';
import { gameStore } from './ui/GameStore';

// Game state management
let game: Phaser.Game | null = null;

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    fps: {
        target: 60,
        forceSetTimeOut: true,
        smoothStep: false,
    },
    width: 800,
    height: 600,
    backgroundColor: '#222222',
    parent: 'phaser-example',
    // 移除默认物理引擎，我们自己管理或者只是渲染
    pixelArt: true,
    scene: [GameScene],
};

// Functions to destroy and recreate game instance
export const destroyGame = () => {
    if (game) {
        console.log('Destroying Phaser Game instance...');
        game.destroy(true);
        game = null;
    }
};

export const createGame = () => {
    if (!game) {
        console.log('Creating new Phaser Game instance...');
        game = new Phaser.Game(config);
    }
    return game;
};

// Main App wrapper with state management
const MainApp: React.FC = () => {
    const [gameStarted, setGameStarted] = useState(false);
    const [playerInfo, setPlayerInfo] = useState<{ username: string; userId: string; team?: string } | null>(null);

    const handleGameStart = (options: { username: string; userId: string; team?: string }) => {
        console.log('Starting game with options:', options);
        setPlayerInfo(options);
        setGameStarted(true);
        
        // Store player info for the game
        (window as any).playerInfo = options;
    };

    useEffect(() => {
        if (gameStarted && !game) {
            // Show game menu
            const gameMenu = document.getElementById('game-menu');
            if (gameMenu) {
                gameMenu.classList.remove('hidden');
            }
            
            // Show Phaser container
            const phaserContainer = document.getElementById('phaser-example');
            if (phaserContainer) {
                phaserContainer.style.display = 'block';
            }
            
            game = createGame();
        }
    }, [gameStarted]);

    if (!gameStarted) {
        return <FrontPage onGameStart={handleGameStart} />;
    }

    return <App />;
};

// Render React UI
const container = document.getElementById('react-root');
if (container) {
    const root = createRoot(container);
    root.render(<MainApp />);
}

// Hide phaser container initially
const phaserContainer = document.getElementById('phaser-example');
if (phaserContainer) {
    phaserContainer.style.display = 'none';
}

// --- Latency Simulation Logic ---
const latencyInput = document.querySelector<HTMLInputElement>("input#latency");
if (latencyInput) {
    const selectedLatencyLabel = document.querySelector<HTMLElement>("#latency-value")
    if (selectedLatencyLabel) {
        selectedLatencyLabel.innerText = `${latencyInput.value} ms`;
    }

    latencyInput.oninput = (event: Event) => {
        const value = (event.target as HTMLInputElement).value;
        if (selectedLatencyLabel) {
            selectedLatencyLabel.innerText = `${value} ms`;
        }
    };

    latencyInput.onchange = function (event: Event) {
        const value = (event.target as HTMLInputElement).value;
        fetch(`${BACKEND_HTTP_URL}/simulate-latency/${value}`);
    };
    
    // Keep syncing latency value from server
    setInterval(() => {
        fetch(`${BACKEND_HTTP_URL}/latency`)
            .then((response) => response.json())
            .then((value) => {
                latencyInput.value = value;
                if (selectedLatencyLabel) {
                    selectedLatencyLabel.innerText = `${value} ms`;
                }
            })
            .catch(() => {}); // ignore errors
    }, 2000);
}
