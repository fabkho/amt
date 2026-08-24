import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AmtError, toErrorMessage } from '../core/errors.js'
import { loadProfile, resolveHome, type Profile } from '../core/profile.js'
import {
  buildApplication,
  changeStatus,
  dashboard,
  detail,
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
  if (!full.startsWith(base) || !existsSync(full)) return { status: 404, body: 'not found' }
  const ext = full.slice(full.lastIndexOf('.'))
  return { status: 200, body: readFileSync(full, 'utf-8'), contentType: MIME[ext] ?? 'text/plain' }
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return new URLSearchParams(Buffer.concat(chunks).toString())
}

const NOT_FOUND: Reply = { status: 404, body: 'not found' }

function routeGet(profile: Profile, url: URL, parts: string[]): Reply {
  if (url.pathname === '/') return dashboard(profile)
  if (url.pathname === '/jobs') return jobs(profile, url.searchParams)
  if (parts[0] === 'assets') return serveAsset(parts.slice(1).join('/'))
  if (parts[0] === 'jobs' && parts[1]) return detail(profile, parts[1])
  return NOT_FOUND
}

async function routePost(
  profile: Profile,
  home: string,
  parts: string[],
  form: URLSearchParams,
): Promise<Reply> {
  if (parts[0] !== 'jobs' || !parts[1]) return NOT_FOUND
  const slug = parts[1]
  switch (parts[2]) {
    case 'status':
      return changeStatus(profile, home, slug, form.get('status') ?? '', form.get('reason') ?? undefined)
    case 'favorite':
      return toggleFavorite(profile, slug)
    case 'prepare':
      return buildApplication(profile, slug)
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
  if (req.method === 'POST') return routePost(profile, home, parts, await readBody(req))
  return NOT_FOUND
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const reply = await route(req)
    res.writeHead(reply.status, { 'Content-Type': reply.contentType ?? 'text/html; charset=utf-8' })
    res.end(reply.body)
  } catch (error) {
    const code = error instanceof AmtError ? error.code : 'UNEXPECTED'
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`[${code}] ${toErrorMessage(error)}`)
  }
}

export function startServer(port: number): Promise<{ port: number; close: () => void }> {
  const server = createHttpServer((req, res) => void handle(req, res))
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({ port, close: () => server.close() }))
  })
}
