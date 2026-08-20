import { z } from 'zod'
import { toIsoDate } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const posting = z.looseObject({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  workplaceType: z.enum(['remote', 'hybrid', 'onsite']).nullish(),
  createdAt: z.number().nullish(), // epoch milliseconds
  description: z.string().nullish(),
  descriptionBody: z.string().nullish(),
  categories: z
    .looseObject({
      location: z.string().nullish(),
      department: z.string().nullish(),
      commitment: z.string().nullish(),
    })
    .nullish(),
})

const response = z.array(posting)

export const lever: SourceAdapter = {
  name: 'lever',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const data = response.parse(
      await client.json(`https://api.lever.co/v0/postings/${company}?mode=json`),
    )
    return data.map(p => ({
      source: 'lever',
      nativeId: p.id,
      company,
      title: p.text,
      url: p.hostedUrl,
      descriptionHtml: p.description ?? p.descriptionBody ?? null,
      location: p.categories?.location ?? null,
      workMode: p.workplaceType ?? null,
      salaryMin: null,
      salaryMax: null,
      publishedAt: toIsoDate(p.createdAt),
      tags: [p.categories?.department, p.categories?.commitment].filter(
        (t): t is string => Boolean(t),
      ),
    }))
  },
}
