import { readFile } from 'node:fs/promises';
import { fileExcerpt, type EvidenceSource, type Issue, type Comparison, type IssueComment } from './domain.js';
import { fileInput, commentsInput } from './inputs.js';
export async function createDemoSource(): Promise<EvidenceSource> {
  const data = JSON.parse(await readFile(new URL('../fixtures/scenario.json', import.meta.url), 'utf8')) as {
    repository: string; issues: Issue[]; comparison: Comparison; comments: Record<string, IssueComment[]>; files: { path: string; ref: string; commitSha: string; content: string }[];
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
    async getIssueComments(number, page = 1) {
      ({ number, page } = commentsInput.parse({ number, page }));
      if (!data.issues.some(i => i.number === number)) throw new Error(`Demo issue #${number} not found.`);
      const all = data.comments[String(number)] ?? [];
      const comments = all.slice((page - 1) * 20, page * 20);
      const nextPage = all.length > page * 20 ? page + 1 : null;
      return { comments, page, nextPage, truncated: nextPage !== null };
    },
    async getFile(path, ref, startLine = 1, maxLines = 200) {
      ({ path, ref, startLine, maxLines } = fileInput.parse({ path, ref, startLine, maxLines }));
      const file = data.files.find(f => f.path === path && (f.ref === ref || f.commitSha === ref));
      if (!file) throw new Error('Demo file or ref not found.');
      return { path, requestedRef: ref, commitSha: file.commitSha, blobSha: 'synthetic-blob',
        url: `demo://files/${file.commitSha}/${path}#L${startLine}`, ...fileExcerpt(file.content, startLine, maxLines) };
    },
    async compareCommits(base, head) {
      if (base !== data.comparison.base || head !== data.comparison.head)
        throw new Error('Demo supports only v1.3.9...v1.4.0.');
      return data.comparison;
    }
  };
}
