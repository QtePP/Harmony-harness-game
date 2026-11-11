import { common } from '@kit.AbilityKit'
import { TravelCard } from '../view/TravelCard'
import { TravelInsightPanel } from '../view/TravelInsightPanel'
import { TravelAgent } from '../travel/TravelAgent'
import { flightTimes, LEG, TRAVEL_STATES, TravelState } from '../travel/TravelModel'

/**
 * The demo host: one travel card on a light page, with the AI answers growing
 * directly underneath it.
 *
 * This page exists so the card can be looked at on a device without the chat
 * shell in the way. Everything it draws around the card (greeting, 行前提醒,
 * 落地之后, the state-machine switch) is context for the demo — the components
 * under `view/` are the deliverable and carry no knowledge of this page.
 *
 * Two decisions worth keeping:
 *
 * · THE ANSWERS EXPAND IN PLACE. Tapping AI does not push a page; the panel
 *   opens under the card and the scroll position stays. The user's context is
 *   the card, so the answer belongs next to it.
 *
 * · THE RUNTIME WARMS UP ON APPEAR. Booting is the slow half and does not
 *   depend on the state, so it runs while the user is still reading the card.
 *   By the time AI is tapped, only the turn is left to wait for.
 */

const PAGE_BG = '#F6F7FB'
const INK = '#0D1220'
const INK_2 = '#3D465C'
const INK_3 = '#7B849C'
const FAINT = '#98A2BB'
const PAPER = '#FFFFFF'
const BRAND = '#2F5BFF'
const VIOLET = '#7A5CFF'
const LINE = '#121A2C0F'

interface MiniFact {
  label: string
  value: string
  note: string
}

const MINI_FACTS: MiniFact[] = [
  { label: '成都 · 今日', value: '14° / 20°', note: '多云转小雨' },
  { label: '落地后', value: '58 km', note: '天府机场 → 市区' }
]

interface PlanRow {
  time: string
  title: string
  note: string
  hot: boolean
}

const PLAN: PlanRow[] = [
  { time: '17:40', title: '酒店入住', note: '春熙路 · 天府机场出发 58 km', hot: false },
  { time: '19:00', title: '宽窄巷子', note: '小雨，建议带伞 · 步行 20 分钟可逛完', hot: true },
  { time: '20:30', title: '火锅 · 蜀大侠', note: '需提前取号，晚市 18:30 开始排队', hot: false }
]

@Entry
@Component
struct TravelDemo {
  /** Which stop of the machine the card is showing. Starts at 登机. */
  @State stateIndex: number = 3
  @State aiOpen: boolean = false
  /** The leg's clock for the current stop; recomputed whenever the stop moves. */
  @State departTime: string = ''
  @State arriveTime: string = ''
  @State planTimes: string[] = ['', '', '']

  /** Anchor the card's clock to now, so the state and the times never disagree. */
  private syncClock(): void {
    const now = new Date()
    const times = flightTimes(this.stateIndex, now)
    this.departTime = times.departText
    this.arriveTime = times.arriveText
    const plan = [40, 120, 210]
    const out: string[] = []
    for (const offset of plan) {
      const when = new Date(times.arrive.getTime() + offset * 60000)
      out.push(`${when.getHours() < 10 ? '0' : ''}${when.getHours()}:${when.getMinutes() < 10 ? '0' : ''}${when.getMinutes()}`)
    }
    this.planTimes = out
  }

  aboutToAppear(): void {
    this.syncClock()
    // The runtime is part of the app, not of the AI tap: boot it and prepare
    // the state the card opens on, while the user is still reading the card.
    void TravelAgent.get().warmUp(getContext(this) as common.UIAbilityContext, this.stateIndex)
  }

  @Builder
  header() {
    Row() {
      Column({ space: 5 }) {
        Text('THURSDAY · 11 / 05')
          .fontSize(11)
          .fontWeight(FontWeight.Bold)
          .fontColor(FAINT)
          .letterSpacing(1.6)
        Text(`今天飞${LEG.toCity.substring(0, 2)}`)
          .fontSize(23)
          .fontWeight(FontWeight.Bold)
          .fontColor(INK)
          .letterSpacing(-0.4)
      }
      .alignItems(HorizontalAlign.Start)

      Blank()

      // A box, not a Circle: gradients paint the background of a box, while a
      // shape's colour comes from fill().
      Column()
        .width(36)
        .height(36)
        .borderRadius(18)
        .linearGradient({ angle: 140, colors: [['#C9D6FF', 0], ['#E8D6FF', 1]] })
        .border({ width: 1, color: '#E6FFFFFF' })
    }
    .width('100%')
    .padding({ left: 6, right: 6, bottom: 16 })
    .alignItems(VerticalAlign.Bottom)
  }

  @Builder
  sectionTitle(title: string, trailing: string) {
    Row() {
      Text(title)
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor(INK)
      Blank()
      Text(trailing)
        .fontSize(11)
        .fontWeight(FontWeight.Medium)
        .fontColor(FAINT)
    }
    .width('100%')
    .padding({ left: 6, right: 6, top: 26, bottom: 12 })
  }

  @Builder
  miniCard(fact: MiniFact) {
    Column({ space: 7 }) {
      Text(fact.label)
        .fontSize(10)
        .fontWeight(FontWeight.Bold)
        .fontColor(FAINT)
        .letterSpacing(0.8)
      Text(fact.value)
        .fontSize(15)
        .fontWeight(FontWeight.Bold)
        .fontColor(INK)
      Text(fact.note)
        .fontSize(10.5)
        .fontColor('#8B95AD')
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
    .padding({ left: 14, right: 14, top: 13, bottom: 13 })
    .borderRadius(18)
    .backgroundColor(PAPER)
    .border({ width: 1, color: LINE })
    .shadow({ radius: 20, color: '#12142040', offsetX: 0, offsetY: 8 })
  }

  @Builder
  planRow(row: PlanRow, index: number) {
    Row({ space: 11 }) {
      Text(this.planTimes.length > index ? this.planTimes[index] : row.time)
        .fontSize(11)
        .fontWeight(FontWeight.Bold)
        .fontColor(row.hot ? BRAND : '#8B95AD')
        .width(38)
      Circle()
        .width(6)
        .height(6)
        .fill(row.hot ? BRAND : '#CFD8EA')
        .margin({ top: 5 })
      Column({ space: 2 }) {
        Text(row.title)
          .fontSize(12)
          .fontWeight(FontWeight.Bold)
          .fontColor(INK)
        Text(row.note)
          .fontSize(10.5)
          .fontColor(FAINT)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .padding({ top: 11, bottom: 11 })
  }

  @Builder
  stateSwitch() {
    Column({ space: 10 }) {
      Row() {
        Text('状态机演示')
          .fontSize(10)
          .fontWeight(FontWeight.Bold)
          .fontColor(FAINT)
          .letterSpacing(1.4)
        Blank()
        Text('点右上角 AI 进二级页')
          .fontSize(10)
          .fontColor('#AEB8CC')
      }
      .width('100%')

      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(TRAVEL_STATES, (state: TravelState, index: number) => {
          Text(state.badge)
            .fontSize(11.5)
            .fontWeight(FontWeight.Medium)
            .fontColor(index === this.stateIndex ? '#FFFFFF' : '#5A6480')
            .padding({ left: 13, right: 13, top: 7, bottom: 7 })
            .borderRadius(15)
            .backgroundColor(index === this.stateIndex ? '#00000000' : '#FFFFFF')
            .linearGradient(index === this.stateIndex
              ? { angle: 120, colors: [[BRAND, 0], [VIOLET, 1]] }
              : { angle: 120, colors: [['#FFFFFF', 0], ['#FFFFFF', 1]] })
            .border({ width: 1, color: index === this.stateIndex ? '#00000000' : LINE })
            .margin({ right: 7, top: 7 })
            .onClick(() => {
              this.stateIndex = index
              // Prefetch the new state's answer in the background. Without this
              // the cache only ever holds the state the page opened on, so the
              // first tap after a switch still pays for a whole turn — exactly
              // the wait warm-up exists to remove.
              void TravelAgent.get().prepare(getContext(this) as common.UIAbilityContext, index)
            })
        }, (state: TravelState) => state.badge)
      }
      .width('100%')
    }
    .width('100%')
    .margin({ top: 26 })
    .padding({ left: 2, right: 2 })
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Scroll() {
        Row() {
          Column() {
            this.header()

            TravelCard({
              stateIndex: this.stateIndex,
              departTime: this.departTime,
              arriveTime: this.arriveTime,
              onAi: () => {
                this.aiOpen = !this.aiOpen
              }
            })

            // The answers grow right here, under the card they came from.
            if (this.aiOpen) {
              TravelInsightPanel({
                stateIndex: this.stateIndex,
                onClose: () => {
                  this.aiOpen = false
                }
              })
                .transition(TransitionEffect.OPACITY.animation({ duration: 220, curve: Curve.EaseOut })
                  .combine(TransitionEffect.translate({ y: -10 }).animation({ duration: 260, curve: Curve.FastOutSlowIn })))
            }

            this.sectionTitle('行前提醒', `共 ${MINI_FACTS.length} 条`)
            Row({ space: 10 }) {
              ForEach(MINI_FACTS, (fact: MiniFact) => {
                this.miniCard(fact)
              }, (fact: MiniFact) => fact.label)
            }
            .width('100%')

            Row({ space: 10 }) {
              Stack({ alignContent: Alignment.Center }) {
                Text('✦').fontSize(13).fontColor('#FFFFFF')
              }
              .width(26)
              .height(26)
              .borderRadius(9)
              .linearGradient({ angle: 140, colors: [['#5B7CFF', 0], ['#A06BFF', 1]] })

              Text('这张卡片右上角的 AI 会自己读完行程，把目的地该知道的四件事摆出来 —— 不用你问。')
                .fontSize(11.5)
                .lineHeight(17)
                .fontColor('#4A5470')
                .layoutWeight(1)
            }
            .width('100%')
            .padding({ left: 14, right: 14, top: 13, bottom: 13 })
            .borderRadius(18)
            .linearGradient({ angle: 100, colors: [['#EEF2FF', 0], ['#F7F0FF', 1]] })
            .border({ width: 1, color: '#247A5CFF' })
            .margin({ top: 20 })
            .alignItems(VerticalAlign.Center)

            this.sectionTitle('落地之后', `${LEG.toCity.substring(0, 2)} · 11/05`)
            Column() {
              ForEach(PLAN, (row: PlanRow, index: number) => {
                if (index > 0) {
                  Divider().color('#0D14211F').strokeWidth(1)
                }
                this.planRow(row, index)
              }, (row: PlanRow) => row.title)
            }
            .width('100%')
            .padding({ left: 15, right: 15, top: 6, bottom: 6 })
            .borderRadius(20)
            .backgroundColor(PAPER)
            .border({ width: 1, color: LINE })
            .shadow({ radius: 20, color: '#12142040', offsetX: 0, offsetY: 8 })

            this.stateSwitch()
          }
          .width('100%')
          .padding({ left: 16, right: 16, top: 14, bottom: 30 })
          .constraintSize({ maxWidth: 620 })
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
      }
      .width('100%')
      .height('100%')
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(PAGE_BG)
  }
}
