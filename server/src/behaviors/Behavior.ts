import type { Agent } from "../entities/Agent";

export abstract class Behavior<T = any> {
    agent: Agent<T>;

    constructor(agent: Agent<T>) {
        this.agent = agent;
    }

    // Called every tick before physics update
    update(deltaTime: number): void { }

    // Called every tick after physics update
    postUpdate(deltaTime: number): void { }
}
