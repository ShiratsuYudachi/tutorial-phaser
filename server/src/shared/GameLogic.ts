
import { Body, Vector } from "matter-js";
import { InputData } from "./Schema";
import { GAME_CONFIG } from "./Constants";

export const applyInput = (body: Body, input: InputData) => {
    const speed = GAME_CONFIG.playerSpeed;
    let velocity = Vector.create(0, 0);

    if (input.left) velocity.x -= speed;
    if (input.right) velocity.x += speed;
    if (input.up) velocity.y -= speed;
    if (input.down) velocity.y += speed;

    // Normalize to prevent faster diagonal movement
    if (velocity.x !== 0 || velocity.y !== 0) {
        velocity = Vector.normalise(velocity);
        velocity = Vector.mult(velocity, speed);
    }

    Body.setVelocity(body, velocity);
};
