import { z } from 'zod'
import { parseItems } from './parse.js'
import type { BoardOptions, HttpClient, JobPosting, SourceAdapter } from './types.js'

// Bundesagentur für Arbeit Jobsuche — Germany's largest job database, official
// public API (documented at jobsuche.api.bund.dev). The API key is the public
// one the BA publishes for this service, not a secret.
const API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service'
const AUTH = { 'X-API-Key': 'jobboerse-jobsuche' }
const PAGE_SIZE = 50
const CITY_RADIUS_KM = 50

const item = z.looseObject({
  referenznummer: z.string(),
  stellenangebotsTitel: z.string(),
  firma: z.string().nullish(),
  datumErsteVeroeffentlichung: z.string().nullish(),
  alleBerufe: z.array(z.string()).catch([]),
  stellenlokationen: z
    .array(z.looseObject({ adresse: z.looseObject({ ort: z.string().nullish() }).nullish() }))
    .catch([]),
})

const listResponse = z.looseObject({ ergebnisliste: z.array(z.unknown()).catch([]) })
const detailResponse = z.looseObject({ stellenangebotsBeschreibung: z.string().nullish() })

/**
 * This is a search API over millions of postings, not a listable board — it is
 * queried per stack keyword, scoped to the profile's cities (plus the BA's
 * home-office flag). A Germany-wide query would flood the notes with onsite
 * roles everywhere, because most BA postings carry no usable remote marker.
 */
function searchScopes(options: BoardOptions): string[] {
  const scopes = (options.cities ?? []).map(
    city => `&wo=${encodeURIComponent(city)}&umkreis=${CITY_RADIUS_KM}`,
  )
  if (options.remote) scopes.push('&arbeitszeit=ho')
  return scopes
}

function toPosting(j: z.output<typeof item>): JobPosting {
  return {
    source: 'arbeitsagentur',
    nativeId: j.referenznummer,
    company: j.firma ?? 'unbekannt',
    title: j.stellenangebotsTitel,
    url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(j.referenznummer)}`,
    descriptionHtml: null, // fetched per new posting via fetchDetail
    location: j.stellenlokationen[0]?.adresse?.ort ?? null,
    workMode: null, // the BA data has no reliable remote/hybrid signal
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    publishedAt: j.datumErsteVeroeffentlichung ?? null,
    tags: j.alleBerufe,
  }
}

// Descriptions arrive as plain text with markdown-ish headings. The note
// pipeline expects HTML, so escape and keep the line structure.
function textToHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return escaped.replaceAll('\n', '<br>')
}

export const arbeitsagentur: SourceAdapter = {
  name: 'arbeitsagentur',
  kind: 'board',
  async fetchBoard(client: HttpClient, options: BoardOptions = {}): Promise<JobPosting[]> {
    const keywords = options.keywords ?? []
    const scopes = searchScopes(options)
    if (keywords.length === 0 || scopes.length === 0) return []
    const pages = options.pages ?? 1

    // The same posting shows up across keywords and scopes — dedupe by refnr.
    const byRef = new Map<string, JobPosting>()
    for (const keyword of keywords) {
      for (const scope of scopes) {
        for (let page = 1; page <= pages; page++) {
          // zeitarbeit=false: temp-agency listings are noise by profile policy
          const url = `${API}/pc/v6/jobs?was=${encodeURIComponent(keyword)}&size=${PAGE_SIZE}&page=${page}&zeitarbeit=false${scope}`
          const data = listResponse.parse(await client.json(url, { headers: AUTH }))
          const items = parseItems(data.ergebnisliste, item)
          for (const j of items) {
            if (!byRef.has(j.referenznummer)) byRef.set(j.referenznummer, toPosting(j))
          }
          if (data.ergebnisliste.length < PAGE_SIZE) break // past the last page
        }
      }
    }
    return [...byRef.values()]
  },
  async fetchDetail(client, _company, nativeId): Promise<string | null> {
    const encoded = Buffer.from(nativeId).toString('base64')
    const data = detailResponse.parse(
      await client.json(`${API}/pc/v4/jobdetails/${encoded}`, { headers: AUTH }),
    )
    return data.stellenangebotsBeschreibung ? textToHtml(data.stellenangebotsBeschreibung) : null
  },
}
