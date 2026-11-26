/**
 * 离线 demo 的无头验收：
 *
 *   1. 引擎的 23 个场景能走到 `end`（不会卡在某个 scene）；
 *   2. 终章五个选择 × 史载/随机两种走法，能把 8 个结局全部打出来。
 *
 * 跑法：cd demo && npm run simulate
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { makeGame } from './game.js'
import { ENDINGS } from './endings.js'

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

function pickOption(view, policy, random) {
  if (policy === 'historical') {
    return (view.options.find((option) => option.historical) ?? view.options[0])?.id
  }
  if (policy === 'first') return view.options[0]?.id
  return view.options[Math.floor(random() * view.options.length)]?.id
}

function run(seed, policy, epilogue) {
  const random = seeded(`${seed}/${policy}/${epilogue}`)
  const started = game.newRun(seed)
  let state = started.state
  let steps = 0
  while (steps < MAX_STEPS) {
    const view = game.view(state)
    if (view.finished) break
    if (view.kind === 'moral') {
      const id = pickOption(view, policy, random)
      if (!id) throw new Error(`no option at ${view.sceneId}`)
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
  const finished = game.finish(state, epilogue)
  return {
    seed,
    policy,
    epilogue,
    ending: finished.ending.id,
    steps,
    hp: finished.state.player.resources.hp,
    fame: finished.state.player.counters.fame,
    trust: finished.state.player.counters.trust,
    drift: finished.state.drift
  }
}

const epilogues = ['crown', 'decline', 'king', 'war', 'retire']
const policies = ['historical', 'random']
const runs = []
for (const epilogue of epilogues) {
  for (const policy of policies) {
    for (let index = 0; index < 16; index += 1) {
      runs.push(run(`sim-${epilogue}-${policy}-${index}`, policy, epilogue))
    }
  }
}

const counts = new Map(ENDINGS.map((ending) => [ending.id, 0]))
for (const item of runs) {
  counts.set(item.ending, (counts.get(item.ending) ?? 0) + 1)
}

const lines = ENDINGS.map((ending) => `  ${ending.id.padEnd(9)} ${String(counts.get(ending.id)).padStart(3)}  ${ending.title}`)
console.log(`runs: ${runs.length}`)
console.log(lines.join('\n'))

const missing = ENDINGS.filter((ending) => (counts.get(ending.id) ?? 0) === 0)
if (missing.length > 0) {
  console.error(`unreachable endings: ${missing.map((ending) => ending.id).join(', ')}`)
  process.exit(1)
}

const sample = runs.find((item) => item.ending === 'zhaolie')
console.log(`sample 昭烈: seed=${sample.seed} hp=${sample.hp} fame=${sample.fame} trust=${sample.trust} drift=${sample.drift}`)
console.log('ok')
