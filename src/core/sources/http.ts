import { AmtError } from '../errors.js'
import type { HttpClient } from './types.js'

const HEADERS = { 'User-Agent': 'amt (personal job search tool)' }
const TIMEOUT_MS = 30_000

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// Rate limits (429) and transient 5xx are worth backing off and retrying —
// this is what the LinkedIn detail endpoint returns under a burst.
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after')
  const seconds = header ? Number(header) : NaN
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 15_000)
  return 1000 * 2 ** (attempt - 1) // 1s, 2s, …
}

const fetchOnce = (url: string, headers: Record<string, string>): Promise<Response> =>
  fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })

async function request(url: string, headers?: Record<string, string>): Promise<Response> {
  const merged = { ...HEADERS, ...headers }
  let last = 'unknown error'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await fetchOnce(url, merged)
    } catch (error) {
      // Network blip / timeout — back off and retry (last iteration falls through).
      last = error instanceof Error ? error.message : String(error)
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt)
      continue
    }
    if (response.ok) return response
    last = `HTTP ${response.status}`
    if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) break
    await sleep(retryDelay(response, attempt))
  }
  throw new AmtError('SOURCE_UNREACHABLE', `${url}: ${last}`)
}

export const defaultHttpClient: HttpClient = {
  json: async (url, options) => (await request(url, options?.headers)).json(),
  text: async (url, options) => (await request(url, options?.headers)).text(),
}
