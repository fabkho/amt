import { z } from 'zod'
import { JobKitError } from '../errors.js'
import { toIsoDate, workModeFromFlags } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const listItem = z.looseObject({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().nullish(),
  company: z.looseObject({ identifier: z.string(), name: z.string() }).nullish(),
  location: z
    .looseObject({
      fullLocation: z.string().nullish(),
      remote: z.boolean().nullish(),
      hybrid: z.boolean().nullish(),
    })
    .nullish(),
})

const listResponse = z.looseObject({
  totalFound: z.number(),
  content: z.array(listItem),
})

const MAX_PAGES = 5
const PAGE_SIZE = 100

export const smartrecruiters: SourceAdapter = {
  name: 'smartrecruiters',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const items: z.output<typeof listItem>[] = []
    let totalFound = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = listResponse.parse(
        await client.json(
          `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        ),
      )
      totalFound = data.totalFound
      items.push(...data.content)
      if (items.length >= totalFound || data.content.length === 0) break
    }
    // The API answers 200 with totalFound 0 for unknown identifiers — treat
    // that as "wrong slug", not "no openings", so probing stays honest.
    if (totalFound === 0) {
      throw new JobKitError(
        'SOURCE_UNREACHABLE',
        `SmartRecruiters returned no postings for "${company}" — likely a wrong company identifier.`,
      )
    }

    return items.map(item => ({
      source: 'smartrecruiters',
      nativeId: item.id,
      company: item.company?.name ?? company,
      title: item.name,
      url: `https://jobs.smartrecruiters.com/${item.company?.identifier ?? company}/${item.id}`,
      // Descriptions need one extra request per posting — deferred until a
      // posting actually becomes a note worth reading.
      descriptionHtml: null,
      location: item.location?.fullLocation ?? null,
      workMode: workModeFromFlags(item.location?.remote, item.location?.hybrid),
      salaryMin: null,
      salaryMax: null,
      publishedAt: toIsoDate(item.releasedDate),
      tags: [],
    }))
  },
}
