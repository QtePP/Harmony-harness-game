# 插件归档/打包协议 — 开源方案调研

> 调研时间：2026-11-05
> 目的：为 `docs/PLUGIN-PROTOCOL.md`（DPP 1.0）做可行性校验，判断"自研 vs 采纳"
> 结论摘要：**有高度重合的现成方案（Microsoft APM），但它在两个点上覆盖不到本仓库的需求**

---

## 0. 结论先行

| 判断 | 内容 |
|---|---|
| 有没有现成方案 | **有，且不止一个**。打包/版本/解析这一层，`microsoft/apm` 几乎是同题竞品 |
| 重合度 | 约 **80%**：manifest、lockfile、传递依赖、多目标编译、离线重放、审计、策略，APM 全做了 |
| 不可替代的缺口 | **① 无自定义 target 机制**（dsh 不在内建列表）；**② 无 contract/能力抽象**（依赖是具体 repo+path，换实现要改消费方） |
| 建议 | **不要从零自研**。把 APM 当解析引擎复用，只补 dsh 的 deploy 环节 + 一层 contract 约定 |
| 需要修正 DPP 的地方 | 4 处，见 §5（tree-sha 方案不如 APM 的 content_hash；漏了隐藏 Unicode 扫描、漂移检测、可执行原语门控） |

---

## 1. 生态分层：谁在解决哪一层

这是理解全局的关键。所谓"插件协议"其实横跨四层，而**没有任何一个项目同时覆盖四层**。

```
L4 分发层   打包成文件 / 市场索引 / 离线传输
L3 解析层   依赖图、版本选择、锁文件、可复现重放
L2 清单层   一个包长什么样、声明哪些原语
L1 规范层   单个原语的文件格式（SKILL.md / AGENTS.md / server.json）
```

- **L1 已被标准统一**：`AGENTS.md`、`Agent Skills`、`MCP` 三家分治，且都进了基金会或事实标准。
- **L2 有事实标准但碎片化**：Claude Code 的 `plugin.json`、MCP 的 `server.json`、APM 的 `apm.yml`，各自一套。
- **L3 基本空白**，只有 APM 在做完整实现。
- **L4 各家自建**：marketplace.json / OCI artifact / git bundle。

> 你原来把这一切都叫"归档协议"，实际要的是 **L2 + L3**。这个区分很重要，因为 L1 不必自造。

---

## 2. 各方案逐个说

### 2.1 Microsoft APM — 最接近的现成方案 ★★★★★

`github.com/microsoft/apm`，开源，微软出品。自称 "An open-source, community-driven dependency manager for AI agents"，定位就是"agent 配置的 package.json / Cargo.toml"。

**它做什么**

| 能力 | 实现 |
|---|---|
| manifest | `apm.yml`：`name` / `version` / `targets` / `dependencies.apm`（git 路径）/ `dependencies.mcp` |
| 依赖来源 | GitHub、GitLab、Bitbucket、Azure DevOps、Gitea、Gogs、任意 git host；也支持 marketplace |
| 传递依赖 | 支持，lock 里记 `depth` 与 `resolved_by` |
| 锁文件 | `apm.lock.yaml`，`lockfile_version` 1/2/3 |
| 版本钉死 | Git 依赖钉 `resolved_commit`（40 位 SHA）；semver 依赖记 `constraint` + `resolved_tag` |
| 内容完整性 | `content_hash` = SHA-256（**排序后的相对路径 + 原始字节**，文本先做 CRLF→LF 归一化） |
| 可复现重放 | `apm install --frozen`：无解析、无网络漂移 |
| 漂移检测 | `apm audit` 重建上下文到 scratch 并与工作区 diff，抓手工改动 |
| 安全扫描 | 隐藏 Unicode 检测（防止不可见字符劫持 agent 行为）、`exec_status` 可执行原语门控（`deployed` / `gated_pending_approval` / `denied`）、传递 MCP 需显式同意 |
| 供应链 | `apm lock export --format cyclonedx\|spdx` 出 SBOM |
| 治理 | `apm-policy.yml`：限定允许的来源/作用域/原语，enterprise → org → repo **只收紧不放宽** |
| 打包分发 | `apm pack` → 压缩包或独立 plugin；`apm unpack` 还原；bundle 锁含 `pack:` 块（`format: apm\|plugin`） |
| 多目标 | 11 个内建 target + 5 个实验性，把同一份原语编译到各 harness 的目录布局 |
| 失败语义 | fail-closed：无效 YAML / 未知版本 / 畸形部署行一律拒绝，**不会静默替换为空锁** |

**它的关键设计取舍（值得直接抄）**

1. **内容哈希而非 git 对象哈希**：`content_hash` 按"排序相对路径 + 文件字节"算 SHA-256，并做 CRLF 归一化。这比 git tree sha 更稳——跨平台一致，且能校验"实际落盘内容"而不只是"提交里有什么"。
2. **部署台账（`deployments`）带属主历史**：每个落盘文件记录 `owners[]` 与 `active_owner`，卸载时能精确回收孤儿，不会误删别人写的文件。这是 `prune` 能安全工作的前提。
3. **`exec_status` 三态**：把"可执行原语"（hooks、脚本）与"纯文本原语"区别对待，前者默认需要批准。
4. **自举（self entry）**：项目自身的原语以 `repo_url: <self>` 的合成条目参与遍历，所以"自己的技能"和"依赖来的技能"走同一套台账。

**它不做什么（对你的关键缺口）**

- ❌ **没有自定义 target 机制**。targets 是硬编码枚举，文档明确写了"canonical targets validator will reject them"——连官方实验性目标都不能写进 `apm.yml`，第三方新增更不可能。**dsh 不在列表里。**
- ❌ **没有 contract / 能力抽象**。依赖写的是 `anthropics/skills/skills/frontend-design` 这种具体坐标。想"从 mcp 换成 cli 而不改消费方"，APM 表达不了。
- ❌ **无层级约束**。它有 `package_type`（`apm_package` / `skill_bundle` / `claude_skill` / `hook_package` / `hybrid` / `marketplace_plugin`），但这是"放哪去"的分类，不是"能依赖谁"的规则。
- ⚠️ 目标是把原语**摊平编译**到各 harness 目录，不保留"包"的边界。对 dsh 这种"包 = 一个 agent 工作区"的模型，语义不完全对齐。

---

### 2.2 AGENTS.md — 团队上下文层已标准化 ★★★★★

- 由 OpenAI / Anthropic / Google 等于 2025 年联合推动，现由 **Linux Foundation 下的 Agentic AI Foundation (AAIF)** 托管。
- 截至 2026 年初，**6 万+ 开源项目采用**，Codex / Copilot / Gemini 等主流工具支持。
- 本仓库的 `AGENTS.md` 用法**已经合规**，不需要改造。

**对你的意义**：DPP 里"workspace 级 context 只读继承"这条不必自造格式，直接声明"继承链的根是 AAIF 的 AGENTS.md 语义"即可。同时也提醒一个坑：Claude Code 曾长期只读 `CLAUDE.md` 不认 `AGENTS.md`，生态里靠 symlink 兼容——**说明"事实标准"仍会分裂，你的协议要留兼容钩子**。

---

### 2.3 Agent Skills — SKILL.md 已标准化，但没有版本与依赖 ★★★★☆

- 原始作者 Anthropic，以开放标准发布，仓库 `github.com/agentskills/agentskills`，站点 `agentskills.io`。
- 格式：一个目录 + `SKILL.md`，YAML frontmatter 至少含 `name` + `description`，正文是指令。可选 `scripts/`、`references/`、`assets/`。
- 加载机制是**渐进披露**三阶段：Discovery（只读 name+description）→ Activation（命中才读全文）→ Execution。
- 客户端生态很广：Claude Code、Cursor、Copilot、Gemini CLI、VS Code、OpenHands、Goose、Kiro、OpenCode、TRAE、Amp 等。

**关键事实：规范本身没有 `version` 字段，也没有任何依赖声明或解析机制。** "version-controlled" 只是说用 VCS 管文件夹。

**对你的意义**：本仓库 `.dsh/skills/<name>/SKILL.md` 已经是这个格式，`check-agent-pack.mjs` 的校验（name 必须等于目录名、description 长度下限）也与之一致。**这一层零成本对齐，且能顺带获得生态互操作**。版本与依赖必须由外层（L2/L3）补，这正是 DPP 的位置。

---

### 2.4 MCP Registry + server.json — 只解决"发现" ★★★☆☆

- 官方 Registry 有 schema：`server.schema.json`，`mcp-publisher` CLI 发布。
- 命名空间用**反向 DNS**：`io.github.<user>/<server>`、`com.example/<name>`，企业走域名验证。
- `packages[]` 描述可分发包：`registryType`（npm / oci / pypi / nuget 等）+ `identifier` + `version` + `transport`。
- **定位是发现关系，不是把可执行文件上传进去**；安装仍走各包管理器。

**对你的意义**：
1. 反向 DNS 命名空间值得直接抄进 DPP 的 `id` 规则——你现在的 kebab-case 单段 id 在多团队场景会撞名。
2. 它印证了一个重要分工：**注册中心只做索引，不做托管**。你的 `dsh-pack.workspace.json` 里的 `registry` 也应如此设计。

---

### 2.5 Claude Code Plugins — "一个容器装五类资产"的现成先例 ★★★★☆

结构（这正是你想要的"统一归档"形态）：

```
my-plugin/
├── .claude-plugin/plugin.json   ← 清单（必须）
├── skills/<name>/SKILL.md
├── agents/<name>.md
├── commands/<name>.md
├── hooks/hooks.json
├── .mcp.json                    ← MCP 服务器
└── .lsp.json
```

- 分发走 **marketplace**：仓库根 `.claude-plugin/marketplace.json`，每个插件条目至少 `name` + `source`。
- 安装状态记在 `installed_plugins.json`（含 `installPath`、`scope`），`marketplaces/` 存原始副本、`cache/` 存按版本运行的实例——**这就是"按版本可回滚"的实现方式**。
- 官方市场 `claude-plugins-official` 已收录 315 个插件。

**对你的意义**：这是"五类资产装一个容器"最成熟的落地形态，且 **APM 能 export 成 `plugin.json`**。如果你的 dsh pack 想对外分发，`plugin.json` 是现成的对外格式，不必自造。

---

### 2.6 A2A AgentCard / OASF-AGNTCY — 运行时能力声明，不是打包 ★★☆☆☆

- **A2A AgentCard**：`/.well-known/agent-card.json`，声明 name / description / url / capabilities / skills / security。用于**运行时发现与调用**，不是分发。
- **OASF（Open Agentic Schema Framework）**，AGNTCY（Cisco、LangChain 等）推动：把**能力语义**（skills / domains）与**约束描述**（constraint descriptors，含所需依赖）分离；ADS 用 OCI artifact（`application/vnd.oci.image.manifest.v1+json`）分发记录。

**对你的意义**：OASF 的"能力语义 / 约束描述分离"是学术上与你 contract 思路最接近的现成理论，可以引用为设计依据。但它的落地重心在**跨组织 agent 发现**，不在"同事机器上复现一套工作流"，直接采用会过重。

---

### 2.7 其他相关但不建议采用

| 方案 | 定位 | 为什么不选 |
|---|---|---|
| `open-agent-hub` | 零依赖 CLI，为 Claude Code / Cursor / Trae 管 Skills/Agents/Commands | 无 lockfile、无传递依赖，只做"装到某目录" |
| `npx skills add` | 从 git 仓库装技能 | 无版本约束、无锁，APM 已兼容它 |
| Nix flakes | `flake.lock` 的 `narHash` + `rev` | 设计极佳（DPP 的 tree-sha 思路源头），但要求用户接受 Nix，团队成本过高 |
| Backstage catalog | `catalog-info.yaml` 服务目录 | 面向服务而非 agent 原语，且需跑一套服务 |

---

## 3. 逐条对照：DPP 的设计点 vs APM

| DPP 设计点 | APM 是否有 | 差异与处置 |
|---|---|---|
| manifest（`pack.json`） | ✅ `apm.yml` | 字段命名不同，能力等价。**建议直接采用 `apm.yml`** |
| 四层模型（capability/skill/entry/workflow） | ⚠️ 部分 | APM 有 `package_type` 但无层级依赖约束。**保留 DPP 的层级规则，作为 APM 之上的 lint** |
| contract 解耦（`provides`/`requires`） | ❌ | **DPP 独有价值**。建议降级为"命名约定 + 校验器"，不引入新解析器 |
| Git tag 版本锚定 | ✅ 支持 git semver | APM 的 `constraint` + `resolved_tag` + `resolved_commit` 比纯 tag 更完备 |
| tree sha 完整性 | ⚠️ 用 content_hash 更优 | **改采纳 APM 的 content_hash**（SHA-256 + CRLF 归一化） |
| lockfile | ✅ `apm.lock.yaml` | 字段远比 DPP 细致（部署台账、属主、MCP 溯源） |
| workspace `roots` 声明 | ⚠️ 无对应 | APM 是"项目级安装到 target 目录"，不扫多根。**保留 DPP 的 roots 概念** |
| 三通道分发 | ⚠️ 部分 | APM 有 git + marketplace + `apm pack`，但**无自定义 target ⇒ 无法直接物化到 dsh 目录** |
| 凭据只写名字 | ⚠️ 部分 | APM 管 MCP 配置，不管密钥值。DPP 的 secrets 规则仍需要 |
| 校验器镜像真实 loader | ❌ | **DPP 独有且正确**。APM 校验的是"能否部署"，不校验"能否被 dsh 加载" |
| 设备端不解析 | ✅ 一致 | 两者都在构建期解析 |
| 隐藏 Unicode 扫描 | ✅ APM 有，DPP 漏了 | **必须补**（见 §5） |
| 漂移检测 | ✅ `apm audit`，DPP 漏了 | **必须补**，直接治"脚本与 prompt 版本漂移" |
| 可执行原语门控 | ✅ `exec_status`，DPP 漏了 | **应补** |
| SBOM / 策略文件 | ✅ APM 有，DPP 漏了 | 团队协作可选，建议至少留字段 |

---

## 4. 三条路线

### 路线 A：全量采纳 APM（最省力，但卡在 target）
```
apm.yml → apm install --frozen → apm_modules/ → 自己写 20 行脚本物化到 agents/<id>/
```
- ✅ 解析、锁、审计、安全扫描全部白拿
- ❌ dsh 不在 target 列表，**编译环节必须自己写**；且原语会被摊平，丢掉"包边界"
- 适合：想两周内让同事跑起来

### 路线 B：APM 做解析 + DPP 做 dsh 层（**推荐**）
```
apm.yml（依赖声明，含 git tag 约束）
  └─ apm install --frozen  →  apm.lock.yaml + apm_modules/
       └─ dsh-pack build   →  读 lock + apm_modules
                           →  校验 DPP 层级规则 / contract 一致性 / loader 兼容
                           →  物化 agents/<id>/.dsh/skills/ + agent.json
                           →  跑 check-agent-pack.mjs
```
- ✅ 解析/锁/审计复用成熟实现，不重造
- ✅ DPP 只保留真正独有价值的三件：**层级约束、contract 校验、loader 镜像校验**
- ✅ 已有 `check-agent-pack.mjs` 与 `agent.json` 生成逻辑可以原样接上
- ⚠️ 需要接受 `apm.yml` 作为声明文件（而非自造的 `pack.json`）

### 路线 C：全自研 DPP
- ✅ 完全贴合 dsh（contract、层级、设备端约束）
- ❌ 要自己实现传递依赖、semver 选择、内容哈希、漂移检测、fail-closed 解析——**APM 用一年做的，你重做一遍**
- 只在"必须深度定制"时才选

---

## 5. DPP 需要修正的四处（诚实清单）

调研推翻或补强了我上一版的四个判断：

1. **tree sha 不如 content_hash。**
   我原来用 `git rev-parse <tag>:<path>` 取 tree sha 做完整性锚点。问题：① 它只能证明"提交里有什么"，不能证明"落盘内容对不对"；② 受 `.gitattributes` / filter 影响，跨平台不保证一致。APM 的 `content_hash`（排序路径 + 原始字节，文本 CRLF→LF 归一化）更正确。**建议改采纳。**

2. **漏了隐藏 Unicode 扫描——这是真实威胁。**
   Skill 本质是"给模型读的文本"，即"可执行程序"。攻击者可以在 `SKILL.md` 里塞不可见字符劫持行为，肉眼 review 抓不到。APM 每次 install 都扫。**DPP 必须补，且优先级高**（因为 dsh 把 SKILL.md 直接塞进上下文）。

3. **漏了漂移检测——这正是你抱怨的"版本混乱"。**
   `apm audit` 的做法是：按 lock 重建到临时目录，与工作区 diff。手改过的文件立刻暴露。**这直接解决 P4，比"约定不要手改"有效一万倍。**

4. **漏了可执行原语的三态门控。**
   `exec_status: deployed | gated_pending_approval | denied`。对 dsh 尤其重要——`cli` 类型的 capability 会在设备上跑脚本。

另外一处**设计层面**的建议：`id` 应改成反向 DNS（`com.qtepp.sanguo-life`），理由见 §2.4。现在单段 kebab-case 在多团队分发的场景下必然撞名。

---

## 6. 一句话建议

> **别造 package manager，造它的 dsh 适配层。**
> APM 已经把 L3（解析/锁/审计）做完了，缺的只是"最后一个 target 不是 dsh"。
> 你要写的不是协议，是 `dsh-pack build` 这个约 200 行的转换器——把 `apm.lock.yaml` + `apm_modules/` 变成 `agents/<id>/`，并跑你自己的 loader 校验。
> DPP 文档里真正该保留的是三样：**层级约束、contract 校验、loader 镜像校验**。其余全删，改为"见 APM 规范"。

---

## 7. 参考链接

| 项目 | 地址 |
|---|---|
| Microsoft APM | https://github.com/microsoft/apm · https://microsoft.github.io/apm/ |
| APM 锁文件规范 | https://microsoft.github.io/apm/reference/lockfile-spec/ |
| APM 目标矩阵 | https://microsoft.github.io/apm/reference/targets-matrix/ |
| AGENTS.md | https://agents.md （Linux Foundation / AAIF 托管） |
| Agent Skills | https://agentskills.io · https://github.com/agentskills/agentskills |
| MCP Registry | https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json |
| Claude Code Plugins | `.claude-plugin/plugin.json` + `marketplace.json` |
| A2A AgentCard | `/.well-known/agent-card.json` |
| OASF / AGNTCY | https://github.com/agntcy/oasf · https://github.com/agntcy/dir |

**未核实项**（引用前需确认）：APM 的具体开源许可证、APM 是否已在 Windows 之外的 CI 上验证 dsh 类自定义布局、OASF 规范版本号。
