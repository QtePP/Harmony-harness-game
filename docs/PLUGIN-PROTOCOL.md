# DPP 1.0 — DSH Pack Protocol

> **状态**：Draft（待评审）
> **范围**：command / cli / skill / mcp / tool 五类资产的归档、版本、依赖与分发
> **不涉及**：dsh 内核改造、模型适配、UI 层
> **版本锚定**：Git tag（无 npm registry、无私服）
> **最后修订**：2026-11-05

---

## 1. 问题陈述

当前仓库同时存在三套互不相识的"包"概念，这是混乱的根因，不是归档路径本身：

| 位置 | 形态 | 谁在读 |
|---|---|---|
| `agents/<id>/` | `agent.json` schema 1 + `AGENTS.md` + `.dsh/skills/*/SKILL.md` + `cards/*.card.json` | 应用内 `dsh-agent-*` loader |
| `host/profile-ohos/profiles/ohos/` | `cordis.patch.yml` + bundle `dependencies` | dsh 启动期 cordis 装配 |
| `~/.workbuddy-ai/skills/`、`~/.claude/skills/` | 游离 `SKILL.md` | 各自宿主 |

由此派生出四个具体病症：

- **P1 路径不可寻址**：没有人能回答"这个 workflow 到底由哪几个文件组成"，因为组成关系只存在于人的记忆里。
- **P2 版本不可锚定**：`agents/sanguo-life` 与 `@ohos/dsh-sanguo` 谁跟谁配套，无记录；`agent.json` 里也没有 version 字段。
- **P3 团队上下文不统一**：`AGENTS.md` 在每个包里各写一份，口径靠复制粘贴同步，漂移无人察觉。
- **P4 耦合无判据**：脚本互引绝对路径、skill 里写死工具实现名、prompt 里硬编码 key——没有规则能判定"这算不算耦合"。

DPP 的目标不是重排目录，而是给出**三件缺失的东西**：可寻址的标识（manifest）、可解析的契约（contract）、可复现的装配（lock）。

---

## 2. 设计原则

1. **Git 是 registry，tag 是版本，`git archive` 是分发通道。** 不引入任何需要运维的服务。
2. **声明优于约定。** 任何"大家都这么写"的规则，必须能在 manifest 里被机器读到。
3. **只依赖契约，不依赖路径。** 消费方写 `web.search@1`，不写 `../mcp-tavily/`。
4. **校验器镜像真实 loader。** 延续 `scripts/check-agent-pack.mjs` 的既有做法：校验逻辑只用 loader 真正要求的东西，不做额外发明。
5. **解析发生在构建期，不在设备上。** 手机没有终端；`resolve/sync` 只在电脑上跑，设备只消费已物化的目录。

---

## 3. 概念模型

四层，依赖只能自上而下（L4 → L3 → L2 → L1）：

| 层 | `kind` | 含 | 本质 | 生命周期 |
|---|---|---|---|---|
| L1 | `capability` | tool / mcp / cli | **能做事的东西** | 有进程、连接、凭据 |
| L2 | `skill` | `SKILL.md` | **怎么用能力**（纯文本，无实现） | 无状态 |
| L3 | `entry` | agent / command | **人怎么唤起** | 会话级 |
| L4 | `workflow` | 跨包编排 | **组合实例** | 一次运行 |

三个核心实体：

- **Pack** — 一个可独立版本化的单元，由 `pack.json` 描述，占据一个目录。
- **Contract** — 能力的**语义名**，形如 `<domain>.<name>@<major>`（如 `web.search@1`）。它是解耦的接缝：消费方只认 contract，不认谁实现它。
- **Lock** — 一次装配的确定性快照，记录每个 pack 解析到的 commit 与 tree。

> **关键设计**：`provides` 把 contract 映射到实现。因此 `skill-x` 声明 `requires: web.search@1` 后，背后换成 mcp 还是 cli 与它无关——这就是"解耦"的可执行定义。

---

## 4. 标识与版本（Git tag）

### 4.1 标识

`pack-id` 必须满足 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`，**且全局唯一**。沿用现有 `agent.json` 的 kebab-case 约束，不新增规则。

### 4.2 版本 tag

```
<pack-id>@<semver>          例：sanguo-life@1.2.0
<pack-id>@<semver>-<pre>    例：sanguo-life@1.3.0-rc.1
```

- 每个 pack 独立打 tag。monorepo 里 5 个 agent + N 个 host 插件各有各的版本线，单一 `v1.2.0` 无法表达。
- `semver` 遵循 semver 2.0.0；`build metadata`（`+xxx`）不参与比较，禁止出现在 tag 中。
- **tag 必须为 annotated**（`git tag -a`）。轻量 tag 可被静默移动，解析器遇到时给 `DPP-W210` 警告。

### 4.3 完整性锚点：tree sha

不引入自研哈希。pack 目录在某个 commit 下的 **git tree sha** 天然是内容指纹：

```bash
git rev-parse '<tag>:<pack-path>'   # 例：sanguo-life@1.2.0:agents/sanguo-life
```

同一 tree sha ⇒ 逐字节相同的目录内容。lockfile 只存 `commit` + `tree`，校验即比较 tree。

### 4.4 解析算法

```
resolve(id, range):
  1. git ls-remote --tags --refs origin 'refs/tags/<id>@*'
  2. 解析 semver，按 range 过滤，取最高（prerelease 仅在 range 显式允许时参与）
  3. 无候选 → DPP-E301（不是静默降级）
  4. commit = git rev-parse '<tag>^{commit}'
  5. tree   = git rev-parse '<tag>:<pack-path>'
  6. 返回 {version, tag, commit, tree}
```

`pack-path` 由 workspace 声明（见 §7）反查，不靠猜测。

---

## 5. manifest：`pack.json`

每个 pack 根目录一份，是**协议层唯一真相**。

```json
{
  "schema": 1,
  "protocol": "dpp/1",
  "id": "sanguo-life",
  "version": "1.2.0",
  "kind": "entry",
  "name": "汉末人生",
  "summary": "扮演刘备的三国人生模拟，可偏离史载",

  "provides": [
    { "contract": "sanguo.engine@1", "impl": "@ohos/dsh-sanguo" }
  ],
  "requires": [
    { "contract": "agent.runtime@1", "range": ">=1.0 <2", "why": "启动即需 agent 装载器" }
  ],
  "uses": [
    { "contract": "card.render@1", "range": "^1.0", "why": "无卡片时降级为纯文本" },
    { "contract": "web.search@1", "range": "^1.0", "why": "检索史实做校验" }
  ],

  "secrets": [
    { "name": "TAVILY_API_KEY", "required": false, "for": "web.search@1" }
  ],

  "entry": {
    "home": "chat",
    "agent": "agent.json",
    "skills": ["play-turn", "recap"],
    "cards": ["life"],
    "commands": [
      { "name": "sanguo", "description": "继续上一回合", "prompt": "继续上一回合" }
    ]
  },

  "context": ["AGENTS.md"],
  "files": { "exclude": ["data/**", "node_modules/**", "*.log"] }
}
```

### 5.1 字段约束

| 字段 | 必填 | 约束 |
|---|---|---|
| `schema` | ✓ | 固定 `1`（协议内演进用 `protocol` 区分） |
| `protocol` | ✓ | 当前仅 `"dpp/1"` |
| `id` | ✓ | kebab-case，与目录名一致，全局唯一 |
| `version` | ✓ | semver，且必须等于解析出的 tag 版本，否则 `DPP-E302` |
| `kind` | ✓ | `capability` / `skill` / `entry` / `workflow` |
| `provides` | — | `contract` 必填；`impl` 指向具体实现（仅 L1 允许） |
| `requires` | — | 硬依赖，未解析即拒装 |
| `uses` | — | 软依赖，缺失时降级并在报告里列出 |
| `secrets` | — | **只能写名字**，见 §8 |
| `files.exclude` | — | 分发时排除，默认已排除 `data/**`、`node_modules/**` |

### 5.2 三种 `kind` 的能力块

```json
"kind": "capability",
"capability": {
  "type": "mcp",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@scope/tavily-mcp"]
}
```

```json
"kind": "capability",
"capability": { "type": "cli", "path": "bin/fetch.sh", "runtime": "sh" }
```

```json
"kind": "capability",
"capability": { "type": "tool", "module": "@ohos/dsh-sanguo", "registers": "tools" }
```

> `capability.type` 是**实现细节**，只允许出现在 `provides` 的一侧。任何 `requires` 里出现 `type` 都是协议违规（`DPP-E310`）——这正是"换实现不改消费方"的强制点。

---

## 6. 依赖规则（单一职责的强制手段）

### 6.1 允许的依赖方向

```
workflow → entry → skill → capability
workflow → skill          （跳过 entry，合法）
entry → capability        （直接用工具，合法）
capability → ✗            （不得依赖任何上层）
```

同层之间只允许**按 contract 引用**，不允许按路径引用。

### 6.2 禁止模式（可直接判定的耦合）

| 模式 | 判据 | 代码 |
|---|---|---|
| 绝对路径引用 | 脚本/skill 中出现 `/Users/`、`~/`、`$HOME/` 且指向另一个 pack | `DPP-E320` |
| 跨包相对路径 | `../<other-pack>/` | `DPP-E321` |
| 写死实现名 | `requires` 里出现 `capability.type` 或具体 `module` | `DPP-E310` |
| 环依赖 | 依赖图上存在环 | `DPP-E330` |
| 反向依赖 | L1 依赖 L2/L3/L4 | `DPP-E331` |
| 内联凭据 | manifest / skill / 脚本中出现 `sk-`、`Bearer `、`api_key=` 字面量 | `DPP-E340` |

> 这六条就是"解耦"的**可验收定义**。规则不写进 manifest 就无法机器判定，所以 §5 的字段是必要的，不是形式主义。

### 6.3 上下文继承

workspace 级 `context/` 目录对所有 pack **只读继承**，pack 自己的 `context` 在其后追加：

```
解析顺序：workspace/context/*.md  →  pack/AGENTS.md
预算：     合并后 ≤ 65536 B（沿用现有 loader 预算），> 8192 B 给警告
```

这解决 P3：团队口径只维护一份，pack 不再各自复制 `AGENTS.md` 的公共段。

---

## 7. 归档布局与 workspace 声明

**不搬家**，只**声明**。这是对 P1 的直接回答：路径混乱不是文件放错位置，而是没有任何文件声明"哪些目录属于同一个装配域"。

仓库根新增 `dsh-pack.workspace.json`：

```json
{
  "schema": 1,
  "protocol": "dpp/1",
  "roots": [
    { "path": "agents", "kind": "entry" },
    { "path": "host/profile-ohos/profiles/ohos/packages", "kind": "capability" },
    { "path": "packs", "kind": "workflow" }
  ],
  "context": "context",
  "registry": {
    "remote": "origin",
    "url": "https://github.com/QtePP/deepseek-harness-harmony"
  }
}
```

- `roots` 是**唯一入口**：解析器只扫这里，扫不到即不存在。
- 新增一类资产只需加一行 root，不需要移动任何文件。
- 游离资产（`~/.workbuddy-ai/skills/` 等）若要纳入，加 root 并 `dsh-pack adopt` 即可，逐步收敛。

---

## 8. 凭据

manifest 只能声明 `secrets[].name`，**永不含值**。解析顺序：

```
1. process.env[NAME]
2. ~/.dsh/secrets/<NAME>   （目录 0700，文件 0600，不入 git）
3. 缺失且 required=true → DPP-E341，中止并指明哪个 contract 需要它
```

硬约束：

- lockfile 不含 secrets
- 分发包（tarball / bundle）不含 secrets
- `dsh-pack verify` 扫描 `files` 范围内所有文件，命中 `DPP-E340` 即失败

---

## 9. 分发通道（同事机器 + 离线 + 设备载荷）

三条通道，覆盖三种真实场景：

### 9.1 在线（同事有网、能 clone）

```bash
dsh-pack add https://github.com/QtePP/deepseek-harness-harmony#sanguo-life@^1.2
dsh-pack sync
```

`add` 写 manifest 与 lock，`sync` 按 lock 精确拉取 commit。

### 9.2 离线（AirDrop / U 盘 / 内网隔离）

```bash
# 你
dsh-pack bundle --out team-2026-11-05.dshpack

# 同事
dsh-pack import team-2026-11-05.dshpack
dsh-pack sync --offline
```

`.dshpack` = `git bundle`（只含 lock 引用的 commit）+ lockfile + workspace 声明。单文件、可校验、无需网络。

### 9.3 设备载荷（HarmonyOS）

```bash
dsh-pack vendor --into build/payload
```

把解析结果**物化**为普通目录，供 `scripts/assemble-payload.mjs` 打包。设备端不做任何解析——遵守原则 5。

> 三种通道共用同一份 lock。同事机器上 `dsh-pack verify` 通过 ⇒ 与你本地是同一份内容（tree sha 相等）。

---

## 10. lockfile

`dsh-pack.lock.json`，**必须入 git**（这是团队可复现的全部依据）：

```json
{
  "schema": 1,
  "protocol": "dpp/1",
  "generated": "2026-11-05T15:00:00Z",
  "resolved": [
    {
      "id": "sanguo-life",
      "version": "1.2.0",
      "tag": "sanguo-life@1.2.0",
      "commit": "a1b2c3d4e5f6...",
      "tree": "9f8e7d6c5b4a...",
      "path": "agents/sanguo-life",
      "requires": ["agent.runtime@1"]
    },
    {
      "id": "mcp-tavily",
      "version": "0.4.1",
      "tag": "mcp-tavily@0.4.1",
      "commit": "f6e5d4c3b2a1...",
      "tree": "1a2b3c4d5e6f...",
      "path": "host/profile-ohos/profiles/ohos/packages/mcp-tavily",
      "provides": ["web.search@1"]
    }
  ]
}
```

`provides` 出现在 lock 里是刻意的：它是**这次装配中 contract 的绑定结果**，换实现时 diff 一眼可见。

---

## 11. 校验器链

`dsh-pack verify` 串联多个校验器，每个镜像一个真实 loader（延续 `check-agent-pack.mjs` 的既有原则）：

| 校验器 | 镜像的 loader | 覆盖 |
|---|---|---|
| `manifest` | — | `pack.json` schema、id/version 一致性 |
| `graph` | — | 依赖方向、环、反向依赖 |
| `agent` | `dsh-agent-instructions` / `dsh-skill-filesystem` / CardSpec v1 | 沿用 `check-agent-pack.mjs` 现有逻辑 |
| `bundle` | cordis bundle patch | `cordis.patch.yml` 声明的插件与 `provides` 一致 |
| `secrets` | — | 凭据字面量扫描 |

现有 `scripts/check-agent-pack.mjs` **不废弃**，降级为 `agent` 校验器的实现，由 `verify` 调用。

---

## 12. 与 `agent.json` schema 1 的迁移

**不改 `agent.json`**：应用内 loader 读的就是它，改 schema 会直接打挂真机。

策略：`pack.json` 为源，`agent.json` 为**生成物**。

```
pack.json  ──dsh-pack build──▶  agent.json (schema 1)
                              cards/*.card.json 校验
                              .dsh/skills/* 校验
```

过渡期（v1 兼容）：

1. `pack.json` 缺失时，`dsh-pack adopt <path>` 由 `agent.json` 反推生成。
2. 两者并存时，以 `pack.json` 为准，并校验派生结果与现有 `agent.json` 一致（不一致 → `DPP-W220`，提示重新 build）。
3. 存量 5 个 pack 逐个 `adopt`，不强制一次性迁移。

---

## 13. 未决问题

| # | 问题 | 待定 |
|---|---|---|
| Q1 | `workflow` 的表达力：目前只有依赖声明，是否需要步骤级 DAG？ | 先不引入，用 skill 文本 + `uses` 表达；观察 3 个真实 workflow 后再定 |
| Q2 | 跨仓库 pack（同事自己的私有 pack）如何参与解析？ | 候选：`roots` 支持 `git+url` 远程 root |
| Q3 | tag 签名（`git tag -s`）是否强制？ | 建议团队内强制，开源外部可选 |
| Q4 | `data/**` 被 exclude 后，pack 的初始状态从哪来？ | 候选：`seed/` 目录 + 首次运行时复制 |
| Q5 | 是否需要 `dsh-pack doctor` 检查设备端实际装载结果与 lock 的偏差？ | 需要，但依赖 boot-report 扩展 |

---

## 14. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-05 | 初稿。确立四层模型、Git tag 版本锚定、contract 解耦、三通道分发 |

---

**口径约束**：本文件与 `AGENTS.md` 冲突时以 `AGENTS.md` 为准；本协议任何口径变更必须同一 commit 修订 `AGENTS.md` §2 术语表。
