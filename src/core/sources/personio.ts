import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
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

const feed = z.looseObject({
  'workzag-jobs': z.looseObject({
    position: z.union([position, z.array(position)]).nullish(),
  }),
})

export const personio: SourceAdapter = {
  name: 'personio',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const xml = await client.text(`https://${company}.jobs.personio.de/xml`)
    const parsed = feed.parse(new XMLParser({ ignoreAttributes: true }).parse(xml))
    const raw = parsed['workzag-jobs'].position
    const positions = raw ? (Array.isArray(raw) ? raw : [raw]) : []

    return positions.map((p) => {
      const descs = p.jobDescriptions
      const descList
        = descs && typeof descs === 'object' && descs.jobDescription
          ? Array.isArray(descs.jobDescription)
            ? descs.jobDescription
            : [descs.jobDescription]
          : []
      const html = descList
        .map(d => (d.name ? `<h3>${d.name}</h3>\n${d.value ?? ''}` : d.value ?? ''))
        .join('\n')
        .trim()

      return {
        source: 'personio',
        nativeId: String(p.id),
        company: p.subcompany ?? company,
        title: p.name,
        url: `https://${company}.jobs.personio.de/job/${p.id}`,
        descriptionHtml: html || null,
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
