import { Behavior } from "./Behavior";
export class SyncTransformBehavior extends Behavior {
    postUpdate(deltaTime) {
        if (this.agent.body && this.agent.schema) {
            const entity = this.agent.schema;
            entity.x = this.agent.body.position.x;
            entity.y = this.agent.body.position.y;
        }
    }
}
