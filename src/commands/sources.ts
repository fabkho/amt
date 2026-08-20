import { defineCommand } from 'citty'
import { createCommand } from './_shared.js'
import { resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { addCompany, loadSources, removeCompany } from '../core/sources-store.js'
import { JobKitError } from '../core/errors.js'

const list = createCommand({
  name: 'list',
  description: 'Show boards, tracked companies, and agent channels',
  run() {
    const sources = loadSources(resolveHome())
    return {
      result: sources,
      human: [
        `Boards: ${sources.boards.join(', ') || '(none)'}`,
        `Companies (${sources.companies.length}):`,
        ...sources.companies.map(c => `  ${c.name} → ${c.ats}:${c.slug} (${c.addedBy})`),
        `Agent channels: ${sources.channels.map(c => c.name).join(', ') || '(none)'}`,
      ],
    }
  },
})

const add = createCommand({
  name: 'add',
  description: 'Track a company — discovers its ATS automatically',
  args: {
    company: { type: 'positional', description: 'Company name', required: true },
  },
  async run(args) {
    const result = await addCompany(
      defaultHttpClient,
      resolveHome(),
      args.company as string,
    )
    return {
      result: {
        name: result.name,
        ats: result.ats,
        slug: result.slug,
        openPostings: result.postings.length,
        alreadyTracked: result.alreadyTracked,
      },
      human: [
        result.alreadyTracked
          ? `Already tracked: ${result.name} (${result.ats}:${result.slug})`
          : `Tracking ${result.name} → ${result.ats}:${result.slug} (${result.postings.length} open postings)`,
      ],
    }
  },
})

const remove = createCommand({
  name: 'remove',
  description: 'Stop tracking a company (by name or slug)',
  args: {
    company: { type: 'positional', description: 'Company name or slug', required: true },
  },
  run(args) {
    const removed = removeCompany(resolveHome(), args.company as string)
    if (!removed) {
      throw new JobKitError('COMPANY_NOT_TRACKED', `"${args.company}" is not in sources.yaml`)
    }
    return { result: { removed: args.company }, human: [`Removed ${args.company}.`] }
  },
})

export default defineCommand({
  meta: { name: 'sources', description: 'Manage the crawl sources' },
  subCommands: { list: () => list, add: () => add, remove: () => remove },
})
