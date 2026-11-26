/**
 * 如果 · 本机决策器。
 *
 * 没有模型、没有网络：它做的是一次“往前推演到结局”的贪心搜索。
 * 对每个当前可走的选项，先走一步，然后按同一个倾向一路走到 2026，
 * 用那个结局的六个数值得分来反推这一步值不值。
 *
 * 这不是“最优解”，是“按你的倾向，最像你的那条路”。
 */

import { sceneOf, choose, endingFor } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-life/engine/life.js'

export const PERSONAS = {
  money: {
    label: '钱',
    focus: 'money',
    stats: { money: 1, health: 0.2, love: 0.15, freedom: 0.25, parents: 0.1, regret: -0.7 },
    desire: 1.2
  },
  freedom: {
    label: '自由',
    focus: 'freedom',
    stats: { money: 0.2, health: 0.45, love: 0.25, freedom: 1, parents: 0.1, regret: -0.6 },
    desire: 1.2
  },
  love: {
    label: '被爱',
    focus: 'love',
    stats: { money: 0.2, health: 0.35, love: 1, freedom: 0.25, parents: 0.35, regret: -0.6 },
    desire: 1.2
  },
  parents: {
    label: '被期待',
    focus: 'home',
    stats: { money: 0.2, health: 0.35, love: 0.45, freedom: 0.15, parents: 1, regret: -0.5 },
    desire: 1.2
  },
  self: {
    label: '自己',
    focus: 'self',
    stats: { money: 0.15, health: 0.5, love: 0.35, freedom: 0.5, parents: 0.2, regret: -1.2 },
    desire: 1.6
  },
  balanced: {
    label: '平衡',
    focus: 'self',
    stats: { money: 0.5, health: 0.5, love: 0.5, freedom: 0.5, parents: 0.5, regret: -0.6 },
    desire: 0.6
  }
}

const STATS = ['money', 'health', 'love', 'freedom', 'parents', 'regret']

export function scoreState(state, data, persona) {
  const profile = PERSONAS[persona] ?? PERSONAS.balanced
  let score = 0
  for (const key of STATS) score += (state.stats?.[key] ?? 0) * (profile.stats[key] ?? 0)
  score += (state.desires?.[profile.focus] ?? 0) * profile.desire
  if (state.finished === true) {
    const ending = endingFor(state, data)
    if (ending.theme === profile.focus) score += 8
    if (persona === 'balanced') score -= Math.abs((state.stats?.health ?? 0) - (state.stats?.money ?? 0)) * 0.05
  }
  return score
}

/** 从某个状态开始，按同一倾向一路贪心走到结局。 */
function rollout(start, data, persona) {
  let state = start
  for (let guard = 0; guard < 12 && state.finished !== true; guard += 1) {
    const scene = sceneOf(state, data)
    const options = scene.options.filter((option) => option.locked !== true)
    if (options.length === 0) break
    let best = null
    for (const option of options) {
      const next = choose(state, data, option.id).state
      const value = scoreState(next, data, persona)
      if (best === null || value > best.value) best = { id: option.id, value }
    }
    if (best === null) break
    state = choose(state, data, best.id).state
  }
  return state
}

/**
 * 决策：返回 { id, label, reason, ending, final }。
 * reason 是给玩家看的一句话，不是模型的解释。
 */
export function decide(state, data, persona) {
  const profile = PERSONAS[persona] ?? PERSONAS.balanced
  const scene = sceneOf(state, data)
  const options = scene.options.filter((option) => option.locked !== true)
  let best = null
  for (const option of options) {
    const next = choose(state, data, option.id).state
    const final = rollout(next, data, persona)
    const value = scoreState(final, data, persona)
    if (best === null || value > best.value) best = { option, value, final }
  }
  if (best === null) return null
  const ending = endingFor(best.final, data)
  const stats = best.final.stats
  return {
    id: best.option.id,
    label: best.option.label,
    persona: profile.label,
    value: best.value,
    ending,
    final: best.final,
    reason:
      `按「${profile.label}」推到 ${best.final.year} 年，最可能走到「${ending.title}」——` +
      `钱 ${stats.money} · 健康 ${stats.health} · 爱 ${stats.love} · 自由 ${stats.freedom} · 父母 ${stats.parents}。`
  }
}

/** 给页面用的倾向清单。 */
export function personaList() {
  return Object.entries(PERSONAS).map(([id, profile]) => ({ id, label: profile.label }))
}
