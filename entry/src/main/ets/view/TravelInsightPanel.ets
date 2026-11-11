import { common } from '@kit.AbilityKit'
import { AgentPhase, TraceStep, TravelAgent } from '../travel/TravelAgent'
import {
  DESTINATION, FALLBACK_INSIGHT, InsightCard, LEG, TRAVEL_STATES, TravelInsight
} from '../travel/TravelModel'

/**
 * The AI page: four cards the on-device runtime produced for this exact state.
 *
 * Design notes worth keeping:
 *
 * · THE PAGE IS A WINDOW ONTO A REAL TURN, NOT A MOCK. It boots the in-process
 *   Node runtime, opens a session, prompts `deepseek-v4-flash` and renders what
 *   comes back. The pipeline rows and the stream panel exist because that is
 *   the only honest way to show "this was inferred here, just now" — a spinner
 *   would look the same whether or not anything ran.
 *
 * · DIFFERENT STATES GET DIFFERENT CARDS. The prompt carries the state's focus
 *   ("还没出门" vs "已经落地"), and the renderer is generic, so the four slots
 *   change content and kind per state instead of re-skinning one fixed set.
 *
 * · THE FALLBACK IS LABELLED. If the runtime is unreachable the page shows the
 *   shipped dataset with a visible "本地兜底" marker. Silent substitution would
 *   make a broken runtime look like a working one.
 *
 * · CACHED PER STATE. The runtime is a process-wide singleton and a turn costs
 *   seconds; reopening the sheet on a state already answered paints instantly.
 */

const INK = '#0D1220'
const INK_2 = '#3D465C'
const FAINT = '#98A2BB'
const PAPER = '#FFFFFF'
const PAGE = '#FBFCFF'
const BRAND = '#2F5BFF'
const VIOLET = '#7A5CFF'
const LINE = '#121A2C0F'
const OK = '#0F9F6E'

/** Card kind → glyph, tint and the small caps label. */
class KindStyle {
  glyph: string
  fg: string
  bg: string

  constructor(glyph: string, fg: string, bg: string) {
    this.glyph = glyph
    this.fg = fg
    this.bg = bg
  }
}

const STYLE_WEATHER = new KindStyle('☁', '#2B7FD4', '#E6F1FF')
const STYLE_SPOT = new KindStyle('◈', '#1C9B5C', '#E8FBEF')
const STYLE_BOOKING = new KindStyle('◷', '#D4692B', '#FFF1E6')
const STYLE_FOOD = new KindStyle('◍', '#CF3F6A', '#FFEAEF')
const STYLE_TRAFFIC = new KindStyle('⇄', '#3F5BD8', '#EAEFFF')
const STYLE_LUGGAGE = new KindStyle('▤', '#0E8C8C', '#E6F7F7')
const STYLE_TIP = new KindStyle('✦', '#7A5CFF', '#F1EBFF')

function styleOf(kind: string): KindStyle {
  if (kind === 'weather') {
    return STYLE_WEATHER
  }
  if (kind === 'spot') {
    return STYLE_SPOT
  }
  if (kind === 'booking') {
    return STYLE_BOOKING
  }
  if (kind === 'food') {
    return STYLE_FOOD
  }
  if (kind === 'traffic') {
    return STYLE_TRAFFIC
  }
  if (kind === 'luggage') {
    return STYLE_LUGGAGE
  }
  return STYLE_TIP
}

@Component
export struct TravelInsightPanel {
  /**
   * The card the panel is answering for. Watching it is what makes the panel
   * re-answer in place when the state machine advances — no page change, no
   * lost scroll position.
   */
  @Prop @Watch('onStateChanged') stateIndex: number
  onClose: () => void = () => {}

  @State phase: string = AgentPhase.IDLE
  @State detail: string = ''
  @State stream: string = ''
  @State error: string = ''
  @State headline: string = ''
  @State cards: InsightCard[] = []
  @State conclusion: string = ''
  @State origin: string = ''
  @State bootMs: number = 0
  @State turnMs: number = 0
  @State shown: number = 0
  @State failed: boolean = false
  @State booted: boolean = false
  @State fromCache: boolean = false
  @State steps: TraceStep[] = []
  /** Walks 0..3 while the cards are still placeholders, for a loading wave. */
  @State pulseStep: number = 0

  private scroller: Scroller = new Scroller()
  private timers: number[] = []
  private lastPhase: string = ''
  private pulseTimer: number = -1

  aboutToAppear(): void {
    const agent = TravelAgent.get()
    agent.onUpdate = () => {
      this.sync()
    }
    this.sync()
    this.pulseTimer = setInterval(() => {
      this.pulseStep = (this.pulseStep + 1) % 4
    }, 280)
    void agent.run(getContext(this) as common.UIAbilityContext, this.stateIndex, false)
  }

  /** The state advanced: answer the new one, from cache when possible. */
  onStateChanged(): void {
    void TravelAgent.get().run(getContext(this) as common.UIAbilityContext, this.stateIndex, false)
  }

  aboutToDisappear(): void {
    for (const id of this.timers) {
      clearTimeout(id)
    }
    this.timers = []
    if (this.pulseTimer > 0) {
      clearInterval(this.pulseTimer)
      this.pulseTimer = -1
    }
  }

  private sync(): void {
    const agent = TravelAgent.get()
    this.phase = agent.phase
    this.detail = agent.detail
    this.stream = agent.stream
    this.error = agent.error
    this.bootMs = agent.bootMs
    this.turnMs = agent.turnMs
    this.booted = agent.booted
    this.fromCache = agent.fromCache
    this.steps = agent.trace.slice()

    const insight: TravelInsight | null = agent.insight
    if (insight !== null) {
      this.headline = insight.headline
      this.cards = insight.cards
      this.conclusion = insight.conclusion
      this.origin = insight.origin
      this.failed = false
    } else if (agent.phase === AgentPhase.FAILED) {
      // Never leave the page blank: say what went wrong, and mark the cards as
      // the shipped dataset rather than passing them off as inference.
      this.headline = FALLBACK_INSIGHT.headline
      this.cards = FALLBACK_INSIGHT.cards
      this.conclusion = FALLBACK_INSIGHT.conclusion
      this.origin = 'fallback'
      this.failed = true
    } else if (agent.phase === AgentPhase.BOOTING || agent.phase === AgentPhase.ASKING) {
      // A turn is running for a state we have no answer for yet. Keeping the
      // previous state's cards on screen would be worse than an empty frame:
      // they answer a different question. Drop them and show the skeleton.
      if (this.cards.length > 0) {
        this.cards = []
        this.shown = 0
      }
    }

    const wasDone = this.lastPhase === AgentPhase.DONE
    this.lastPhase = this.phase
    if (this.phase === AgentPhase.DONE && !wasDone) {
      this.shown = 0
      this.reveal()
    }

    if (this.stream.length > 0) {
      this.timers.push(setTimeout(() => {
        this.scroller.scrollEdge(Edge.Bottom)
      }, 40))
    }
  }

  /** Cards land one after another; four at once reads as a page, not an answer. */
  private reveal(): void {
    if (this.shown >= this.cards.length) {
      return
    }
    this.timers.push(setTimeout(() => {
      this.shown += 1
      this.reveal()
    }, 110))
  }

  private stateName(): string {
    const index = Math.max(0, Math.min(this.stateIndex, TRAVEL_STATES.length - 1))
    return TRAVEL_STATES[index].badge
  }

  private busy(): boolean {
    return this.phase === AgentPhase.BOOTING || this.phase === AgentPhase.ASKING
  }

  private seconds(ms: number): string {
    if (ms <= 0) {
      return '—'
    }
    return `${(ms / 1000).toFixed(1)}s`
  }

  /* ---------------------------------------------------------------- */
  /* Pieces                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * One workflow row. Reads everything from the step object, so a status change
   * on an existing row repaints without the parent rebuilding the list.
   */
  @Builder
  traceRow(step: TraceStep, index: number) {
    Row({ space: 9 }) {
      Stack({ alignContent: Alignment.Center }) {
        if (step.status === 'done') {
          Text('✓').fontSize(8).fontWeight(FontWeight.Bold).fontColor(OK)
        } else if (step.status === 'fail') {
          Text('!').fontSize(9).fontWeight(FontWeight.Bold).fontColor('#D14343')
        } else {
          LoadingProgress().width(10).height(10).color(BRAND)
        }
      }
      .width(14)
      .height(14)
      .borderRadius(7)
      .backgroundColor(step.status === 'done' ? '#1A0F9F6E' : (step.status === 'fail' ? '#1AD14343' : '#00000000'))

      Text(step.label)
        .fontSize(11)
        .fontColor(step.status === 'run' ? INK : INK_2)
        .fontWeight(step.status === 'run' ? FontWeight.Bold : FontWeight.Normal)
        .maxLines(1)
        .flexShrink(0)

      if (step.detail.length > 0) {
        Text(step.detail)
          .fontSize(10)
          .fontColor(step.status === 'fail' ? '#D14343' : FAINT)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
          .textAlign(TextAlign.End)
      } else {
        Blank()
      }

      if (step.ms > 0) {
        Text(this.seconds(step.ms))
          .fontSize(9.5)
          .fontColor('#B4BDD0')
          .width(34)
          .textAlign(TextAlign.End)
      }
    }
    .width('100%')
    .padding({ top: 4, bottom: 4 })
    .alignItems(VerticalAlign.Center)
  }

  /**
   * The framework the answers will land in. Drawn before any token arrives so
   * the sheet has shape the instant it opens — the wait happens inside a card
   * that already looks like the answer, not on a blank page.
   */
  @Builder
  skeletonCard(index: number) {
    Column() {
      Row({ space: 9 }) {
        Column().width(29).height(29).borderRadius(10).backgroundColor('#EDF0F7')
        Column({ space: 7 }) {
          Column().width(92).height(10).borderRadius(5).backgroundColor('#EDF0F7')
          Column().width(54).height(8).borderRadius(4).backgroundColor('#F4F6FA')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .width('100%')

      Column().width('90%').height(9).borderRadius(4).backgroundColor('#F2F4F9').margin({ top: 13 })
      Column().width('66%').height(9).borderRadius(4).backgroundColor('#F2F4F9').margin({ top: 7 })
    }
    .width('100%')
    .padding(15)
    .borderRadius(20)
    .backgroundColor(PAPER)
    .border({ width: 1, color: LINE })
    .opacity(this.pulseStep === index ? 1 : 0.5)
    .animation({ duration: 280, curve: Curve.EaseInOut })
  }

  @Builder
  answerCard(card: InsightCard, index: number) {
    Column() {
      Row({ space: 9 }) {
        Stack({ alignContent: Alignment.Center }) {
          Text(styleOf(card.kind).glyph)
            .fontSize(14)
            .fontColor(styleOf(card.kind).fg)
        }
        .width(29)
        .height(29)
        .borderRadius(10)
        .backgroundColor(styleOf(card.kind).bg)

        Text(card.title)
          .fontSize(13)
          .fontWeight(FontWeight.Bold)
          .fontColor(INK)
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        if (card.badge.length > 0) {
          Text(card.badge)
            .fontSize(9.5)
            .fontWeight(FontWeight.Bold)
            .fontColor(styleOf(card.kind).fg)
            .padding({ left: 7, right: 7, top: 3, bottom: 3 })
            .borderRadius(6)
            .backgroundColor(styleOf(card.kind).bg)
            .maxLines(1)
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      ForEach(card.lines, (line: string, i: number) => {
        Text(line)
          .fontSize(12)
          .lineHeight(19)
          .fontColor(INK_2)
          .width('100%')
          .margin({ top: i === 0 ? 9 : 3 })
      }, (line: string, i: number) => `${index}-l${i}`)

      if (card.tags.length > 0) {
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(card.tags, (tag: string, i: number) => {
            Text(tag)
              .fontSize(9.5)
              .fontWeight(FontWeight.Medium)
              .fontColor('#5A6480')
              .padding({ left: 8, right: 8, top: 3.5, bottom: 3.5 })
              .borderRadius(7)
              .backgroundColor('#F3F6FB')
              .margin({ right: 5, top: 5 })
          }, (tag: string, i: number) => `${index}-t${i}`)
        }
        .width('100%')
        .margin({ top: 4 })
      }
    }
    .width('100%')
    .padding(15)
    .borderRadius(20)
    .backgroundColor(PAPER)
    .border({ width: 1, color: LINE })
    .shadow({ radius: 24, color: '#12142046', offsetX: 0, offsetY: 10 })
    .opacity(this.shown > index ? 1 : 0)
    .translate({ y: this.shown > index ? 0 : 14 })
    .animation({ duration: 380, curve: Curve.FastOutSlowIn })
  }

  @Builder
  conclusionCard() {
    Column() {
      Row() {
        Text('CONCLUSION')
          .fontSize(9.5)
          .fontWeight(FontWeight.Bold)
          .fontColor('#80FFFFFF')
          .letterSpacing(1.4)
        Blank()
        Text(this.origin === 'model' ? '端侧生成' : '本地兜底')
          .fontSize(9)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.origin === 'model' ? '#9FE4FF' : '#FFC58A')
      }
      .width('100%')

      Text(this.conclusion)
        .fontSize(12)
        .lineHeight(20)
        .fontColor('#EBFFFFFF')
        .width('100%')
        .margin({ top: 8 })

      Flex({ wrap: FlexWrap.Wrap }) {
        Text(LEG.flightNo)
          .fontSize(9)
          .fontWeight(FontWeight.Medium)
          .fontColor('#99FFFFFF')
          .padding({ left: 6, right: 6, top: 3, bottom: 3 })
          .borderRadius(6)
          .backgroundColor('#17FFFFFF')
          .border({ width: 1, color: '#1FFFFFFF' })
          .margin({ right: 6, top: 6 })
        Text('deepseek-v4-flash')
          .fontSize(9)
          .fontWeight(FontWeight.Medium)
          .fontColor('#99FFFFFF')
          .padding({ left: 6, right: 6, top: 3, bottom: 3 })
          .borderRadius(6)
          .backgroundColor('#17FFFFFF')
          .border({ width: 1, color: '#1FFFFFFF' })
          .margin({ right: 6, top: 6 })
        Text(this.seconds(this.turnMs))
          .fontSize(9)
          .fontWeight(FontWeight.Medium)
          .fontColor('#99FFFFFF')
          .padding({ left: 6, right: 6, top: 3, bottom: 3 })
          .borderRadius(6)
          .backgroundColor('#17FFFFFF')
          .border({ width: 1, color: '#1FFFFFFF' })
          .margin({ right: 6, top: 6 })
      }
      .width('100%')
      .margin({ top: 6 })
    }
    .width('100%')
    .padding(15)
    .borderRadius(18)
    .alignItems(HorizontalAlign.Start)
    .linearGradient({ angle: 135, colors: [['#20264F', 0], ['#33306E', 0.55], ['#4A2F78', 1]] })
    .shadow({ radius: 24, color: '#3D1E2450', offsetX: 0, offsetY: 14 })
    .opacity(this.shown >= this.cards.length && this.cards.length > 0 ? 1 : 0)
    .translate({ y: this.shown >= this.cards.length && this.cards.length > 0 ? 0 : 12 })
    .animation({ duration: 400, curve: Curve.EaseOut })
  }

  build() {
    Column({ space: 10 }) {
      /* ---------- header ---------- */
      Row({ space: 9 }) {
        Stack({ alignContent: Alignment.Center }) {
          Text('✦')
            .fontSize(13)
            .fontColor('#FFFFFF')
        }
        .width(28)
        .height(28)
        .borderRadius(9)
        .linearGradient({ angle: 140, colors: [[BRAND, 0], [VIOLET, 1]] })

        Column({ space: 2 }) {
          Text(`AI 洞察 · ${this.stateName()}`)
            .fontSize(13)
            .fontWeight(FontWeight.Bold)
            .fontColor(INK)
          Text(this.busy() ? this.detail
            : (this.fromCache ? `已就绪 · ${this.steps.length > 0 ? this.steps[0].detail : '缓存'}`
              : `端侧生成 · ${this.seconds(this.turnMs)}`))
            .fontSize(9.5)
            .fontColor(FAINT)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        Text(this.busy() ? 'LIVE' : (this.origin === 'model' ? 'DONE' : (this.origin === 'cache' ? 'CACHED' : 'OFFLINE')))
          .fontSize(9)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.busy() ? '#C9721F' : (this.origin === 'model' ? OK : (this.origin === 'cache' ? BRAND : '#D14343')))
          .letterSpacing(0.6)
          .padding({ left: 7, right: 7, top: 3, bottom: 3 })
          .borderRadius(6)
          .backgroundColor(this.busy() ? '#FFF4E8' : (this.origin === 'model' ? '#E9F7F1' : (this.origin === 'cache' ? '#EEF2FF' : '#FDECEC')))

        Text('收起')
          .fontSize(10.5)
          .fontColor('#8B95AD')
          .padding({ left: 4, right: 2, top: 4, bottom: 4 })
          .onClick(() => this.onClose())
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      /* ---------- pipeline ---------- */
      Column() {
        Row({ space: 7 }) {
          Text('WORKFLOW')
            .fontSize(9.5)
            .fontWeight(FontWeight.Bold)
            .fontColor(FAINT)
            .letterSpacing(1.2)
          Blank()
          Text(this.phase === AgentPhase.FAILED ? '已中断'
            : (this.phase === AgentPhase.DONE ? `共 ${this.steps.length} 步 · ${this.seconds(this.bootMs + this.turnMs)}` : '进行中'))
            .fontSize(9.5)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.phase === AgentPhase.FAILED ? '#D14343' : OK)
        }
        .width('100%')
        .margin({ bottom: 3 })

        ForEach(this.steps, (step: TraceStep, index: number) => {
          this.traceRow(step, index)
        }, (step: TraceStep, index: number) => `${index}-${step.status}-${step.detail}-${step.ms}`)
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 12, bottom: 12 })
      .borderRadius(18)
      .backgroundColor(PAPER)
      .border({ width: 1, color: LINE })
      .shadow({ radius: 20, color: '#12142040', offsetX: 0, offsetY: 8 })

      /* ---------- stream ---------- */
      if (this.stream.length > 0) {
        Column() {
          Row() {
            Text('STREAM')
              .fontSize(9.5)
              .fontWeight(FontWeight.Bold)
              .fontColor(FAINT)
              .letterSpacing(1.2)
            Blank()
            Text(`${this.stream.length} 字`)
              .fontSize(9.5)
              .fontColor('#AEB8CC')
          }
          .width('100%')
          .margin({ bottom: 6 })

          Scroll(this.scroller) {
            Text(this.stream)
              .fontSize(10)
              .lineHeight(15)
              .fontColor('#3E4A6B')
              .width('100%')
          }
          .width('100%')
          .height(78)
          .scrollBar(BarState.Off)
          .align(Alignment.TopStart)
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 10, bottom: 10 })
        .borderRadius(16)
        .backgroundColor('#F4F6FB')
        .border({ width: 1, color: '#0F1A2C14' })
      }

      /* ---------- failure ---------- */
      if (this.failed) {
        Column({ space: 5 }) {
          Text('端侧推理未完成')
            .fontSize(11.5)
            .fontWeight(FontWeight.Bold)
            .fontColor('#B33A3A')
          Text(this.error.length > 0 ? this.error : '未知错误')
            .fontSize(10.5)
            .lineHeight(16)
            .fontColor('#8A5A5A')
          Text('下面是随包数据，不是这次推理的结果。')
            .fontSize(10.5)
            .fontColor('#A08080')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 13, right: 13, top: 11, bottom: 11 })
        .borderRadius(14)
        .backgroundColor('#FDEFEF')
        .border({ width: 1, color: '#2AD14343' })
      }

      /* ---------- answers ---------- */
      if (this.cards.length === 0 && !this.failed) {
        this.skeletonCard(0)
        this.skeletonCard(1)
        this.skeletonCard(2)
        this.skeletonCard(3)
      }

      ForEach(this.cards, (card: InsightCard, index: number) => {
        this.answerCard(card, index)
      }, (card: InsightCard, index: number) => `${this.origin}-${index}-${card.title}`)

      if (this.cards.length > 0) {
        this.conclusionCard()
      }

      /* ---------- footer ---------- */
      Row({ space: 9 }) {
        Text(this.busy() ? '正在端侧推理…' : '换个说法？按当前状态重新生成')
          .fontSize(11)
          .fontColor(this.busy() ? '#A3ADC2' : '#7B849C')
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Row({ space: 4 }) {
          Text('↻')
            .fontSize(11)
            .fontColor(BRAND)
          Text('重新推理')
            .fontSize(11)
            .fontWeight(FontWeight.Bold)
            .fontColor(BRAND)
        }
        .height(28)
        .padding({ left: 11, right: 11 })
        .borderRadius(10)
        .backgroundColor('#EFF3FF')
        .opacity(this.busy() ? 0.45 : 1)
        .onClick(() => {
          if (this.busy()) {
            return
          }
          void TravelAgent.get().run(getContext(this) as common.UIAbilityContext, this.stateIndex, true)
        })
      }
      .width('100%')
      .padding({ left: 4, right: 2, top: 2 })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .padding({ top: 14 })
  }
}
