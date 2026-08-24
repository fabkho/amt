import { z } from 'zod'
import type { HttpClient } from './types.js'

// Company → favicon, best-effort and cached per run. Clearbit's free
// suggest endpoint maps names to domains; DuckDuckGo serves the favicon.
// Any failure is a null logo, never a crawl error.

const suggestions = z.array(
  z.looseObject({ name: z.string(), domain: z.string().nullish() }),
)

const cache = new Map<string, string | null>()

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(?:gmbh|ag|se|inc\.?|co\.?|kg|e\.v\.)$/i, '')
    .trim()
}

export async function resolveCompanyLogo(
  client: HttpClient,
  company: string,
): Promise<string | null> {
  const key = normalize(company)
  if (key.length < 2 || key === 'unbekannt') return null
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let logo: string | null = null
  try {
    const raw = await client.json(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(key)}`,
    )
    const parsed = suggestions.safeParse(raw)
    if (parsed.success) {
      // Prefer the exact name match — "shopware" also suggests Shop-Ware.
      const exact = parsed.data.find(s => normalize(s.name) === key)
      const domain = (exact ?? parsed.data[0])?.domain
      if (domain) logo = `https://icons.duckduckgo.com/ip3/${domain}.ico`
    }
  } catch {
    // offline or rate-limited — notes simply stay logo-less
  }
  cache.set(key, logo)
  return logo
}
