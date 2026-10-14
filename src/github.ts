import { bounded, type EvidenceSource, type Issue, type Comparison } from './domain.js';
import { z } from 'zod';
const issueSchema = z.object({ number: z.number(), title: z.string(), body: z.string().nullable(), state: z.string(), html_url: z.string() });
const comparisonSchema = z.object({
  html_url: z.string(), total_commits: z.number(),
  commits: z.array(z.object({ sha: z.string(), html_url: z.string(), commit: z.object({ message: z.string() }) })),
  files: z.array(z.object({ filename: z.string(), status: z.string(), patch: z.string().optional() })).optional()
});
function normalizeIssue(i: z.infer<typeof issueSchema>): Issue {
  return { number: i.number, title: bounded(i.title, 500), body: bounded(i.body ?? ''), state: i.state, url: i.html_url };
}
export class GitHubSource implements EvidenceSource {
  readonly label: string;
  constructor(private repo: string, private token?: string, private request: typeof fetch = fetch) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('GITHUB_REPO must be owner/repository.');
    this.label = `GitHub: ${repo}`;
  }
  private async get(path: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'github-issue-investigator' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try { response = await this.request(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error('GitHub request failed or timed out. Check network access.'); }
    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (response.status === 429 || (response.status === 403 && remaining === '0'))
        throw new Error('GitHub rate limit reached. Wait before retrying or configure a read-only GITHUB_TOKEN.');
      if (response.status === 401) throw new Error('GitHub authentication failed. Check GITHUB_TOKEN.');
      if (response.status === 404) throw new Error('GitHub resource not found or inaccessible. Check repository, references, and token permissions.');
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    return response.json();
  }
  async searchIssues(query: string) {
    // Prevent a caller from escaping the server-configured repository using search qualifiers.
    if (/[:\r\n]/.test(query) || /\b(?:OR|AND|NOT)\b/.test(query)) throw new Error('Use plain search terms without qualifiers or boolean operators.');
    const q = encodeURIComponent(`repo:${this.repo} is:issue ${query}`);
    const data = z.object({ total_count: z.number(), incomplete_results: z.boolean(), items: z.array(issueSchema) })
      .parse(await this.get(`/search/issues?q=${q}&per_page=20`));
    return { issues: data.items.map(normalizeIssue), total: data.total_count, truncated: data.incomplete_results || data.total_count > data.items.length };
  }
  async getIssue(number: number) {
    return normalizeIssue(issueSchema.parse(await this.get(`/repos/${this.repo}/issues/${number}`)));
  }
  async compareCommits(base: string, head: string): Promise<Comparison> {
    const data = comparisonSchema.parse(await this.get(`/repos/${this.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100`));
    const files = data.files ?? [];
    return {
      base, head, url: data.html_url, totalCommits: data.total_commits,
      commits: data.commits.map(c => ({ sha: c.sha, message: bounded(c.commit.message, 2000), url: c.html_url })),
      files: files.slice(0, 50).map(f => ({ filename: f.filename, status: f.status, patch: f.patch ? bounded(f.patch, 6000) : null })),
      truncated: data.total_commits > data.commits.length || files.length > 50 || files.length >= 300 || files.some(f => !f.patch || f.patch.length > 6000)
    };
  }
}
