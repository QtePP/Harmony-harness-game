/**
 * 穿梭人生 · 副本模式。
 *
 * 和《如果》共用同一个纯 JS 引擎（@ohos/dsh-life/engine），
 * 只是把 data 换成 instances.json 里的一段人生：
 * 每个副本 3 页 × 3 个选择 × 3–4 个结局，读同一套六个数值和 flags。
 *
 * 副本标题来自 B站 @穿梭人生Up 的 47 个视频；剧情为本游戏原创。
 * 抖音 @潦草人生 的“潦草结局”已经写进《如果》的结局池，这里暂不重复。
 */

import instancesData from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/data/instances.json'
import {
  createSave,
  sceneOf,
  choose
} from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/engine/life.js'

const app = document.getElementById('app')

const STATS = [
  ['money', '钱'],
  ['health', '健康'],
  ['love', '爱'],
  ['freedom', '自由'],
  ['parents', '父母'],
  ['regret', '遗憾']
]

let instance = null
let state = null
let scene = null
let result = null
let ending = null
let mode = 'hub'

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function top() {
  window.scrollTo({ top: 0, behavior: 'auto' })
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

function shell(inner, extra = '') {
  return `
    <main class="table">
      <section class="card ${extra}">${inner}</section>
      ${tools()}
      <p class="note">穿梭人生 · ${instancesData.instances.length} 个副本 · 离线</p>
    </main>`
}

function tools() {
  if (mode === 'hub') return ''
  return `
    <div class="tools">
      <button data-hub>副本库</button>
      <button data-restart>重开这个副本</button>
    </div>`
}

function renderHub() {
  mode = 'hub'
  app.innerHTML = `
    <main class="table">
      <section class="card back hub-card">
        <div class="hub-inner">
          <div class="back-seal" aria-hidden="true">穿</div>
          <p class="back-kicker">B站 @穿梭人生Up · 47 个视频</p>
          <h1 class="back-title">副本</h1>
          <p class="back-sub">选一段别人的人生，<br>替他把这一步走完。</p>
          <div class="hub-list">
            ${instancesData.instances.map((item) => `
              <button class="instance-item" data-instance="${esc(item.id)}">
                <b>${esc(item.title)}</b>
                <small>${esc(item.subtitle)}</small>
                <span aria-hidden="true">›</span>
              </button>`).join('')}
          </div>
          <p class="hub-foot">
            10 个可玩副本 · 剧情为本游戏原创
            <a href="${esc(instancesData.source.url)}" target="_blank" rel="noopener">来源：穿梭人生Up</a>
          </p>
        </div>
      </section>
      <p class="note">每段 3 页 · 3 个选择 · 3–4 种结局 · 离线</p>
    </main>`
  bind()
}

function startInstance(id) {
  const found = instancesData.instances.find((item) => item.id === id)
  if (!found) return
  instance = found
  state = createSave(`instance-${id}-${Date.now().toString(36)}`)
  state.stats = { ...instance.start.stats }
  state.year = instance.start.year
  state.age = instance.start.age
  state.tags = { ...instance.start.tags }
  state.premise = ''
  scene = sceneOf(state, instance)
  result = null
  ending = null
  mode = 'play'
  top()
  render()
}

function renderScene() {
  if (!scene || scene.finished) { finish(); return }
  mode = 'play'
  const options = scene.options.filter((option) => !option.locked).map((option) => `
    <button class="choice" data-choice="${esc(option.id)}">
      <span class="choice-text"><span class="desire">${esc(option.desireLabel)}</span>${esc(option.label)}</span>
      <span class="arrow" aria-hidden="true">›</span>
    </button>`).join('')

  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">副本 · 第${scene.chapter + 1}/${scene.total}页</p>
        <h1>${esc(scene.title)}</h1>
      </header>
      <div class="card-seal" aria-hidden="true">副</div>
      <div class="card-meta"><span>${scene.year}年</span><span>${scene.age}岁</span><span>${esc(state.tags.city)}</span></div>
      ${statsBar(scene.stats)}
      <div class="card-story">
        ${scene.chapter === 0 ? `<p class="instance-premise">${esc(instance.premise)}</p>` : ''}
        <p class="narration">${esc(scene.narration)}</p>
      </div>
      <div class="card-actions ${scene.options.length > 4 ? 'many' : ''}">${options}</div>
    </div>`)
  bind()
}

function renderResult() {
  mode = 'play'
  if (!result) return renderScene()
  const option = result.option
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">副本 · 第${result.chapter + 1}/${instance.chapters.length}页</p>
        <h1>${esc(option.label)}</h1>
      </header>
      <div class="card-seal" aria-hidden="true">副</div>
      <div class="card-meta">
        <span>欲望：${esc(option.desireLabel)}</span>
        ${result.mult > 1 ? `<span class="compound">复利 ×${result.mult.toFixed(2)}</span>` : ''}
      </div>
      ${statsBar(state.stats)}
      <div class="card-story">
        <p class="narration">${esc(option.note)}</p>
        <div class="deltas">${Object.entries(result.effects ?? {}).filter(([, value]) => value !== 0).map(([key, value]) => {
          const label = STATS.find(([id]) => id === key)?.[1] ?? key
          return `<span class="delta ${value > 0 ? 'up' : 'down'}">${label} ${value > 0 ? '+' : ''}${value}</span>`
        }).join('')}</div>
      </div>
      <div class="card-actions"><button class="primary" data-continue>继续</button></div>
    </div>`)
  bind()
}

function renderEnding() {
  mode = 'ending'
  if (!ending) return
  app.innerHTML = shell(`
    <div class="card-grid">
      <header class="card-head">
        <p class="act">副本结局 · ${esc(instance.title)}</p>
        <h1>${esc(ending.title)}</h1>
      </header>
      <div class="card-seal" aria-hidden="true">副</div>
      <div class="card-meta"><span>${esc(ending.subtitle)}</span></div>
      ${statsBar(state.stats)}
      <div class="card-story">
        <p class="narration ending-text">${esc(ending.text)}</p>
        <p class="ending-comment">${esc(ending.comment)}</p>
      </div>
      <div class="card-actions ending-actions">
        <button class="primary" data-hub>再走一个副本</button>
        <button class="secondary" data-restart>重开</button>
      </div>
    </div>`)
  bind()
}

function chooseOption(id) {
  if (!scene || scene.finished) return
  const out = choose(state, instance, id)
  state = out.state
  result = {
    option: out.option,
    effects: out.effects,
    mult: out.mult,
    chapter: scene.chapter
  }
  scene = out.next
  top()
  render()
}

function finish() {
  if (ending) return
  if (!scene || !scene.finished) return
  ending = scene.ending
}

function restart() {
  if (instance) startInstance(instance.id)
}

function render() {
  if (mode === 'hub') return renderHub()
  if (result) return renderResult()
  if (!ending && scene && scene.finished) finish()
  if (ending) return renderEnding()
  if (scene) return renderScene()
  renderHub()
}

function bind() {
  app.querySelectorAll('[data-instance]').forEach((node) => {
    node.addEventListener('click', () => startInstance(node.dataset.instance))
  })
  app.querySelectorAll('[data-choice]').forEach((node) => {
    node.addEventListener('click', () => chooseOption(node.dataset.choice))
  })
  app.querySelectorAll('[data-continue]').forEach((node) => {
    node.addEventListener('click', () => {
      result = null
      render()
    })
  })
  app.querySelectorAll('[data-hub]').forEach((node) => node.addEventListener('click', renderHub))
  app.querySelectorAll('[data-restart]').forEach((node) => node.addEventListener('click', restart))
}

renderHub()
