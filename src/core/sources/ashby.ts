import { z } from 'zod'
import { parseItems } from './parse.js'
import { toIsoDate } from './normalize.js'
import type { JobPosting, SourceAdapter } from './types.js'

const job = z.looseObject({
  id: z.string(),
  title: z.string(),
  jobUrl: z.string(),
  descriptionHtml: z.string().nullish(),
  location: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(), // "Remote" | "Hybrid" | "OnSite"
  team: z.string().nullish(),
  department: z.string().nullish(),
  publishedAt: z.string().nullish(),
  compensation: z
    .looseObject({
      scrapeableCompensationSalarySummary: z.string().nullish(),
    })
    .nullish(),
})

// Items are validated one by one — a single malformed entry never sinks the batch.
const response = z.looseObject({ jobs: z.array(z.unknown()) })

// workplaceType is the specific field — Ashby sets isRemote true even on
// hybrid roles, so it only serves as a fallback.
function workMode(j: z.output<typeof job>): JobPosting['workMode'] {
  const type = j.workplaceType?.toLowerCase()
  if (type === 'remote' || type === 'hybrid') return type
  if (type === 'onsite' || type === 'on site') return 'onsite'
  return j.isRemote ? 'remote' : null
}

/** "€89.7K – €132.4K" / "€38,400 - €52,800" → [89700, 132400]. */
function parseSalarySummary(
  summary: string | null | undefined,
): { min: number | null; max: number | null } {
  if (!summary) return { min: null, max: null }
  const numbers = [...summary.matchAll(/([\d.,]+)\s*(K?)/gi)]
    .map(([, raw, k]) => {
      const value = Number(raw!.replaceAll(',', ''))
      return Number.isFinite(value) ? value * (k ? 1000 : 1) : null
    })
    .filter((v): v is number => v !== null && v > 1000)
  if (numbers.length === 0) return { min: null, max: null }
  return { min: Math.min(...numbers), max: Math.max(...numbers) }
}

export const ashby: SourceAdapter = {
  name: 'ashby',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const data = response.parse(
      await client.json(
        `https://api.ashbyhq.com/posting-api/job-board/${company}?includeCompensation=true`,
      ),
    )
    const jobs = parseItems(data.jobs, job)
    return jobs.map((j) => {
      const salary = parseSalarySummary(
        j.compensation?.scrapeableCompensationSalarySummary,
      )
      return {
        source: 'ashby',
        nativeId: j.id,
        company,
        title: j.title,
        url: j.jobUrl,
        descriptionHtml: j.descriptionHtml ?? null,
        location: j.location ?? null,
        workMode: workMode(j),
        salaryMin: salary.min,
        salaryMax: salary.max,
        publishedAt: toIsoDate(j.publishedAt),
        tags: [j.team, j.department].filter((t): t is string => Boolean(t)),
      }
    })
  },
}
