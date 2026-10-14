import { readFile } from 'node:fs/promises';
import type { EvidenceSource, Issue, Comparison } from './domain.js';
export async function createDemoSource(): Promise<EvidenceSource> {
  const data = JSON.parse(await readFile(new URL('../fixtures/scenario.json', import.meta.url), 'utf8')) as {
    repository: string; issues: Issue[]; comparison: Comparison;
  };
  return {
    label: `Synthetic fixture: ${data.repository}`,
    async searchIssues(query) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const issues = data.issues.filter(i => words.every(w => `${i.title} ${i.body}`.toLowerCase().includes(w)));
      return { issues, total: issues.length, truncated: false };
    },
    async getIssue(number) {
      const issue = data.issues.find(i => i.number === number);
      if (!issue) throw new Error(`Demo issue #${number} not found.`);
      return issue;
    },
    async compareCommits(base, head) {
      if (base !== data.comparison.base || head !== data.comparison.head)
        throw new Error('Demo supports only v1.3.9...v1.4.0.');
      return data.comparison;
    }
  };
}
