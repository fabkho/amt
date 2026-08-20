import { z } from 'zod'
import { parseItems } from './parse.js'
import { toIsoDate, workModeFromFlags } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const offer = z.looseObject({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  company_name: z.string().nullish(),
  careers_url: z.string().nullish(),
  description: z.string().nullish(),
  requirements: z.string().nullish(),
  city: z.string().nullish(),
  country_code: z.string().nullish(),
  location: z.string().nullish(),
  remote: z.boolean().nullish(),
  hybrid: z.boolean().nullish(),
  on_site: z.boolean().nullish(),
  department: z.string().nullish(),
  published_at: z.string().nullish(),
  salary: z
    .looseObject({ min: z.number().nullish(), max: z.number().nullish() })
    .nullish(),
})

// Items are validated one by one — a single malformed entry never sinks the batch.
const response = z.looseObject({ offers: z.array(z.unknown()) })

export const recruitee: SourceAdapter = {
  name: 'recruitee',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const data = response.parse(
      await client.json(`https://${company}.recruitee.com/api/offers/`),
    )
    const offers = parseItems(data.offers, offer)
    return offers.map(o => ({
      source: 'recruitee',
      nativeId: String(o.id),
      company: o.company_name ?? company,
      title: o.title,
      url: o.careers_url ?? `https://${company}.recruitee.com/o/${o.slug}`,
      descriptionHtml:
        [o.description, o.requirements].filter(Boolean).join('\n') || null,
      location:
        o.city && o.country_code ? `${o.city}, ${o.country_code}` : o.location ?? null,
      workMode: workModeFromFlags(o.remote, o.hybrid, o.on_site),
      salaryMin: o.salary?.min ?? null,
      salaryMax: o.salary?.max ?? null,
      publishedAt: toIsoDate(o.published_at),
      tags: o.department ? [o.department] : [],
    }))
  },
}
