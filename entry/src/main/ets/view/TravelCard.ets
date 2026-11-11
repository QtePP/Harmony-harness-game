import { LEG, TRAVEL_STATES, TravelState } from '../travel/TravelModel'

/**
 * The travel status card: one boarding pass that also shows where the trip is.
 *
 * Design notes worth keeping, because each one is a decision:
 *
 * · THE STATE MACHINE IS THE POINT. Six stops, drawn at the bottom of the card
 *   rather than on a separate page. A status card that says "boarding" without
 *   showing what came before and what is left is just a label; the track is
 *   what makes it a machine.
 *
 * · THE CARD IS DARK ON PURPOSE. Everything else in the shell is a light tool
 *   surface. A boarding pass is a physical object, so it gets its own material —
 *   and the light AI page that follows reads as "leaving the object".
 *
 * · ONE WAY IN. The AI button is the only affordance on the card that is not
 *   read-only. Tapping the card does nothing, so there is no ambiguity about
 *   what opens the second page.
 *
 * · NOTCHES MATCH THE PAGE. The two half-circles at the tear line are filled
 *   with PAGE_BG, not with a gradient, so they read as holes. If this card is
 *   ever placed on a different background, that constant has to move with it.
 */

const PAGE_BG = '#F6F7FB'
const CARD_STOPS: Array<[string, number]> = [
  ['#101A3C', 0],
  ['#1D2A63', 0.38],
  ['#2B2F7A', 0.68],
  ['#402C78', 1]
]

const WHITE_HIGH = '#FFFFFFFF'
const WHITE_MID = '#A8FFFFFF'
const WHITE_LOW = '#70FFFFFF'
const WHITE_DIM = '#4DFFFFFF'
const WHITE_FAINT = '#29FFFFFF'
const ACCENT = '#63D6FF'

/**
 * The plane badge's geometry, in vp.
 *
 * The disc is 38 so the plane can be 34 and still sit inside the 1vp rim with
 * a hair of breathing room. Both are named because the wing polygon's vertices
 * are computed from PLANE — hard-coding 34 in six places is how an icon ends up
 * a different size from its own backdrop.
 */
const DISC = 38
const PLANE = 34
const ACCENT_SOFT = '#9D8BFF'
const LIVE = '#43E6A8'

@Component
export struct TravelCard {
  /** Which stop of TRAVEL_STATES the trip is at. */
  @Prop stateIndex: number
  /** Departure and arrival clock for this stop, computed by the host page. */
  @Prop departTime: string
  @Prop arriveTime: string
  /** Opens the AI page. The card itself is not tappable. */
  onAi: () => void = () => {}

  private state(): TravelState {
    const index = Math.max(0, Math.min(this.stateIndex, TRAVEL_STATES.length - 1))
    return TRAVEL_STATES[index]
  }

  /** How far the track's filled portion reaches, as a percentage string. */
  private trackFill(): string {
    const ratio = this.stateIndex / (TRAVEL_STATES.length - 1)
    return `${ratio * 100}%`
  }

  private dashCount(count: number): number[] {
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      out.push(i)
    }
    return out
  }

  /** A run of tick marks. `spread` pushes them to the edges of their row. */
  @Builder
  dashes(count: number) {
    Row() {
      ForEach(this.dashCount(count), (i: number) => {
        Row().width(5).height(1).backgroundColor(WHITE_DIM)
      }, (i: number) => i.toString())
    }
    .width('100%')
    .justifyContent(FlexAlign.SpaceBetween)
  }

  @Builder
  port(code: string, time: string, city: string, terminal: string, alignEnd: boolean) {
    Column() {
      Text(code)
        .fontSize(31)
        .fontWeight(FontWeight.Bold)
        .fontColor(WHITE_HIGH)
        .letterSpacing(-0.5)
      Text(time)
        .fontSize(19)
        .fontWeight(FontWeight.Medium)
        .fontColor(WHITE_HIGH)
        .margin({ top: 9 })
      Text(`${city} ${terminal}`)
        .fontSize(10.5)
        .fontColor(WHITE_LOW)
        .margin({ top: 4 })
    }
    .alignItems(alignEnd ? HorizontalAlign.End : HorizontalAlign.Start)
  }

  /** One meta cell: a small caps label over a tabular figure. */
  @Builder
  metaCell(label: string, value: string) {
    Column({ space: 3 }) {
      Text(label)
        .fontSize(9.5)
        .fontWeight(FontWeight.Bold)
        .fontColor(WHITE_LOW)
        .letterSpacing(1)
      Text(value)
        .fontSize(13)
        .fontWeight(FontWeight.Bold)
        .fontColor(WHITE_HIGH)
    }
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  stepperNode(index: number) {
    Column({ space: 7 }) {
      Stack({ alignContent: Alignment.Center }) {
        if (index === this.stateIndex) {
          // Current stop: a solid dot with a halo, so the eye lands on "now".
          Circle()
            .width(22)
            .height(22)
            .fill('#33FFFFFF')
          Circle()
            .width(11)
            .height(11)
            .fill(WHITE_HIGH)
            .shadow({ radius: 8, color: '#CC8CC0FF', offsetX: 0, offsetY: 0 })
        } else if (index < this.stateIndex) {
          Circle().width(7).height(7).fill(ACCENT)
        } else {
          Circle().width(7).height(7).fill(WHITE_FAINT)
        }
      }
      .width(22)
      .height(22)

      Text(TRAVEL_STATES[index].label)
        .fontSize(9)
        .fontWeight(index === this.stateIndex ? FontWeight.Bold : FontWeight.Medium)
        .fontColor(index === this.stateIndex ? WHITE_HIGH : (index < this.stateIndex ? WHITE_MID : '#57FFFFFF'))
        .maxLines(1)
    }
    .width(46)
    .alignItems(HorizontalAlign.Center)
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() {
        /* ---------- status line ---------- */
        Row() {
          Row({ space: 6 }) {
            Circle().width(6).height(6).fill(LIVE)
            Text(this.state().badge)
              .fontSize(11.5)
              .fontWeight(FontWeight.Bold)
              .fontColor(WHITE_HIGH)
          }
          .height(25)
          .padding({ left: 9, right: 11 })
          .borderRadius(13)
          .backgroundColor('#21FFFFFF')
          .border({ width: 1, color: '#2EFFFFFF' })

          Text(this.state().hint)
            .fontSize(11)
            .fontWeight(FontWeight.Medium)
            .fontColor('#A8FFFFFF')
            .margin({ left: 9 })
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          // The only way into the AI page.
          Row({ space: 5 }) {
            Text('✦')
              .fontSize(12)
              .fontColor('#C9E8FF')
            Text('AI')
              .fontSize(11.5)
              .fontWeight(FontWeight.Bold)
              .fontColor(WHITE_HIGH)
              .letterSpacing(1)
          }
          .height(30)
          .padding({ left: 9, right: 11 })
          .borderRadius(15)
          .backgroundColor('#24FFFFFF')
          .border({ width: 1, color: '#4DFFFFFF' })
          .shadow({ radius: 14, color: '#6690B4FF', offsetX: 0, offsetY: 0 })
          .onClick(() => this.onAi())
        }
        .width('100%')
        .padding({ left: 18, right: 18, top: 18 })

        /* ---------- route ---------- */
        Row() {
          this.port(LEG.fromCode, this.departTime, LEG.fromCity, LEG.fromTerminal, false)

          Column() {
            Row() {
              // Each run gets a weight box: the dash builder is 100% wide, and
              // two 100% children plus the plane would overflow the row.
              Row() {
                this.dashes(7)
              }
              .layoutWeight(1)

              Stack({ alignContent: Alignment.Center }) {
                // A disc with its own gradient, not a flat Circle fill: the
                // badge has to read as a lit object sitting on the dashes, not
                // as a hole punched through the card.
                Column()
                  .width(DISC)
                  .height(DISC)
                  .borderRadius(DISC / 2)
                  .linearGradient({ angle: 140, colors: [['#4C5EA8', 0], ['#2B3670', 1]] })
                  .border({ width: 1, color: '#59FFFFFF' })
                  .shadow({ radius: 14, color: '#8090B4FF', offsetX: 0, offsetY: 2 })
                // Two wings, not one outline. A single polygon that folds back
                // on itself (nose → lower wing → crease → upper wing) reads as
                // a hollow chevron on this renderer; two adjacent triangles that
                // share the crease fill solid and give the fold a visible seam
                // when the lower wing is tinted.
                //
                // Polygon, not Path: path commands rendered hollow here, while
                // explicit points fill correctly.
                Column() {
                  Stack({ alignContent: Alignment.Center }) {
                    // Upper wing — full white. Vertices are fractions of PLANE
                    // so the icon scales with the constant instead of drifting
                    // out of its disc if one of them is retuned.
                    //
                    // Proportions matter here: tail at 0.06 and tip at 0.12 put
                    // the outline at 30 x 26 units, i.e. wider than tall. An
                    // earlier version spread the wings to 0.06..0.94, which
                    // rendered 50 x 69 px on device — a plane standing on its
                    // tail. A right-pointing plane has to read as wider than
                    // tall or it stops looking like a plane at all.
                    Polygon({ width: PLANE, height: PLANE })
                      .points([
                        [PLANE - 2, PLANE / 2],
                        [PLANE * 0.06, PLANE * 0.12],
                        [PLANE * 0.42, PLANE / 2]
                      ])
                      .fill('#FFFFFF')
                      .strokeWidth(0)
                    // Lower wing — one shade down, so the crease reads as a fold
                    // rather than as an accidental seam.
                    Polygon({ width: PLANE, height: PLANE })
                      .points([
                        [PLANE - 2, PLANE / 2],
                        [PLANE * 0.42, PLANE / 2],
                        [PLANE * 0.06, PLANE * 0.88]
                      ])
                      .fill('#CBD5F5')
                      .strokeWidth(0)
                  }
                  .width(PLANE)
                  .height(PLANE)
                }
                .width(PLANE)
                .height(PLANE)
              }
              .width(46)
              .height(38)

              Row() {
                this.dashes(7)
              }
              .layoutWeight(1)
            }
            .width('100%')
            .alignItems(VerticalAlign.Center)

            Text(`${LEG.duration} · 直飞`)
              .fontSize(10)
              .fontColor('#99FFFFFF')
              .margin({ top: 8 })
            Text(`${LEG.flightNo} · ${LEG.aircraft}`)
              .fontSize(10)
              .fontColor('#6EFFFFFF')
              .margin({ top: 3 })
              .maxLines(1)
          }
          .layoutWeight(1)
          .padding({ left: 12, right: 12, top: 4 })
          .alignItems(HorizontalAlign.Center)

          this.port(LEG.toCode, this.arriveTime, LEG.toCity, LEG.toTerminal, true)
        }
        .width('100%')
        .padding({ left: 18, right: 18, top: 18 })
        .alignItems(VerticalAlign.Top)

        /* ---------- tear line ---------- */
        Stack({ alignContent: Alignment.Center }) {
          this.dashes(26)
          Row() {
            Circle().width(16).height(16).fill(PAGE_BG).offset({ x: -8 })
            Circle().width(16).height(16).fill(PAGE_BG).offset({ x: 8 })
          }
          .width('100%')
          .justifyContent(FlexAlign.SpaceBetween)
        }
        .width('100%')
        .height(16)
        .margin({ top: 16 })

        /* ---------- ticket stub ---------- */
        Row() {
          this.metaCell('登机口', this.state().gate)
          Divider().vertical(true).height(22).color('#21FFFFFF')
          this.metaCell('座位', LEG.seat)
          Divider().vertical(true).height(22).color('#21FFFFFF')
          this.metaCell('行李转盘', this.state().belt)
        }
        .width('100%')
        .padding({ left: 18, right: 18, top: 12 })
        .justifyContent(FlexAlign.SpaceBetween)

        /* ---------- state machine ---------- */
        Column() {
          Stack({ alignContent: Alignment.TopStart }) {
            // Base rail, inset by half a column so it starts and ends on the
            // first and last node centres rather than on the card edge.
            Row() {
              Row().width('100%').height(2).backgroundColor('#24FFFFFF')
            }
            .width('100%')
            .padding({ left: 23, right: 23 })
            .margin({ top: 10 })

            Row() {
              Row()
                .width(this.trackFill())
                .height(2)
                .linearGradient({ angle: 90, colors: [[ACCENT, 0], [ACCENT_SOFT, 1]] })
                .shadow({ radius: 6, color: '#8899C8FF', offsetX: 0, offsetY: 0 })
            }
            .width('100%')
            .padding({ left: 23, right: 23 })
            .margin({ top: 10 })

            Row() {
              ForEach(TRAVEL_STATES, (item: TravelState, index: number) => {
                this.stepperNode(index)
              }, (item: TravelState) => item.label)
            }
            .width('100%')
            .justifyContent(FlexAlign.SpaceBetween)
            .alignItems(VerticalAlign.Top)
          }
          .width('100%')
        }
        .width('100%')
        .padding({ left: 18, right: 18, top: 12, bottom: 16 })
        .border({ width: { top: 1 }, color: '#1AFFFFFF' })
        .margin({ top: 14 })
      }
      .width('100%')
    }
    .width('100%')
    .borderRadius(26)
    .linearGradient({ angle: 148, colors: CARD_STOPS })
    .shadow({ radius: 28, color: '#3D172250', offsetX: 0, offsetY: 16 })
  }
}
