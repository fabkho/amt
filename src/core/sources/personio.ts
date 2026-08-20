import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import { parseItems } from './parse.js'
import { toIsoDate } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const description = z.looseObject({
  name: z.coerce.string().nullish(),
  value: z.coerce.string().nullish(),
})

const position = z.looseObject({
  id: z.coerce.number(),
  name: z.coerce.string(),
  subcompany: z.coerce.string().nullish(),
  office: z.coerce.string().nullish(),
  department: z.coerce.string().nullish(),
  keywords: z.coerce.string().nullish(),
  createdAt: z.coerce.string().nullish(),
  jobDescriptions: z
    .union([
      z.looseObject({
        jobDescription: z.union([description, z.array(description)]).nullish(),
      }),
      z.literal(''),
    ])
    .nullish(),
})

// Items are validated one by one — a single malformed entry never sinks the batch.
const feed = z.looseObject({
  'workzag-jobs': z.looseObject({
    position: z.unknown().nullish(),
  }),
})

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function descriptionHtml(p: z.output<typeof position>): string | null {
  const container = p.jobDescriptions
  const sections
    = container && typeof container === 'object'
      ? asArray(container.jobDescription)
      : []
  const html = sections
    .map(d => (d.name ? `<h3>${d.name}</h3>\n${d.value ?? ''}` : d.value ?? ''))
    .join('\n')
    .trim()
  return html || null
}

export const personio: SourceAdapter = {
  name: 'personio',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const xml = await client.text(`https://${company}.jobs.personio.de/xml`)
    const parsed = feed.parse(new XMLParser({ ignoreAttributes: true }).parse(xml))
    const positions = parseItems(asArray(parsed['workzag-jobs'].position as unknown), position)

    return positions.map((p) => {
      return {
        source: 'personio',
        nativeId: String(p.id),
        company: p.subcompany ?? company,
        title: p.name,
        url: `https://${company}.jobs.personio.de/job/${p.id}`,
        descriptionHtml: descriptionHtml(p),
        location: p.office ?? null,
        workMode: p.office && /remote/i.test(p.office) ? 'remote' : null,
        salaryMin: null,
        salaryMax: null,
        publishedAt: toIsoDate(p.createdAt),
        tags: [
          ...(p.department ? [p.department] : []),
          ...(p.keywords ? p.keywords.split(',').map(k => k.trim()) : []),
        ],
      }
    })
  },
}
