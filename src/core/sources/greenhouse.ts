import { z } from 'zod'
import { toIsoDate, unescapeHtml } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const job = z.looseObject({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  company_name: z.string().nullish(),
  content: z.string().nullish(),
  location: z.looseObject({ name: z.string() }).nullish(),
  first_published: z.string().nullish(),
  departments: z.array(z.looseObject({ name: z.string() })).nullish(),
})

const response = z.looseObject({ jobs: z.array(job) })

export const greenhouse: SourceAdapter = {
  name: 'greenhouse',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const data = response.parse(
      await client.json(
        `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`,
      ),
    )
    return data.jobs.map((j) => {
      const location = j.location?.name ?? null
      return {
        source: 'greenhouse',
        nativeId: String(j.id),
        company: j.company_name ?? company,
        title: j.title,
        url: j.absolute_url,
        descriptionHtml: j.content ? unescapeHtml(j.content) : null,
        location,
        // Greenhouse has no structured flag — only trust an explicit mention.
        workMode: location && /remote/i.test(location) ? 'remote' : null,
        salaryMin: null,
        salaryMax: null,
        publishedAt: toIsoDate(j.first_published),
        tags: j.departments?.map(d => d.name) ?? [],
      }
    })
  },
}
