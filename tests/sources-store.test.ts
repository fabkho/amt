import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  addCompany,
  discoverCompany,
  loadSources,
  removeChannel,
  removeCompany,
  slugCandidates,
  tryAutoTrack,
  upsertChannel,
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
    expect(loadSources(home2).companies).toHaveLength(0)
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
    expect(loadSources(home).companies).toHaveLength(1)

    const again = await addCompany(probingClient, home, 'Shopware')
    expect(again.alreadyTracked).toBe(true)
    expect(loadSources(home).companies).toHaveLength(1)

    expect(removeCompany(home, 'shopwareag')).toBe(true)
    expect(loadSources(home).companies).toHaveLength(0)
    expect(removeCompany(home, 'shopwareag')).toBe(false)
  })

  it('rejects undiscoverable companies with a coded error', async () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-home-'))
    await expect(addCompany(probingClient, home, 'nope-inc')).rejects.toMatchObject({
      code: 'COMPANY_NOT_DISCOVERED',
    })
  })
})

describe('channels', () => {
  it('upserts by name and removes', () => {
    const home = mkdtempSync(join(tmpdir(), 'amt-src-'))
    const { updated } = upsertChannel(home, { name: 'linkedin-guest', priority: 1 })
    expect(updated).toBe(false)
    const again = upsertChannel(home, {
      name: 'LinkedIn-Guest',
      priority: 2,
      recipe: { urlTemplate: 'https://example.com/{kw}' },
    })
    expect(again.updated).toBe(true)
    const sources = loadSources(home)
    expect(sources.channels).toHaveLength(1)
    expect(sources.channels[0]!.priority).toBe(2)
    expect(removeChannel(home, 'linkedin-guest')).toBe(true)
    expect(removeChannel(home, 'linkedin-guest')).toBe(false)
    expect(loadSources(home).channels).toHaveLength(0)
  })
})
