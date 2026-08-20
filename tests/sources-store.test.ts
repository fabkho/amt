import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  addCompany,
  discoverCompany,
  loadSources,
  removeCompany,
  slugCandidates,
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
    const home = mkdtempSync(join(tmpdir(), 'job-kit-home-'))

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
    const home = mkdtempSync(join(tmpdir(), 'job-kit-home-'))
    await expect(addCompany(probingClient, home, 'nope-inc')).rejects.toMatchObject({
      code: 'COMPANY_NOT_DISCOVERED',
    })
  })
})
