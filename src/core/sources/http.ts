import { JobKitError } from '../errors.js'
import type { HttpClient } from './types.js'

const HEADERS = { 'User-Agent': 'job-kit (personal job search tool)' }

async function request(url: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { headers: HEADERS })
  } catch (error) {
    throw new JobKitError(
      'SOURCE_UNREACHABLE',
      `${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!response.ok) {
    throw new JobKitError(
      'SOURCE_UNREACHABLE',
      `${url} responded with HTTP ${response.status}`,
    )
  }
  return response
}

export const defaultHttpClient: HttpClient = {
  json: async url => (await request(url)).json(),
  text: async url => (await request(url)).text(),
}
