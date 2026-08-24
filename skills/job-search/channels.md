# Channel recipes — field-tested seeds

Seed these via `add_channel` (MCP) or `amt sources add-channel` when the user has
none — after asking. Replace the placeholder keywords, slugs, and
cities with the user's profile. These are **agent-executed, personal-use
recipes** — the tool stores them but never runs them; execute them at a
person's pace during a search round, not as bulk crawling.

Field-tested yield ranking: **LinkedIn guest ≫ StepStone > VueJobs > Bing-RSS.**
The tracked-company ATS crawl is the verifier/closer, not a discovery channel.

```yaml
channels:
  - name: linkedin-guest
    description: LinkedIn guest search API — personal use, agent-executed
    recipe:
      urlTemplate: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location={country}&f_WT={wt}&f_TPR=r604800&start={0|25|50}
      keywords: [] # the user's stack + role keywords, e.g. Vue.js, React, Frontend Engineer
      params: f_WT=2 remote, f_WT=3 hybrid; f_TPR=r604800 = last 7 days; paginate
        start=0/25/50; send a browser User-Agent
      parse: <h3 class="base-search-card__title"> = title; company = the <a> inside
        <h4 class="base-search-card__subtitle">; location in
        <span class="job-search-card__location">; href = …/jobs/view/…
    priority: 1
    yield: very high — the main discovery channel in practice
  - name: stepstone
    description: StepStone search pages — personal use, agent-executed
    recipe:
      urlTemplate: https://www.stepstone.de/jobs/{slug}/in-{city}?radius=100
      slugs: [] # role/stack slugs, e.g. vue-js, nuxt, frontend-entwickler
      params: append &rw=1 for remote; detail pages are flaky — retry with --http1.1
      parse: 'search results: "title":"…", "url":"/stellenangebote--…"; detail pages:
        prefer the application/ld+json JobPosting block (plain-text extraction fails
        on CSS soup); skip dead postings ("Oh nein, der Job ist nicht mehr verfügbar")'
    priority: 2
    yield: high — good discovery via slugs, flaky detail pages
  - name: vuejobs
    description: VueJobs internal API — niche, on-target for Vue roles
    recipe:
      urlTemplate: https://vuejobs.com/api/posts
      params: plain GET, JSON array of ~25 postings; undocumented endpoint —
        agent-executed only
      fields: title, description (HTML), salary, seniority, remote, remote_countries,
        work_place, apply_url, organization, published_at
      parse: 'filter by the profile (remote countries / work_place / seniority);
        feed via import with manual fields (apply_url as the URL)'
    priority: 3
    yield: medium — small volume, high stack precision
  - name: bing-rss
    description: Bing RSS fallback for company/role searches
    recipe:
      urlTemplate: https://www.bing.com/search?format=rss&q={urlencoded}
    priority: 4
    yield: fallback only
```

Grow the list organically: when a channel keeps surfacing companies, try
`add_source <company>` — if their ATS is supported, they upgrade from
occasional discovery to being crawled on every run.
