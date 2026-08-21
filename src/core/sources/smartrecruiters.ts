import { z } from 'zod'
import { AmtError } from '../errors.js'
import { parseItems } from './parse.js'
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

// Items are validated one by one — a single malformed entry never sinks the batch.
const listResponse = z.looseObject({
  totalFound: z.number(),
  content: z.array(z.unknown()),
})

const MAX_PAGES = 10
const PAGE_SIZE = 100

export const smartrecruiters: SourceAdapter = {
  name: 'smartrecruiters',
  kind: 'ats',
  async fetchCompany(client, company): Promise<JobPosting[]> {
    const items: z.output<typeof listItem>[] = []
    let totalFound = 0
    let rawSeen = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = listResponse.parse(
        await client.json(
          `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        ),
      )
      totalFound = data.totalFound
      rawSeen += data.content.length
      items.push(...parseItems(data.content, listItem))
      if (rawSeen >= totalFound || data.content.length === 0) break
    }
    if (rawSeen < totalFound) {
      // Silent truncation is the failure mode a crawler must never have.
      process.stderr.write(
        `[amt] smartrecruiters:${company} truncated — fetched ${rawSeen} of ${totalFound} postings (page cap)\n`,
      )
    }
    // The API answers 200 with totalFound 0 for unknown identifiers AND for
    // legitimately empty boards — a distinct code lets slug probing treat it
    // as a miss while the crawler treats a tracked company as simply empty.
    if (totalFound === 0) {
      throw new AmtError(
        'SOURCE_EMPTY',
        `SmartRecruiters returned no postings for "${company}" — wrong identifier or an empty board.`,
      )
    }

    return items.map(item => ({
      source: 'smartrecruiters',
      nativeId: item.id,
      company: item.company?.name ?? company,
      title: item.name,
      url: `https://jobs.smartrecruiters.com/${item.company?.identifier ?? company}/${item.id}`,
      // Descriptions need one extra request per posting — the crawler calls
      // fetchDetail below once per NEW posting.
      descriptionHtml: null,
      location: item.location?.fullLocation ?? null,
      workMode: workModeFromFlags(item.location?.remote, item.location?.hybrid),
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      publishedAt: toIsoDate(item.releasedDate),
      tags: [],
    }))
  },

  async fetchDetail(client, company, nativeId): Promise<string | null> {
    const detail = detailResponse.parse(
      await client.json(
        `https://api.smartrecruiters.com/v1/companies/${company}/postings/${nativeId}`,
      ),
    )
    const sections = Object.values(detail.jobAd?.sections ?? {})
    const html = sections
      .map(section => (section?.title ? `<h3>${section.title}</h3>\n${section.text ?? ''}` : section?.text ?? ''))
      .join('\n')
      .trim()
    return html || null
  },
}

const detailSection = z.looseObject({
  title: z.string().nullish(),
  text: z.string().nullish(),
})

const detailResponse = z.looseObject({
  jobAd: z
    .looseObject({
      sections: z.record(z.string(), detailSection.nullish()).nullish(),
    })
    .nullish(),
})
