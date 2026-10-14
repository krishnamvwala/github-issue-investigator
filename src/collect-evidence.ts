import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
const planPath = process.argv[2];
if (!planPath) throw new Error('Usage: npm run case:collect -- path/to/plan.json');
const plan = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), calls: z.array(z.object({
  name: z.enum(['search_issues', 'get_issue', 'get_issue_comments', 'get_file', 'compare_commits', 'search_logs']),
  arguments: z.record(z.string(), z.unknown())
})).min(1).max(30) }).parse(JSON.parse(await readFile(planPath, 'utf8')));
const client = new Client({ name: 'case-study-evidence-collector', version: '0.1.0' });
const env: Record<string, string> = { INVESTIGATOR_MODE: 'github', GITHUB_REPO: plan.repository };
for (const key of ['PATH', 'HOME', 'SYSTEMROOT', 'GITHUB_TOKEN']) if (process.env[key]) env[key] = process.env[key];
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.js', import.meta.url))], env });
const trace: unknown[] = [];
try {
  await client.connect(transport);
  for (const call of plan.calls) {
    const start = performance.now();
    const result = await client.callTool(call);
    trace.push({ ...call, durationMs: Math.round(performance.now() - start), result });
    if (result.isError) throw new Error(`${call.name} failed: ${JSON.stringify(result.content)}`);
    console.log(`✓ ${call.name} ${JSON.stringify(call.arguments)}`);
  }
} finally {
  await client.close();
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/case-study-evidence.json', JSON.stringify({ repository: plan.repository, collectedAt: new Date().toISOString(), trace }, null, 2) + '\n');
}
console.log('Saved artifacts/case-study-evidence.json. Evidence collection does not itself establish a diagnosis.');
