import { z } from 'zod'
import { toIsoDate } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

// Free German-focused board, updated hourly. Terms ask for a link back to
// arbeitnow.com when anything built on it is published.

const job = z.looseObject({
  slug: z.string(),
  title: z.string(),
  company_name: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  location: z.string().nullish(),
  remote: z.boolean().nullish(),
  created_at: z.number().nullish(), // epoch seconds
  // A handful of live entries ship these as keyed objects instead of
  // arrays — tolerate rather than failing the whole board.
  tags: z.array(z.string()).catch([]),
  job_types: z.array(z.string()).catch([]),
})

// Items are validated one by one: a single malformed entry (it happens on
// this board) must never sink the other 174.
const response = z.looseObject({
  data: z.array(z.unknown()),
  links: z.looseObject({ next: z.string().nullish() }).nullish(),
})

export const arbeitnow: SourceAdapter = {
  name: 'arbeitnow',
  kind: 'board',
  async fetchBoard(client, options = {}): Promise<JobPosting[]> {
    const pages = options.pages ?? 1
    const postings: JobPosting[] = []
    let url: string | null = 'https://www.arbeitnow.com/api/job-board-api'

    for (let page = 0; page < pages && url; page++) {
      const data: z.output<typeof response> = response.parse(await client.json(url))
      const jobs = data.data
        .map(item => job.safeParse(item))
        .filter(result => result.success)
        .map(result => result.data)
      postings.push(
        ...jobs.map(j => ({
          source: 'arbeitnow',
          nativeId: j.slug,
          company: j.company_name,
          title: j.title,
          url: j.url,
          descriptionHtml: j.description ?? null,
          location: j.location ?? null,
          workMode: j.remote ? ('remote' as const) : null,
          salaryMin: null,
          salaryMax: null,
          publishedAt: toIsoDate(j.created_at),
          tags: [...j.tags, ...j.job_types],
        })),
      )
      url = data.links?.next ?? null
    }
    return postings
  },
}
