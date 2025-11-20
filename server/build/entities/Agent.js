import Matter from "matter-js";
export class Agent {
    constructor(world, schema) {
        this.behaviors = [];
        this.world = world;
        this.schema = schema;
    }
    addBehavior(behavior) {
        this.behaviors.push(behavior);
        return this;
    }
    getBehavior(type) {
        return this.behaviors.find(b => b instanceof type);
    }
    update(deltaTime) {
        for (const behavior of this.behaviors) {
            behavior.update(deltaTime);
        }
    }
    postUpdate(deltaTime) {
        for (const behavior of this.behaviors) {
            behavior.postUpdate(deltaTime);
        }
    }
    destroy() {
        if (this.body) {
            Matter.Composite.remove(this.world, this.body);
        }
        this.behaviors = [];
    }
}
