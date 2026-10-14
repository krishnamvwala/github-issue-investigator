export interface Issue { number: number; title: string; body: string; state: string; url: string }
export interface Comparison {
  base: string; head: string; url: string; totalCommits: number;
  commits: { sha: string; message: string; url: string }[];
  files: { filename: string; status: string; patch: string | null }[];
  truncated: boolean;
}
export interface LogEntry { timestamp: string; level: 'info' | 'warn' | 'error'; release: string; message: string }
export interface EvidenceSource {
  label: string;
  searchIssues(query: string): Promise<{ issues: Issue[]; total: number; truncated: boolean }>;
  getIssue(number: number): Promise<Issue>;
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
