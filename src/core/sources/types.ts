/** Normalized posting — the bridge between a source API and a job note. */
export interface JobPosting {
  source: string
  /** Source-native id; `${source}:${nativeId}` is the global dedupe key. */
  nativeId: string
  company: string
  title: string
  url: string
  descriptionHtml: string | null
  location: string | null
  workMode: 'remote' | 'hybrid' | 'onsite' | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  /** ISO date (YYYY-MM-DD). */
  publishedAt: string | null
  tags: string[]
}

export interface HttpClient {
  json: (url: string, options?: { headers?: Record<string, string> }) => Promise<unknown>
  text: (url: string, options?: { headers?: Record<string, string> }) => Promise<string>
}

/** Boards that are search APIs (Arbeitsagentur) need the profile's search scope. */
export interface BoardOptions {
  pages?: number
  keywords?: string[]
  cities?: string[]
  remote?: boolean
}

export interface SourceAdapter {
  name: string
  /** ATS adapters are crawled per company slug; boards return postings directly. */
  kind: 'ats' | 'board'
  /** Required for kind 'ats'. */
  fetchCompany?: (client: HttpClient, company: string) => Promise<JobPosting[]>
  /** Required for kind 'board'. */
  fetchBoard?: (client: HttpClient, options?: BoardOptions) => Promise<JobPosting[]>
  /**
   * For ATS where the list endpoint carries no description (N+1 detail
   * requests) — the crawler calls this once per new posting.
   */
  fetchDetail?: (
    client: HttpClient,
    company: string,
    nativeId: string,
  ) => Promise<string | null>
}
