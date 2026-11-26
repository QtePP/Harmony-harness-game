/**
 * 三国人生 · 离线 demo 的前端。
 *
 * 没有框架、没有网络请求、没有 API Key。引擎是 @ohos/dsh-sanguo 的纯 JS 部分，
 * 剧情是 data/acts.json 的 23 个场景；长坂之后接一个 demo 专属的终章，收束到 8 个结局。
 */

import actsDocument from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/data/acts.json'
import { makeGame } from './game.js'
import { EPILOGUE, ENDINGS, ENDING_BY_ID } from './endings.js'

const game = makeGame(actsDocument)
const app = document.getElementById('app')

const SAVE_KEY = 'sanguo-demo-run-v1'
const GALLERY_KEY = 'sanguo-demo-endings-v1'

const ATTR_LABEL = { wu: '武', tong: '统', zhi: '智', zheng: '政', mei: '魅' }
const EFFECT_LABEL = {
  fame: '名望',
  trust: '信义',
  talent: '人才',
  gold: '金',
  grain: '粮',
  troops: '兵',
  hp: '体力'
}
const OUTCOME_LABEL = {
  critical_success: '大成功',
  success: '成功',
  partial: '未成',
  failure: '失败',
  critical_failure: '大失败'
}

const PERSONAS = {
  ren: {
    name: '仁',
    trust: 2.0, fame: 1.0, talent: 1.0, troops: -0.3, gold: 0.1, grain: 0.1, hp: 0.6, historical: 0.4
  },
  ba: {
    name: '霸',
    trust: -0.6, fame: 1.2, talent: 0.5, troops: 1.0, gold: 0.4, grain: 0.4, hp: 0.2, historical: -0.4
  },
  wen: {
    name: '稳',
    trust: 0.8, fame: 0.5, talent: 0.5, troops: 0.3, gold: 0.5, grain: 0.5, hp: 1.2, historical: 0.2
  },
  yin: {
    name: '隐',
    trust: 0.5, fame: -1.0, talent: 0.2, troops: -1.0, gold: 0.5, grain: 0.5, hp: 1.0, historical: -0.3
  }
}

let state = null
let scene = null
let result = null
let ending = null
let mode = 'start'
let skipped = null
let auto = false
let autoTimer = null
let persona = 'ren'
let newEnding = false
let unlocked = loadUnlocked()

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function loadUnlocked() {
  try {
    const raw = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id) => ENDING_BY_ID[id] !== undefined) : [])
  } catch {
    return new Set()
  }
}

function saveUnlocked() {
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify([...unlocked]))
  } catch {
    /* file:// 下个别浏览器会禁用 localStorage，忽略即可 */
  }
}

function loadRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (raw && raw.player && raw.clock && typeof raw.act === 'string') return raw
  } catch {
    /* ignore */
  }
  return null
}

function saveRun() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function clearRun() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: auto || reducedMotion() ? 'auto' : 'smooth' })
}

function yearsOf(turns) {
  const years = Math.round((Number(turns) || 0) / 4)
  return years <= 1 ? '一年' : `${years}年`
}

function deltaChips(effects, attributeGain) {
  const out = []
  for (const [key, raw] of Object.entries(effects ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value === 0) continue
    const label = EFFECT_LABEL[key] ?? key
    out.push(`<span class="delta ${value > 0 ? 'up' : 'down'}">${label} ${value > 0 ? '+' : ''}${value}</span>`)
  }
  for (const [key, raw] of Object.entries(attributeGain ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value === 0) continue
    out.push(`<span class="delta up">${ATTR_LABEL[key] ?? key} ${value > 0 ? '+' : ''}${value}</span>`)
  }
  return out.length > 0 ? `<div class="deltas">${out.join('')}</div>` : ''
}

function statsBar(stats) {
  const driftClass = stats.drift >= 60 ? 'danger' : stats.drift >= 30 ? 'warn' : ''
  const hpClass = stats.hp <= 30 ? 'danger' : stats.hp <= 60 ? 'warn' : ''
  return `
    <div class="stats" aria-label="当前数值">
      <span class="chip"><b>名望</b>${stats.fame}</span>
      <span class="chip"><b>信义</b>${stats.trust}</span>
      <span class="chip"><b>人才</b>${stats.talent}</span>
      <span class="chip ${driftClass}"><b>势</b>${stats.drift}</span>
      <span class="chip"><b>兵</b>${stats.troops}</span>
      <span class="chip"><b>金</b>${stats.gold}</span>
      <span class="chip"><b>粮</b>${stats.grain}</span>
      <span class="chip ${hpClass}"><b>体力</b>${stats.hp}</span>
    </div>`
}

function metaLine(scene) {
  const era = scene.era ? ` · ${scene.era}` : ''
  return `<div class="meta"><span>${esc(scene.when)}${esc(era)}</span><span>${scene.age}岁</span><span>${esc(scene.place ?? '')}</span></div>`
}

function timeSkipNote(skip) {
  if (!skip) return ''
  return `<p class="timeskip">时光流转：${yearsOf(skip.turns)}过去。</p>`
}

function brand() {
  return `<div class="brand"><span class="seal" aria-hidden="true">漢</span><div><h1>三国人生</h1><p>离线 demo · 161—223</p></div></div>`
}

function topBar(right = '') {
  return `
    <header class="top">
      ${brand()}
      <div class="top-actions">
        ${right}
        <button class="ghost" data-gallery>结局 <span class="count">${unlocked.size}/${ENDINGS.length}</span></button>
      </div>
    </header>`
}

/* ------------------------------------------------------------------ */
/* 开场                                                                */
/* ------------------------------------------------------------------ */

function renderStart() {
  const saved = loadRun()
  mode = 'start'
  auto = false
  clearAuto()
  document.body.dataset.phase = 'start'
  app.innerHTML = `
    <main class="hero">
      <div class="hero-seal" aria-hidden="true">漢</div>
      <p class="kicker">汉末 · 延熹四年 — 章武三年</p>
      <h1>三国人生</h1>
      <p class="tagline">你扮演刘备，从涿县的一棵桑树开始。</p>
      <p class="lede">
        23 个场景，从五岁指树，到白帝托孤。
        骰子、数值、天下大势都由引擎算；你只做选择。
      </p>
      <div class="hero-actions">
        <button class="primary" data-start>开始这一生</button>
        ${saved ? '<button class="secondary" data-resume>继续上局</button>' : ''}
        <button class="text" data-gallery>结局图鉴 <span class="count">${unlocked.size}/${ENDINGS.length}</span></button>
      </div>
      <p class="footnote">单文件 · 无网络请求 · 引擎与剧情来自 @ohos/dsh-sanguo</p>
    </main>`
  bind()
}

/* ------------------------------------------------------------------ */
/* 场景                                                                */
/* ------------------------------------------------------------------ */

function renderScene() {
  if (!scene || scene.finished) return renderEpilogue()
  mode = 'play'
  document.body.dataset.phase = 'scene'
  const skip = timeSkipNote(skipped)
  const choices = scene.kind === 'moral'
    ? `<div class="choices">${scene.options.map((option) => `
        <button class="choice" data-choice="${esc(option.id)}">
          <span class="choice-label">${esc(option.label)}</span>
          <span class="choice-arrow" aria-hidden="true">›</span>
        </button>`).join('')}</div>`
    : `<div class="check-card">
        <p class="check-line">判定 · ${ATTR_LABEL[scene.ability.attribute] ?? scene.ability.attribute} ${scene.stats.attrs[scene.ability.attribute] ?? ''}
          <span class="muted">对</span> 难度 ${scene.ability.difficulty}</p>
        <p class="check-hint">骰子由引擎掷。成或不成，都不由你说了算。</p>
        <button class="primary" data-roll>掷骰</button>
      </div>`

  app.innerHTML = `
    ${topBar(`<button class="ghost" data-restart>重开</button>`)}
    <main class="stage" aria-live="polite">
      ${metaLine(scene)}
      ${skip}
      <section class="scene">
        <p class="act">${esc(scene.act)} <span class="progress">${scene.index + 1}/${scene.total}</span></p>
        <h2>${esc(scene.title)}</h2>
        <p class="narration">${esc(scene.narration)}</p>
      </section>
      ${statsBar(scene.stats)}
      ${choices}
      <div class="toolbar">
        <button class="text ${auto ? 'active' : ''}" data-auto>${auto ? '停止推演' : '本机推演'}</button>
        <label class="persona">
          <span>倾向</span>
          <select data-persona>
            ${Object.entries(PERSONAS).map(([key, item]) => `<option value="${key}" ${key === persona ? 'selected' : ''}>${item.name}</option>`).join('')}
          </select>
        </label>
      </div>
      <p class="hint">${auto ? '本机推演中：权重 + 骰，不联网。' : '「本机推演」会按所选倾向自动走完这一生。'}</p>
    </main>`
  bind()
  scheduleAuto()
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

function renderResult() {
  mode = 'play'
  document.body.dataset.phase = 'result'
  if (!result) return renderScene()
  const isCheck = result.kind === 'check'

  const head = isCheck
    ? `<p class="eyebrow">判定 · ${esc(result.title)}</p>
       <h2 class="result-title">${OUTCOME_LABEL[result.outcome] ?? result.outcome}</h2>
       <p class="roll">
         ${ATTR_LABEL[result.attribute] ?? result.attribute} ${result.attributeValue}
         + 骰 ${result.roll}
         ${result.modifierTotal ? ` ${result.modifierTotal > 0 ? '+' : ''}${result.modifierTotal}` : ''}
         = ${result.total}
         <span class="muted">对 难度 ${result.difficulty}</span>
       </p>
       <p class="narration result-text">${esc(result.text || (result.outcome === 'success' || result.outcome === 'critical_success' ? '事成了。' : '事没成。'))}</p>`
    : `<p class="eyebrow">已选 · ${esc(result.title)}</p>
       <h2 class="result-title">${esc(result.label)}</h2>
       ${result.note ? `<p class="narration result-text">${esc(result.note)}</p>` : ''}`

  const departure = !isCheck && result.departure
    ? `<p class="departure">偏离史载 · 势 → ${result.drift}</p>`
    : ''

  app.innerHTML = `
    ${topBar()}
    <main class="stage" aria-live="polite">
      <section class="scene result">
        ${head}
        ${deltaChips(result.effects, result.attributeGain)}
        ${departure}
        ${result.historical ? `<details class="history"><summary>史载</summary><p>${esc(result.historical)}</p></details>` : ''}
        ${skipped ? `<p class="timeskip">时光流转：${yearsOf(skipped.turns)}过去。</p>` : ''}
        ${statsBar(game.stats(state))}
        <button class="primary wide" data-continue>继续</button>
      </section>
    </main>`
  bind()
  scheduleAuto()
}

/* ------------------------------------------------------------------ */
/* 终章                                                                */
/* ------------------------------------------------------------------ */

function renderEpilogue() {
  mode = 'play'
  document.body.dataset.phase = 'epilogue'
  const stats = game.stats(state)
  app.innerHTML = `
    ${topBar()}
    <main class="stage" aria-live="polite">
      <div class="meta"><span>${esc(EPILOGUE.when)}</span><span>${state.age}岁</span><span>成都</span></div>
      <section class="scene epilogue">
        <p class="act">${esc(EPILOGUE.act)}</p>
        <h2>${esc(EPILOGUE.title)}</h2>
        <p class="narration">${esc(EPILOGUE.narration)}</p>
      </section>
      ${statsBar(stats)}
      <div class="choices">
        ${EPILOGUE.options.map((option) => `
          <button class="choice" data-epilogue="${esc(option.id)}">
            <span class="choice-label">${esc(option.label)}</span>
            <span class="choice-arrow" aria-hidden="true">›</span>
          </button>`).join('')}
      </div>
      <p class="hint">终章是 demo 的收束层；引擎写到这里，七个 act 到长坂为止。</p>
    </main>`
  bind()
  scheduleAuto()
}

/* ------------------------------------------------------------------ */
/* 结局                                                                */
/* ------------------------------------------------------------------ */

function renderEnding() {
  mode = 'ending'
  auto = false
  clearAuto()
  document.body.dataset.phase = 'ending'
  const stats = game.stats(state)
  const total = unlocked.size
  app.innerHTML = `
    <main class="ending">
      <div class="ending-seal" aria-hidden="true">漢</div>
      <p class="kicker">${newEnding ? '新结局' : '结局'} · ${total}/${ENDINGS.length}</p>
      <h1>${esc(ending.title)}</h1>
      <p class="ending-sub">${esc(ending.subtitle)}</p>
      <p class="ending-text">${esc(ending.text)}</p>
      ${ending.comment && ending.comment !== ending.subtitle ? `<p class="ending-comment">${esc(ending.comment)}</p>` : ''}
      <div class="ending-stats">
        <span>名望 <b>${stats.fame}</b></span>
        <span>信义 <b>${stats.trust}</b></span>
        <span>人才 <b>${stats.talent}</b></span>
        <span>势 <b>${stats.drift}</b></span>
        <span>选择 <b>${state.counters?.choicesMade ?? 0}</b></span>
        <span>偏离 <b>${state.counters?.deviations ?? 0}</b></span>
      </div>
      ${total === ENDINGS.length ? '<p class="all-done">全结局达成。</p>' : ''}
      <div class="ending-actions">
        <button class="primary" data-start>再活一次</button>
        <button class="secondary" data-gallery>结局图鉴</button>
      </div>
    </main>`
  bind()
}

/* ------------------------------------------------------------------ */
/* 行为                                                                */
/* ------------------------------------------------------------------ */

function startRun() {
  stopAuto()
  const run = game.newRun(`liubei-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  state = run.state
  scene = game.view(state)
  skipped = run.skipped
  result = null
  ending = null
  newEnding = false
  mode = 'play'
  clearRun()
  scrollTop()
  render()
}

function resumeRun() {
  stopAuto()
  const saved = loadRun()
  if (!saved) return renderStart()
  state = saved
  scene = game.view(state)
  skipped = null
  result = null
  ending = null
  newEnding = false
  mode = 'play'
  scrollTop()
  render()
}

function chooseOption(id) {
  if (!scene || scene.kind !== 'moral') return
  stopAuto()
  const previous = scene
  const out = game.choose(state, id)
  state = out.state
  scene = out.scene
  skipped = out.skipped
  result = { ...out.result, historical: previous.historical ?? '' }
  scrollTop()
  render()
}

function rollCheck() {
  if (!scene || scene.kind !== 'ability') return
  stopAuto()
  const previous = scene
  const out = game.attempt(state)
  state = out.state
  scene = out.scene
  skipped = out.skipped
  result = { ...out.result, historical: previous.historical ?? '' }
  scrollTop()
  render()
}

function continueAfterResult() {
  if (!result) return
  stopAuto()
  result = null
  skipped = null
  saveRun()
  scrollTop()
  render()
}

function chooseEpilogue(id) {
  stopAuto()
  const out = game.finish(state, id)
  state = out.state
  ending = out.ending
  newEnding = !unlocked.has(ending.id)
  if (newEnding) {
    unlocked.add(ending.id)
    saveUnlocked()
  }
  clearRun()
  scrollTop()
  render()
}

function restart() {
  stopAuto()
  state = null
  scene = null
  result = null
  ending = null
  clearRun()
  scrollTop()
  renderStart()
}

/* ------------------------------------------------------------------ */
/* 本机推演（pybot 风格：透明权重，不是大模型）                        */
/* ------------------------------------------------------------------ */

function scoreOption(option, stats, weights) {
  const effects = option.effects ?? {}
  let score = 0
  for (const key of ['trust', 'fame', 'talent', 'troops', 'gold', 'grain', 'hp']) {
    score += Number(effects[key] ?? 0) * Number(weights[key] ?? 0)
  }
  if (option.historical) score += weights.historical
  // 体力见底时，任何扣血的选项都要被压一压
  if (stats.hp < 35 && Number(effects.hp ?? 0) < 0) score -= 4
  // 势太高时，不要再加偏离
  if (stats.drift > 55 && option.historical === false) score -= 2
  return score + Math.random() * 0.9
}

function pickOption() {
  const weights = PERSONAS[persona]
  let best = null
  let bestScore = -Infinity
  for (const option of scene.options) {
    const score = scoreOption(option, scene.stats, weights)
    if (score > bestScore) {
      bestScore = score
      best = option
    }
  }
  return best?.id
}

function pickEpilogue() {
  const stats = game.stats(state)
  if (persona === 'ren') return 'decline'
  if (persona === 'ba') return stats.troops >= 45 ? 'war' : 'crown'
  if (persona === 'wen') return 'king'
  return 'retire'
}

function scheduleAuto() {
  clearAuto()
  if (!auto || mode !== 'play' || ending) return
  const delay = result ? 1200 : 950
  autoTimer = setTimeout(() => {
    autoTimer = null
    autoStep()
  }, delay)
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
    skipped = null
    saveRun()
    scrollTop()
    render()
    return
  }
  if (!scene) return
  if (scene.finished) {
    chooseEpilogue(pickEpilogue())
    return
  }
  if (scene.kind === 'moral') {
    const id = pickOption()
    if (id) {
      const previous = scene
      const out = game.choose(state, id)
      state = out.state
      scene = out.scene
      skipped = out.skipped
      result = { ...out.result, historical: previous.historical ?? '' }
      scrollTop()
      render()
    }
    return
  }
  if (scene.kind === 'ability') {
    const previous = scene
    const out = game.attempt(state)
    state = out.state
    scene = out.scene
    skipped = out.skipped
    result = { ...out.result, historical: previous.historical ?? '' }
    scrollTop()
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
/* 结局图鉴                                                            */
/* ------------------------------------------------------------------ */

function openGallery() {
  if (auto) {
    stopAuto()
    render()
  }
  const existing = document.querySelector('.overlay')
  if (existing) existing.remove()
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="结局图鉴">
      <div class="modal-head">
        <div>
          <p class="eyebrow">结局图鉴</p>
          <h2>${unlocked.size} / ${ENDINGS.length}</h2>
        </div>
        <button class="ghost close" data-close aria-label="关闭">×</button>
      </div>
      <div class="gallery">
        ${ENDINGS.map((item, index) => {
          const open = unlocked.has(item.id)
          if (!open) {
            return `<div class="gallery-card locked">
              <span class="gallery-index">${String(index + 1).padStart(2, '0')}</span>
              <div><p class="gallery-title">未解锁</p><p class="gallery-hint">${esc(item.hint)}</p></div>
            </div>`
          }
          return `<details class="gallery-card open">
            <summary>
              <span class="gallery-index">${String(index + 1).padStart(2, '0')}</span>
              <span class="gallery-title">${esc(item.title)}</span>
              <span class="gallery-sub">${esc(item.subtitle)}</span>
            </summary>
            <p class="gallery-text">${esc(item.text)}</p>
            ${item.comment && item.comment !== item.subtitle ? `<p class="gallery-comment">${esc(item.comment)}</p>` : ''}
          </details>`
        }).join('')}
      </div>
      <p class="modal-foot">结局一旦解锁会留在这台设备上（localStorage）。</p>
    </div>`
  document.body.appendChild(overlay)
  const close = () => {
    overlay.remove()
    document.body.style.overflow = previousOverflow
  }
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })
  overlay.querySelector('[data-close]').addEventListener('click', close)
  const onKey = (event) => {
    if (event.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onKey)
    }
  }
  document.addEventListener('keydown', onKey)
}

/* ------------------------------------------------------------------ */
/* 绑定与渲染                                                          */
/* ------------------------------------------------------------------ */

function bind() {
  app.querySelectorAll('[data-start]').forEach((node) => node.addEventListener('click', startRun))
  app.querySelectorAll('[data-resume]').forEach((node) => node.addEventListener('click', resumeRun))
  app.querySelectorAll('[data-gallery]').forEach((node) => node.addEventListener('click', openGallery))
  app.querySelectorAll('[data-restart]').forEach((node) => node.addEventListener('click', restart))
  app.querySelectorAll('[data-choice]').forEach((node) => {
    node.addEventListener('click', () => chooseOption(node.dataset.choice))
  })
  app.querySelectorAll('[data-roll]').forEach((node) => node.addEventListener('click', rollCheck))
  app.querySelectorAll('[data-continue]').forEach((node) => node.addEventListener('click', continueAfterResult))
  app.querySelectorAll('[data-epilogue]').forEach((node) => {
    node.addEventListener('click', () => chooseEpilogue(node.dataset.epilogue))
  })
  app.querySelectorAll('[data-auto]').forEach((node) => node.addEventListener('click', toggleAuto))
  app.querySelectorAll('[data-persona]').forEach((node) => {
    node.addEventListener('change', () => {
      persona = node.value
      if (auto) render()
    })
  })
}

function render() {
  if (mode === 'start') return renderStart()
  if (ending) return renderEnding()
  if (result) return renderResult()
  if (!scene || scene.finished) return renderEpilogue()
  return renderScene()
}

// 开场
render()
