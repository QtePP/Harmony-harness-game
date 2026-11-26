import { http } from '@kit.NetworkKit'

/**
 * Loopback fast path for the native board.
 *
 * The Sanguo plugin listens on 127.0.0.1:4519 and resolves a turn with the same
 * engine the `sanguo_*` tools use. A tap on 去做 / 等一等 / an option can
 * therefore commit without a model round-trip. Every failure returns null and
 * the caller falls back to the normal chat turn, so an old payload (no local
 * API) plays exactly as before.
 */
export interface SanguoLocalReply {
  ok?: boolean
  rendered?: string
  error?: string
}

/** One request body; all endpoints share the workspace field. */
interface LocalBody {
  workspace: string
  attribute?: string
  difficulty?: number
  intent?: string
  turns?: number
  option?: string
}

const BASE = 'http://127.0.0.1:4519'

async function post(path: string, body: LocalBody): Promise<SanguoLocalReply | null> {
  const request = http.createHttp()
  try {
    const response = await request.request(`${BASE}${path}`, {
      method: http.RequestMethod.POST,
      header: { 'Content-Type': 'application/json' },
      extraData: JSON.stringify(body),
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: 800,
      readTimeout: 2500
    })
    if (response.responseCode !== 200) {
      return null
    }
    const raw = response.result
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
    return JSON.parse(text) as SanguoLocalReply
  } catch (_error) {
    return null
  } finally {
    request.destroy()
  }
}

/** Resolve an ability scene with the board's default attribute/difficulty. */
export async function localAct(
  workspace: string,
  attribute: string,
  difficulty: number,
  intent: string
): Promise<SanguoLocalReply | null> {
  const body: LocalBody = { workspace, attribute, difficulty, intent }
  return post('/act', body)
}

/** Let one season pass. */
export async function localAdvance(
  workspace: string,
  turns: number
): Promise<SanguoLocalReply | null> {
  const body: LocalBody = { workspace, turns }
  return post('/advance', body)
}

/** Pick a declared moral option by id. */
export async function localChoose(
  workspace: string,
  option: string
): Promise<SanguoLocalReply | null> {
  const body: LocalBody = { workspace, option }
  return post('/choose', body)
}
