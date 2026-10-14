import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
// Defaults exercise a real public repository without requiring credentials.
const repo = process.env.GITHUB_REPO ?? 'nodejs/node';
const base = process.env.BASE_REF ?? 'v22.0.0';
const head = process.env.HEAD_REF ?? 'v22.1.0';
const query = process.env.ISSUE_QUERY ?? 'crash';
const client = new Client({ name: 'investigator-live-smoke', version: '0.1.0' });
const env: Record<string, string> = { INVESTIGATOR_MODE: 'github', GITHUB_REPO: repo };
// Explicit allowlist: never inherit a demo mode, log file, or unrelated secrets.
for (const key of ['PATH', 'HOME', 'SYSTEMROOT', 'GITHUB_TOKEN']) {
  if (process.env[key]) env[key] = process.env[key];
}
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.js', import.meta.url))], env });
const trace: unknown[] = [];
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const start = performance.now();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
  const text = z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(result.content)[0]?.text;
  if (!text) throw new Error(`${name}: missing text response`);
  const envelope = z.object({ source: z.string(), data: z.unknown() }).parse(JSON.parse(text));
  if (envelope.source !== `GitHub: ${repo}`) throw new Error('Unexpected evidence source.');
  const durationMs = Math.round(performance.now() - start);
  trace.push({ tool: name, arguments: args, durationMs, result });
  console.log(`✓ ${name} (${durationMs} ms)`);
  return envelope.data;
}
try {
  await client.connect(transport);
  if ((await client.listTools()).tools.length !== 6) throw new Error('Expected six tools.');
  const search = z.object({ issues: z.array(z.object({ number: z.number() })), total: z.number() }).parse(await call('search_issues', { query }));
  const first = search.issues[0];
  if (!first) throw new Error('No matching issues. Try another ISSUE_QUERY.');
  const issue = z.object({ number: z.number(), title: z.string(), url: z.string() }).parse(await call('get_issue', { number: first.number }));
  await call('get_issue_comments', { number: first.number });
  await call('get_file', { path: process.env.FILE_PATH ?? 'lib/timers.js', ref: head, maxLines: 20 });
  const comparison = z.object({ url: z.string(), totalCommits: z.number(), truncated: z.boolean() }).parse(await call('compare_commits', { base, head }));
  const logs = z.object({ available: z.boolean() }).parse(await call('search_logs', { query }));
  if (logs.available) throw new Error('Smoke check must not load local or synthetic logs.');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-trace.json', JSON.stringify({ repository: repo, checkedAt: new Date().toISOString(), trace }, null, 2) + '\n');
  await writeFile('artifacts/live-verification.md', `# Live MCP verification\n\nRepository: ${repo}\n\n- Search returned ${search.total} matching issues.\n- Retrieved [issue #${issue.number}](${issue.url}).\n- Retrieved [${base}...${head}](${comparison.url}): ${comparison.totalCommits} commits; truncated=${comparison.truncated}.\n- Without LOG_FILE, logs correctly report unavailable.\n\nThis is a connectivity smoke check. The selected issue and release range are independent inputs; this check does not establish a causal relationship or diagnose a regression.\n\nActual MCP responses and timings: live-trace.json.\n`);
  console.log(`Live GitHub verification passed: ${repo}\nArtifacts: artifacts/live-verification.md and artifacts/live-trace.json`);
} finally { await client.close(); }
