# Channel recipes — field-tested seeds

Seed these via `add_channel` (MCP) or `amt sources add-channel` when the user has
none — after asking. Replace the placeholder keywords, slugs, and cities with the
user's profile.

All sources live in one `sources:` list in sources.yaml; an entry's shape says
how it runs (`execute` is derived and stamped for you):

- **Tool-crawled** — a source with a `crawl:` block (URL template + machine
  parse spec). `amt crawl` fetches it itself, through the same pipeline as any
  board. `amt init` seeds these for LinkedIn and VueJobs. (`execute: tool`)
- **Agent-executed** — a source with only a free-form `recipe:` (no `crawl`
  block). The tool stores it but never runs it; your agent fetches/parses it
  during a round (StepStone, whose detail pages are bot-walled, lives here).
  (`execute: agent`)

Field-tested yield ranking: **LinkedIn ≫ StepStone > VueJobs.**
The tracked-company ATS crawl is the verifier/closer, not a discovery channel.

## The `crawl:` spec

```yaml
crawl:
  urlTemplate: "https://…/search?keywords={keyword}&f_WT={wt}"  # {keyword},{city} + variant tokens
  keywords: stacks            # 'stacks' = the profile's stacks, or an explicit list
  variants: { wt: ["2", "3"] } # each {token} expanded as a cartesian product
  headers: { User-Agent: "Mozilla/5.0 …" }
  mode: selectors             # selectors (CSS) | regex | json
  item: "li.card"             # selectors: item selector · json: dot-path to array · regex: per-item pattern
  fields:                     # bare string = the natural locator for the mode
    title: "h3.title"
    company: "a.company"
    location: ".loc"
    url: { selector: "a.link", attr: href }   # {selector,attr} | {path} | {regex}
  nativeId: { field: url, regex: "-(\\d{8,})" }  # canonical id extractor (else the URL)
  detail:                     # optional: fetched once per new posting for the description
    urlTemplate: "https://…/jobPosting/{id}"
    selector: ".description__text"
  render: false               # true = fetch via the bundled Chromium (JS/bot-walled pages)
```

A source with the fields above is validated live against LinkedIn and VueJobs
in the seeds below. Everything else stays an agent-executed `recipe:`.

```yaml
sources:
  - name: linkedin-guest
    description: LinkedIn guest search API — personal use, agent-executed
    crawl:
      urlTemplate: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={keyword}&location=Germany&f_WT={wt}&f_TPR=r604800
      keywords: stacks
      variants: { wt: ["2", "3"] } # 2 remote, 3 hybrid; f_TPR=r604800 = last 7 days
      headers: { User-Agent: "Mozilla/5.0 … Chrome/128 Safari/537.36" }
      mode: selectors
      item: li
      fields:
        title: h3.base-search-card__title
        company: h4.base-search-card__subtitle a
        location: .job-search-card__location
        url: { selector: a.base-card__full-link, attr: href }
      nativeId: { field: url, regex: "-(\\d{8,})" }
      detail:
        urlTemplate: https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}
        selector: .description__text
    priority: 1
    yield: very high — the main discovery channel in practice
  - name: vuejobs
    description: VueJobs internal API — tool-crawled (JSON)
    crawl:
      urlTemplate: https://vuejobs.com/api/posts
      mode: json
      item: data
      fields:
        title: title
        company: organization.name
        url: apply_url
        location: work_place
      nativeId: { field: id }
    priority: 3
    yield: medium — small volume, high stack precision
  - name: stepstone
    description: StepStone search pages — agent-executed (detail pages bot-walled)
    recipe:
      urlTemplate: https://www.stepstone.de/jobs/{slug}/in-{city}?radius=100
      slugs: [] # role/stack slugs, e.g. vue-js, nuxt, frontend-entwickler
      params: append &rw=1 for remote; detail pages are flaky — retry with --http1.1
      parse: 'search results: "title":"…", "url":"/stellenangebote--…"; detail pages:
        prefer the application/ld+json JobPosting block (plain-text extraction fails
        on CSS soup); skip dead postings ("Oh nein, der Job ist nicht mehr verfügbar")'
    priority: 2
    yield: high — good discovery via slugs, flaky detail pages
```

For a JS-rendered or bot-walled channel, add `render: true` to its `crawl:`
block — amt fetches it through the bundled Chromium (the same engine that makes
the PDFs). Use it sparingly; plain HTTP is faster and stabler.

Grow the list organically: when a channel keeps surfacing companies, try
`add_source <company>` — if their ATS is supported, they upgrade from
occasional discovery to being crawled on every run.
