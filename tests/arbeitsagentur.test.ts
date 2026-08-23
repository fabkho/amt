import { describe, expect, it } from 'vite-plus/test'
import { getAdapter, type HttpClient } from '../src/index.js'

const listItem = {
  referenznummer: '10000-1205400559-S',
  stellenangebotsTitel: 'Vue.js-Developer:innen (w/m/d)',
  firma: 'Head-on Solutions GmbH',
  datumErsteVeroeffentlichung: '2026-02-05',
  alleBerufe: ['Fachinformatiker/in - Anwendungsentwicklung'],
  stellenlokationen: [{ adresse: { ort: 'Nürnberg, Mittelfranken' } }],
}

function recordingClient(pageItems: (url: string) => unknown[]): {
  client: HttpClient
  calls: { url: string; headers?: Record<string, string> }[]
} {
  const calls: { url: string; headers?: Record<string, string> }[] = []
  return {
    calls,
    client: {
      json: async (url, options) => {
        calls.push({ url, headers: options?.headers })
        return { ergebnisliste: pageItems(url) }
      },
      text: async () => '',
    },
  }
}

const adapter = getAdapter('arbeitsagentur')

describe('arbeitsagentur board', () => {
  it('queries per keyword and scope with the public API key, deduping by refnr', async () => {
    const { client, calls } = recordingClient(() => [listItem])
    const postings = await adapter.fetchBoard!(client, {
      pages: 1,
      keywords: ['vue', 'nuxt'],
      cities: ['Köln'],
      remote: true,
    })

    // 2 keywords × (1 city + 1 home-office scope) = 4 requests, 1 unique posting
    expect(calls).toHaveLength(4)
    expect(calls.every(c => c.headers?.['X-API-Key'] === 'jobboerse-jobsuche')).toBe(true)
    expect(calls[0]!.url).toContain('was=vue')
    expect(calls[0]!.url).toContain('zeitarbeit=false')
    expect(calls[0]!.url).toContain(`wo=${encodeURIComponent('Köln')}&umkreis=50`)
    expect(calls[1]!.url).toContain('arbeitszeit=ho')

    expect(postings).toHaveLength(1)
    const p = postings[0]!
    expect(p.source).toBe('arbeitsagentur')
    expect(p.nativeId).toBe('10000-1205400559-S')
    expect(p.company).toBe('Head-on Solutions GmbH')
    expect(p.location).toBe('Nürnberg, Mittelfranken')
    expect(p.publishedAt).toBe('2026-02-05')
    expect(p.descriptionHtml).toBeNull() // fetched lazily via fetchDetail
    expect(p.url).toBe(
      'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1205400559-S',
    )
  })

  it('is inert without keywords or scopes — no Germany-wide flood', async () => {
    const { client, calls } = recordingClient(() => [listItem])
    expect(await adapter.fetchBoard!(client, { keywords: [], cities: ['Köln'] })).toEqual([])
    expect(await adapter.fetchBoard!(client, { keywords: ['vue'], cities: [], remote: false }))
      .toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('fetches details with a base64 refnr and converts text to HTML', async () => {
    const calls: string[] = []
    const client: HttpClient = {
      json: async (url) => {
        calls.push(url)
        return { stellenangebotsBeschreibung: 'Wir suchen <dich> & bieten:\n- Vue 3' }
      },
      text: async () => '',
    }
    const html = await adapter.fetchDetail!(client, 'unbekannt', '10000-1205400559-S')
    expect(calls[0]).toContain(
      `/pc/v4/jobdetails/${Buffer.from('10000-1205400559-S').toString('base64')}`,
    )
    expect(html).toBe('Wir suchen &lt;dich&gt; &amp; bieten:<br>- Vue 3')
  })
})
