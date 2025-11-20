import type { Agent } from "../entities/Agent";

export abstract class Behavior {
    agent: Agent;

    constructor(agent: Agent) {
        this.agent = agent;
    }

    // Called every tick before physics update
    update(deltaTime: number): void { }

    // Called every tick after physics update
    postUpdate(deltaTime: number): void { }
}
