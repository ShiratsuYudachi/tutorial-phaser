export class Behavior {
    constructor(agent) {
        this.agent = agent;
    }
    // Called every tick before physics update
    update(deltaTime) { }
    // Called every tick after physics update
    postUpdate(deltaTime) { }
}
