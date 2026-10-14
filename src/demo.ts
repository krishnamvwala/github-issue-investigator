import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { reproduce } from './reproducer.js';
const client = new Client({ name: 'investigator-demo', version: '0.1.0' });
const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined));
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.js', import.meta.url))], env: { ...env, INVESTIGATOR_MODE: 'demo' } });
const trace: { tool: string; arguments: Record<string, unknown>; durationMs: number; result: unknown }[] = [];
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`Connected via MCP stdio · ${tools.tools.length} tools available\n`);
  for (const [name, args] of [
    ['search_issues', { query: 'login' }], ['get_issue', { number: 42 }],
    ['get_issue_comments', { number: 42 }],
    ['get_file', { path: 'src/auth/session.ts', ref: 'v1.4.0' }],
    ['compare_commits', { base: 'v1.3.9', head: 'v1.4.0' }],
    ['search_logs', { query: 'SESSION_EXPIRED', release: 'v1.4.0' }]
  ] as [string, Record<string, unknown>][]) {
    const start = performance.now();
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`Tool ${name} failed: ${JSON.stringify(result.content)}`);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    trace.push({ tool: name, arguments: args, durationMs, result });
    console.log(`✓ ${name} (${durationMs} ms)`);
  }
  const repro = reproduce();
  if (repro.originalExpired || !repro.regressedExpired) throw new Error('Synthetic reproducer did not show the expected regression.');
  const report = `# Login regression investigation\n\nSynthetic demo • demo/checkout-api • v1.3.9 → v1.4.0\n\nThis report uses a scripted fixture workflow, not an LLM-generated diagnosis. All demo:// citations refer to fixtures/scenario.json. Full MCP responses and timings are in trace.json.\n\n## Evidence\n\n- [Issue #42](demo://issues/42) reports login failures after v1.4.0.\n- [Commit a13b9c7](demo://commits/a13b9c7) replaces a seconds-based clock with a millisecond clock in src/auth/session.ts. See [release comparison](demo://compare/v1.3.9...v1.4.0).\n- fixtures/logs.json at 2026-10-12T10:02:00Z records SESSION_EXPIRED with expiry ${repro.expiresAtSeconds} and clock ${repro.nowMs}.\n\n## Finding\n\nThe new comparison mixes epoch seconds and milliseconds. The synthetic reproducer returns expired=${repro.regressedExpired}; the original comparison returns expired=${repro.originalExpired} for the same unexpired session.\n\nConfidence: high for this synthetic example because the patch, logs, and executable reproducer agree. No conclusion about a real repository is implied.\n\n## Proposed fix and verification\n\nNormalize the injected millisecond clock with Math.floor(clock.now() / 1000). Test future expiry, exact expiry, and past expiry using a fixed clock. Confirm the clock contract in the real application before applying a fix.\n\n## Tool execution\n\n| Tool | Duration |\n| --- | --- |\n${trace.map(t => `| ${t.tool} | ${t.durationMs} ms |`).join('\n')}\n`;
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/trace.json', JSON.stringify(trace, null, 2) + '\n');
  await writeFile('artifacts/investigation.md', report);
  console.log('\nReproduced: unexpired session rejected by the regressed comparison.\nReport: artifacts/investigation.md\nTrace: artifacts/trace.json');
} finally { await client.close(); }
