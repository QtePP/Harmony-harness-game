# 预推理与预计算（Speculative Turns）

> 2026-11-26。目标：选项点击到状态更新 <1s，而不是等一次模型往返。
> 结论先说：**引擎侧已经能预计算（0.03ms/选项），慢的只剩模型叙述。**

## 1. 实测基线

当前一局（166 年·春，织席贩履）点「去做」的链路：

```
点击 → 模型（low，~2.3s）→ sanguo_act → 引擎（~0.03ms）→ 模型叙述流
```

`reasoningEffort: low` 已经把一轮从 13s 压到 2.3s；再往下压，瓶颈是**模型往返本身**，不是引擎。

引擎预计算原型：

```bash
node scripts/preview-options.mjs /tmp/sanguo-preview
# 173年·春 · 12岁 · 第一幕·涿郡 · 织席贩履 [ability]
# 去做（mei 40）  0.029ms  critical_success  骰 39（margin 77）
# 等一等          0.021ms  → 173年 夏，12岁
```

为什么可以预计算：

- 引擎是纯函数式状态推进（`attemptScene` / `chooseBranch` / `advanceWorld`），`rng` 在 `state` 里；
- 在 `structuredClone(state)` 上跑，不写 `.sanguo`，对真实存档零副作用；
- 同一 state 的骰子结果可复现，所以预计算结果 = 点击后的真实结果（只要 hint 一致）。

## 2. 方案 A：引擎预计算（不花 token，<100ms）

选项渲染时：

1. 读当前 `save.json`，算 `saveHash`（含 scene / rng / age / options）。
2. 对每个可见选项，在该存档的**影子副本**上跑引擎，得到 `nextState` + 引擎文本。
3. 缓存 `{ saveHash, optionKey, hint, nextState, text }`。

点击时：

1. 再算 `saveHash`；不匹配 → 丢弃缓存，走原来的模型链路。
2. 匹配 → 原子写入 `nextState`（`save.json` temp+rename，追加 `history.jsonl`），立即渲染引擎文本。
3. 模型只做**可选**润色；不调模型也能玩。

优点：点击到状态更新是本地文件操作。缺点：引擎文本比模型叙述干，适合「结果先到、旁白后到」的渐进式 UI。

**前提**：App 现在没有直连引擎的通道。它只能通过 ACP 让模型去调工具，所以每点一次仍要一次模型往返。要做方案 A，必须先加通道（见 §4）。

## 3. 方案 B：叙述预取（用用户思考的时间）

引擎结果有了以后，叙述仍要模型。预取的做法：

1. 选项出现时，为**最可能的 1–2 个选项**各建一个**影子 workspace**（复制 `.sanguo`）。
2. 用 `session/new` 开一个**独立 ACP 会话**，`cwd` 指向影子 workspace（不是 UI 会话）。
3. 提示它「状态已经由引擎推进到 X，把这段讲成 2–4 句；不要调工具」；捕获 `agent_message_chunk`。
4. 缓存 `{ saveHash, optionKey, prose }`；点击命中就把影子状态提交、直接显示 prose。
5. 未命中/超时/用户选了别的 → 取消影子会话，走正常模型链路。

硬约束（都是这个外壳的实测契约）：

- **ACP 一个会话同时只能有一个 prompt**（`a prompt is already in flight`），所以预取必须用**第二个会话**，不能复用 UI 那个。
- 影子会话的 `cwd` 必须是影子 workspace；否则模型一调工具就写真实存档。
- 预取用的是**用户思考的时间**，但 App 切后台会被冻结；只在前台、且选项可见时跑。
- 缓存必须绑定 `saveHash` + 选项 id + hint；scene / rng / age 任一变化都作废。
- 模型叙述只能引用引擎给的 `text` / digest；数值仍以引擎为准，prefetch 不能改状态。
- 成本：每个选项一次小请求；只预取 1–2 个，点击后取消其余。

## 4. App 直连引擎的通道（方案 A 的前提）

三条路，按代价排序：

| 方案 | 做法 | 代价 |
|---|---|---|
| **本地 HTTP**（推荐） | `@ohos/dsh-sanguo` 在 `127.0.0.1:4519` 起一个 `node:http`：`GET /state`、`POST /preview`、`POST /commit`、`POST /act`、`POST /advance`。ArkTS 用 `@ohos.net.http` 调 | 插件加 ~150 行；App 加一个 client；端口只绑 loopback；和桥一样无鉴权（自用内测可接受） |
| 自定义 ACP 方法 | 在 dsh-acp 里加 `sanguo/*` 方法 | 要改 dsh 上游/协议，版本耦合，不推荐 |
| 新增工具 | 加 `sanguo_preview` 工具让模型调 | 仍要一次模型往返，达不到 <1s |

HTTP 通道的边界：

- 只监听 `127.0.0.1`，不监听 `0.0.0.0`；
- 只接受当前 workspace 的 `.sanguo`，路径由插件解析，不接受客户端传绝对路径；
- `commit` 必须带 `saveHash`，不匹配就 409，不覆盖；
- 与 ACP 工具共用同一把文件锁/单线程事件循环，避免和模型同时写。

## 5. 提交与缓存

- `saveHash`：`save.json` 的 sha256（或 size+mtime），再加 `scene` / `rng` / `age` / `options` 的摘要。
- 影子目录：`<workspace>/.sanguo.preview/<optionKey>/`，用完删；不进 git。
- 提交：把影子 `save.json` 以 temp+rename 换入；`history.jsonl` 追加一条 `kind: 'preview-commit'`。
- 缓存 TTL：一个场景内有效；`sanguo_advance`、自由行动、切项目、切会话都清空。
- 失败回退：hash 不匹配、文件被改、模型没回来 → 走原来的「发消息给模型」链路，用户最多等一次正常回合。

## 6. 指标与 kill criteria

- 点击 → 状态更新：p50 < 100ms（引擎直连），p95 < 300ms。
- 点击 → 叙述首字：命中缓存 < 200ms；未命中回退到当前 2.3s。
- 预取成本：每个选项 ≤ 1 次小请求；只预取 top 2；命中率 < 30% 就关掉。
- 安全：任何情况下不出现「影子状态覆盖真实存档」的路径；hash 不匹配必须拒绝。

## 7. 落地顺序

1. 引擎 HTTP 通道 + `preview`/`commit`（可先用 `scripts/preview-options.mjs` 的逻辑）。
2. App 选项模型：渲染时 preview，点击时 commit，引擎文本先上屏。
3. 模型叙述改为可选：先显示引擎文本，再异步追加 prose（不阻塞状态）。
4. 叙述预取（方案 B）：影子会话 + 缓存；先只对「去做 / 等一等」两个按钮做。
5. 真机验收：同一场景连点 20 次，状态不丢、hash 不匹配能回退、切后台不写坏存档。

当前进度：**第 1 步的引擎侧原型已验**（`scripts/preview-options.mjs`，0.03ms/选项）；HTTP 通道与 App 接入还没做，需要真机验证。
