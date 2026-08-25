import { parse as parseHtml } from 'node-html-parser'
import type { ChannelCrawl, ChannelSource } from '../sources-store.js'
import type { HttpClient, JobPosting } from './types.js'

// The channel engine: turns a machine-usable recipe (sources.yaml `crawl`)
// into JobPostings, run through the exact same ingest pipeline as boards.
// Site specifics stay data in the recipe; this file is a generic engine.

export function isCrawlableChannel(channel: ChannelSource): boolean {
  return channel.crawl !== undefined
}

const MAX_URLS = 40

/** Cartesian expansion of {keyword}, {city}, and every declared variant. */
function buildUrls(spec: ChannelCrawl, stacks: string[], cities: string[]): string[] {
  const axes: { token: string; values: string[] }[] = []
  if (spec.urlTemplate.includes('{keyword}')) {
    const kw = spec.keywords === 'stacks' || spec.keywords === undefined ? stacks : spec.keywords
    axes.push({ token: 'keyword', values: kw.length > 0 ? kw : [''] })
  }
  if (spec.urlTemplate.includes('{city}')) {
    axes.push({ token: 'city', values: cities.length > 0 ? cities : ['deutschland'] })
  }
  for (const [token, values] of Object.entries(spec.variants ?? {})) {
    if (spec.urlTemplate.includes(`{${token}}`)) axes.push({ token, values })
  }

  let combos: Record<string, string>[] = [{}]
  for (const axis of axes) {
    combos = combos.flatMap(c => axis.values.map(v => ({ ...c, [axis.token]: v })))
  }
  const urls = combos.map(combo =>
    Object.entries(combo).reduce(
      (url, [token, value]) => url.replaceAll(`{${token}}`, encodeURIComponent(value)),
      spec.urlTemplate,
    ),
  )
  return [...new Set(urls)].slice(0, MAX_URLS)
}

interface FieldSpec {
  selector?: string
  attr?: string
  path?: string
  regex?: string
}

function normField(field: string | FieldSpec, mode: string): FieldSpec {
  if (typeof field !== 'string') return field
  // A bare string means the natural locator for the mode.
  if (mode === 'json') return { path: field }
  if (mode === 'regex') return { regex: field }
  return { selector: field }
}

function applyRegex(text: string, pattern: string): string | null {
  const m = new RegExp(pattern).exec(text)
  return m ? (m[1] ?? m[0]) : null
}

function dotPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  )
}

type HtmlNode = ReturnType<typeof parseHtml>

/** Scalars only — a JSON path landing on an object/array is a misconfigured field. */
function scalarString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

const withRegex = (value: string | null, regex?: string): string | null =>
  value === null ? null : regex ? applyRegex(value, regex) : value

function fromJson(item: unknown, spec: FieldSpec): string | null {
  return withRegex(scalarString(spec.path ? dotPath(item, spec.path) : item), spec.regex)
}

function fromSelector(item: unknown, spec: FieldSpec): string | null {
  const node = item as HtmlNode
  const found = spec.selector ? node.querySelector(spec.selector) : node
  if (!found) return null
  const raw = spec.attr ? found.getAttribute(spec.attr) ?? null : found.text.trim()
  return withRegex(raw, spec.regex)
}

/** Extract one field from an item (an HTML node, a JSON value, or a text blob). */
function extractField(item: unknown, spec: FieldSpec, mode: string): string | null {
  if (mode === 'json') return fromJson(item, spec)
  if (mode === 'regex') return withRegex(scalarString(item) ?? '', spec.regex)
  return fromSelector(item, spec)
}

function itemsFrom(body: string, spec: ChannelCrawl): unknown[] {
  const mode = spec.mode ?? 'selectors'
  if (mode === 'json') {
    const data = JSON.parse(body) as unknown
    const arr = spec.item ? dotPath(data, spec.item) : data
    return Array.isArray(arr) ? arr : []
  }
  if (mode === 'regex') {
    if (!spec.item) return []
    return [...body.matchAll(new RegExp(spec.item, 'g'))].map(m => m[0])
  }
  // selectors
  const root = parseHtml(body)
  return spec.item ? root.querySelectorAll(spec.item) : [root]
}

function toPosting(item: unknown, spec: ChannelCrawl, source: string): JobPosting | null {
  const fields = spec.fields ?? {}
  const mode = spec.mode ?? 'selectors'
  const get = (name: string): string | null => {
    const f = fields[name]
    return f === undefined ? null : extractField(item, normField(f, mode), mode)
  }
  const title = get('title')
  const url = get('url')
  if (!title || !url) return null // an item without a title or link is noise

  const company = get('company') ?? source
  // nativeId: dedicated extractor (regex on the url, or a field), else the url.
  let nativeId = url
  if (spec.nativeId?.field) nativeId = get(spec.nativeId.field) ?? url
  if (spec.nativeId?.regex) nativeId = applyRegex(nativeId, spec.nativeId.regex) ?? url

  return {
    source,
    nativeId,
    company: company.replaceAll(/\s+/g, ' ').trim(),
    title: title.replaceAll(/\s+/g, ' ').trim(),
    url: url.split('?')[0] ?? url, // drop tracking query params
    descriptionHtml: null, // fetched per new posting via detail
    location: get('location'),
    workMode: null, // channels rarely expose a reliable mode; agent/filters decide
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    publishedAt: null,
    tags: [],
  }
}

const REQUEST_DELAY_MS = 400
const DETAIL_DELAY_MS = 350

async function fetchBody(
  client: HttpClient,
  url: string,
  spec: ChannelCrawl,
): Promise<string> {
  if (spec.render === true) return renderHtml(url, spec.headers)
  return client.text(url, { headers: spec.headers })
}

/** Fetch a JS-rendered page via the bundled Chromium. Lazy-loaded — most
 *  channels never need it, and Playwright is a heavy import. */
async function renderHtml(url: string, headers?: Record<string, string>): Promise<string> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext(headers ? { extraHTTPHeaders: headers } : {})
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    return await page.content()
  } finally {
    await browser.close()
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Append an offset query param to a URL, respecting an existing query string. */
function withOffset(url: string, param: string, offset: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}${param}=${offset}`
}

/** Fetch one base URL, walking offset pages when `paginate` is set. Adds new
 *  postings into `byId`; a page yielding nothing new (empty or all-seen) ends
 *  the walk, so a short result tail costs one extra request, not `maxPages`. */
async function fetchInto(
  client: HttpClient,
  channel: ChannelSource,
  spec: ChannelCrawl,
  baseUrl: string,
  byId: Map<string, JobPosting>,
  pace: () => Promise<void>,
): Promise<void> {
  const pg = spec.paginate
  const pages = pg?.maxPages ?? 1
  for (let page = 0; page < pages; page++) {
    await pace()
    const url = pg ? withOffset(baseUrl, pg.param, (pg.start ?? 0) + page * pg.step) : baseUrl
    const body = await fetchBody(client, url, spec)
    let added = 0
    for (const item of itemsFrom(body, spec)) {
      const posting = toPosting(item, spec, channel.name)
      if (posting && !byId.has(posting.nativeId)) {
        byId.set(posting.nativeId, posting)
        added++
      }
    }
    if (added === 0) break // empty or fully-duplicate page — the tail ran out
  }
}

/** Crawl one channel's recipe into deduped postings. */
export async function fetchChannel(
  client: HttpClient,
  channel: ChannelSource,
  search: { stacks: string[]; cities: string[] },
): Promise<JobPosting[]> {
  const spec = channel.crawl
  if (!spec) return []
  const urls = buildUrls(spec, search.stacks, search.cities)
  const byId = new Map<string, JobPosting>()
  let first = true
  const pace = async (): Promise<void> => {
    if (!first) await sleep(REQUEST_DELAY_MS)
    first = false
  }
  for (const url of urls) {
    await fetchInto(client, channel, spec, url, byId, pace)
  }
  return [...byId.values()]
}

/** A detail fetcher for a channel, or undefined when the recipe has no detail spec. */
export function channelDetailFetcher(
  channel: ChannelSource,
): ((client: HttpClient, _company: string, nativeId: string) => Promise<string | null>) | undefined {
  const detail = channel.crawl?.detail
  if (!detail) return undefined
  return async (client, _company, nativeId) => {
    // Pace per-posting detail hits so a burst of them doesn't earn a 429 (the
    // HTTP client still backs off and retries if one slips through).
    await new Promise(resolve => setTimeout(resolve, DETAIL_DELAY_MS))
    const url = detail.urlTemplate.replaceAll('{id}', encodeURIComponent(nativeId))
    const body = channel.crawl?.render === true
      ? await renderHtml(url, channel.crawl.headers)
      : await client.text(url, { headers: channel.crawl?.headers })
    if (detail.path) {
      return scalarString(dotPath(JSON.parse(body), detail.path))
    }
    if (detail.selector) {
      const node = parseHtml(body).querySelector(detail.selector)
      return node ? node.innerHTML.trim() : null
    }
    return body
  }
}
