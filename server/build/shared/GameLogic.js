import Matter from "matter-js";
import { GAME_CONFIG } from "./Constants";
// 纯逻辑：应用输入力到物体
// 注意：Matter.js 推荐使用力(Force)或速度(Velocity)
export function applyInput(body, input) {
    const speed = GAME_CONFIG.playerSpeed;
    let velocity = { x: 0, y: 0 };
    if (input.left)
        velocity.x -= speed;
    if (input.right)
        velocity.x += speed;
    if (input.up)
        velocity.y -= speed;
    if (input.down)
        velocity.y += speed;
    // 直接设置速度（类似于 Arcade Physics 的行为，响应更灵敏）
    // 如果想要更有"惯性"的感觉，可以使用 Matter.Body.applyForce
    Matter.Body.setVelocity(body, velocity);
}
