# Mini Bed Wars - Architecture Documentation

本项目是一个基于 **Phaser (Client)** + **Colyseus (Server)** + **Matter.js (Physics)** 的实时多人对战游戏。
核心设计思想是 **服务端权威物理 (Server-Authoritative Physics)** 配合 **Agent/Behavior 模式** 进行逻辑解耦。

## 核心架构 (Core Architecture)

### 1. 服务端物理世界 (Server-Side Physics)
游戏的所有物理计算（碰撞、移动、速度）完全在服务端进行，使用 `Matter.js` 引擎。
- **权威性**: 客户端不进行物理模拟，只负责渲染。
- **安全性**: 防止客户端作弊（如穿墙、加速）。
- **同步**: 服务端以固定频率（如 60Hz）运行物理步进，并将结果同步给客户端。

### 2. Agent 系统 (Agent System)
为了管理复杂的实体逻辑，我们引入了 `Agent` 概念。
- **Agent**: 是一个容器，连接了 **物理实体 (Matter.Body)** 和 **网络状态 (Colyseus Schema)**。
- **职责**: 它不直接包含游戏逻辑，而是作为 `Behavior` 的宿主，管理行为的生命周期 (`update`, `postUpdate`)。

```typescript
class Agent {
    body: Matter.Body;      // 物理实体
    schema: Schema;         // 网络状态
    behaviors: Behavior[];  // 行为列表
}
```

### 3. Behavior 模式 (Behavior Pattern)
游戏逻辑被拆分为一个个独立的、可复用的 `Behavior`。
- **定义**: 每个 Behavior 负责一个特定的功能模块。
- **应用**: 通过 `agent.addBehavior(new MyBehavior(agent))` 动态组合逻辑。

**核心 Behavior 示例**:
- `PlayerControlBehavior`: 读取用户输入 (`InputData`)，对 `Matter.Body` 施加力或速度。
- `SyncTransformBehavior`: 在物理计算完成后，将 `Matter.Body` 的坐标 (`x`, `y`) 同步到 `Schema` 中。

### 4. 数据流与同步 (Data Flow & Synchronization)

#### A. Schema 定义 (Schema Definition)
我们在 `Schema.ts` 中定义了游戏的状态结构。这是服务端和客户端的**唯一共享数据契约**。
```typescript
class GameState extends Schema {
    @type({ map: Entity }) entities = new MapSchema<Entity>();
}

class Entity extends Schema {
    @type("string") type: string; // 用于客户端区分类型 (player, bullet, etc.)
    @type("number") x: number;
    @type("number") y: number;
}
```

#### B. 更新流程 (Update Loop)
服务端的每一帧 (`fixedTick`) 遵循以下顺序：
1.  **Pre-Update**: 处理网络消息，将玩家输入压入队列。
2.  **Agent Update**: 遍历所有 Agent，执行 `behavior.update()`。
    *   例如 `PlayerControlBehavior` 消耗输入，修改 `body.velocity`。
3.  **Physics Step**: `Matter.Engine.update()` 执行物理模拟。
4.  **Agent Post-Update**: 遍历所有 Agent，执行 `behavior.postUpdate()`。
    *   例如 `SyncTransformBehavior` 读取 `body.position` 并赋值给 `schema.x/y`。
5.  **Network Sync**: Colyseus 自动检测 `Schema` 的变化，并将差异 (Patch) 发送给客户端。

#### C. 前端渲染 (Frontend Rendering)
前端是**只读**的，它只负责“画”出服务端的状态。
1.  **监听**: 使用 `room.state.entities.onAdd` 监听新实体。
2.  **识别**: 通过 `entity.type` (如 'player', 'bullet') 决定创建什么图形/Sprite。
3.  **同步**: 监听 `entity.onChange`，当服务端更新 `x, y` 时，前端平滑插值更新显示对象的位置。

---

## 如何运行 (How to Run)

### Server
```bash
cd server
npm install
npm start
```
Server running at `ws://localhost:2567`

### Client
```bash
cd client
npm install
npm start
```
Client running at `http://localhost:1234`
