#!/usr/bin/env node
/**
 * Precompute the current scene's option outcomes on shadow saves.
 *
 * This is the engine half of "pre-reason while the player is thinking":
 * `sanguo_choose` / `sanguo_act` are deterministic and cheap, so the app can
 * run every visible option against a copy of `.sanguo` before the player taps,
 * cache the resulting state + text, and commit the matching copy on click.
 *
 * It does NOT call the model. The model's prose is the remaining cost; cache
 * that separately if you want a <1s click (see docs/SPECULATIVE-TURNS.md).
 *
 * Usage:
 *   node scripts/preview-options.mjs <workspace> [--json]
 *
 * `<workspace>` must contain `.sanguo/save.json` (the app's project workspace
 * or a copy of it). Nothing in it is written.
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

import { load } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/state.js'
import {
  indexActs, currentScene, catchUpToScene, attemptScene, advanceWorld,
  nextCursor, chooseBranch
} from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/acts.js'

const PLUGIN = resolve(
  import.meta.dirname,
  '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo'
)
const args = process.argv.slice(2)
const json = args.includes('--json')
const workspace = resolve(args.find((arg) => !arg.startsWith('--')) ?? process.cwd())

const acts = indexActs(JSON.parse(await readFile(join(PLUGIN, 'data', 'acts.json'), 'utf8')))
let state = await load(workspace)
if (state === null) {
  console.error(`no .sanguo/save.json under ${workspace}`)
  process.exit(2)
}
const caught = catchUpToScene(state, acts)
if (caught !== null) {
  state = caught.state
}
const { act, scene } = currentScene(state, acts)
if (scene === null || act === undefined) {
  console.error('the save is not sitting on a scene')
  process.exit(2)
}

/** Average one option over `runs` clones, then keep one concrete result. */
function bench(run, runs = 100) {
  const started = performance.now()
  for (let index = 0; index < runs; index += 1) {
    run(structuredClone(state))
  }
  return (performance.now() - started) / runs
}

const options = []

if (scene.kind === 'ability') {
  const hint = { attribute: scene.attribute, difficulty: scene.difficulty }
  const ms = bench((copy) => attemptScene(copy, act, scene, hint))
  const result = attemptScene(structuredClone(state), act, scene, hint)
  const next = nextCursor(result.state, acts)
  const upcomingInfo = currentScene(next, acts)
  const upcoming = upcomingInfo.scene
  options.push({
    id: 'act',
    label: `去做（${scene.attribute} ${scene.difficulty}）`,
    kind: 'ability',
    ms: Number(ms.toFixed(3)),
    outcome: result.result.outcome,
    roll: result.result.roll,
    margin: result.result.margin,
    text: result.text,
    nextScene: upcoming === null ? null : { act: upcomingInfo.act?.name ?? '', title: upcoming.title, narration: upcoming.narration }
  })
}

if (scene.kind === 'moral') {
  for (const branch of scene.options ?? []) {
    const ms = bench((copy) => chooseBranch(copy, act, scene, branch.id))
    const result = chooseBranch(structuredClone(state), act, scene, branch.id)
    const next = nextCursor(result.state, acts)
    const upcomingInfo = currentScene(next, acts)
    const upcoming = upcomingInfo.scene
    options.push({
      id: branch.id,
      label: branch.label,
      kind: 'choice',
      ms: Number(ms.toFixed(3)),
      drift: result.priced.drift,
      departure: result.priced.departure,
      effects: result.effects,
      nextScene: upcoming === null ? null : { act: upcomingInfo.act?.name ?? '', title: upcoming.title, narration: upcoming.narration }
    })
  }
}

// "等一等" is an advance, not a scene resolution; it is always available.
{
  const ms = bench((copy) => advanceWorld(copy, 1))
  const result = advanceWorld(structuredClone(state), 1)
  options.push({
    id: 'wait',
    label: '等一等',
    kind: 'advance',
    ms: Number(ms.toFixed(3)),
    clock: result.state.clock,
    age: result.state.age,
    events: result.events.map((event) => event.text)
  })
}

const payload = {
  workspace,
  at: {
    year: state.clock?.year,
    season: state.clock?.season,
    age: state.age,
    act: act.name,
    scene: scene.title,
    kind: scene.kind
  },
  options
}

if (json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
} else {
  console.log(`${payload.at.year}年·${payload.at.season} · ${payload.at.age}岁 · ${payload.at.act} · ${payload.at.scene} [${payload.at.kind}]`)
  for (const option of options) {
    const head = `${option.label.padEnd(14)} ${option.ms.toFixed(3)}ms`
    if (option.kind === 'ability') {
      console.log(`${head}  ${option.outcome}  骰 ${option.roll}（margin ${option.margin}）`)
      console.log(`  ${option.text}`)
      if (option.nextScene !== null) {
        console.log(`  下一幕：${option.nextScene.act}·${option.nextScene.title}`)
      }
    } else if (option.kind === 'choice') {
      console.log(`${head}  drift ${option.drift}${option.departure ? '（偏离史载）' : ''}`)
      if (option.nextScene !== null) {
        console.log(`  下一幕：${option.nextScene.act}·${option.nextScene.title}`)
      }
    } else {
      console.log(`${head}  → ${option.clock.year}年 ${option.clock.season}，${option.age}岁`)
      for (const event of option.events) {
        console.log(`  ${event}`)
      }
    }
  }
}
