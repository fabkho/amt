import { AmtError } from '../errors.js'
import type { HttpClient } from './types.js'

const HEADERS = { 'User-Agent': 'amt (personal job search tool)' }
const TIMEOUT_MS = 30_000

async function request(url: string, headers?: Record<string, string>): Promise<Response> {
  let response: Response
  try {
    response = await fetchWithRetry(url, headers)
  } catch (error) {
    throw new AmtError(
      'SOURCE_UNREACHABLE',
      `${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!response.ok) {
    throw new AmtError(
      'SOURCE_UNREACHABLE',
      `${url} responded with HTTP ${response.status}`,
    )
  }
  return response
}

// One hanging request must never stall the whole crawl; transient network
// blips get exactly one retry.
async function fetchWithRetry(url: string, headers?: Record<string, string>): Promise<Response> {
  const merged = { ...HEADERS, ...headers }
  try {
    return await fetch(url, { headers: merged, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return fetch(url, { headers: merged, signal: AbortSignal.timeout(TIMEOUT_MS) })
  }
}

export const defaultHttpClient: HttpClient = {
  json: async (url, options) => (await request(url, options?.headers)).json(),
  text: async (url, options) => (await request(url, options?.headers)).text(),
}
