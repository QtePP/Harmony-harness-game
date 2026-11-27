/**
 * 统一入口：一个《如果》，两个模式。
 *
 *   #         → 小狮的一生（70 种结局）
 *   #copybook → 穿梭副本（50 段别人的人生）
 *
 * 两个模式共用同一套引擎/卡面；切换只换渲染函数，不刷新页面。
 */

import { renderStart, resumeLife } from './life-app.js'
import { renderHub, openInstance } from './instance-app.js'

const wantsCopybook = () => location.hash.replace('#', '') === 'copybook'

function openCopybook() {
  if (location.hash !== '#copybook') history.replaceState(null, '', '#copybook')
  renderHub()
}

function openLife() {
  if (location.hash !== '') history.replaceState(null, '', location.pathname + location.search)
  resumeLife()
}

window.__openCopybook = openCopybook
window.__openCopybookWith = (id) => {
  if (location.hash !== '#copybook') history.replaceState(null, '', '#copybook')
  openInstance(id)
}
window.__openLife = openLife

window.addEventListener('hashchange', () => {
  if (wantsCopybook()) renderHub()
  else renderStart()
})

if (wantsCopybook()) renderHub()
else renderStart()
