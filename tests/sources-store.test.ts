import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { describe, expect, it } from 'vite-plus/test'
import {
  addCompany,
  discoverCompany,
  loadSources,
  removeSource,
  slugCandidates,
  tryAutoTrack,
  upsertSource,
  type HttpClient,
} from '../src/index.js'

const fixturesDir = join(import.meta.dirname, 'fixtures/sources')

/** Serves the recruitee fixture only for the shopwareag slug; 404s the rest. */
const probingClient: HttpClient = {
  json: async (url) => {
    if (url === 'https://shopwareag.recruitee.com/api/offers/') {
      return JSON.parse(readFileSync(join(fixturesDir, 'recruitee.json'), 'utf-8'))
    }
    throw new Error(`404: ${url}`)
  },
  text: async () => {
    throw new Error('404')
  },
}

/** A recruitee sandbox that answers for the "personio" slug with a posting
 *  whose company is NOT the queried name — the real FD-Sandbox incident. */
const sandboxClient: HttpClient = {
  json: async (url) => {
    if (url === 'https://personio.recruitee.com/api/offers/') {
      const base = JSON.parse(readFileSync(join(fixturesDir, 'recruitee.json'), 'utf-8'))
      base.offers = [{ ...base.offers[0], company_name: 'FD Sandbox' }]
      return base
    }
    throw new Error(`404: ${url}`)
  },
  text: async () => {
    throw new Error('404')
  },
}

describe('auto-track plausibility', () => {
  it('refuses to auto-track a discovery whose postings do not name the company', async () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-home-'))
    // manual add still works but reports verified:false
    const manual = await addCompany(sandboxClient, home, 'personio', 'manual')
    expect(manual.verified).toBe(false)
    // auto path (tryAutoTrack) rejects it — no sandbox in sources.yaml
    const home2 = mkdtempSync(join(tmpdir(), 'amt-home-'))
    const tracked = await tryAutoTrack(sandboxClient, home2, true, 'personio')
    expect(tracked).toBeNull()
    expect(loadSources(home2).sources).toHaveLength(0)
  })

  it('verifies a real match', async () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-home-'))
    const added = await addCompany(probingClient, home, 'shopware AG', 'auto')
    expect(added.verified).toBe(true)
  })
})

describe('slugCandidates', () => {
  it('generates bare, squashed, and suffix variants', () => {
    const candidates = slugCandidates('shopware AG')
    expect(candidates).toContain('shopware')
    expect(candidates).toContain('shopwareag')
    expect(candidates).toContain('shopware-ag')
  })
})

describe('discoverCompany', () => {
  it('probes ATS patterns until one answers', async () => {
    const found = await discoverCompany(probingClient, 'shopware AG')
    expect(found).not.toBeNull()
    expect(found!.ats).toBe('recruitee')
    expect(found!.slug).toBe('shopwareag')
    expect(found!.postings.length).toBeGreaterThan(0)
  })

  it('returns null when nothing answers', async () => {
    expect(await discoverCompany(probingClient, 'does-not-exist-gmbh')).toBeNull()
  })
})

describe('sources.yaml lifecycle', () => {
  it('adds via discovery, dedupes, and removes', async () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-home-'))

    const added = await addCompany(probingClient, home, 'shopware AG')
    expect(added.alreadyTracked).toBe(false)
    expect(loadSources(home).sources).toHaveLength(1)

    const again = await addCompany(probingClient, home, 'Shopware')
    expect(again.alreadyTracked).toBe(true)
    expect(loadSources(home).sources).toHaveLength(1)

    expect(removeSource(home, 'shopwareag')).toBe(true) // by ATS slug
    expect(loadSources(home).sources).toHaveLength(0)
    expect(removeSource(home, 'shopwareag')).toBe(false)
  })

  it('rejects undiscoverable companies with a coded error', async () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-home-'))
    await expect(addCompany(probingClient, home, 'nope-inc')).rejects.toMatchObject({
      code: 'COMPANY_NOT_DISCOVERED',
    })
  })
})

describe('sources', () => {
  it('upserts by name and removes', () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-src-'))
    const { updated } = upsertSource(home, { name: 'linkedin-guest', priority: 1 })
    expect(updated).toBe(false)
    const again = upsertSource(home, {
      name: 'LinkedIn-Guest',
      priority: 2,
      recipe: { urlTemplate: 'https://example.com/{kw}' },
    })
    expect(again.updated).toBe(true)
    const sources = loadSources(home)
    expect(sources.sources).toHaveLength(1)
    expect(sources.sources[0]!.priority).toBe(2)
    expect(removeSource(home, 'linkedin-guest')).toBe(true)
    expect(removeSource(home, 'linkedin-guest')).toBe(false)
    expect(loadSources(home).sources).toHaveLength(0)
  })
})

describe('legacy migration', () => {
  it('folds boards/companies/channels into one list, backs up, and stamps execute', () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-mig-'))
    const path = join(home, 'sources.yaml')
    writeFileSync(path, stringify({
      boards: ['arbeitnow'],
      companies: [{ name: 'Shopware', ats: 'recruitee', slug: 'shopwareag', addedBy: 'manual' }],
      channels: [
        { name: 'linkedin-guest', crawl: { urlTemplate: 'https://li/{keyword}' } },
        { name: 'stepstone', recipe: { urlTemplate: 'https://s/{kw}' } },
      ],
    }))

    const sources = loadSources(home)
    expect(sources.sources).toHaveLength(4)
    const byName = (n: string) => sources.sources.find(s => s.name === n)!
    expect(byName('arbeitnow').execute).toBe('tool')
    expect(byName('Shopware').execute).toBe('tool')
    expect(byName('linkedin-guest').execute).toBe('tool') // has a crawl spec
    expect(byName('stepstone').execute).toBe('agent') // recipe only

    // old file preserved as .bak, new file has the unified shape
    expect(existsSync(`${path}.bak`)).toBe(true)
    const rewritten = readFileSync(path, 'utf-8')
    expect(rewritten).toContain('sources:')
    expect(rewritten).not.toMatch(/^boards:/m)
  })
})
