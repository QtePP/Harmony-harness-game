/**
 * 离线 demo 的终章与结局。
 *
 * 引擎的七个 act 在长坂之后就把 `act` 置为 `end`——它只写了刘备的前半生。
 * 这里补一个「终章·白帝」：建安二十五年，曹丕受禅，成都群臣劝进。玩家做最后一个
 * 决定，结局由这个决定 + 末局的数值共同决定。
 *
 * 这不是引擎的一部分，是 demo 的叙事收束层；它只读 state，不改引擎的规则。
 */

const clamp = (value, low, high) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low))

/** 终章的场景与选项。effects 与 acts.json 同形，便于复用同一套加减法。 */
export const EPILOGUE = {
  act: '终章',
  title: '白帝',
  when: '建安二十五年·成都',
  narration:
    '曹操已死，曹丕受禅，汉室的最后一块牌位被从许都挪走。' +
    '成都群臣三次上表，请你即皇帝位。荆州已失，云长、翼德都不在了。你五十九岁。',
  options: [
    {
      id: 'crown',
      label: '称帝，续汉',
      note: '群臣山呼万岁。你接过玉玺，说：汉室没有亡。',
      effects: { fame: 8, trust: 4, drift: 5, hp: -5 }
    },
    {
      id: 'decline',
      label: '不称帝，终身汉臣',
      note: '你把劝进表压在案底，只受汉中王印。',
      effects: { trust: 12, fame: -6, drift: -5 }
    },
    {
      id: 'king',
      label: '称汉中王，割据一方',
      note: '不称尊号，不北伐，守住剑阁以南。',
      effects: { fame: 3, troops: 10, drift: 8 }
    },
    {
      id: 'war',
      label: '倾国伐吴，为云长报仇',
      note: '你点起益州全部兵马，顺江而下。',
      effects: { troops: 0.5, hp: -25, trust: -8, drift: 20 }
    },
    {
      id: 'retire',
      label: '归还印绶，回涿郡',
      note: '你把印绶挂在堂上，带几个老卒回北方。',
      effects: { troops: 0, fame: -30, trust: -10, drift: -10 }
    }
  ]
}

/** 结局表。顺序也是图鉴的顺序。 */
export const ENDINGS = [
  {
    id: 'zhaolie',
    title: '昭烈',
    subtitle: '汉室没有亡',
    text:
      '章武元年，你在成都即皇帝位。汉室没有亡，只是退到了剑阁以南。你册封诸葛亮为丞相，' +
      '立刘禅为太子。三年后，你在白帝城托孤，说“如其不才，君可自取”。江风很冷，你死时六十三岁。' +
      '史称昭烈皇帝。',
    comment: '名望与信义都兑现了，代价是二十年的颠沛。',
    hint: '称帝，且名望与信义都够。'
  },
  {
    id: 'dufu',
    title: '独夫',
    subtitle: '你赢了位置',
    text:
      '你称了帝，却不再信任何人。旧部一个个外放，谏者一个个下狱。成都的宫城越修越高，' +
      '朝会上的声音越来越少。你死时，太子年幼，权臣当国。史书写你“有高祖之风”，' +
      '又在后面补了一句“然性多疑”。',
    comment: '你赢了位置，输了人。',
    hint: '称帝，但信义不足。'
  },
  {
    id: 'renzhe',
    title: '仁者',
    subtitle: '史书没有本纪',
    text:
      '你没有称帝。曹丕的使者来，你只受汉中王印，不称尊号。群臣说你懦，你说：' +
      '“汉室不可复兴，百姓不可再苦。”你死时，益州百姓自发罢市三日。史书没有给你本纪，' +
      '只在《先主传》里写了一句：“其得人心如此。”',
    comment: '没有本纪，不等于没有分量。',
    hint: '不称帝，且信义足够高。'
  },
  {
    id: 'pianan',
    title: '偏安',
    subtitle: '不赌',
    text:
      '你守住了益州，也守住了汉中的几道关隘。没有北伐，没有称帝，也没有再丢城。' +
      '你死时，蜀中无大战，府库有余粮。后人说你“保守”，也有人说，那是乱世里最难的一种本事。',
    comment: '不赌，也是一种赌。',
    hint: '不称帝，信义也不足。'
  },
  {
    id: 'hanzhong',
    title: '汉中王',
    subtitle: '最小的一方',
    text:
      '你称汉中王，不称帝。魏、吴、汉三方并立，你这一方最小，却最稳。你死时，' +
      '魏国正在内斗，吴国正在换太子。你的儿子守了四十年。史家把你放进“割据”一类，' +
      '却不得不承认：那一隅，是三国里最后熄的灯。',
    comment: '最小的一方，最久的一盏灯。',
    hint: '称王，不称帝。'
  },
  {
    id: 'zhixi',
    title: '织席者',
    subtitle: '从市井来',
    text:
      '你把印绶挂在堂上，带着几个老卒回了涿郡。市集上没人认得你，你重新支起席摊。' +
      '有人问你年轻时做过什么，你说：“卖过席子。”你死时，家里只有一张旧席。',
    comment: '他从市井来，回市井去。',
    hint: '归还印绶。'
  },
  {
    id: 'zaoshi',
    title: '蚤世',
    subtitle: '火熄之后',
    text:
      '夷陵的火烧了七百里。你退到白帝城，病没有再起。你死时六十二岁，身边只有诸葛亮和李严。' +
      '你把刘禅托给他们，说：“勿以恶小而为之，勿以善小而不为。”那是你一生最后一句话。',
    comment: '火熄之后，江还是那条江。',
    hint: '倾国伐吴，身体先垮。'
  },
  {
    id: 'jiedi',
    title: '举世皆敌',
    subtitle: '天下皆敌',
    text:
      '你倾国伐吴，魏国乘虚而入，南中三郡反了，东吴断了粮道。你退到永安，四面都是敌人。' +
      '你死时，成都的使者还在路上。史书写：“先主败绩，还永安，遂崩。”',
    comment: '你把天下都变成了敌人，天下也就把你变成了一个人。',
    hint: '倾国伐吴，天下皆敌。'
  }
]

/** 快捷索引。 */
export const ENDING_BY_ID = Object.fromEntries(ENDINGS.map((ending) => [ending.id, ending]))

const COUNTERS = ['fame', 'trust', 'talent']
const RESOURCES = ['gold', 'grain', 'troops', 'hp']

/** 把一个 effects 对象结算到 state 上；troops 支持 0.5 这种比例写法。 */
export function applyEpilogue(state, optionId) {
  const option = EPILOGUE.options.find((item) => item.id === optionId)
  if (option === undefined) return state

  const player = state.player ?? {}
  const counters = { ...(player.counters ?? {}) }
  const resources = { ...(player.resources ?? {}) }
  let drift = Number.isFinite(state.drift) ? state.drift : 0

  for (const [key, raw] of Object.entries(option.effects ?? {})) {
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    if (key === 'drift') {
      drift += value
    } else if (key === 'troops' && value > 0 && value < 1) {
      resources.troops = Math.floor((resources.troops ?? 0) * value)
    } else if (COUNTERS.includes(key)) {
      counters[key] = (counters[key] ?? 0) + value
    } else if (RESOURCES.includes(key)) {
      resources[key] = (resources[key] ?? 0) + value
    }
  }

  for (const key of COUNTERS) counters[key] = clamp(counters[key], 0, 100)
  for (const key of RESOURCES) resources[key] = Math.max(0, Math.trunc(resources[key]))
  resources.hp = clamp(resources.hp, 0, 100)
  drift = clamp(drift, 0, 100)

  return {
    ...state,
    drift,
    player: { ...player, counters, resources },
    flags: { ...(state.flags ?? {}), epilogue: optionId },
    log: [
      ...(Array.isArray(state.log) ? state.log : []),
      { kind: 'epilogue', text: option.label }
    ]
  }
}

/**
 * 由终章选择 + 末局数值决定结局。
 *
 * 先判「身体先垮」，再按选择分流；称帝/不称帝内部再用名望与信义分高低。
 * 所有分支都有落点，不存在“没有结局”的状态。
 */
export function endingFor(state) {
  const hp = Number(state?.player?.resources?.hp ?? 100)
  const fame = Number(state?.player?.counters?.fame ?? 0)
  const trust = Number(state?.player?.counters?.trust ?? 0)
  const epilogue = state?.flags?.epilogue

  if (hp <= 15) return ENDING_BY_ID.zaoshi

  switch (epilogue) {
    case 'crown':
      return fame >= 70 && trust >= 55 && Number(state?.drift ?? 0) <= 35
        ? ENDING_BY_ID.zhaolie
        : ENDING_BY_ID.dufu
    case 'decline':
      return trust >= 65 ? ENDING_BY_ID.renzhe : ENDING_BY_ID.pianan
    case 'king':
      return ENDING_BY_ID.hanzhong
    case 'retire':
      return ENDING_BY_ID.zhixi
    case 'war':
      return hp <= 35 ? ENDING_BY_ID.zaoshi : ENDING_BY_ID.jiedi
    default:
      return trust >= 65 ? ENDING_BY_ID.renzhe : ENDING_BY_ID.pianan
  }
}
