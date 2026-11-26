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
| **本地 HTTP**（已实现） | `@ohos/dsh-sanguo` 在 `127.0.0.1:4519` 起一个 `node:http`：`GET /health`、`POST /state`、`POST /act`、`POST /advance`、`POST /choose`。ArkTS 用 `@ohos.net.http` 调 | 插件加 ~200 行；App 加一个 client；端口只绑 loopback；和桥一样无鉴权（自用内测可接受） |
| 自定义 ACP 方法 | 在 dsh-acp 里加 `sanguo/*` 方法 | 要改 dsh 上游/协议，版本耦合，不推荐 |
| 新增工具 | 加 `sanguo_preview` 工具让模型调 | 仍要一次模型往返，达不到 <1s |

HTTP 通道的边界（已实现）：

- 只监听 `127.0.0.1`，不监听 `0.0.0.0`；
- 只接受 `$HOME/workspace` / `$HOME/workspaces/<id>` 下的路径，别的直接 400；
- 当前是**直接结算**（`/act` `/advance` `/choose` 当场 commit），没有 `preview` / `commit` / `saveHash`；预计算缓存是下一步，不是现在；
- 与 ACP 工具共用同一个 Node 事件循环，App 在模型回合进行中会禁用棋盘按钮，避免并发写；
- 请求体上限 256KB；错误统一 400 + `{ok:false,error}`，App 收到非 200 就回退模型。
- 本机回合只 commit 存档 + 写 App 消息，**不写 ACP 会话历史**；下一次自由输入时模型可能先用 `sanguo_status` 对齐。

## 5. 提交与缓存

当前实现：

- `/act` `/advance` `/choose` 直接调用 `commit()`（`save.json` temp+rename，`history.jsonl` 追加），一次点击只结算一次；
- App 在 `boardBusy || running` 时拒绝再次点击，避免双击双结算；
- 本地消息会 `persist()`，切 tab/回前台不丢；
- 任何 HTTP 失败（旧载荷、端口占用、超时、非 200）都回退到原来的模型链路；如果引擎已 `ok:true` 但没有文本，App 显示「本机引擎已结算」而不是回退，避免双结算。

下一步（未做）：

- `preview` / `commit` + `saveHash`：在玩家思考时把选项结果预计算到影子存档，点击只做一次原子提交；
- 叙述预取（方案 B）：影子 ACP 会话生成 prose 缓存；
- 连点/切后台/并发写压力测试。

## 6. 指标与 kill criteria

- 点击 → 状态更新：p50 < 100ms（引擎直连），p95 < 300ms。
- 点击 → 叙述首字：命中缓存 < 200ms；未命中回退到当前 2.3s。
- 预取成本：每个选项 ≤ 1 次小请求；只预取 top 2；命中率 < 30% 就关掉。
- 安全：任何情况下不出现「影子状态覆盖真实存档」的路径；hash 不匹配必须拒绝。

## 7. 落地顺序

1. 引擎 HTTP 通道 + `/act` `/advance` `/choose` — **已实现**。
2. App 棋盘按钮直连 + 引擎文本上屏 + 失败回退 — **已实现**；聊天标「本机引擎」，本地消息持久化。
3. 模型叙述改为可选（先引擎文本，再异步 prose）— 未做；当前直连只显示引擎文本。
4. 叙述预取（方案 B）— 未做。
5. 真机验收 — `去做` / 仁义选项 / `等一等` 三条路径已在 CMM-AL10 验成；连点 20 次/切后台/并发压力未做。

当前进度：**本地 HTTP + App 直连已真机闭环**（2026-11-26 手机 CMM-AL10）：点击后 0.8s 内棋盘已到下一幕，聊天出现「本机引擎」结算，session log 无新模型请求；`/state` `/health` `/act` 也在 fport 下验过。
