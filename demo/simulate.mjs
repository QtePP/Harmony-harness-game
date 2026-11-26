/**
 * 离线 demo 的无头验收：
 *
 *   1. 引擎的 38 个场景（十二幕）能走到 `end`，不会卡在某个 scene；
 *   2. 第八至十二幕的关键选择能把 8 个结局全部打出来。
 *
 * 跑法：cd demo && npm run simulate
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { makeGame } from './game.js'
import { ENDINGS, endingFor } from './endings.js'

const actsPath = fileURLToPath(new URL(
  '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/data/acts.json',
  import.meta.url
))
const document = JSON.parse(fs.readFileSync(actsPath, 'utf8'))
const game = makeGame(document)

const MAX_STEPS = 80

/** Deterministic PRNG so the reachability counts do not flicker between runs. */
function seeded(text) {
  let state = 2166136261 >>> 0
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index)
    state = Math.imul(state, 16777619) >>> 0
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function pickOption(view, policy, random, plan) {
  if (view.sceneId === 'emperor') return plan.emperor
  if (view.sceneId === 'yiling') return plan.yiling
  if (view.sceneId === 'baidi') return plan.baidi
  if (view.sceneId === 'the_choice' && plan.changban) return plan.changban
  if (policy === 'historical') {
    return (view.options.find((option) => option.historical) ?? view.options[0])?.id
  }
  if (policy === 'first') return view.options[0]?.id
  return view.options[Math.floor(random() * view.options.length)]?.id
}

function run(plan, seed) {
  const random = seeded(`${seed}/${plan.policy}`)
  const started = game.newRun(seed)
  let state = started.state
  let steps = 0

  while (steps < MAX_STEPS) {
    const view = game.view(state)
    if (view.finished) break
    if (view.kind === 'moral') {
      const id = pickOption(view, plan.policy, random, plan)
      if (!id) throw new Error(`no option at ${view.sceneId}`)
      if (!view.options.some((option) => option.id === id)) {
        throw new Error(`option ${id} missing at ${view.sceneId}`)
      }
      state = game.choose(state, id).state
    } else if (view.kind === 'ability') {
      state = game.attempt(state).state
    } else {
      throw new Error(`unknown scene kind: ${view.kind}`)
    }
    steps += 1
  }

  if (state.act !== 'end') {
    throw new Error(`run did not finish: act=${state.act} scene=${state.scene} steps=${steps}`)
  }

  return {
    plan: plan.id,
    seed,
    ending: endingFor(state).id,
    steps,
    hp: state.player.resources.hp,
    fame: state.player.counters.fame,
    trust: state.player.counters.trust,
    drift: state.drift,
    flags: state.flags
  }
}

/**
 * 每个计划固定关键的三个选择（称帝 / 伐吴 / 托孤），其余走史载或随机。
 * 计谋不在多，在于每个结局都有一条确定性路径。
 */
const PLANS = [
  {
    id: 'zhaolie', policy: 'historical', seed: 'plan-zhaolie',
    emperor: 'crown', yiling: 'peace', baidi: 'trust_zhuge'
  },
  {
    id: 'dufu', policy: 'random', seed: 'sim-dufu-pianan',
    emperor: 'crown', yiling: 'peace', baidi: 'trust_zhuge'
  },
  {
    id: 'renzhe', policy: 'historical', seed: 'plan-renzhe',
    emperor: 'decline', yiling: 'peace', baidi: 'trust_zhuge'
  },
  {
    id: 'pianan', policy: 'random', seed: 'sim-dufu-pianan',
    emperor: 'decline', yiling: 'peace', baidi: 'trust_zhuge'
  },
  {
    id: 'hanzhong', policy: 'historical', seed: 'plan-hanzhong',
    emperor: 'king', yiling: 'peace', baidi: 'trust_zhuge'
  },
  {
    id: 'zhixi', policy: 'historical', seed: 'plan-zhixi',
    emperor: 'crown', yiling: 'peace', baidi: 'retire'
  },
  {
    id: 'zaoshi', policy: 'historical', seed: 'plan-zaoshi',
    emperor: 'crown', yiling: 'war', baidi: 'trust_zhuge'
  },
  {
    id: 'jiedi', policy: 'historical', seed: 'plan-jiedi',
    emperor: 'crown', yiling: 'war', baidi: 'trust_zhuge', changban: 'abandon'
  }
]

const runs = PLANS.map((plan) => run(plan, plan.seed))
const counts = new Map(ENDINGS.map((ending) => [ending.id, 0]))
for (const item of runs) counts.set(item.ending, (counts.get(item.ending) ?? 0) + 1)

console.log(`runs: ${runs.length}, steps each: ${runs[0].steps}`)
console.log(ENDINGS.map((ending) => `  ${ending.id.padEnd(9)} ${String(counts.get(ending.id)).padStart(3)}  ${ending.title}`).join('\n'))

const missing = ENDINGS.filter((ending) => (counts.get(ending.id) ?? 0) === 0)
if (missing.length > 0) {
  console.error(`unreachable endings: ${missing.map((ending) => ending.id).join(', ')}`)
  for (const item of runs) console.error(item)
  process.exit(1)
}

for (const item of runs) {
  console.log(`  ${item.plan.padEnd(9)} -> ${item.ending.padEnd(9)} hp=${item.hp} fame=${item.fame} trust=${item.trust} flags=${JSON.stringify(item.flags)}`)
}
console.log('ok')
