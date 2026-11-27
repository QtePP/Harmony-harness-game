/**
 * 如果（小狮日记 · 人生之书）—— 4:6 单卡 demo。
 *
 * 1985 年出生在广东东莞。2003 年高考，2026 年四十一岁。
 * 六次选择 + 三次拷问；前一步决定后一步哪条路存在。
 * 引擎算数值和结局，页面只负责把这一页讲出来。
 *
 * 离线、没有模型、没有网络请求。本机决策器是往前推演到结局的贪心搜索。
 */

import lifeData from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/data/life.json'
import instancesData from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/data/instances.json'
import {
  createSave,
  sceneOf,
  choose,
  endingFor
} from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/engine/life.js'
import { decide, personaList } from './life-policy.js'

const SAVE_KEY = 'xiaoshi-life-run-v2'
const PREMISE_KEY = 'xiaoshi-life-premise-v2'
const LINE_KEY = 'xiaoshi-life-lastline-v2'
const SEEN_KEY = 'xiaoshi-life-seen-v2'

const app = document.getElementById('app')

const STATS = [
  ['money', '钱'],
  ['health', '健康'],
  ['love', '爱'],
  ['freedom', '自由'],
  ['parents', '父母'],
  ['regret', '遗憾']
]
const DESIRE = {
  money: '钱', health: '健康', love: '被爱', freedom: '自由', parents: '被期待', self: '自己'
}

const COPY_SUGGEST = {
  money: ['billionaire', 'phoenix', 'top-donor'],
  freedom: ['mayor', 'delivery', 'sloppy'],
  love: ['marry-love', 'moonlight', 'npd'],
  home: ['village', 'mom-shop', 'barber'],
  self: ['misdiagnosis', 'glasses', 'acting']
}

const themeLabel = (id) => lifeData.themes.find((theme) => theme.id === id)?.label ?? id
const costLabel = (id) => lifeData.costs.find((cost) => cost.id === id)?.label ?? id

let state = null
let scene = null
let result = null
let ending = null
let open = null
let mode = 'start'
let auto = false
let autoTimer = null
let persona = 'money'
let decisionNote = ''
let lastLine = ''

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const PAGE_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const pageNum = (index) => PAGE_NUM[index] ?? String(index + 1)

function loadRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (raw && raw.schema === 2 && raw.stats && Number.isFinite(raw.chapter)) return raw
  } catch { /* ignore */ }
  return null
}

function saveRun() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function clearRun() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
}

function loadPremise() {
  try { return localStorage.getItem(PREMISE_KEY) ?? '' } catch { return '' }
}

function savePremise(value) {
  try {
    if (value) localStorage.setItem(PREMISE_KEY, value)
    else localStorage.removeItem(PREMISE_KEY)
  } catch { /* ignore */ }
}

function loadLine() {
  try { return localStorage.getItem(LINE_KEY) ?? '' } catch { return '' }
}

function saveLine(value) {
  try {
    if (value) localStorage.setItem(LINE_KEY, value)
    else localStorage.removeItem(LINE_KEY)
  } catch { /* ignore */ }
}

function seenSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [])
  } catch { return new Set() }
}

function markSeen(id) {
  const seen = seenSet()
  seen.add(id)
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])) } catch { /* ignore */ }
}

function top() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

/* ------------------------------------------------------------------ */
/* 卡面零件                                                            */
/* ------------------------------------------------------------------ */

function shell(inner, extra = '') {
  return `
    <main class="table">
      <section class="card ${extra}">${inner}</section>
      ${tools()}
      <p class="note">竖版单卡 · 1985—2026 · 七十种答案 · 离线</p>
    </main>`
}

function seal() {
  return '<div class="card-seal" aria-hidden="true">生</div>'
}

function statsBar(stats) {
  return `
    <div class="card-stats life" aria-label="当前数值">
      ${STATS.map(([key, label]) => {
        const value = stats[key] ?? 0
        const danger = (key === 'regret' && value >= 55) || (key === 'health' && value <= 40)
        return `<span class="stat ${danger ? 'danger' : ''}">
          <span class="stat-top"><b>${label}</b><i>${value}</i></span>
          <span class="stat-bar"><span style="width:${value}%"></span></span>
        </span>`
      }).join('')}
    </div>`
}

function deltaChips(effects) {
  const rows = []
  for (const [key, raw] of Object.entries(effects ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value === 0) continue
    const label = STATS.find(([id]) => id === key)?.[1] ?? key
    rows.push(`<span class="delta ${value > 0 ? 'up' : 'down'}">${label} ${value > 0 ? '+' : ''}${value}</span>`)
  }
  return rows.length > 0 ? `<div class="deltas">${rows.join('')}</div>` : '<p class="hint">这一步不改变数字，只改变你。</p>'
}

function journey(current) {
  const pages = lifeData.pages ?? lifeData.chapters
  return `
    <div class="journey" aria-label="时间线">
      ${pages.map((chapter, index) => {
        const cls = index < current ? 'done' : index === current ? 'now' : ''
        return `<span class="journey-step ${cls}"><i></i><b>${String(chapter.year).slice(2)}</b></span>`
      }).join('')}
    </div>`
}

function footline(current, options = null) {
  const locked = options === null ? 0 : options.filter((option) => option.locked).length
  return `
    <div class="card-footline">
      ${journey(current)}
      ${locked > 0 ? `<button class="locked-link" data-locked title="当年没走的路" aria-label="当年没走的路"><b>锁</b>${locked}</button>` : ''}
    </div>`
}

function premiseText(value) {
  return String(value ?? '').replace(/^如果当年[，,]?\s*/, '')
}

function trace() {
  const log = Array.isArray(state?.log) ? state.log : []
  if (log.length === 0) return ''
  const rows = log.slice(-2)
  return `<p class="trace-line"><span>已走</span>${rows.map((entry) =>
    `${entry.age}岁 ${esc(entry.title.replace(/^拷问 · /, ''))}：${esc(entry.label)}`
  ).join(' → ')}</p>`
}

function tools() {
  if (mode === 'start') return ''
  const personas = personaList()
  return `
    <div class="tools">
      ${mode === 'play' ? `<button data-auto>${auto ? '停止推演' : '本机决策'}</button>` : ''}
      ${mode === 'play' ? `<label class="persona">倾向
        <select data-persona>
          ${personas.map((item) => `<option value="${item.id}" ${item.id === persona ? 'selected' : ''}>${item.label}</option>`).join('')}
        </select>
      </label>` : ''}
      <button data-gallery>图鉴</button>
      <button data-restart>重开</button>
    </div>`
}

/* ------------------------------------------------------------------ */
/* 开场（卡背）                                                        */
/* ------------------------------------------------------------------ */

function renderStart() {
  mode = 'start'
  auto = false
  clearAuto()
  const saved = loadRun()
  const seen = seenSet()
  const premise = loadPremise()
  app.innerHTML = shell(`
    <div class="back-inner">
      <div class="back-seal" aria-hidden="true">生</div>
      <p class="back-kicker">1985 · 广东东莞 · 2026</p>
      <h1 class="back-title">如果</h1>
      <p class="back-sub">人生之书<br>六次选择 · 三次拷问 · 七十种答案</p>
      <p class="back-memory">台风、录像厅、龙舟鼓。<br>1997 香港回归，2003 年你十八岁。</p>
      <label class="premise-field">
        <span>如果当年……</span>
        <input data-premise maxlength="30" placeholder="可留空，写一句你的如果" value="${esc(premise)}">
      </label>
      <div class="back-actions">
        <button class="gold" data-start>${saved ? '翻开新的一生' : '翻开第一页'}</button>
        ${saved ? '<button class="ghost-light" data-resume>继续上局</button>' : ''}
        <button class="link-light" data-gallery>结局图鉴 ${seen.size} / ${lifeData.endings.length}</button>
        <button class="link-light" data-copybook>穿梭人生 · ${instancesData.instances.length + 1} 个副本</button>
      </div>
      <p class="back-foot">离线 · 无网络请求</p>
    </div>`, 'back')
  bind()
}

/* ------------------------------------------------------------------ */
/* 章节                                                                */
/* ------------------------------------------------------------------ */

function eraChips(era) {
  if (!era) return ''
  return `
    <div class="era" aria-label="年代符号">
      <span class="era-source">那年 · ${esc(era.source)}</span>
      ${(era.hot ?? []).map((item) => `<span class="era-item">${esc(item)}</span>`).join('')}
    </div>`
}

function lockedPaths(options) {
  const locked = options.filter((option) => option.locked)
  if (locked.length === 0) return ''
  return `<button class="locked-link" data-locked><b>锁</b>${locked.length}</button>`
}

function showLocked(options) {
  stopAuto()
  const locked = options.filter((option) => option.locked)
  if (locked.length === 0) return
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `
    <div class="modal locked-modal" role="dialog" aria-modal="true" aria-label="当年没走的路">
      <div class="modal-head">
        <div>
          <p class="eyebrow">当年没走的路</p>
          <h2>${locked.length} 条</h2>
          <p class="modal-sub">它们不是被删掉了，是你当年的选择没有把它们留出来。</p>
        </div>
        <button class="close" data-close aria-label="关闭">×</button>
      </div>
      ${locked.map((option) => `
        <div class="locked-card">
          <p class="locked-label">${esc(option.label)}</p>
          <p class="locked-reason">${esc(option.lockReason)}</p>
        </div>`).join('')}
    </div>`
  document.body.append(overlay)
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (event) => { if (event.key === 'Escape') close() }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close() })
  overlay.querySelector('[data-close]').addEventListener('click', close)
  document.addEventListener('keydown', onKey)
}

function renderScene() {
  if (!scene || scene.finished) { finishRun(); return }
  mode = 'play'
  const isQuestion = scene.kind === 'question'
  const title = isQuestion ? scene.title.replace(/^拷问 · /, '') : scene.title
  const openOptions = scene.options.filter((option) => !option.locked)
  const options = openOptions.map((option) => `
    <button class="choice" data-choice="${esc(option.id)}">
      <span class="choice-text"><span class="desire">${esc(option.desireLabel)}</span>${esc(option.label)}<span class="flag">${option.canon ? '当年' : '如果'}</span></span>
      <span class="arrow" aria-hidden="true">›</span>
    </button>`).join('')

  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">${isQuestion ? '拷问' : `第${pageNum(scene.chapter)}页`} <span class="progress">${scene.chapter + 1}/${scene.total}</span></p>
        <h1>${esc(title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta"><span>${scene.year}年</span><span>${scene.age}岁</span><span>${esc(state.tags.city)}</span>${scene.premise ? `<span class="premise-meta">如果：${esc(premiseText(scene.premise))}</span>` : ''}</div>
      ${statsBar(scene.stats)}
      <div class="card-story">
        ${eraChips(scene.era)}
        <p class="narration ${isQuestion ? 'question-text' : ''}">${esc(scene.narration)}</p>
        ${trace()}
        ${isQuestion ? '<p class="hint">没有标准答案。它只决定，十年后哪条路还在。</p>' : ''}
      </div>
      ${footline(scene.chapter, scene.options)}
      <div class="card-actions ${openOptions.length > 4 ? 'many' : ''} ${isQuestion ? 'question-actions' : ''}">${options}</div>
    </div>`, isQuestion ? 'question-card' : '')
  bind()
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

function renderResult() {
  mode = 'play'
  if (!result) return renderScene()
  const option = result.option
  const nextIsQuestion = scene && scene.finished === false && scene.kind === 'question'
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">第${pageNum(result.chapter)}页 · ${esc(result.title)}</p>
        <h1>${esc(option.label)}</h1>
      </header>
      ${seal()}
      <div class="card-meta">
        <span>${option.canon ? '当年' : '如果'}</span>
        <span>欲望：${esc(DESIRE[option.desire] ?? option.desire)}</span>
        ${result.mult > 1 ? `<span class="compound">复利 ×${result.mult.toFixed(2)}</span>` : ''}
      </div>
      ${statsBar(state.stats)}
      <div class="card-story">
        ${result.after
          ? `<p class="narration">${esc(result.after)}</p><p class="after-note">${esc(option.note)}</p>`
          : `<p class="narration">${esc(option.note)}</p>`}
        ${deltaChips(result.effects)}
        ${option.echo ? `<p class="echo"><span>多年以后</span>${esc(option.echo)}</p>` : ''}
        ${decisionNote ? `<p class="decision"><b>本机决策器</b>${esc(decisionNote)}</p>` : ''}
        ${scene && !scene.finished ? `<p class="hint">下一${nextIsQuestion ? '问' : '页'}：${esc(scene.title.replace(/^拷问 · /, ''))}</p>` : ''}
        ${trace()}
      </div>
      ${footline(result.chapter)}
      <div class="card-actions"><button class="primary" data-continue>继续</button></div>
    </div>`, 'result-card')
  bind()
}

/* ------------------------------------------------------------------ */
/* 结局                                                                */
/* ------------------------------------------------------------------ */

function endingTheme(ending) {
  if (ending.theme) return ending.theme
  const flags = state?.flags ?? {}
  if (flags.sea_life || flags.sea_owner || flags.fisherman) return 'freedom'
  if (flags.factory_owner || flags.boss) return 'money'
  if (flags.coach || flags.pro_athlete || flags.writer_life || flags.painter_life) return 'self'
  if (flags.ipo || flags.bank) return 'money'
  if (flags.reunited || flags.family) return 'love'
  if (flags.sea_life || flags.south) return 'freedom'
  if (flags.shop_home || flags.came_home) return 'home'
  return 'self'
}

function suggestedCopies(ending) {
  const ids = COPY_SUGGEST[endingTheme(ending)] ?? COPY_SUGGEST.self
  return ids
    .map((id) => instancesData.instances.find((item) => item.id === id))
    .filter(Boolean)
}

function renderEnding() {
  mode = 'ending'
  auto = false
  clearAuto()
  if (!ending) return
  lastLine = loadLine()
  const desires = Object.entries(state.desires ?? {}).filter(([, count]) => count > 0)
  const fragments = open?.fragments ?? []
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">${ending.kind === 'special' ? '结局 · 另一种答案' : `结局 · ${esc(themeLabel(ending.theme))} × ${esc(costLabel(ending.cost))}`}</p>
        <h1>${esc(ending.title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta"><span>${esc(ending.subtitle)}</span></div>
      ${statsBar(state.stats)}
      <div class="card-story">
        <p class="narration ending-text">${esc(ending.text)}</p>
        <p class="ending-comment">${esc(ending.comment)}</p>
        ${open ? `<div class="open-epilogue">
          <p class="open-title">${ending.kind === 'special' ? '这一生的坐标' : '开放式尾声'}</p>
          ${ending.kind === 'special' ? '' : `<p>${esc(open.line)}</p>`}
          <div class="open-tags">${fragments.map((fragment) => `<span>${esc(fragment)}</span>`).join('')}</div>
        </div>` : ''}
        ${state.premise ? `<p class="premise-line">你带着：${esc(state.premise)}</p>` : ''}
        <p class="ending-run">你喂饱了：${desires.length > 0 ? desires.map(([key, count]) => `${DESIRE[key] ?? key}×${count}`).join('、') : '没有记下任何欲望'}</p>
        <div class="lastline">
          <label>写给自己的结局<input data-lastline maxlength="40" placeholder="一句你的如果" value="${esc(lastLine)}"></label>
          <button class="secondary" data-save-line>留下</button>
        </div>
        ${lastLine ? `<p class="lastline-show">你的如果：${esc(lastLine)}</p>` : ''}
        <div class="ending-copies">
          <p class="copy-title">换一段人生 · 根据这一世给你推的副本</p>
          <div class="copy-buttons">
            ${suggestedCopies(ending).map((item) => `<button class="copy-chip" data-open-copy="${esc(item.id)}">${esc(item.title)}<span>${esc(item.subtitle)}</span></button>`).join('')}
          </div>
        </div>
      </div>
      ${footline((lifeData.pages ?? lifeData.chapters).length)}
      <div class="card-actions ending-actions">
        <button class="primary" data-start>再活一次</button>
        <button class="secondary" data-gallery>图鉴</button>
      </div>
    </div>`, 'ending-card')
  bind()
}

/* ------------------------------------------------------------------ */
/* 行为                                                                */
/* ------------------------------------------------------------------ */

function startRun(premise = '') {
  stopAuto()
  const value = String(premise ?? '').trim().slice(0, 30)
  savePremise(value)
  state = createSave(`xiaoshi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  state.premise = value
  scene = sceneOf(state, lifeData)
  result = null
  ending = null
  open = null
  decisionNote = ''
  mode = 'play'
  clearRun()
  top()
  render()
}

function resumeRun() {
  stopAuto()
  const saved = loadRun()
  if (saved === null) return renderStart()
  state = saved
  scene = sceneOf(state, lifeData)
  result = null
  ending = null
  open = null
  decisionNote = ''
  mode = 'play'
  top()
  render()
}

function chooseOption(id, note = '') {
  if (!scene || scene.finished) return
  const out = choose(state, lifeData, id)
  state = out.state
  decisionNote = note
  result = {
    option: out.option,
    effects: out.effects,
    mult: out.mult,
    after: out.after,
    chapter: scene.chapter,
    title: scene.title
  }
  scene = out.next
  top()
  render()
}

function continueAfterResult() {
  if (!result) return
  result = null
  decisionNote = ''
  saveRun()
  top()
  render()
}

function finishRun() {
  if (ending) return
  if (!scene || !scene.finished) return
  ending = scene.ending ?? sceneOf(state, lifeData).ending ?? endingFor(state, lifeData)
  open = scene.open ?? null
  markSeen(ending.id)
  clearRun()
}

function restart() {
  stopAuto()
  state = null
  scene = null
  result = null
  ending = null
  open = null
  decisionNote = ''
  clearRun()
  top()
  renderStart()
}

/* ------------------------------------------------------------------ */
/* 本机推演                                                            */
/* ------------------------------------------------------------------ */

function scheduleAuto() {
  clearAuto()
  if (!auto || mode !== 'play' || ending) return
  autoTimer = setTimeout(() => {
    autoTimer = null
    autoStep()
  }, result ? 1150 : 950)
}

function clearAuto() {
  if (autoTimer !== null) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}

function stopAuto() {
  auto = false
  clearAuto()
  decisionNote = ''
}

function autoStep() {
  if (!auto || mode !== 'play') return
  if (result) {
    result = null
    decisionNote = ''
    saveRun()
    render()
    return
  }
  if (!scene || scene.finished) {
    finishRun()
    render()
    return
  }
  const decision = decide(state, lifeData, persona)
  if (!decision) return
  chooseOption(decision.id, decision.reason)
}

function toggleAuto() {
  if (auto) {
    stopAuto()
    render()
    return
  }
  auto = true
  decisionNote = ''
  render()
}

/* ------------------------------------------------------------------ */
/* 结局图鉴                                                            */
/* ------------------------------------------------------------------ */

function galleryRows(items, seen, labelOf) {
  return items.map((item) => {
    const got = seen.has(item.id)
    return `
      <details class="gallery-card ${got ? 'open' : 'locked'}">
        <summary>
          <span class="gallery-index">${esc(labelOf(item))}</span>
          <span class="gallery-title ${got ? '' : 'locked-title'}">${got ? esc(item.title) : '未解锁'}</span>
          <span class="gallery-sub">${got ? esc(item.subtitle) : esc(item.hint)}</span>
        </summary>
        ${got
          ? `<p class="gallery-text">${esc(item.text)}</p><p class="gallery-comment">${esc(item.comment)}</p>`
          : `<p class="gallery-hint">提示：${esc(item.hint)}</p>`}
      </details>`
  }).join('')
}

function showGallery() {
  stopAuto()
  const seen = seenSet()
  const costIndex = new Map(lifeData.costs.map((cost, index) => [cost.id, index]))
  const matrix = lifeData.endings.filter((item) => item.kind !== 'special')
  const special = lifeData.endings.filter((item) => item.kind === 'special' && !item.id.startsWith('rough'))
  const rough = lifeData.endings.filter((item) => item.kind === 'special' && item.id.startsWith('rough'))
  const groups = lifeData.themes.map((theme) => ({
    theme,
    rows: matrix
      .filter((item) => item.theme === theme.id)
      .sort((a, b) => (costIndex.get(a.cost) ?? 0) - (costIndex.get(b.cost) ?? 0))
  }))
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="结局图鉴">
      <div class="modal-head">
        <div>
          <p class="eyebrow">结局图鉴</p>
          <h2>${seen.size} / ${lifeData.endings.length}</h2>
          <p class="modal-sub">五个主题 × 六个代价位，外加四十种特殊人生（含十种潦草人生）。锁着的格子，只给一句提示。</p>
        </div>
        <button class="close" data-close aria-label="关闭">×</button>
      </div>
      ${groups.map(({ theme, rows }) => `
        <p class="group-title">${esc(theme.label)}</p>
        ${galleryRows(rows, seen, (item) => `${theme.label} · ${costLabel(item.cost)}`)}
      `).join('')}
      <p class="group-title">潦草人生</p>
      ${galleryRows(rough, seen, () => '潦草')}
      <p class="group-title">另一种答案</p>
      ${galleryRows(special, seen, () => '特别')}
      <p class="modal-foot">图鉴存在这台设备的 localStorage 里。换一台设备不会同步。</p>
    </div>`
  document.body.append(overlay)
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (event) => { if (event.key === 'Escape') close() }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close() })
  overlay.querySelector('[data-close]').addEventListener('click', close)
  document.addEventListener('keydown', onKey)
}

/* ------------------------------------------------------------------ */
/* 绑定与渲染                                                          */
/* ------------------------------------------------------------------ */

function bind() {
  app.querySelectorAll('[data-start]').forEach((node) => {
    node.addEventListener('click', () => {
      const input = app.querySelector('[data-premise]')
      startRun(input ? input.value : loadPremise())
    })
  })
  app.querySelectorAll('[data-resume]').forEach((node) => node.addEventListener('click', resumeRun))
  app.querySelectorAll('[data-restart]').forEach((node) => node.addEventListener('click', restart))
  app.querySelectorAll('[data-gallery]').forEach((node) => node.addEventListener('click', showGallery))
  app.querySelectorAll('[data-copybook]').forEach((node) => node.addEventListener('click', () => window.__openCopybook?.()))
  app.querySelectorAll('[data-open-copy]').forEach((node) => node.addEventListener('click', () => window.__openCopybookWith?.(node.dataset.openCopy)))
  app.querySelectorAll('[data-locked]').forEach((node) => {
    node.addEventListener('click', () => showLocked(scene ? scene.options : []))
  })
  app.querySelectorAll('[data-choice]').forEach((node) => {
    node.addEventListener('click', () => {
      stopAuto()
      chooseOption(node.dataset.choice)
    })
  })
  app.querySelectorAll('[data-continue]').forEach((node) => node.addEventListener('click', continueAfterResult))
  app.querySelectorAll('[data-auto]').forEach((node) => node.addEventListener('click', toggleAuto))
  app.querySelectorAll('[data-persona]').forEach((node) => {
    node.addEventListener('change', () => {
      persona = node.value
      if (auto) render()
    })
  })
  app.querySelectorAll('[data-save-line]').forEach((node) => {
    node.addEventListener('click', () => {
      const input = app.querySelector('[data-lastline]')
      lastLine = input ? input.value.trim().slice(0, 40) : ''
      saveLine(lastLine)
      renderEnding()
    })
  })
  const premise = app.querySelector('[data-premise]')
  if (premise) {
    premise.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') startRun(premise.value)
    })
  }
}

function render() {
  if (mode === 'start') {
    renderStart()
    return
  }
  if (result) {
    renderResult()
  } else {
    if (!ending && scene && scene.finished) finishRun()
    if (ending) renderEnding()
    else if (scene) renderScene()
    else renderStart()
  }
  if (auto && mode === 'play' && !ending) scheduleAuto()
}

function resumeLife() {
  if (state) render()
  else renderStart()
}

export { renderStart, render, resumeLife }
