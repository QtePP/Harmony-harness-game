import { flightTimes, InsightCard, LEG, TRAVEL_STATES, TravelInsight } from './TravelModel'

/**
 * Prompt construction and output parsing — the two places where this feature
 * can quietly go wrong, kept in one file so they can be read together.
 *
 * The contract with the model is deliberately narrow: four cards, a closed set
 * of kinds, hard character budgets. A model asked for "some travel advice" will
 * write an essay; a model asked for four rows with a badge each writes something
 * a card can actually render. The budgets are also what keeps six states from
 * producing six walls of text.
 */

/** Two-digit padding without pulling in a formatter. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

function stamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * Build the turn text for one state. Everything the model needs is inline: it
 * has no conversation history, and the whole point is that the user never typed
 * anything.
 */
export function buildPrompt(stateIndex: number, now: Date): string {
  const index = Math.max(0, Math.min(stateIndex, TRAVEL_STATES.length - 1))
  const state = TRAVEL_STATES[index]
  const times = flightTimes(index, now)
  return [
    '你是一张航旅卡片背后的实时助手，运行在用户手机本地的 dsh 运行时里。',
    '用户没有提问——你要根据卡片当前状态，主动说出此刻最该知道的 4 件事。',
    '',
    '【卡片】',
    `${LEG.flightNo} ${LEG.carrier} ${LEG.aircraft}`,
    `${LEG.fromCity} ${LEG.fromTerminal} ${times.departText} → ${LEG.toCity} ${LEG.toTerminal} ${times.arriveText}（${LEG.duration}，直飞）`,
    `座位 ${LEG.seat}，登机口 ${state.gate}，行李转盘 ${state.belt}，日期 ${times.date}`,
    `当前状态：${state.badge}（第 ${index + 1} 段，共 ${TRAVEL_STATES.length} 段）`,
    `状态提示：${state.hint}`,
    `现在是 ${stamp(now)}。`,
    '',
    `【这一站的重点】${state.focus}`,
    '',
    '【目的地】成都，天府机场距市区 58 km。',
    '',
    '【输出要求】',
    '- 只输出一个 JSON 对象。不要 markdown 代码块，不要任何解释文字。',
    '- cards 3 到 6 张，条数由这一站真正需要的信息决定，不要为了凑数加卡。',
    '- kind 从 weather / spot / booking / food / traffic / luggage / tip 里选，同一个 kind 最多出现两次。',
    '- 每张卡：title 不超过 8 个字；badge 不超过 8 个字（一个具体数字或结论）；lines 1 到 2 条、每条不超过 30 个字；tags 0 到 3 个、每个不超过 6 个字。',
    '- 内容必须服务「这一站」：处在这个状态的旅客，看完这几张卡就能行动。',
    '- 给具体数字（温度、距离、时长、价格、楼层），不要写"注意安全""提前准备"这类空话。',
    '',
    '【格式示例】',
    '{"headline":"一句话结论，不超过 16 字","cards":[{"kind":"weather","title":"落地天气","badge":"17°C",' +
      '"lines":["多云转小雨，14°~20°","傍晚有雨，带折叠伞"],"tags":["湿度68%","东南风2级"]}],' +
      '"conclusion":"一句话可执行建议，不超过 60 字"}'
  ].join('\n')
}

/** Strip ``` fences and any prose around the object. */
function extractObject(raw: string): string {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return ''
  }
  return cleaned.substring(start, end + 1)
}

function asString(value: Object | undefined): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return (value as string).trim()
  }
  return ''
}

function asStringArray(value: Object | undefined): string[] {
  const out: string[] = []
  if (value === undefined || value === null || !Array.isArray(value)) {
    return out
  }
  for (const item of value as Object[]) {
    if (typeof item === 'string') {
      const text = (item as string).trim()
      if (text.length > 0) {
        out.push(text)
      }
    } else if (item !== null && item !== undefined) {
      out.push(JSON.stringify(item))
    }
  }
  return out
}

/**
 * Turn the model's answer into cards. Returns null rather than throwing: a
 * malformed answer is a normal outcome, and the caller decides whether to retry
 * or fall back.
 */
export function parseInsight(raw: string): TravelInsight | null {
  const body = extractObject(raw)
  if (body.length === 0) {
    return null
  }
  let root: Record<string, Object>
  try {
    root = JSON.parse(body) as Record<string, Object>
  } catch (error) {
    return null
  }
  if (root === null || root === undefined) {
    return null
  }
  const rawCards = root['cards']
  if (rawCards === undefined || !Array.isArray(rawCards)) {
    return null
  }
  const cards: InsightCard[] = []
  for (const item of rawCards as Object[]) {
    if (item === null || typeof item !== 'object') {
      continue
    }
    const obj = item as Record<string, Object>
    const title = asString(obj['title'])
    const lines = asStringArray(obj['lines'])
    if (title.length === 0 && lines.length === 0) {
      continue
    }
    let kind = asString(obj['kind'])
    if (kind.length === 0) {
      kind = 'tip'
    }
    cards.push({
      kind: kind,
      title: title.length === 0 ? '提示' : title,
      badge: asString(obj['badge']),
      lines: lines.slice(0, 3),
      tags: asStringArray(obj['tags']).slice(0, 3)
    })
  }
  if (cards.length === 0) {
    return null
  }
  return {
    headline: asString(root['headline']),
    cards: cards.slice(0, 6),
    conclusion: asString(root['conclusion']),
    origin: 'model'
  }
}
