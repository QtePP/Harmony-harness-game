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
let simulating = false
let simTimer = null

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
      <button data-simulate>${simulating ? '停止模拟' : '模拟体验'}</button>
      <button data-life>回到《如果》</button>
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
          <p class="back-kicker">B站 @穿梭人生Up · 抖音 @潦草人生</p>
          <h1 class="back-title">人生副本</h1>
          <p class="back-sub">小狮的一生、五十段别人的人生、<br>还有三国十二幕。选一段，走完它。</p>
          <button class="hub-sim" data-simulate-random>模拟体验 · 随机一段</button>
          <button class="hub-back" data-life>← 回到《如果》</button>
          <div class="hub-list">
            <button class="instance-item feature" data-life>
              <b>小狮 · 人生之书</b>
              <small>1985 · 东莞 · 七十种结局 · 最长的一条</small>
              <span aria-hidden="true">›</span>
            </button>
            <button class="instance-item feature" data-sanguo>
              <b>三国 · 东汉末年</b>
              <small>十二幕 · 从涿郡桑树到白帝托孤 · 另一个游戏</small>
              <span aria-hidden="true">›</span>
            </button>
            ${instancesData.instances.map((item) => `
              <button class="instance-item" data-instance="${esc(item.id)}">
                <b>${esc(item.title)}</b>
                <small>${esc(item.subtitle)}</small>
                <span aria-hidden="true">›</span>
              </button>`).join('')}
          </div>
          <p class="hub-foot">
            ${instancesData.instances.length + 2} 个可玩副本 · 剧情为本游戏原创
            <a href="${esc(instancesData.source.url)}" target="_blank" rel="noopener">来源：穿梭人生Up</a>
            <a href="${esc(instancesData.source.douyin_url ?? 'https://www.douyin.com/user/MS4wLjABAAAAha92Qs4h063W72nAJ08YGQScsi8uoj9DLy7hrwShOwjkQCbwWgfXXylwLywYhTEx')}" target="_blank" rel="noopener">潦草人生</a>
          </p>
        </div>
      </section>
      <p class="note">点开就是一段人生 · 离线</p>
    </main>`
  bind()
}

function startInstance(id, sim = false) {
  const found = instancesData.instances.find((item) => item.id === id)
  if (!found) return
  clearSim()
  simulating = sim
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

function nextCopies() {
  const list = instancesData.instances
  if (!instance) return list.slice(0, 2)
  const index = list.findIndex((item) => item.id === instance.id)
  return [list[(index + 1) % list.length], list[(index + 3) % list.length]].filter(Boolean)
}

function renderEnding() {
  mode = 'ending'
  simulating = false
  clearSim()
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
        <div class="ending-copies">
          <p class="copy-title">下一段人生</p>
          <div class="copy-buttons">
            ${nextCopies().map((item) => `<button class="copy-chip" data-instance="${esc(item.id)}">${esc(item.title)}<span>${esc(item.subtitle)}</span></button>`).join('')}
          </div>
        </div>
      </div>
      <div class="card-actions ending-actions">
        <button class="primary" data-hub>再走一个副本</button>
        <button class="secondary" data-restart>重开</button>
      </div>
    </div>`)
  bind()
}

function utility(state) {
  const s = state.stats
  return s.money + s.health + s.love + s.freedom + s.parents - s.regret * 0.8
}

function rollout(state) {
  let s = state
  for (let i = 0; i < 6 && s.finished !== true; i += 1) {
    const scene = sceneOf(s, instance)
    if (scene.finished) break
    let best = null
    for (const option of scene.options) {
      if (option.locked) continue
      const next = choose(s, instance, option.id).state
      const value = utility(next)
      if (best === null || value > best.value) best = { id: option.id, value }
    }
    if (best === null) break
    s = choose(s, instance, best.id).state
  }
  return utility(s)
}

function bestChoice() {
  const scene = sceneOf(state, instance)
  if (scene.finished) return null
  let best = null
  for (const option of scene.options) {
    if (option.locked) continue
    const next = choose(state, instance, option.id).state
    const value = rollout(next)
    if (best === null || value > best.value) best = { id: option.id, value }
  }
  return best === null ? null : best.id
}

function clearSim() {
  if (simTimer !== null) { clearTimeout(simTimer); simTimer = null }
}

function stopSim(resume = true) {
  simulating = false
  clearSim()
  if (resume && mode !== 'hub') render()
}

function scheduleSim() {
  clearSim()
  if (!simulating || mode !== 'play') return
  simTimer = setTimeout(() => {
    simTimer = null
    if (!simulating) return
    if (result) { result = null; render(); return }
    if (!scene || scene.finished) { simulating = false; render(); return }
    const id = bestChoice()
    if (id) chooseOption(id)
  }, 900)
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
  if (instance) startInstance(instance.id, simulating)
}

function render() {
  if (mode === 'hub') { renderHub(); return }
  if (result) renderResult()
  else {
    if (!ending && scene && scene.finished) finish()
    if (ending) renderEnding()
    else if (scene) renderScene()
    else renderHub()
  }
  if (simulating && mode === 'play' && !ending) scheduleSim()
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
  app.querySelectorAll('[data-life]').forEach((node) => node.addEventListener('click', () => window.__openLife?.()))
  app.querySelectorAll('[data-sanguo]').forEach((node) => node.addEventListener('click', () => window.__openSanguo?.()))
  app.querySelectorAll('[data-restart]').forEach((node) => node.addEventListener('click', restart))
  app.querySelectorAll('[data-simulate]').forEach((node) => node.addEventListener('click', () => {
    if (simulating) return stopSim(true)
    simulating = true
    if (result) result = null
    render()
  }))
  app.querySelectorAll('[data-simulate-random]').forEach((node) => {
    node.addEventListener('click', () => {
      const pick = instancesData.instances[Math.floor(Math.random() * instancesData.instances.length)]
      startInstance(pick.id, true)
    })
  })
}

function openInstance(id) {
  startInstance(id, false)
}

function simulateRandom() {
  const pick = instancesData.instances[Math.floor(Math.random() * instancesData.instances.length)]
  startInstance(pick.id, true)
}

export { renderHub, render, openInstance, simulateRandom }
