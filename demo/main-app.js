/**
 * 统一入口：一个《如果》，两个模式。
 *
 *   #         → 小狮的一生（70 种结局）
 *   #copybook → 穿梭副本（50 段别人的人生）
 *
 * 两个模式共用同一套引擎/卡面；切换只换渲染函数，不刷新页面。
 */

import { renderStart, resumeLife } from './life-app.js'
import { mountSanguo } from './card.js'
import cardTemplate from './card.template.html'
import { renderHub, openInstance, simulateRandom } from './instance-app.js'

const sanguoStyles = (() => {
  const matched = cardTemplate.match(/<style>([\s\S]*?)<\/style>/i)
  const css = matched ? matched[1] : ''
  return css
    .replace(/:root\s*\{/g, ':host {')
    .replace(/html,\s*body\s*\{/g, ':host {')
    .replace(/\n\s*body\s*\{/g, '\n  :host {')
})()

let sanguoHost = null

function closeSanguo() {
  if (sanguoHost !== null) {
    sanguoHost.remove()
    sanguoHost = null
  }
  const life = document.getElementById('app')
  if (life) life.style.display = ''
}

function openSanguo() {
  if (location.hash !== '#sanguo') history.replaceState(null, '', '#sanguo')
  closeSanguo()
  const life = document.getElementById('app')
  if (life) life.style.display = 'none'
  const host = document.createElement('div')
  host.id = 'sanguo-host'
  host.style.cssText = 'display:block;min-height:100vh;background:#17130f'
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = sanguoStyles
  shadow.appendChild(style)
  const root = document.createElement('div')
  root.id = 'app'
  shadow.appendChild(root)
  sanguoHost = host
  mountSanguo(root)
}

const wantsCopybook = () => location.hash.replace('#', '') === 'copybook'
const wantsLife = () => location.hash.replace('#', '') === 'life'
const wantsSanguo = () => location.hash.replace('#', '') === 'sanguo'

function openCopybook() {
  closeSanguo()
  if (location.hash !== '#copybook') history.replaceState(null, '', '#copybook')
  renderHub()
}

function openLife() {
  closeSanguo()
  if (location.hash !== '#life') history.replaceState(null, '', '#life')
  resumeLife()
}

window.__openCopybook = openCopybook
window.__openSanguo = openSanguo
window.__simulateRandom = simulateRandom
window.__openCopybookWith = (id) => {
  if (location.hash !== '#copybook') history.replaceState(null, '', '#copybook')
  openInstance(id)
}
window.__openLife = openLife

window.addEventListener('hashchange', () => {
  if (wantsSanguo()) openSanguo()
  else if (wantsLife()) { closeSanguo(); resumeLife() }
  else { closeSanguo(); renderHub() }
})

if (wantsSanguo()) openSanguo()
else if (wantsLife()) resumeLife()
else renderHub()
