
import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { BACKEND_HTTP_URL } from "./backend";
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

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

const game = new Phaser.Game(config);

// Render React UI
const container = document.getElementById('react-root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
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
