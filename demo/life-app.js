/**
 * 如果（小狮日记 · 人生之书）—— 4:6 单卡 demo。
 *
 * 和 @ohos/dsh-sanguo 的卡片版同一套做法：引擎算数值，页面只负责把
 * 一章讲出来、把选项递到手上。没有模型、没有网络、没有外部依赖。
 */

import lifeData from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/data/life.json'
import { createSave, sceneOf, choose } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/engine/life.js'

const SAVE_KEY = 'xiaoshi-life-run-v1'
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
const PERSONAS = {
  money: '钱', freedom: '自由', love: '被爱', parents: '被期待', self: '自己'
}

let state = null
let scene = null
let result = null
let ending = null
let mode = 'start'
let auto = false
let autoTimer = null
let persona = 'money'

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

function loadRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (raw && raw.stats && Number.isFinite(raw.chapter)) return raw
  } catch { /* ignore */ }
  return null
}

function saveRun() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function clearRun() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
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
      <p class="note">4:6 单卡 · 如果 · 五章 · 六种答案 · 离线</p>
    </main>`
}

function seal() {
  return '<div class="card-seal" aria-hidden="true">生</div>'
}

function statsBar(stats) {
  return `
    <div class="card-stats life" aria-label="当前数值">
      ${STATS.map(([key, label]) =>
        `<span class="chip ${key === 'regret' && stats.regret >= 60 ? 'danger' : key === 'health' && stats.health <= 40 ? 'danger' : ''}"><b>${label}</b>${stats[key]}</span>`
      ).join('')}
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
  return rows.length > 0 ? `<div class="deltas">${rows.join('')}</div>` : ''
}

function tools() {
  if (mode === 'start' || ending) return ''
  return `
    <div class="tools">
      <button data-auto>${auto ? '停止推演' : '本机推演'}</button>
      <label class="persona">倾向
        <select data-persona>
          ${Object.entries(PERSONAS).map(([key, label]) => `<option value="${key}" ${key === persona ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
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
  app.innerHTML = shell(`
    <div class="back-inner">
      <div class="back-seal" aria-hidden="true">生</div>
      <p class="back-kicker">小狮日记 · 1998—2033 · 临江</p>
      <h1 class="back-title">如果</h1>
      <p class="back-sub">人生之书<br>五次选择 · 六种答案</p>
      <div class="back-actions">
        <button class="gold" data-start>${saved ? '翻开新的一生' : '翻开第一页'}</button>
        ${saved ? '<button class="ghost-light" data-resume>继续上局</button>' : ''}
      </div>
      <p class="back-foot">离线 · 无网络请求</p>
    </div>`, 'back')
  bind()
}

/* ------------------------------------------------------------------ */
/* 章节                                                                */
/* ------------------------------------------------------------------ */

function renderScene() {
  if (!scene || scene.finished) { finishRun(); return renderEnding() }
  mode = 'play'
  const options = scene.options.map((option) => `
    <button class="choice" data-choice="${esc(option.id)}">
      <span class="choice-text"><span class="desire">${esc(option.desireLabel)}</span>${esc(option.label)}<span class="flag">${option.canon ? '当年' : '如果'}</span></span>
      <span class="arrow" aria-hidden="true">›</span>
    </button>`).join('')

  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">第${scene.chapter + 1}章 · ${esc(scene.title)} <span class="progress">${scene.chapter + 1}/${scene.total}</span></p>
        <h1>${esc(scene.title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta"><span>${scene.year}年</span><span>${scene.age}岁</span><span>${esc(state.tags.city)}</span></div>
      ${statsBar(scene.stats)}
      <div class="card-story"><p class="narration">${esc(scene.narration)}</p></div>
      <div class="card-actions ${scene.options.length > 4 ? 'many' : ''}">${options}</div>
    </div>`)
  bind()
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

function renderResult() {
  mode = 'play'
  if (!result) return renderScene()
  const option = result.option
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">第${result.chapter + 1}章 · ${esc(result.title)}</p>
        <h1>${esc(option.label)}</h1>
      </header>
      ${seal()}
      <div class="card-meta"><span>${option.canon ? '当年' : '如果'}</span><span>欲望：${esc(DESIRE[option.desire] ?? option.desire)}</span></div>
      ${statsBar(state.stats)}
      <div class="card-story">
        <p class="narration">${esc(option.note)}</p>
        ${deltaChips(result.effects)}
        ${scene && !scene.finished ? `<p class="hint">下一章：${esc(scene.title)}</p>` : ''}
      </div>
      <div class="card-actions"><button class="primary" data-continue>继续</button></div>
    </div>`)
  bind()
}

/* ------------------------------------------------------------------ */
/* 结局                                                                */
/* ------------------------------------------------------------------ */

function renderEnding() {
  mode = 'ending'
  auto = false
  clearAuto()
  const desires = Object.entries(state.desires ?? {}).filter(([, count]) => count > 0)
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">结局 · 六种答案</p>
        <h1>${esc(ending.title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta">${esc(ending.subtitle)}</div>
      ${statsBar(state.stats)}
      <div class="card-story">
        <p class="narration ending-text">${esc(ending.text)}</p>
        <p class="ending-comment">${esc(ending.comment)}</p>
        <p class="ending-run">你喂饱了：${desires.length > 0 ? desires.map(([key, count]) => `${DESIRE[key] ?? key}×${count}`).join('、') : '没有记下任何欲望'}</p>
      </div>
      <div class="card-actions ending-actions"><button class="primary" data-start>再活一次</button></div>
    </div>`, 'ending-card')
  bind()
}

/* ------------------------------------------------------------------ */
/* 行为                                                                */
/* ------------------------------------------------------------------ */

function startRun() {
  stopAuto()
  state = createSave(`xiaoshi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  scene = sceneOf(state, lifeData)
  result = null
  ending = null
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
  ending = scene.finished ? scene.ending : null
  mode = 'play'
  top()
  render()
}

function chooseOption(id) {
  if (!scene || scene.finished) return
  stopAuto()
  const out = choose(state, lifeData, id)
  state = out.state
  result = {
    option: out.option,
    effects: out.effects,
    chapter: scene.chapter,
    title: scene.title
  }
  scene = out.next
  top()
  render()
}

function continueAfterResult() {
  if (!result) return
  stopAuto()
  result = null
  saveRun()
  top()
  render()
}

function finishRun() {
  if (ending || !scene || !scene.finished) return
  ending = scene.ending
  clearRun()
}

function restart() {
  stopAuto()
  state = null
  scene = null
  result = null
  ending = null
  clearRun()
  top()
  renderStart()
}

/* ------------------------------------------------------------------ */
/* 本机推演                                                            */
/* ------------------------------------------------------------------ */

function pickOption() {
  const match = scene.options.find((option) => option.desire === persona)
  if (match) return match.id
  const canon = scene.options.find((option) => option.canon)
  return canon?.id ?? scene.options[0]?.id
}

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
}

function autoStep() {
  if (!auto || mode !== 'play') return
  if (result) {
    result = null
    saveRun()
    render()
    return
  }
  if (!scene) return
  if (scene.finished) {
    finishRun()
    render()
    return
  }
  const id = pickOption()
  if (id) {
    const out = choose(state, lifeData, id)
    state = out.state
    result = { option: out.option, effects: out.effects, chapter: scene.chapter, title: scene.title }
    scene = out.next
    top()
    render()
  }
}

function toggleAuto() {
  if (auto) {
    stopAuto()
    render()
    return
  }
  auto = true
  render()
}

/* ------------------------------------------------------------------ */
/* 绑定与渲染                                                          */
/* ------------------------------------------------------------------ */

function bind() {
  app.querySelectorAll('[data-start]').forEach((node) => node.addEventListener('click', startRun))
  app.querySelectorAll('[data-resume]').forEach((node) => node.addEventListener('click', resumeRun))
  app.querySelectorAll('[data-restart]').forEach((node) => node.addEventListener('click', restart))
  app.querySelectorAll('[data-choice]').forEach((node) => {
    node.addEventListener('click', () => chooseOption(node.dataset.choice))
  })
  app.querySelectorAll('[data-continue]').forEach((node) => node.addEventListener('click', continueAfterResult))
  app.querySelectorAll('[data-auto]').forEach((node) => node.addEventListener('click', toggleAuto))
  app.querySelectorAll('[data-persona]').forEach((node) => {
    node.addEventListener('change', () => {
      persona = node.value
      if (auto) render()
    })
  })
}

function render() {
  if (mode === 'start') {
    renderStart()
  } else {
    if (!ending && scene && scene.finished) finishRun()
    if (ending) renderEnding()
    else if (result) renderResult()
    else if (!scene || scene.finished) { finishRun(); renderEnding() }
    else renderScene()
  }
  if (auto && mode === 'play' && !ending) scheduleAuto()
}

render()
