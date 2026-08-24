import { describe, expect, it } from 'vite-plus/test'
import { resolveCompanyLogo, type HttpClient } from '../src/index.js'

function suggestClient(payload: unknown): { client: HttpClient; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    client: {
      json: async (url) => {
        calls.push(url)
        return payload
      },
      text: async () => '',
    },
  }
}

describe('resolveCompanyLogo', () => {
  it('prefers the exact name match and builds a favicon URL', async () => {
    const { client } = suggestClient([
      { name: 'Shop-Ware', domain: 'shop-ware.com' },
      { name: 'Shopware', domain: 'shopware.com' },
    ])
    expect(await resolveCompanyLogo(client, 'shopware AG')).toBe(
      'https://icons.duckduckgo.com/ip3/shopware.com.ico',
    )
  })

  it('caches per company and never throws', async () => {
    const failing: HttpClient = {
      json: async () => {
        throw new Error('offline')
      },
      text: async () => '',
    }
    expect(await resolveCompanyLogo(failing, 'Some Failing GmbH')).toBeNull()
    // second call served from cache — the failing client is not consulted again
    const { client, calls } = suggestClient([])
    expect(await resolveCompanyLogo(client, 'Some Failing GmbH')).toBeNull()
    expect(calls).toHaveLength(0)
    expect(await resolveCompanyLogo(client, 'unbekannt')).toBeNull()
  })
})
