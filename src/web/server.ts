import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AmtError } from '../core/errors.js'
import { loadProfile, resolveHome, type Profile } from '../core/profile.js'
import {
  changeStatus,
  dashboard,
  detail,
  rejectDialog,
  jobs,
  toggleFavorite,
  type Reply,
} from './handlers.js'

function assetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const levels of ['..', '../..', '../../..']) {
    const candidate = join(here, levels, 'assets/web')
    if (existsSync(join(candidate, 'dashboard.css'))) return candidate
  }
  return join(here, '../assets/web')
}

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

function serveAsset(path: string): Reply {
  const base = assetsDir()
  const full = normalize(join(base, path))
  // Trailing sep so a sibling like ".../assets/web-evil" can't pass the prefix.
  if ((full !== base && !full.startsWith(base + sep)) || !existsSync(full)) {
    return { status: 404, body: 'not found' }
  }
  const ext = full.slice(full.lastIndexOf('.'))
  return { status: 200, body: readFileSync(full, 'utf-8'), contentType: MIME[ext] ?? 'text/plain' }
}

const MAX_BODY = 64 * 1024

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new AmtError('BODY_TOO_LARGE', 'request body too large')
    chunks.push(chunk as Buffer)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString())
}

const NOT_FOUND: Reply = { status: 404, body: 'not found' }

function routeGet(profile: Profile, url: URL, parts: string[]): Reply {
  if (url.pathname === '/') return dashboard(profile)
  if (url.pathname === '/jobs') return jobs(profile, url.searchParams)
  if (parts[0] === 'assets') return serveAsset(parts.slice(1).join('/'))
  if (parts[0] === 'jobs' && parts[1] && parts[2] === 'reject') {
    return rejectDialog(profile, parts[1], url.searchParams.get('from') === 'detail')
  }
  if (parts[0] === 'jobs' && parts[1]) return detail(profile, parts[1])
  return NOT_FOUND
}

async function routePost(
  profile: Profile,
  home: string,
  parts: string[],
  form: URLSearchParams,
  fromUrl: string,
): Promise<Reply> {
  if (parts[0] !== 'jobs' || !parts[1]) return NOT_FOUND
  const slug = parts[1]
  switch (parts[2]) {
    case 'status':
      return changeStatus(profile, home, slug, form.get('status') ?? '', form.get('reason') ?? undefined, fromUrl, form.get('cutNote') ?? undefined)
    case 'favorite':
      return toggleFavorite(profile, slug)
    default:
      return NOT_FOUND
  }
}

async function route(req: IncomingMessage): Promise<Reply> {
  const home = resolveHome()
  const profile = await loadProfile(home)
  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  if (req.method === 'GET') return routeGet(profile, url, parts)
  if (req.method === 'POST') {
    // Every mutation comes from htmx, which sets HX-Request. A cross-site
    // simple form POST cannot set that header — cheap CSRF/rebinding guard.
    if (req.headers['hx-request'] !== 'true') return { status: 403, body: 'forbidden' }
    const fromUrl = String(req.headers['hx-current-url'] ?? '')
    return routePost(profile, home, parts, await readBody(req), fromUrl)
  }
  return NOT_FOUND
}

// Not-found notes are a 404, not a 500, and never echo the filesystem path.
const HTTP_STATUS: Record<string, number> = { NOTE_NOT_FOUND: 404, NOTE_INVALID: 404, BODY_TOO_LARGE: 413 }

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const reply = await route(req)
    res.writeHead(reply.status, { 'Content-Type': reply.contentType ?? 'text/html; charset=utf-8' })
    res.end(reply.body)
  } catch (error) {
    const code = error instanceof AmtError ? error.code : 'UNEXPECTED'
    const status = HTTP_STATUS[code] ?? 500
    res.writeHead(status, { 'Content-Type': 'text/plain' })
    res.end(status === 500 ? `[${code}] internal error` : `[${code}]`)
  }
}

export function startServer(port: number): Promise<{ port: number; close: () => void }> {
  const server = createHttpServer((req, res) => void handle(req, res))
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ port, close: () => server.close() }))
  })
}
