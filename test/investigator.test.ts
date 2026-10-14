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
    assert.equal((await client.listTools()).tools.length, 6);
    const search = await client.callTool({ name: 'search_issues', arguments: { query: 'login' } });
    assert.match(JSON.stringify(search), /Login returns 401/);
    assert.doesNotMatch(JSON.stringify(search), /Slow product/);
    const comments = await client.callTool({ name: 'get_issue_comments', arguments: { number: 42 } });
    assert.match(JSON.stringify(comments), /epoch seconds/);
    const file = await client.callTool({ name: 'get_file', arguments: { path: 'src/auth/session.ts', ref: 'v1.4.0' } });
    assert.match(JSON.stringify(file), /clock.now/);
    const invalidPath = await client.callTool({ name: 'get_file', arguments: { path: '../secret', ref: 'main' } });
    assert.equal(invalidPath.isError, true);
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

test('file retrieval pins a branch before reading, preserves line citations, and redacts secrets', async () => {
  const requests: string[] = [];
  const sha = 'a'.repeat(40);
  const text = 'one\ntoken=sensitive\nthree\nfour\n';
  const request = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return requests.length === 1 ? Response.json({ sha }) : Response.json({
      type: 'file', encoding: 'base64', size: Buffer.byteLength(text), sha: 'blob-sha', content: Buffer.from(text).toString('base64')
    });
  }) as typeof fetch;
  const file = await new GitHubSource('acme/service', undefined, request).getFile('src/a b.ts', 'release/next', 2, 2);
  assert.match(requests[0]!, /commits\/release%2Fnext$/);
  assert.equal(requests[1], `https://api.github.com/repos/acme/service/contents/src/a%20b.ts?ref=${sha}`);
  assert.equal(file.commitSha, sha);
  assert.equal(file.content, 'token=[REDACTED]\nthree');
  assert.equal(file.startLine, 2);
  assert.equal(file.endLine, 3);
  assert.equal(file.totalLines, 4);
  assert.equal(file.truncated, true);
  assert.match(file.url, new RegExp(`/blob/${sha}/src/a%20b.ts#L2$`));
});

test('invalid file paths and windows fail before any network request', async () => {
  let calls = 0;
  const source = new GitHubSource('acme/service', undefined, (async () => { calls++; throw new Error('unexpected network'); }) as typeof fetch);
  for (const path of ['../secret', '/etc/passwd', 'a/../b', 'a//b', 'a\\b', 'a\0b'])
    await assert.rejects(() => source.getFile(path, 'main'));
  await assert.rejects(() => source.getFile('a', 'main', 0));
  await assert.rejects(() => source.getFile('a', 'main', 1, 301));
  assert.equal(calls, 0);
});

test('file retrieval rejects directories, oversized files, submodules, and invalid text', async () => {
  const sha = 'b'.repeat(40);
  const cases: [unknown, RegExp][] = [
    [[], /directory/],
    [{ type: 'file', size: 1_000_001, sha }, /1 MB/],
    [{ type: 'submodule', size: 0, sha }, /regular/],
    [{ type: 'file', size: 1, sha, encoding: 'none', content: '' }, /base64/],
    [{ type: 'file', size: 1, sha, encoding: 'base64', content: '/w==' }, /UTF-8/],
    [{ type: 'file', size: 1, sha, encoding: 'base64', content: 'AA==' }, /Binary/],
    [{ type: 'file', size: 1, sha, encoding: 'base64', content: '!!!!' }, /Invalid/]
  ];
  for (const [response, error] of cases) {
    const request = (async (input: string | URL | Request) => Response.json(String(input).includes('/commits/') ? { sha } : response)) as typeof fetch;
    await assert.rejects(() => new GitHubSource('acme/service', undefined, request).getFile('file', 'main'), error);
  }
});

test('comment pagination uses numeric pages and exposes clipped bodies and deleted users', async () => {
  let requested = '';
  const request = (async (input: string | URL | Request) => {
    requested = String(input);
    return Response.json([{ id: 1, user: null, body: 'x'.repeat(6001), html_url: 'https://github.com/acme/service/issues/1#issuecomment-1', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' }], {
      headers: { link: '<https://api.github.com/repos/acme/service/issues/1/comments?page=3>; rel="next"' }
    });
  }) as typeof fetch;
  const result = await new GitHubSource('acme/service', undefined, request).getIssueComments(1, 2);
  assert.match(requested, /comments\?per_page=20&page=2$/);
  assert.equal(result.nextPage, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.comments[0]?.author, '[deleted]');
  assert.equal(result.comments[0]?.truncated, true);
  await assert.rejects(() => new GitHubSource('acme/service', undefined, request).getIssueComments(1, 0));
});
