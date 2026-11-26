/**
 * 「本机推演」的透明权重。
 *
 * 不是模型：每个选项的 effects 乘上一组倾向权重，再取最高分；同分时加一点
 * 随机，避免每一局都走同一条线。四个倾向分别偏向信义 / 兵力 / 稳健 / 退隐。
 */

export const PERSONAS = {
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

export function scoreOption(option, stats, weights) {
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

/** 返回当前场景里最符合该倾向的选项 id。 */
export function bestOption(options, stats, personaKey) {
  const weights = PERSONAS[personaKey] ?? PERSONAS.ren
  let best = null
  let bestScore = -Infinity
  for (const option of options ?? []) {
    const score = scoreOption(option, stats, weights)
    if (score > bestScore) {
      bestScore = score
      best = option
    }
  }
  return best?.id ?? null
}
