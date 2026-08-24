import { describe, expect, it } from 'vite-plus/test'
import {
  channelDetailFetcher,
  fetchChannel,
  isCrawlableChannel,
  type ChannelSource,
  type HttpClient,
} from '../src/index.js'

function textClient(byUrl: (url: string) => string): { client: HttpClient; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    client: {
      json: async () => ({}),
      text: async (url) => {
        urls.push(url)
        return byUrl(url)
      },
    },
  }
}

const search = { stacks: ['vue', 'php'], cities: ['Köln'] }

describe('isCrawlableChannel', () => {
  it('is true only with a crawl spec', () => {
    expect(isCrawlableChannel({ name: 'a', crawl: { urlTemplate: 'x' } } as ChannelSource)).toBe(true)
    expect(isCrawlableChannel({ name: 'b', recipe: {} } as ChannelSource)).toBe(false)
  })
})

describe('fetchChannel — selectors mode', () => {
  const html = `
    <ul>
      <li class="card">
        <h3 class="title">Senior Vue Engineer</h3>
        <a class="company" href="x">Acme GmbH</a>
        <span class="loc">Köln, Germany</span>
        <a class="link" href="https://de.linkedin.com/jobs/view/senior-vue-4457345623?trk=x">view</a>
      </li>
      <li class="card">
        <h3 class="title">PHP Dev</h3>
        <a class="company" href="y">Beta AG</a>
        <span class="loc">Berlin</span>
        <a class="link" href="https://de.linkedin.com/jobs/view/php-dev-1234567890">view</a>
      </li>
    </ul>`
  const channel: ChannelSource = {
    name: 'linkedin-guest',
    crawl: {
      urlTemplate: 'https://li/search?keywords={keyword}&f_WT={wt}',
      keywords: 'stacks',
      variants: { wt: ['2', '3'] },
      mode: 'selectors',
      item: 'li.card',
      fields: {
        title: 'h3.title',
        company: 'a.company',
        location: '.loc',
        url: { selector: 'a.link', attr: 'href' },
      },
      nativeId: { field: 'url', regex: '-(\\d{8,})' },
    },
  }

  it('expands keyword×variant URLs, parses items, dedupes by nativeId, strips query', async () => {
    const { client, urls } = textClient(() => html)
    const postings = await fetchChannel(client, channel, search)

    // 2 stacks × 2 wt variants = 4 URLs
    expect(urls).toHaveLength(4)
    expect(urls[0]).toContain('keywords=vue')
    expect(urls[0]).toContain('f_WT=2')

    // same 2 postings on every page → deduped to 2 by nativeId
    expect(postings).toHaveLength(2)
    const first = postings[0]!
    expect(first.title).toBe('Senior Vue Engineer')
    expect(first.company).toBe('Acme GmbH')
    expect(first.location).toBe('Köln, Germany')
    expect(first.nativeId).toBe('4457345623') // extracted, not the URL
    expect(first.url).toBe('https://de.linkedin.com/jobs/view/senior-vue-4457345623') // query stripped
    expect(first.source).toBe('linkedin-guest')
    expect(first.descriptionHtml).toBeNull()
  })

  it('drops items missing a title or url', async () => {
    const { client } = textClient(() => '<li class="card"><span class="loc">Köln</span></li>')
    expect(await fetchChannel(client, { ...channel, crawl: { ...channel.crawl!, item: 'li.card' } }, search))
      .toEqual([])
  })
})

describe('fetchChannel — json mode', () => {
  it('walks a dot-path to the array and maps fields', async () => {
    const payload = JSON.stringify({
      data: [
        { id: 42, title: 'Vue Dev', organization: { name: 'JSONCorp' }, apply_url: 'https://j/42' },
      ],
    })
    const { client } = textClient(() => payload)
    const channel: ChannelSource = {
      name: 'vuejobs',
      crawl: {
        urlTemplate: 'https://vuejobs/api/posts',
        mode: 'json',
        item: 'data',
        fields: {
          title: 'title',
          company: 'organization.name',
          url: 'apply_url',
          location: 'nope.missing',
        },
        nativeId: { field: 'url', regex: '(\\d+)$' },
      },
    }
    const postings = await fetchChannel(client, channel, search)
    expect(postings).toHaveLength(1)
    expect(postings[0]!.company).toBe('JSONCorp')
    expect(postings[0]!.nativeId).toBe('42')
    expect(postings[0]!.location).toBeNull()
  })
})

describe('fetchChannel — regex mode', () => {
  it('splits items by pattern and extracts per-item fields', async () => {
    const body = 'JOB["Senior Vue"|"https://s/1"]JOB["PHP Lead"|"https://s/2"]'
    const { client } = textClient(() => body)
    const channel: ChannelSource = {
      name: 'stepstone',
      crawl: {
        urlTemplate: 'https://s/jobs/{keyword}/in-{city}',
        keywords: ['vue-js'],
        mode: 'regex',
        item: 'JOB\\[[^\\]]+\\]',
        fields: {
          title: '"([^"]+)"\\|',
          url: '\\|"([^"]+)"',
        },
      },
    }
    const postings = await fetchChannel(client, channel, search)
    expect(postings.map(p => p.title)).toEqual(['Senior Vue', 'PHP Lead'])
    expect(postings[0]!.url).toBe('https://s/1')
  })
})

describe('channelDetailFetcher', () => {
  it('is undefined without a detail spec', () => {
    expect(channelDetailFetcher({ name: 'x', crawl: { urlTemplate: 'u' } } as ChannelSource))
      .toBeUndefined()
  })

  it('fetches and extracts the description via selector', async () => {
    const channel: ChannelSource = {
      name: 'linkedin-guest',
      crawl: {
        urlTemplate: 'u',
        detail: {
          urlTemplate: 'https://li/jobPosting/{id}',
          selector: '.description__text',
        },
      },
    }
    const fetcher = channelDetailFetcher(channel)!
    const { client, urls } = textClient(() => '<div class="description__text"><p>We use <b>Vue</b>.</p></div>')
    const html = await fetcher(client, 'x', '4457345623')
    expect(urls[0]).toBe('https://li/jobPosting/4457345623')
    expect(html).toBe('<p>We use <b>Vue</b>.</p>')
  })
})
