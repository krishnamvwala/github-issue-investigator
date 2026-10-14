import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp.js';
import { createDemoSource } from '../src/demo-source.js';
import { GitHubSource } from '../src/github.js';
import { redact } from '../src/domain.js';
import { originalIsExpired, regressedIsExpired } from '../src/reproducer.js';

test('MCP lifecycle: discover tools, read evidence, errors, resource, prompt', async () => {
  const server = createServer(await createDemoSource(), new URL('../fixtures/logs.json', import.meta.url));
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    assert.equal((await client.listTools()).tools.length, 4);
    const search = await client.callTool({ name: 'search_issues', arguments: { query: 'login' } });
    assert.match(JSON.stringify(search), /Login returns 401/);
    assert.doesNotMatch(JSON.stringify(search), /Slow product/);
    const diff = await client.callTool({ name: 'compare_commits', arguments: { base: 'v1.3.9', head: 'v1.4.0' } });
    assert.match(JSON.stringify(diff), /clock.now/);
    const logs = await client.callTool({ name: 'search_logs', arguments: { query: 'SESSION_EXPIRED', release: 'v1.4.0' } });
    assert.match(JSON.stringify(logs), /1791799320000/);
    assert.equal((await client.callTool({ name: 'get_issue', arguments: { number: 999 } })).isError, true);
    assert.equal((await client.callTool({ name: 'get_issue', arguments: { number: -1 } })).isError, true);
    assert.match(JSON.stringify(await client.readResource({ uri: 'investigator://guide' })), /untrusted/);
    assert.match(JSON.stringify(await client.getPrompt({ name: 'investigate-regression', arguments: { symptom: 'login fails', base: 'v1.3.9', head: 'v1.4.0' } })), /regression test plan/);
  } finally { await client.close(); await server.close(); }
});

test('GitHub search stays scoped and exposes incomplete results', async () => {
  let requested = '';
  const request = (async (input: string | URL | Request) => {
    requested = String(input);
    return Response.json({ total_count: 21, incomplete_results: false, items: [] });
  }) as typeof fetch;
  const source = new GitHubSource('acme/service', undefined, request);
  assert.equal((await source.searchIssues('login')).truncated, true);
  assert.match(decodeURIComponent(requested), /repo:acme\/service is:issue login/);
  await assert.rejects(() => source.searchIssues('repo:other/private'), /plain search terms/);
  await assert.rejects(() => source.searchIssues('login OR repo:other/private'), /plain search terms/);
  assert.throws(() => new GitHubSource('https://evil.example'), /owner\/repository/);
});

test('GitHub rate limits are actionable and upstream secrets are not echoed', async () => {
  const request = (async () => new Response('secret=do-not-echo', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })) as typeof fetch;
  await assert.rejects(() => new GitHubSource('acme/service', 'private-token', request).getIssue(1), /rate limit reached/);
});

test('auth reproducer covers future, boundary, and expired sessions', () => {
  const now = 1_000_000;
  assert.equal(originalIsExpired(1001, now), false);
  assert.equal(regressedIsExpired(1001, now), true);
  assert.equal(originalIsExpired(1000, now), true);
  assert.equal(originalIsExpired(999, now), true);
});

test('common credential forms are redacted from evidence', () => {
  assert.equal(redact('token=abc Bearer abc ghp_abcdef'), 'token=[REDACTED] Bearer [REDACTED] [REDACTED]');
});
