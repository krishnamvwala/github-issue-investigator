export interface Issue { number: number; title: string; body: string; state: string; url: string }
export interface Comparison {
  base: string; head: string; url: string; totalCommits: number;
  commits: { sha: string; message: string; url: string }[];
  files: { filename: string; status: string; patch: string | null }[];
  truncated: boolean;
}
export interface LogEntry { timestamp: string; level: 'info' | 'warn' | 'error'; release: string; message: string }
export interface RepositoryFile {
  path: string; requestedRef: string; commitSha: string; blobSha: string; url: string;
  content: string; startLine: number; endLine: number; totalLines: number; truncated: boolean;
}
export interface IssueComment {
  id: number; author: string; body: string; url: string; createdAt: string; updatedAt: string; truncated: boolean;
}
export interface CommentsPage {
  comments: IssueComment[]; page: number; nextPage: number | null; truncated: boolean;
}
export interface EvidenceSource {
  label: string;
  searchIssues(query: string): Promise<{ issues: Issue[]; total: number; truncated: boolean }>;
  getIssue(number: number): Promise<Issue>;
  getFile(path: string, ref: string, startLine?: number, maxLines?: number): Promise<RepositoryFile>;
  getIssueComments(number: number, page?: number): Promise<CommentsPage>;
  compareCommits(base: string, head: string): Promise<Comparison>;
}
export function redact(text: string): string {
  return text.replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:password|token|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}
export function bounded(text: string, max = 12000): string {
  const clean = redact(text);
  return clean.length > max ? clean.slice(0, max) + '\n[truncated]' : clean;
}

/** Preserve line offsets for citations while limiting model context. */
export function fileExcerpt(text: string, startLine: number, maxLines: number) {
  const lines = text === '' ? [] : text.replace(/\r\n/g, '\n').split('\n');
  if (text.endsWith('\n')) lines.pop();
  if (startLine > Math.max(lines.length, 1)) throw new Error('startLine exceeds the file length.');
  const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
  const raw = selected.join('\n');
  return {
    content: bounded(raw, 24000), startLine, endLine: startLine + selected.length - 1,
    totalLines: lines.length, truncated: startLine > 1 || startLine - 1 + selected.length < lines.length || redact(raw).length > 24000
  };
}
