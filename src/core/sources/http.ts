import { AmtError } from '../errors.js'
import type { HttpClient } from './types.js'

const HEADERS = { 'User-Agent': 'amt (personal job search tool)' }
const TIMEOUT_MS = 30_000

async function request(url: string): Promise<Response> {
  let response: Response
  try {
    response = await fetchWithRetry(url)
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
async function fetchWithRetry(url: string): Promise<Response> {
  try {
    return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  }
}

export const defaultHttpClient: HttpClient = {
  json: async url => (await request(url)).json(),
  text: async url => (await request(url)).text(),
}
