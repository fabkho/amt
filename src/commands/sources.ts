import { defineCommand } from 'citty'
import { createCommand } from './_shared.js'
import { resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { addCompany, loadSources, removeSource, sourceKind, upsertSource } from '../core/sources-store.js'
import { AmtError } from '../core/errors.js'

const list = createCommand({
  name: 'list',
  description: 'Show boards, tracked companies, and agent channels',
  run() {
    const sources = loadSources(resolveHome())
    const byKind = (kind: string): typeof sources.sources => sources.sources.filter(s => sourceKind(s) === kind)
    const companies = byKind('company')
    return {
      result: sources,
      human: [
        `Boards: ${byKind('board').map(s => s.name).join(', ') || '(none)'}`,
        `Companies (${companies.length}):`,
        ...companies.map(c => `  ${c.name} → ${c.ats}:${c.slug} (${c.addedBy ?? 'manual'})`),
        `Crawl channels: ${byKind('crawl').map(c => c.name).join(', ') || '(none)'}`,
        `Agent channels: ${byKind('agent').map(c => c.name).join(', ') || '(none)'}`,
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

const addChannel = createCommand({
  name: 'add-channel',
  description: 'Add or update an agent channel (stored, never executed by the tool)',
  args: {
    name: { type: 'positional', description: 'Channel name', required: true },
    recipe: { type: 'string', description: 'Recipe as JSON (URL template, parse hints, …)' },
    description: { type: 'string', description: 'One-line description' },
    priority: { type: 'string', description: 'Execution order, 1 = first' },
    yield: { type: 'string', description: 'Observed yield note' },
  },
  run(args) {
    let recipe: unknown
    if (args.recipe !== undefined) {
      try {
        recipe = JSON.parse(args.recipe as string)
      } catch {
        throw new AmtError('CHANNEL_RECIPE_INVALID', '--recipe must be valid JSON')
      }
    }
    const entry = {
      name: args.name as string,
      ...(args.description !== undefined && { description: args.description as string }),
      ...(recipe !== undefined && { recipe }),
      ...(args.priority !== undefined && { priority: Number(args.priority) }),
      ...(args.yield !== undefined && { yield: args.yield as string }),
    }
    const { updated } = upsertSource(resolveHome(), entry)
    return {
      result: { name: entry.name, updated },
      human: [`${updated ? 'Updated' : 'Added'} channel ${entry.name}.`],
    }
  },
})

const remove = createCommand({
  name: 'remove',
  description: 'Remove a tracked company or an agent channel (by name)',
  args: {
    company: { type: 'positional', description: 'Company name/slug or channel name', required: true },
  },
  run(args) {
    const name = args.company as string
    const removed = removeSource(resolveHome(), name)
    if (!removed) {
      throw new AmtError('COMPANY_NOT_TRACKED', `"${name}" is not in sources.yaml`)
    }
    return { result: { removed: name }, human: [`Removed ${name}.`] }
  },
})

export default defineCommand({
  meta: { name: 'sources', description: 'Manage the crawl sources' },
  subCommands: {
    'list': () => list,
    'add': () => add,
    'add-channel': () => addChannel,
    'remove': () => remove,
  },
})
