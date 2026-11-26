/**
 * 三国人生 · 卡片版（4:6 单卡）。
 *
 * 和页面版共用 game.js / endings.js / policy.js；差别只在这一个文件：
 * 它把当前场景、数值和选项装进一张 4 列 × 6 行的竖版卡，卡片之外只留
 * 「本机推演 / 倾向 / 图鉴 / 重开」。
 */

import actsDocument from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/data/acts.json'
import { makeGame } from './game.js'
import { ENDINGS, ENDING_BY_ID, endingFor } from './endings.js'
import { PERSONAS, bestOption } from './policy.js'

const game = makeGame(actsDocument)
const app = document.getElementById('app')

const SAVE_KEY = 'sanguo-demo-run-v1'
const GALLERY_KEY = 'sanguo-demo-endings-v1'

const ATTR_LABEL = { wu: '武', tong: '统', zhi: '智', zheng: '政', mei: '魅' }
const EFFECT_LABEL = {
  fame: '名望', trust: '信义', talent: '人才', gold: '金', grain: '粮', troops: '兵', hp: '体力'
}
const OUTCOME_LABEL = {
  critical_success: '大成功', success: '成功', partial: '未成', failure: '失败', critical_failure: '大失败'
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

function loadUnlocked() {
  try {
    const raw = JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id) => ENDING_BY_ID[id] !== undefined) : [])
  } catch {
    return new Set()
  }
}

function saveUnlocked() {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify([...unlocked])) } catch { /* ignore */ }
}

function loadRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (raw && raw.player && raw.clock && typeof raw.act === 'string') return raw
  } catch { /* ignore */ }
  return null
}

function saveRun() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function clearRun() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
}

function yearsOf(turns) {
  const years = Math.round((Number(turns) || 0) / 4)
  return years <= 1 ? '一年' : `${years}年`
}

function top() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

/* ------------------------------------------------------------------ */
/* 卡面零件                                                            */
/* ------------------------------------------------------------------ */

function seal() {
  return '<div class="card-seal" aria-hidden="true">漢</div>'
}

function statChips(stats) {
  const drift = stats.drift >= 60 ? 'danger' : stats.drift >= 30 ? 'warn' : ''
  const hp = stats.hp <= 30 ? 'danger' : stats.hp <= 60 ? 'warn' : ''
  return `
    <div class="card-stats" aria-label="当前数值">
      <span class="chip"><b>名望</b>${stats.fame}</span>
      <span class="chip"><b>信义</b>${stats.trust}</span>
      <span class="chip"><b>人才</b>${stats.talent}</span>
      <span class="chip ${drift}"><b>势</b>${stats.drift}</span>
      <span class="chip"><b>兵</b>${stats.troops}</span>
      <span class="chip"><b>金</b>${stats.gold}</span>
      <span class="chip"><b>粮</b>${stats.grain}</span>
      <span class="chip ${hp}"><b>体力</b>${stats.hp}</span>
    </div>`
}

function deltaChips(effects, attributeGain) {
  const out = []
  for (const [key, raw] of Object.entries(effects ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value === 0) continue
    out.push(`<span class="delta ${value > 0 ? 'up' : 'down'}">${EFFECT_LABEL[key] ?? key} ${value > 0 ? '+' : ''}${value}</span>`)
  }
  for (const [key, raw] of Object.entries(attributeGain ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value === 0) continue
    out.push(`<span class="delta up">${ATTR_LABEL[key] ?? key} ${value > 0 ? '+' : ''}${value}</span>`)
  }
  return out.length > 0 ? `<div class="deltas">${out.join('')}</div>` : ''
}

function metaScene(scene) {
  const era = scene.era ? ` · ${scene.era}` : ''
  return `<div class="card-meta"><span>${esc(scene.when)}${esc(era)}</span><span>${scene.age}岁</span><span>${esc(scene.place ?? '')}</span></div>`
}

function toolsBar() {
  if (mode === 'start' || ending) return ''
  return `
    <div class="tools">
      <button data-auto>${auto ? '停止推演' : '本机推演'}</button>
      <label class="persona">倾向
        <select data-persona>
          ${Object.entries(PERSONAS).map(([key, item]) => `<option value="${key}" ${key === persona ? 'selected' : ''}>${item.name}</option>`).join('')}
        </select>
      </label>
      <button data-gallery>图鉴 ${unlocked.size}/${ENDINGS.length}</button>
      <button data-restart>重开</button>
    </div>`
}

function shell(inner, extra = '') {
  return `
    <main class="table">
      <section class="card ${extra}">
        ${inner}
      </section>
      ${toolsBar()}
      <p class="note">4:6 单卡 · 38 个场景 · 8 个结局 · 离线</p>
    </main>`
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
      <div class="back-seal" aria-hidden="true">漢</div>
      <p class="back-kicker">汉末 · 161—223</p>
      <h1 class="back-title">三国人生</h1>
      <p class="back-sub">一张卡，一生。<br>38 个场景 · 8 个结局</p>
      <div class="back-actions">
        <button class="gold" data-start>${saved ? '开始新的一生' : '开始这一生'}</button>
        ${saved ? '<button class="ghost-light" data-resume>继续上局</button>' : ''}
        <button class="link-light" data-gallery>结局图鉴 ${unlocked.size}/${ENDINGS.length}</button>
      </div>
      <p class="back-foot">离线 · 无网络请求</p>
    </div>`, 'back')
  bind()
}

/* ------------------------------------------------------------------ */
/* 场景                                                                */
/* ------------------------------------------------------------------ */

function renderScene() {
  if (!scene || scene.finished) { finishRun(); return renderEnding() }
  mode = 'play'
  const skip = skipped ? `<p class="timeskip">时光流转：${yearsOf(skipped.turns)}过去。</p>` : ''
  const actions = scene.kind === 'moral'
    ? scene.options.map((option) => `
        <button class="choice" data-choice="${esc(option.id)}">
          <span>${esc(option.label)}</span><span class="arrow" aria-hidden="true">›</span>
        </button>`).join('')
    : `<p class="check-line">判定 · ${ATTR_LABEL[scene.ability.attribute] ?? scene.ability.attribute}
         ${scene.stats.attrs[scene.ability.attribute] ?? ''} <span class="muted">对</span> 难度 ${scene.ability.difficulty}</p>
       <p class="check-hint">骰子由引擎掷。成或不成，都不由你说了算。</p>
       <button class="primary" data-roll>掷骰</button>`

  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">${esc(scene.act)} <span class="progress">${scene.index + 1}/${scene.total}</span></p>
        <h1>${esc(scene.title)}</h1>
      </header>
      ${seal()}
      ${metaScene(scene)}
      ${statChips(scene.stats)}
      <div class="card-story">
        ${skip}
        <p class="narration">${esc(scene.narration)}</p>
      </div>
      <div class="card-actions">${actions}</div>
    </div>`)
  bind()
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

function renderResult() {
  mode = 'play'
  if (!result) return renderScene()
  const isCheck = result.kind === 'check'
  const title = isCheck ? (OUTCOME_LABEL[result.outcome] ?? result.outcome) : result.label
  const meta = isCheck
    ? `${ATTR_LABEL[result.attribute] ?? result.attribute} ${result.attributeValue} + 骰 ${result.roll}` +
      `${result.modifierTotal ? ` ${result.modifierTotal > 0 ? '+' : ''}${result.modifierTotal}` : ''}` +
      ` = ${result.total} · 难度 ${result.difficulty}`
    : result.departure ? `偏离史载 · 势 → ${result.drift}` : '史载'

  const text = isCheck
    ? (result.text || (result.outcome === 'success' || result.outcome === 'critical_success' ? '事成了。' : '事没成。'))
    : result.note

  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">${isCheck ? '判定' : '已选'} · ${esc(result.title)}</p>
        <h1>${esc(title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta">${esc(meta)}</div>
      ${statChips(game.stats(state))}
      <div class="card-story">
        ${text ? `<p class="narration">${esc(text)}</p>` : ''}
        ${deltaChips(result.effects, result.attributeGain)}
        ${result.historical ? `<details class="history"><summary>史载</summary><p>${esc(result.historical)}</p></details>` : ''}
        ${skipped ? `<p class="timeskip">时光流转：${yearsOf(skipped.turns)}过去。</p>` : ''}
      </div>
      <div class="card-actions"><button class="primary" data-continue>继续</button></div>
    </div>`)
  bind()
}

/* ------------------------------------------------------------------ */
/* 终章                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 结局                                                                */
/* ------------------------------------------------------------------ */

function renderEnding() {
  mode = 'ending'
  auto = false
  clearAuto()
  const stats = game.stats(state)
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">${newEnding ? '新结局' : '结局'} · ${unlocked.size}/${ENDINGS.length}</p>
        <h1>${esc(ending.title)}</h1>
      </header>
      ${seal()}
      <div class="card-meta">${esc(ending.subtitle)}</div>
      ${statChips(stats)}
      <div class="card-story">
        <p class="narration ending-text">${esc(ending.text)}</p>
        ${ending.comment && ending.comment !== ending.subtitle ? `<p class="ending-comment">${esc(ending.comment)}</p>` : ''}
        <p class="ending-run">选择 ${state.counters?.choicesMade ?? 0} · 偏离 ${state.counters?.deviations ?? 0}</p>
        ${unlocked.size === ENDINGS.length ? '<p class="all-done">全结局达成。</p>' : ''}
      </div>
      <div class="card-actions ending-actions">
        <button class="primary" data-start>再活一次</button>
        <button class="secondary" data-gallery>结局图鉴</button>
      </div>
    </div>`, 'ending-card')
  bind()
}

/* ------------------------------------------------------------------ */
/* 行为                                                                */
/* ------------------------------------------------------------------ */

function startRun() {
  stopAuto()
  const run = game.newRun(`card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  state = run.state
  scene = game.view(state)
  skipped = run.skipped
  result = null
  ending = null
  newEnding = false
  mode = 'play'
  clearRun()
  top()
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
  top()
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
  render()
}

function continueAfterResult() {
  if (!result) return
  stopAuto()
  result = null
  skipped = null
  saveRun()
  render()
}

function finishRun() {
  if (ending || !state) return
  ending = endingFor(state)
  newEnding = !unlocked.has(ending.id)
  if (newEnding) {
    unlocked.add(ending.id)
    saveUnlocked()
  }
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

function scheduleAuto() {
  clearAuto()
  if (!auto || mode !== 'play' || ending) return
  autoTimer = setTimeout(() => {
    autoTimer = null
    autoStep()
  }, result ? 1150 : 900)
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
    render()
    return
  }
  if (!scene) return
  if (scene.finished) {
    render()
    return
  }
  if (scene.kind === 'moral') {
    const id = bestOption(scene.options, scene.stats, persona)
    if (id) {
      const previous = scene
      const out = game.choose(state, id)
      state = out.state
      scene = out.scene
      skipped = out.skipped
      result = { ...out.result, historical: previous.historical ?? '' }
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
/* 图鉴                                                                */
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
        <div><p class="eyebrow">结局图鉴</p><h2>${unlocked.size} / ${ENDINGS.length}</h2></div>
        <button class="close" data-close aria-label="关闭">×</button>
      </div>
      <div class="gallery">
        ${ENDINGS.map((item, index) => {
          if (!unlocked.has(item.id)) {
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
      <p class="modal-foot">结局解锁会留在这台设备上（localStorage），与页面版共用。</p>
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
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onKey)
    }
  })
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
    if (!ending && state && state.act === 'end') finishRun()
    if (ending) renderEnding()
    else if (result) renderResult()
    else if (!scene || scene.finished) {
      finishRun()
      renderEnding()
    } else {
      renderScene()
    }
  }
  if (auto && mode === 'play' && !ending) scheduleAuto()
}
render()
