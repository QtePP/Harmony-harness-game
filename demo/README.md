# 三国人生 · 离线 demo

[`sanguo.html`](sanguo.html) 是一个**单文件**的三国人生 demo：双击就能玩，不需要安装 App、
不需要 API Key、不需要网络、不需要 Node。

```bash
open demo/sanguo.html          # macOS
# 或者直接把文件拖进浏览器
```

文件约 92 KB。引擎、23 个场景、终章和 8 个结局全部在里面；页面没有任何外部请求。

## 它是什么

- **引擎是真的**：复用 `host/profile-ohos/.../@ohos/dsh-sanguo/engine/` 的掷骰、判定、
  数值、天下推演；不是为 demo 另写一套。
- **剧情是真的**：`data/acts.json` 的七幕 23 个场景，从涿郡桑树到长坂坡。
- **终章是 demo 的**：引擎写到长坂就 `act = "end"` 了。demo 在这里补了一个「终章·白帝」，
  用最后的选择 + 末局数值收束到 8 个结局。
- **本机推演**：不调用模型。它把每个选项的 effects 乘上一组透明权重（仁 / 霸 / 稳 / 隐），
  再加一点随机；点「本机推演」就会按这个倾向自动走完一生。

> 这不是 App 里那个 pybot。pybot 是藏在 WebView / Pyodide 里的 Hugging Face 模型
> （冷启 ~26s、常驻 ~648MB），没法在 `file://` 的单文件 HTML 里跑。这里用「引擎 + 透明权重」
> 达到同样的目的：离线、即时、可解释。要真上小型神经网络，得离线训练再把权重嵌进来，
> 对这个体量的文本不值得。

## 改它

| 文件 | 作用 |
|---|---|
| `app.js` | 界面与流程（开场 / 场景 / 结算 / 终章 / 结局 / 图鉴） |
| `endings.js` | 终章五个选择 + 8 个结局 + 判定条件 |
| `game.js` | 把纯 JS 引擎包成浏览器可用的控制器；开局状态在这里 |
| `template.html` | 单文件骨架与全部 CSS |
| `build.mjs` | esbuild 打包 + 把 JS 内联进 HTML |
| `simulate.mjs` | 无头验收：23 个场景能走到 end，8 个结局全部可达 |

```bash
cd demo
npm install
npm run build       # 生成 sanguo.html
npm run simulate    # 160 局自动跑，断言 8 个结局都出现
```

`sanguo.html` 是**生成物**，不要直接改；改上面的源文件再 build。

## 8 个结局

| id | 标题 | 条件 |
|---|---|---|
| `zhaolie` | 昭烈 | 称帝，名望 ≥ 70、信义 ≥ 55、势 ≤ 35 |
| `dufu` | 独夫 | 称帝，但上面任一条不够 |
| `renzhe` | 仁者 | 不称帝，信义 ≥ 65 |
| `pianan` | 偏安 | 不称帝，信义 < 65 |
| `hanzhong` | 汉中王 | 称王，不称帝 |
| `zhixi` | 织席者 | 归还印绶 |
| `zaoshi` | 蚤世 | 体力 ≤ 15，或伐吴结算后体力 ≤ 35 |
| `jiedi` | 举世皆敌 | 伐吴，体力 > 35 |

结局图鉴存在浏览器 `localStorage`（`sanguo-demo-endings-v1`）；中途存档用
`sanguo-demo-run-v1`，刷新后可以从开场页「继续上局」。

## 边界

- 只覆盖已经写好的七幕（到长坂）。第八至十二幕（赤壁 / 益州 / 汉中 / 荆州 / 白帝）
  没有写成完整场景；终章是压缩后的收束，不是第八幕。
- 没有音频、图片、动画资产；所有观感来自 CSS 与排版。
- 没有把存档导出成 `.sanguo/save.json` 的入口；demo 的存档只活在 localStorage。
- 许可与仓库一致：MIT。剧情来自史书与演义，属公有领域。
