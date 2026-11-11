/**
 * The travel card's data, kept apart from its pixels.
 *
 * Everything the demo asserts lives here: the six-stop state machine, the
 * flight leg, and the four things the AI page says about the destination.
 * Splitting it out is what lets the card and the AI page stay pure layout —
 * and it is the seam a real integration would replace with live data.
 */

/** One stop on the trip's state machine. Index order is chronological. */
export interface TravelState {
  /** Short label under the stepper node. Two or three characters. */
  label: string
  /** Badge on the card's top-left. */
  badge: string
  /** Right-aligned hint next to the badge. */
  hint: string
  /** Boarding gate, or '—' once the flight is airborne. */
  gate: string
  /** Baggage belt, empty until arrival. */
  belt: string
  /**
   * What the AI page should look at from this stop. This is the whole reason
   * the page is not one fixed set of four cards: a traveller who has not left
   * home and a traveller who has just landed need different four things.
   */
  focus: string
}

export const TRAVEL_STATES: TravelState[] = [
  {
    label: '计划中',
    badge: '计划中',
    hint: '距起飞 3h20m',
    gate: 'C12',
    belt: '—',
    focus: '还没出门：重点是行前准备（证件、行李、值机几点开放）和该几点到机场'
  },
  {
    label: '值机',
    badge: '值机开放',
    hint: '柜台 K01–K12',
    gate: 'C12',
    belt: '—',
    focus: '值机已开放：重点是柜台与选座、托运规则、安检排队大概多久'
  },
  {
    label: '安检',
    badge: '安检中',
    hint: 'B 区 · 约 8 分钟',
    gate: 'C12',
    belt: '—',
    focus: '正在安检：重点是安检口位置、哪些东西不能带、到登机口还要走多久'
  },
  {
    label: '登机',
    badge: '登机中',
    hint: '15 分钟后起飞',
    gate: 'C12',
    belt: '—',
    focus: '正在登机：重点是登机口临时变更的风险、落地天气、落地后第一件事'
  },
  {
    label: '起飞',
    badge: '飞行中',
    hint: '巡航 10,600 m',
    gate: 'C12',
    belt: '—',
    focus: '已在空中：重点是落地天气、机场到市区的接驳、到达后的第一件事'
  },
  {
    label: '到达',
    badge: '已到达',
    hint: '行李转盘 7',
    gate: '—',
    belt: '7',
    focus: '已经落地：重点是行李转盘、进城交通、入住和第一顿吃什么'
  }
]

/**
 * How far each stop sits from its departure, in minutes. Negative means the
 * flight has already left. Anchoring the schedule to the clock is what keeps
 * the card and the model's reading of it from disagreeing: a fixed 13:45
 * departure plus a 15:00 clock is a flight that is four hours late, and a model
 * told both will say so.
 */
const DEPART_OFFSET_MIN: number[] = [200, 130, 45, 15, -2, -195]

export interface FlightTimes {
  depart: Date
  arrive: Date
  departText: string
  arriveText: string
  date: string
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

function hhmm(when: Date): string {
  return `${pad2(when.getHours())}:${pad2(when.getMinutes())}`
}

/** The leg's clock, computed for the stop the card is showing. */
export function flightTimes(stateIndex: number, now: Date): FlightTimes {
  const index = Math.max(0, Math.min(stateIndex, DEPART_OFFSET_MIN.length - 1))
  const depart = new Date(now.getTime() + DEPART_OFFSET_MIN[index] * 60000)
  const arrive = new Date(depart.getTime() + 195 * 60000)
  return {
    depart: depart,
    arrive: arrive,
    departText: hhmm(depart),
    arriveText: hhmm(arrive),
    date: `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  }
}

/** The leg the card is about. Static in the demo; one API call in production. */
export interface FlightLeg {
  carrier: string
  flightNo: string
  aircraft: string
  fromCode: string
  fromCity: string
  fromTerminal: string
  fromTime: string
  toCode: string
  toCity: string
  toTerminal: string
  toTime: string
  duration: string
  seat: string
  date: string
}

export const LEG: FlightLeg = {
  carrier: '东方航空',
  flightNo: 'MU5401',
  aircraft: '空客 A321',
  fromCode: 'SHA',
  fromCity: '上海虹桥',
  fromTerminal: 'T2',
  fromTime: '13:45',
  toCode: 'TFU',
  toCity: '成都天府',
  toTerminal: 'T2',
  toTime: '17:00',
  duration: '3h 15m',
  seat: '32A',
  date: '11-05'
}

/* ------------------------------------------------------------------ */
/* What the AI page says                                               */
/* ------------------------------------------------------------------ */

/**
 * A run of text inside one reasoning line. `strong` is what the eye should
 * land on — the flight number, the city, the count. Styling is carried as
 * data so the model of the line stays one array instead of three fields.
 */
export interface Segment {
  text: string
  strong: boolean
}

export interface ReasonStep {
  segments: Segment[]
}

function plain(text: string): Segment {
  return { text: text, strong: false }
}

function strong(text: string): Segment {
  return { text: text, strong: true }
}

export const REASON_STEPS: ReasonStep[] = [
  {
    segments: [plain('读取卡片上下文 · '), strong('MU5401'), plain(' 上海虹桥 → 成都天府 · 12:50 落地')]
  },
  {
    segments: [plain('定位目的地 '), strong('成都'), plain(' · 天府新区，距市区 58 km')]
  },
  {
    segments: [plain('查询落地时段天气 · '), strong('17°C 多云转小雨')]
  },
  {
    segments: [plain('检索目的地高热度景点 · 命中 '), strong('4 处'), plain('，取第一顺位')]
  },
  {
    segments: [plain('核对预约政策 · '), strong('熊猫基地 / 成都博物馆 / 三星堆'), plain(' 需预约')]
  },
  {
    segments: [plain('汇总本地必吃 · 命中 '), strong('4 项')]
  }
]

export interface WeatherHour {
  hour: string
  temp: string
  current: boolean
}

export interface Weather {
  temp: string
  condition: string
  range: string
  humidity: string
  wind: string
  advice: string
  hours: WeatherHour[]
}

export const WEATHER: Weather = {
  temp: '17',
  condition: '多云转小雨',
  range: '14° ~ 20°',
  humidity: '湿度 68%',
  wind: '东南风 2 级',
  advice: '傍晚有零星小雨，带一件薄外套 + 折叠伞；天府机场到市区 58 km，落地后先别急着脱外套。',
  hours: [
    { hour: '17:00', temp: '17°', current: true },
    { hour: '19:00', temp: '16°', current: false },
    { hour: '21:00', temp: '15°', current: false },
    { hour: '23:00', temp: '14°', current: false }
  ]
}

export interface Spot {
  name: string
  emoji: string
  desc: string
  tags: string[]
}

export const SPOT: Spot = {
  name: '成都大熊猫繁育研究基地',
  emoji: '🐼',
  desc: '来成都的第一顺位。上午 9 点前是熊猫最活跃的时段，从市区打车约 30 分钟。',
  tags: ['距你 58 km', '建议 3 小时', '07:30 开园', '门票 55 元']
}

export interface Reservation {
  name: string
  rule: string
}

export const RESERVATIONS: Reservation[] = [
  { name: '大熊猫繁育研究基地', rule: '需提前 1 天在官方小程序实名分时段预约 · 上午场最抢手' },
  { name: '成都博物馆', rule: '免费但必须实名预约，提前 1–7 天放号 · 周一闭馆' },
  { name: '三星堆博物馆（广汉）', rule: '需提前 3 天预约，新馆单独购票 72 元 · 距成都 40 km' }
]

export interface Food {
  emoji: string
  name: string
  note: string
}

export const FOODS: Food[] = [
  { emoji: '🌶', name: '成都火锅', note: '蜀大侠 / 大龙燚 · 微辣也要提前说「微微辣」' },
  { emoji: '🥟', name: '钟水饺 + 甜水面', note: '红油带甜，老字号「钟水饺」总店' },
  { emoji: '🍢', name: '钵钵鸡', note: '冷吃串串，叶婆婆 / 马路边边' },
  { emoji: '🥞', name: '蛋烘糕', note: '贺记蛋烘糕 · 奶油肉松双拼是本地吃法' }
]

/** Where each claim came from. Shown so the reasoning is auditable, not magic. */
export const SOURCES: string[] = ['行程卡片', '航班动态', '天气 API', '预约政策库', '本地榜单']

export const CONCLUSION: string =
  '12:50 落地、小雨、市区 58 km —— 建议先回酒店放行李，傍晚再去宽窄巷子；' +
  '熊猫基地必须现在约明天的上午场，晚了只剩下午场。'

/** Everything the AI page needs about the destination, in one object. */
export interface Destination {
  city: string
  code: string
  weather: Weather
  spot: Spot
  reservations: Reservation[]
  foods: Food[]
  sources: string[]
  conclusion: string
}

export const DESTINATION: Destination = {
  city: '成都',
  code: 'CTU',
  weather: WEATHER,
  spot: SPOT,
  reservations: RESERVATIONS,
  foods: FOODS,
  sources: SOURCES,
  conclusion: CONCLUSION
}

/* ------------------------------------------------------------------ */
/* What the model is asked to produce                                  */
/* ------------------------------------------------------------------ */

/**
 * One answer card. The model picks the kind from CARD_KINDS; the page owns how
 * each kind looks. Keeping the shape this small is what lets six different
 * states produce six genuinely different sets without six layouts.
 */
export interface InsightCard {
  kind: string
  title: string
  /** One short figure or verdict, shown on the right of the head. */
  badge: string
  lines: string[]
  tags: string[]
}

export interface TravelInsight {
  headline: string
  cards: InsightCard[]
  conclusion: string
  /** 'model' when the runtime produced it, 'fallback' when it did not. */
  origin: string
}

/** The closed set the prompt allows. Anything else renders as a generic tip. */
export const CARD_KINDS: string[] = ['weather', 'spot', 'booking', 'food', 'traffic', 'luggage', 'tip']

/**
 * Offline safety net. If the runtime cannot be reached the page still has to
 * say something true, so it falls back to the shipped dataset — clearly marked
 * as a fallback rather than passed off as inference.
 */
export const FALLBACK_INSIGHT: TravelInsight = {
  headline: '本地兜底：成都今天多云转小雨',
  origin: 'fallback',
  cards: [
    {
      kind: 'weather',
      title: '落地天气',
      badge: '17°C',
      lines: ['多云转小雨，14° ~ 20°', '傍晚有零星小雨，带一件薄外套 + 折叠伞'],
      tags: ['湿度 68%', '东南风 2 级']
    },
    {
      kind: 'spot',
      title: '最出名的景点',
      badge: '必去',
      lines: ['成都大熊猫繁育研究基地', '上午 9 点前熊猫最活跃，市区打车约 30 分钟'],
      tags: ['距你 58 km', '07:30 开园', '门票 55 元']
    },
    {
      kind: 'booking',
      title: '需要预约',
      badge: '3 处',
      lines: ['熊猫基地需提前 1 天分时段预约', '成都博物馆免费但必须实名预约，周一闭馆'],
      tags: ['三星堆提前 3 天', '新馆 72 元']
    },
    {
      kind: 'food',
      title: '一定要吃',
      badge: '4 样',
      lines: ['火锅：蜀大侠 / 大龙燚', '钟水饺、钵钵鸡、蛋烘糕都值得单独跑一趟'],
      tags: ['微辣也要说微微辣']
    }
  ],
  conclusion: '17:00 落地、小雨、市区 58 km —— 先回酒店放行李，晚上再去宽窄巷子；熊猫基地现在就约明天的上午场。'
}
