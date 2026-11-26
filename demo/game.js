/**
 * demo 的游戏控制器：把 @ohos/dsh-sanguo 的纯 JS 引擎包一层，给浏览器用。
 *
 * 这里刻意不 import `engine/state.js`——它依赖 node:fs，浏览器里没有。开局状态
 * 从同一组常量复制一份（字段与 state.js 的 createSave 一致），存档只活在内存 /
 * localStorage 里。
 */

import {
  indexActs,
  currentScene,
  catchUpToScene,
  chooseBranch,
  attemptScene,
  nextCursor,
  seedFactions
} from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/acts.js'
import { seedFrom } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/rng.js'
import { formatDate, eraOf } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/clock.js'
import { describe as describeDrift } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/destiny.js'
import { playerPower } from '../host/profile-ohos/profiles/ohos/node_modules/@ohos/dsh-sanguo/engine/world.js'


const BIRTH_ATTRS = { wu: 42, tong: 40, zhi: 48, zheng: 45, mei: 78 }
const BIRTH_COUNTERS = { fame: 5, trust: 20, talent: 0 }
const BIRTH_RESOURCES = { gold: 3, grain: 1, troops: 0, hp: 100 }

/** 与 engine/state.js 的 createSave 同形，但不需要 fs。 */
export function createInitialState(name) {
  const seedName = typeof name === 'string' && name.length > 0 ? name : 'liubei'
  const seed = seedFrom(seedName)
  return {
    schema: 1,
    seed,
    rng: seed,
    clock: { year: 161, month: 1, day: 1, turn: 0 },
    age: 0,
    act: 'zhuojun',
    actName: '第一幕·涿郡',
    scene: 0,
    player: {
      name: '刘备',
      courtesy: '玄德',
      attrs: { ...BIRTH_ATTRS },
      counters: { ...BIRTH_COUNTERS },
      resources: { ...BIRTH_RESOURCES },
      tags: ['寒门', '织席贩履', '汉室宗亲（远支）'],
      titles: []
    },
    drift: 0,
    people: {},
    flags: {},
    counters: { turnsPlayed: 0, choicesMade: 0, deviations: 0 },
    log: []
  }
}

/** 保持 actName / place 与游标同步。 */
function restamp(state, acts) {
  const act = acts.get(state.act)
  return {
    ...state,
    actName: act?.name ?? state.actName ?? '',
    place: act?.place ?? state.place ?? ''
  }
}

/** 场景年龄门槛：把时钟快进到当前场景的 atAge。 */
function ready(state, acts) {
  const caught = catchUpToScene(state, acts)
  if (caught === null) {
    return { state: restamp(state, acts), skipped: null }
  }
  return {
    state: restamp(caught.state, acts),
    skipped: { turns: caught.moved, targetAge: caught.targetAge }
  }
}

/** 把 state 投影成 UI 需要的场景视图。 */
function view(state, acts) {
  const { act, scene, index, total } = currentScene(state, acts)
  if (scene === null || state.act === 'end') {
    return {
      finished: true,
      when: formatDate(state.clock ?? {}),
      era: eraOf(state.clock?.year ?? 161),
      age: state.age ?? 0,
      stats: statsOf(state)
    }
  }

  const options = scene.kind === 'moral'
    ? (Array.isArray(scene.options) ? scene.options : []).map((option) => ({
      id: option.id,
      label: option.label,
      note: option.note ?? '',
      effects: option.effects ?? {},
      historical: option.historical === true
    }))
    : []

  return {
    finished: false,
    when: formatDate(state.clock ?? {}),
    era: eraOf(state.clock?.year ?? 161),
    age: state.age ?? 0,
    place: act?.placeName ?? state.place ?? act?.place ?? '',
    act: act?.name ?? state.actName ?? '',
    actId: act?.id ?? state.act,
    sceneId: scene.id,
    index,
    total,
    title: scene.title ?? '',
    narration: scene.narration ?? '',
    historical: scene.historical ?? '',
    kind: scene.kind,
    options,
    ability: scene.kind === 'ability'
      ? {
        attribute: scene.attribute ?? 'mei',
        difficulty: Number.isFinite(scene.difficulty) ? scene.difficulty : 50,
        targetFaction: scene.targetFaction ?? ''
      }
      : null,
    stats: statsOf(state)
  }
}

/** 数值面板。 */
export function statsOf(state) {
  const player = state.player ?? {}
  const counters = player.counters ?? {}
  const resources = player.resources ?? {}
  return {
    fame: counters.fame ?? 0,
    trust: counters.trust ?? 0,
    talent: counters.talent ?? 0,
    drift: Number.isFinite(state.drift) ? state.drift : 0,
    mood: describeDrift(Number.isFinite(state.drift) ? state.drift : 0),
    gold: resources.gold ?? 0,
    grain: resources.grain ?? 0,
    troops: resources.troops ?? 0,
    hp: resources.hp ?? 100,
    attrs: { ...(player.attrs ?? {}) },
    power: playerPower(state)
  }
}

/** demo 层的关键选择：把 act 11/12 的选择记进 flags，结局层只读 flags。 */
function storyFlags(state, actId, sceneId, optionId) {
  const flags = { ...(state.flags ?? {}) }
  if (actId === 'jingzhou' && sceneId === 'emperor') {
    if (optionId === 'crown' || optionId === 'decline' || optionId === 'king') {
      flags.epilogue = optionId
    }
  }
  if (actId === 'baidi' && sceneId === 'yiling') {
    if (optionId === 'war') flags.war = true
    if (optionId === 'peace') flags.war = false
  }
  if (actId === 'baidi' && sceneId === 'baidi' && optionId === 'retire') {
    flags.retire = true
  }
  return flags
}

/**
 * 建一个游戏实例。
 * @param {object} document acts.json 的内容
 */
export function makeGame(document) {
  const acts = indexActs(document)

  function newRun(name) {
    const seeded = seedFactions(createInitialState(name))
    return ready(seeded, acts)
  }

  function choose(state, optionId) {
    const { act, scene } = currentScene(state, acts)
    if (scene === null || scene.kind !== 'moral') {
      throw new Error('当前不是抉择场景')
    }
    const beforeAge = state.age ?? 0
    const resolved = chooseBranch(state, act, scene, optionId)
    let next = nextCursor(resolved.state, acts)
    const moved = ready(next, acts)
    const skipped = moved.skipped ?? (moved.state.age > beforeAge
      ? { turns: (moved.state.age - beforeAge) * 4, targetAge: moved.state.age }
      : null)
    const stamped = { ...moved.state, flags: storyFlags(moved.state, act.id, scene.id, optionId) }
    return {
      state: stamped,
      skipped,
      result: {
        kind: 'choice',
        act: act?.name ?? '',
        title: scene.title ?? '',
        sceneId: scene.id,
        label: resolved.branch.label,
        note: resolved.branch.note ?? '',
        effects: resolved.effects ?? {},
        attributeGain: resolved.attributeGain ?? null,
        departure: resolved.priced?.departure === true,
        drift: resolved.priced?.drift ?? state.drift
      },
      scene: view(stamped, acts)
    }
  }

  function attempt(state) {
    const { act, scene } = currentScene(state, acts)
    if (scene === null || scene.kind !== 'ability') {
      throw new Error('当前不是判定场景')
    }
    const beforeAge = state.age ?? 0
    const resolved = attemptScene(state, act, scene, {
      attribute: scene.attribute,
      difficulty: scene.difficulty
    })
    let next = nextCursor(resolved.state, acts)
    const moved = ready(next, acts)
    const skipped = moved.skipped ?? (moved.state.age > beforeAge
      ? { turns: (moved.state.age - beforeAge) * 4, targetAge: moved.state.age }
      : null)
    return {
      state: moved.state,
      skipped,
      result: {
        kind: 'check',
        act: act?.name ?? '',
        title: scene.title ?? '',
        sceneId: scene.id,
        outcome: resolved.result.outcome,
        roll: resolved.result.roll,
        attribute: resolved.result.attribute,
        attributeValue: resolved.result.attributeValue,
        modifierTotal: resolved.result.modifierTotal,
        total: resolved.result.total,
        difficulty: resolved.result.difficulty,
        margin: resolved.result.margin,
        text: resolved.text ?? '',
        effects: resolved.effects ?? {}
      },
      scene: view(moved.state, acts)
    }
  }

  return {
    acts,
    newRun,
    choose,
    attempt,
    view: (state) => view(state, acts),
    stats: statsOf
  }
}
