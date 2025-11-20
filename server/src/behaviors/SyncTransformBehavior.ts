import { Behavior } from "./Behavior";
import { Entity } from "../shared/Schema";

export class SyncTransformBehavior extends Behavior {
    postUpdate(deltaTime: number) {
        if (this.agent.body && this.agent.schema) {
            const entity = this.agent.schema as Entity;
            entity.x = this.agent.body.position.x;
            entity.y = this.agent.body.position.y;
        }
    }
}
