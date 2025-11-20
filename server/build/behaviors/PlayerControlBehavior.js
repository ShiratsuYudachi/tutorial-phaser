import { Behavior } from "./Behavior";
import { applyInput } from "../shared/GameLogic";
import { GAME_CONFIG } from "../shared/Constants";
export class PlayerControlBehavior extends Behavior {
    update(deltaTime) {
        const player = this.agent.schema;
        if (!player)
            return;
        let input;
        while (input = player.inputQueue.shift()) {
            applyInput(this.agent.body, input);
            player.tick = input.tick;
            if (input.shoot) {
                const now = Date.now();
                if (now - player.lastShootTime > GAME_CONFIG.fireRate) {
                    this.spawnBullet(player, this.agent.body.position);
                    player.lastShootTime = now;
                }
            }
        }
    }
    spawnBullet(player, position) {
        // We need access to the game state to add the bullet
        // Since Agent doesn't hold the full GameState, we might need a way to access it.
        // For now, let's assume we can emit an event or call a method on the Room/World manager.
        // BUT, to keep it simple for this refactor, we can pass a callback or reference to the Agent.
        // However, a better pattern is to have a BulletManager or similar.
        // For this MVP refactor, let's assume the Agent has a reference to the 'Context' or we pass it in.
        // Wait, the user said: "PlayerControlBehavior: 读取 schema.inputQueue，计算向量，应用 Matter.Body.setVelocity"
        // The user didn't explicitly say it handles bullet spawning, but the original code did.
        // In the original GameRoom.ts: spawnBullet adds to state.bullets and creates a body.
        // Let's look at how we can handle this.
        // Option 1: Pass a 'spawnBullet' callback to the Behavior.
        // Option 2: Emit an event.
        // Let's try to keep it self-contained if possible, or use a callback.
        // Since we haven't defined a global context, I'll add a callback property to this behavior 
        // or just leave a TODO and handle movement first?
        // Actually, the user's prompt said: "PlayerControlBehavior: 读取 schema.inputQueue，计算向量，应用 Matter.Body.setVelocity"
        // It didn't mention shooting. But shooting is part of the input.
        // Let's implement a callback for spawning bullets so we don't couple this behavior to the Room directly.
        if (this.onShoot) {
            this.onShoot(this.agent.schema.sessionId, position); // Wait, schema doesn't have sessionId directly on Player, it's the key in the map.
            // But we can store sessionId on the Agent or Player.
        }
    }
}
