import Matter from "matter-js";
import { Behavior } from "../behaviors/Behavior";

export class Agent<T = any> {
    body: Matter.Body;
    schema: T;
    behaviors: Behavior[] = [];
    world: Matter.World;

    constructor(world: Matter.World, schema?: T) {
        this.world = world;
        this.schema = schema;
    }

    addBehavior(behavior: Behavior) {
        this.behaviors.push(behavior);
        return this;
    }

    getBehavior<B extends Behavior>(type: new (...args: any[]) => B): B | undefined {
        return this.behaviors.find(b => b instanceof type) as B;
    }

    update(deltaTime: number) {
        for (const behavior of this.behaviors) {
            behavior.update(deltaTime);
        }
    }

    postUpdate(deltaTime: number) {
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
