import { common } from '@kit.AbilityKit'
import { fileIo as fs } from '@kit.CoreFileKit'
import { AppConfig } from '../common/AppConfig'
import { BootPhase, NodeHost } from '../host/NodeHost'
import { RenderedBlock, renderBlocks } from '../model/DshClient'
import { EventLike, SessionEventPayload } from '../model/Protocol'
import { newSessionId } from '../model/ChatModel'
import { TRAVEL_STATES, TravelInsight } from './TravelModel'
import { buildPrompt, parseInsight } from './TravelPrompt'

/**
 * Drives one live inference for the travel card.
 *
 * Why a class instead of doing this in the page: the page is re-created every
 * time the AI sheet opens, but the runtime behind it is a process-wide
 * singleton. This object owns the single in-flight turn, the accumulated text
 * and the per-state cache, so reopening the sheet is instant and switching the
 * card's state is a cache lookup rather than a second boot.
 *
 * The flow is the real one, not a simulation:
 *   boot the in-process Node runtime → connect the loopback bridge →
 *   open a session → prompt `deepseek-v4-flash` → stream `session.event` →
 *   parse the JSON answer into cards.
 *
 * Only one turn may be in flight: `session/prompt` enqueues, and interleaving
 * two turns on one session would mix their `session.event` streams.
 */

/**
 * One line of the workflow trace. Mirrors the chat shell's tool rows: a label,
 * what it produced, how long it took, and whether it failed.
 */
export class TraceStep {
  label: string
  detail: string = ''
  /** 'run' while in flight, then 'done' or 'fail'. */
  status: string = 'run'
  ms: number = 0
  startedAt: number = 0

  constructor(label: string) {
    this.label = label
    this.startedAt = Date.now()
  }
}

/** On-disk shape of one cached answer. */
class DiskEntry {
  savedAt: number = 0
  insight: TravelInsight | null = null
}

export enum AgentPhase {
  IDLE = 'idle',
  BOOTING = 'booting',
  ASKING = 'asking',
  DONE = 'done',
  FAILED = 'failed'
}

/** How long one turn may take before we call it a failure. */
const TURN_TIMEOUT_MS = 120000
/** Keep the on-screen stream bounded; reasoning blocks can be long. */
const STREAM_CAP = 1600

export class TravelAgent {
  private static instance: TravelAgent = new TravelAgent()

  static get(): TravelAgent {
    return TravelAgent.instance
  }

  phase: AgentPhase = AgentPhase.IDLE
  /** Human-readable stage, straight from the host's boot callback. */
  detail: string = ''
  /** Everything the model has emitted this turn, for the live stream view. */
  stream: string = ''
  error: string = ''
  /** Milliseconds spent booting and reasoning, for the pipeline readout. */
  bootMs: number = 0
  turnMs: number = 0
  insight: TravelInsight | null = null
  /** Which card state `insight` belongs to. */
  stateIndex: number = -1
  /** True once the in-process runtime answered its handshake. */
  booted: boolean = false
  /** True when the current insight came from the cache, not a fresh turn. */
  fromCache: boolean = false
  /** The workflow trace the panel renders. */
  trace: TraceStep[] = []
  /** When the on-disk answer was written, for the header readout. */
  cachedAt: number = 0
  /** Which state the current trace describes. */
  private traceState: number = -1

  onUpdate: (() => void) | null = null

  private cache: Map<number, TravelInsight> = new Map<number, TravelInsight>()
  /** Text blocks only — the JSON we parse. Reasoning stays out of it. */
  private answer: string = ''
  private sessionId: string = ''
  private busy: boolean = false
  private attached: boolean = false
  private settle: ((ok: boolean) => void) | null = null
  private timer: number = -1
  private turnError: string = ''
  /** One shared warm-up, so the home page and the sheet never race on boot. */
  private warm: Promise<void> | null = null
  /** A state asked for while a turn was already running; replayed when it ends. */
  private pending: number = -1
  private lastContext: common.UIAbilityContext | null = null

  private notify(): void {
    if (this.onUpdate !== null) {
      this.onUpdate()
    }
  }

  /** Duration readout for the trace rows. */
  private seconds(ms: number): string {
    if (ms <= 0) {
      return '—'
    }
    return `${(ms / 1000).toFixed(1)}s`
  }

  /**
   * Boot the runtime before anyone asks for it, then prepare the state the card
   * starts on.
   *
   * Booting is the expensive half (unpack check, node::Start, bridge connect,
   * handshake) and it does not depend on which card state is on screen. Doing
   * it at page appear — not on the AI tap — is what makes the first tap a paint
   * instead of a wait. The turn for `state` runs in the background for the same
   * reason: by the time the panel opens, the answer is already in the cache.
   */
  warmUp(context: common.UIAbilityContext, state: number): Promise<void> {
    if (this.warm === null) {
      this.warm = this.doWarmUp(context, state)
    }
    return this.warm
  }

  private async doWarmUp(context: common.UIAbilityContext, state: number): Promise<void> {
    if (NodeHost.get().phase === BootPhase.READY) {
      this.booted = true
      this.notify()
      return
    }
    const startedAt = Date.now()
    this.phase = AgentPhase.BOOTING
    this.detail = '启动端侧运行时…'
    this.notify()
    try {
      await AppConfig.load(context)
      await NodeHost.get().boot(context, (phase: BootPhase, detail: string) => {
        this.detail = detail
        this.notify()
      })
    } catch (error) {
      this.booted = false
    }
    // Re-read into a fresh binding: the early return above narrows the property
    // access, and the compiler then refuses the later READY comparison.
    const settled: BootPhase = NodeHost.get().phase
    this.booted = settled === BootPhase.READY
    this.bootMs = Date.now() - startedAt
    if (this.phase === AgentPhase.BOOTING) {
      this.phase = this.booted ? AgentPhase.IDLE : AgentPhase.FAILED
      if (!this.booted) {
        this.error = NodeHost.get().detail
      }
    }
    this.notify()
    if (this.booted) {
      // Fire and forget: the panel reads the result from the cache.
      void this.run(context, state, false)
    }
  }

  /** Cached answer for a state, if the runtime already produced one. */
  cached(state: number): TravelInsight | null {
    const hit = this.cache.get(state)
    return hit === undefined ? null : hit
  }

  /**
   * Warm one state's answer without touching what the panel is showing.
   *
   * This is what makes switching the card's state feel instant: the tap runs
   * this in the background, so by the time the user opens the panel the answer
   * is already cached. It deliberately does NOT go through run() — run() sets
   * `phase`/`insight`, which would make the panel flash a loading state for a
   * card the user has not asked to see yet.
   *
   * Silent on failure: a prefetch that cannot run is not an error the user
   * should ever see. The real tap will surface it.
   */
  async prepare(context: common.UIAbilityContext, state: number): Promise<void> {
    if (this.cache.has(state) || this.busy || this.phase === AgentPhase.BOOTING) {
      return
    }
    await this.warmUp(context, state)
    if (!this.booted) {
      return
    }
    // Re-check: warmUp may have already queued this state, and another tap may
    // have started a turn while we awaited.
    if (this.cache.has(state) || this.busy) {
      return
    }
    try {
      await this.run(context, state, false)
    } catch (error) {
      // Prefetch failures are invisible by design.
    }
  }

  /**
   * Produce cards for one state.
   *
   * Three ways this can end, in order of preference: an answer already in
   * memory, an answer saved in the workspace from an earlier run, or a fresh
   * turn. The trace below records which one happened, because "where did these
   * cards come from" is the question a card like this has to be able to answer.
   */
  async run(context: common.UIAbilityContext, state: number, force: boolean): Promise<void> {
    this.lastContext = context
    if (this.busy) {
      // One turn at a time: interleaving two prompts on the bridge would mix
      // their event streams. Remember the request and replay it when free.
      if (state !== this.stateIndex) {
        this.pending = state
      }
      return
    }

    if (!force) {
      const hit = this.cache.get(state)
      if (hit !== undefined) {
        this.paintCached(state, hit, '内存缓存')
        return
      }
      const saved = this.readWorkspace(context, state)
      if (saved !== null) {
        this.cache.set(state, saved)
        this.paintCached(state, saved, 'workspace 缓存')
        return
      }
    }

    this.busy = true
    this.stateIndex = state
    this.insight = null
    this.error = ''
    this.fromCache = false
    this.stream = ''
    this.answer = ''
    this.turnError = ''
    this.trace = []
    this.traceState = state
    this.phase = AgentPhase.BOOTING
    this.detail = this.booted ? '组装卡片上下文…' : '启动端侧运行时…'
    this.notify()

    let step: TraceStep | null = null
    try {
      if (!this.booted) {
        step = this.begin('启动端侧 dsh 运行时')
        await this.warmUp(context, state)
        const hostReady = NodeHost.get()
        if (hostReady.phase !== BootPhase.READY) {
          throw new Error(hostReady.detail.length === 0 ? '端侧运行时启动失败' : hostReady.detail)
        }
        this.settleStep(step, `内嵌 Node · ${this.seconds(this.bootMs)}`, false)
        step = null
      }
      const host = NodeHost.get()

      step = this.begin('组装卡片上下文')
      const promptText = buildPrompt(state, new Date())
      this.settleStep(step, `状态 ${TRAVEL_STATES[state].badge} · ${promptText.length} 字`, false)
      step = null

      this.attach()
      // One session for the whole app run: a fresh id makes the runtime build
      // an agent from scratch every turn, which costs more than the answer.
      if (this.sessionId.length === 0) {
        this.sessionId = newSessionId()
      }
      step = this.begin('打开会话')
      this.settleStep(step, this.sessionId.substring(0, 8), false)
      step = null

      this.phase = AgentPhase.ASKING
      this.detail = '请求 deepseek-v4-flash…'
      this.notify()

      step = this.begin('请求 deepseek-v4-flash')
      const turnStart = Date.now()
      const finished = new Promise<boolean>((resolve) => {
        this.settle = (ok: boolean) => {
          resolve(ok)
        }
      })
      await host.client.prompt(this.sessionId, promptText)
      this.timer = setTimeout(() => {
        this.finish(false)
      }, TURN_TIMEOUT_MS)
      this.settleStep(step, '已入队', false)
      step = this.begin('接收流式输出')

      const ok = await finished
      this.turnMs = Date.now() - turnStart
      this.settleStep(step, `${this.stream.length} 字`, !ok)
      step = null

      if (!ok) {
        throw new Error(this.turnError.length > 0 ? this.turnError : '推理超时或回合中断')
      }

      step = this.begin('解析 JSON')
      const parsed = parseInsight(this.answer)
      if (parsed === null) {
        throw new Error('模型输出无法解析为卡片')
      }
      this.settleStep(step, `${parsed.cards.length} 张卡`, false)
      step = null

      this.cache.set(state, parsed)
      this.writeWorkspace(context, state, parsed)
      this.insight = parsed
      this.phase = AgentPhase.DONE
    } catch (error) {
      if (step !== null) {
        this.settleStep(step, (error as Error).message, true)
      }
      this.error = (error as Error).message
      this.phase = AgentPhase.FAILED
    } finally {
      this.busy = false
      this.notify()
      const next = this.pending
      this.pending = -1
      if (next >= 0 && next !== state && this.lastContext !== null) {
        void this.run(this.lastContext, next, false)
      }
    }
  }

  /** Paint an answer that did not cost a turn, with the trace saying why. */
  private paintCached(state: number, insight: TravelInsight, source: string): void {
    this.stateIndex = state
    this.insight = insight
    this.phase = AgentPhase.DONE
    this.error = ''
    this.fromCache = true
    // Keep the trace of how this state was produced when we still have it: the
    // workflow is the explanation, and a cache hit should not erase it.
    let kept: TraceStep[] = []
    if (this.traceState === state) {
      // Do not stack one "命中缓存" row per open: keep at most one.
      kept = this.trace.length > 0 && this.trace[0].label === '命中缓存'
        ? this.trace.slice(1) : this.trace.slice()
    }
    const step = new TraceStep('命中缓存')
    step.status = 'done'
    step.detail = source
    step.ms = 0
    this.trace = [step].concat(kept)
    this.traceState = state
    this.notify()
  }

  private begin(label: string): TraceStep {
    const step = new TraceStep(label)
    this.trace = this.trace.concat([step])
    this.notify()
    return step
  }

  private settleStep(step: TraceStep, detail: string, failed: boolean): void {
    step.status = failed ? 'fail' : 'done'
    step.detail = detail
    step.ms = Date.now() - step.startedAt
    this.trace = this.trace.slice()
    this.notify()
  }

  /* ---------------------------------------------------------------- */
  /* Workspace persistence                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Answers live in the agent's workspace, not only in memory: the runtime and
   * the cards it produced are both things the user already paid for, so a
   * restart should not buy them twice.
   */
  private workspaceFile(context: common.UIAbilityContext, state: number): string {
    return `${context.filesDir}/workspace/travel-cache/state-${state}.json`
  }

  private readWorkspace(context: common.UIAbilityContext, state: number): TravelInsight | null {
    try {
      const path = this.workspaceFile(context, state)
      if (!fs.accessSync(path)) {
        return null
      }
      const text = fs.readTextSync(path)
      const entry = JSON.parse(text) as DiskEntry
      this.cachedAt = entry.savedAt
      if (entry.insight === null || entry.insight === undefined) {
        return null
      }
      // Re-normalise through the same parser the model's answer goes through,
      // so a hand-edited or older cache file cannot inject a different shape.
      const parsed = parseInsight(JSON.stringify(entry.insight))
      if (parsed === null) {
        return null
      }
      parsed.origin = 'cache'
      return parsed
    } catch (error) {
      return null
    }
  }

  private writeWorkspace(context: common.UIAbilityContext, state: number, insight: TravelInsight): void {
    try {
      const dir = `${context.filesDir}/workspace/travel-cache`
      if (!fs.accessSync(dir)) {
        fs.mkdirSync(dir)
      }
      const entry = new DiskEntry()
      entry.savedAt = Date.now()
      entry.insight = insight
      const path = this.workspaceFile(context, state)
      const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC)
      fs.writeSync(file.fd, JSON.stringify(entry))
      fs.closeSync(file)
      this.cachedAt = entry.savedAt
    } catch (error) {
      // A failed write only costs a re-inference next launch.
    }
  }

  /**
   * Subscribe to the bridge once. The runtime broadcasts every session's
   * events, so each handler filters on our own session id.
   */
  private attach(): void {
    if (this.attached) {
      return
    }
    this.attached = true
    NodeHost.get().client.onEvent = (payload: SessionEventPayload) => {
      this.onEvent(payload)
    }
  }

  private onEvent(payload: SessionEventPayload): void {
    if (payload.sessionId !== this.sessionId) {
      return
    }
    const event: EventLike | undefined = payload.event
    if (event === undefined) {
      return
    }
    const type = event.type === undefined ? '' : event.type

    if (type === 'assistant/message') {
      const blocks: RenderedBlock[] = renderBlocks(event)
      let appended = false
      for (const block of blocks) {
        if (block.kind === 'text') {
          this.answer += block.text
          appended = true
        } else if (block.kind === 'reasoning') {
          appended = true
        }
        if (block.kind === 'text' || block.kind === 'reasoning') {
          this.stream += block.text
        }
      }
      if (this.stream.length > STREAM_CAP) {
        this.stream = this.stream.substring(this.stream.length - STREAM_CAP)
      }
      if (appended) {
        this.notify()
      }
      return
    }

    if (type === 'turn/end') {
      const reason = event.data?.reason
      if (reason !== undefined && reason.error !== undefined) {
        const message = reason.error.message
        this.turnError = message === undefined || message.length === 0 ? '回合失败' : message
      }
      this.finish(this.turnError.length === 0)
    }
  }

  /** Settle the waiting turn exactly once. */
  private finish(ok: boolean): void {
    if (this.timer > 0) {
      clearTimeout(this.timer)
      this.timer = -1
    }
    const settle = this.settle
    this.settle = null
    if (settle !== null) {
      settle(ok)
    }
  }

  /** Drop the cache so the next open re-runs inference. */
  invalidate(): void {
    this.cache.clear()
  }
}
