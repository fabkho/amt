import { z } from 'zod'
import { parseItems } from './parse.js'
import { toIsoDate } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const posting = z.looseObject({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  // Normalize defensively: per-item tolerance would otherwise silently
  // drop postings if Lever ships "Hybrid"/"on-site"/"unspecified".
  workplaceType: z.preprocess(
    value => (typeof value === 'string' ? value.toLowerCase().replace('-', '') : value),
    z.enum(['remote', 'hybrid', 'onsite']).or(z.string().transform(() => null)),
  ).nullish(),
  createdAt: z.number().nullish(), // epoch milliseconds
  description: z.string().nullish(),
  descriptionBody: z.string().nullish(),
  additional: z.string().nullish(),
  lists: z
    .array(z.looseObject({ text: z.string().nullish(), content: z.string().nullish() }))
    .nullish(),
  categories: z
    .looseObject({
      location: z.string().nullish(),
      department: z.string().nullish(),
      commitment: z.string().nullish(),
    })
    .nullish(),
})

// Items are validated one by one — a single malformed entry never sinks the batch.
const response = z.array(z.unknown())

export const lever: SourceAdapter = {
  name: 'lever',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const data = response.parse(
      await client.json(`https://api.lever.co/v0/postings/${company}?mode=json`),
    )
    const postings = parseItems(data, posting)
    return postings.map(p => ({
      source: 'lever',
      nativeId: p.id,
      company,
      title: p.text,
      url: p.hostedUrl,
      // The intro lives in description; the actual requirements live in
      // lists[] and additional — relevance matching needs all of it.
      descriptionHtml:
        [
          p.description ?? p.descriptionBody,
          ...(p.lists ?? []).map(l => (l.text ? `<h3>${l.text}</h3>${l.content ?? ''}` : l.content ?? '')),
          p.additional,
        ]
          .filter(Boolean)
          .join('\n') || null,
      location: p.categories?.location ?? null,
      workMode: p.workplaceType ?? null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      publishedAt: toIsoDate(p.createdAt),
      tags: [p.categories?.department, p.categories?.commitment].filter(
        (t): t is string => Boolean(t),
      ),
    }))
  },
}
