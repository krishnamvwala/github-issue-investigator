# GitHub Issue Investigator

An evidence-first MCP server for investigating software regressions. Connect an MCP-compatible AI client to search issues, inspect release diffs, and correlate sanitized logs in one workflow.

The included demo investigates **“Why does login return 401 after v1.4.0?”** It finds a clock-unit change, correlates error logs, and runs an executable reproducer. It works offline and needs no API keys.

## Run the demo

Requires Node.js 22+ and npm.

```bash
npm ci
npm run demo
```

The demo starts a real MCP server as a child process, discovers its tools, and calls all six over stdio. Outputs:

- `artifacts/investigation.md`: evidence, finding, confidence rationale, and verification plan.
- `artifacts/trace.json`: actual MCP responses, arguments, and measured tool durations.

The demo's orchestration and report are scripted against synthetic fixtures. Live reasoning is performed by your connected AI client; this project does not bundle a model or require an OpenAI API key. Demo links use `demo://` and identify fixture records rather than real GitHub pages.

## Explore the investigation dashboard

```bash
npm run dashboard
```

Open `http://127.0.0.1:4173` to replay the historical Node.js investigation or synthetic login regression. Inspect tool arguments, timings, readable evidence, raw responses, source citations, findings, and missing evidence. Replay controls and trace downloads work entirely in the browser; no API key is needed.

[Two-minute walkthrough guide](docs/walkthrough.md) · [Dashboard documentation](dashboard/README.md) · [Hosted preview — owner-only](https://github-investigator-replay.mvwalakrishna.chatgpt.site)

![Investigation replay dashboard](docs/screenshots/dashboard-desktop.jpg)

This is a replay of recorded MCP responses with curated findings. It makes no live GitHub or AI requests. Build portable static files with `npm run dashboard:build`; output is `dashboard/dist/`.

## Connect an AI client

Build first with `npm run build`. Add the following to a client that supports `mcpServers` configuration, replacing the path with your absolute checkout path. Other clients may use a different configuration format.

```json
{
  "mcpServers": {
    "github-investigator": {
      "command": "node",
      "args": ["/absolute/path/to/github-issue-investigator/dist/server.js"],
      "env": { "INVESTIGATOR_MODE": "demo" }
    }
  }
}
```

Ask the client:

> Read investigator://guide. Investigate login failures after v1.4.0 compared with v1.3.9. Cite the issue, patch, and log timestamps. Separate observations from hypotheses and propose a regression test.

The server also exposes the `investigate-regression` prompt with `symptom`, `base`, and `head` arguments.

### Connect Codex directly

Codex supports local stdio MCP servers. From this checkout, after building:

```bash
codex mcp add github-investigator \
  --env INVESTIGATOR_MODE=github \
  --env GITHUB_REPO=nodejs/node \
  -- node "$PWD/dist/server.js"
codex mcp get github-investigator
```

Use an absolute Node executable path if your desktop app cannot find `node` on its PATH. The command saves the server in your local Codex configuration; it does not commit your machine-specific path to this repository. Open a new Codex chat after adding the server so it can discover the tools. If they do not appear, restart the app.

A first live prompt:

> Use github-investigator to search nodejs/node issues for crash. Read one relevant issue and cite its URL. Tell me what additional version information, logs, or reproducer you need before diagnosing it. Do not infer that an arbitrary release comparison caused the issue.

For the controlled login regression, register a separate demo server with `--env INVESTIGATOR_MODE=demo` and use the demo prompt above. The live repository has no synthetic login incident or bundled logs.

See [official Codex MCP configuration](https://developers.openai.com/codex/mcp).

### Verify live connectivity

```bash
npm run smoke:live
```

This calls all six tools through a real stdio MCP connection against `nodejs/node`, without a token. It reads an issue found by the search and compares `v22.0.0` with `v22.1.0`, then confirms that logs are unavailable. These are independent connectivity checks, not a causal diagnosis. It writes `artifacts/live-trace.json` and `artifacts/live-verification.md`.

Override inputs when needed:

```bash
GITHUB_REPO=owner/repository BASE_REF=v1.0.0 HEAD_REF=v1.0.1 ISSUE_QUERY=crash npm run smoke:live
```

The smoke check makes public network requests and is intentionally separate from offline CI. GitHub rate limits or unavailable references will fail it explicitly.

### Investigate a real repository

Change the server environment in your client configuration:

```json
{
  "INVESTIGATOR_MODE": "github",
  "GITHUB_REPO": "owner/repository",
  "LOG_FILE": "/absolute/path/to/sanitized-logs.json"
}
```

Public GitHub repositories can be read without a token. An optional `GITHUB_TOKEN` increases available API quota or grants access to authorized private repositories. Use a fine-grained token restricted to the target repository with read access to Issues and Contents. Supply secrets through your client's environment facilities; do not commit them.

`LOG_FILE` is optional. Without it, `search_logs` explicitly reports that logs are unavailable. Live mode never falls back to demo logs. Logs are a JSON array:

```json
[
  {
    "timestamp": "2026-10-12T10:02:00Z",
    "level": "error",
    "release": "v1.4.0",
    "message": "login SESSION_EXPIRED"
  }
]
```

Levels: `info`, `warn`, `error`. Files are limited to 2 MB and 10,000 entries. `.env.example` documents variables; `.env` files are not loaded automatically. For local shell execution, Node supports `node --env-file=.env dist/server.js`.

## MCP surface

| Primitive | Name | Purpose |
| --- | --- | --- |
| Tool | `search_issues(query)` | Search plain terms in one configured repository; up to 20 live results |
| Tool | `get_issue(number)` | Read issue title, body, state, and source URL |
| Tool | `get_issue_comments(number, page?)` | Read 20 comments per page with authors, timestamps, nextPage, and citation URLs |
| Tool | `get_file(path, ref, startLine?, maxLines?)` | Resolve a revision to a commit, then read a cited UTF-8 source excerpt |
| Tool | `compare_commits(base, head)` | Inspect release commits and bounded file patches |
| Tool | `search_logs(query, release?)` | Literal substring search in configured logs; up to 50 entries |
| Resource | `investigator://guide` | Investigation workflow and evidence handling |
| Prompt | `investigate-regression` | Request cited findings, uncertainty, and a verification plan |

## Architecture

```mermaid
flowchart LR
    Client[AI client or scripted demo] <-->|MCP over stdio| Server[MCP server]
    Server --> Source[Evidence source interface]
    Source --> GitHub[GitHub REST adapter]
    Source --> Fixture[Synthetic fixture adapter]
    Server --> Logs[Validated local log reader]
    Demo[Demo client] --> Report[Markdown report and JSON trace]
```

`src/mcp.ts` owns the protocol surface. `EvidenceSource` isolates GitHub retrieval from protocol code and enables deterministic integration tests. The GitHub adapter validates upstream responses, bounds patches, uses request timeouts, and returns actionable authentication and rate-limit errors. Logging to stdout is reserved for the MCP protocol in server mode.

## Trust boundaries and limitations

- All tools are read-only. The server does not create issues, modify code, or execute repository content.
- The repository and log path are chosen by the operator. Tool callers cannot supply URLs, repositories, or local filesystem paths. The file tool accepts only relative paths within the configured repository.
- Retrieved issues, comments, source files, patches, and logs are untrusted content. The guide and prompt instruct clients to treat them as evidence. These instructions cannot guarantee a model will resist prompt injection.
- Common credential patterns are redacted from live issue bodies, comments, file content, patches, and log messages. Redaction is best-effort: sanitize logs before use. Retrieved content goes to the connected client and potentially its model provider.
- Files must be UTF-8 text, up to 1 MB. File excerpts contain up to 300 lines and 24,000 characters; `truncated` means the excerpt is partial. Supply `startLine` to read another window. Files are fetched at a resolved commit SHA, which is included in citation URLs. Directories, explicit symlinks, submodules, and binary data are rejected. GitHub may transparently dereference in-repository symlinks in the Contents API.
- Comments return 20 entries per page and up to 6,000 characters per body. `nextPage` identifies more discussion; `truncated` also flags clipped bodies.
- Search returns one page. Comparisons retrieve up to 100 commits and 50 file patches. Missing or bounded patches and incomplete searches are flagged; check `truncated` before concluding the evidence is complete.
- GitHub Enterprise, remote HTTP transport, hosted authentication, and automatic live diagnosis are outside this first version.
- The SDK v1 maintenance line is pinned through the lockfile. See [official SDK documentation](https://ts.sdk.modelcontextprotocol.io/) for supported protocol versions. This server uses local stdio transport.

## Verification

```bash
npm run check
npm test
npm run demo
```

Tests cover MCP discovery and tool calls, prompt/resource access, invalid inputs, repository scoping, rate-limit handling, credential redaction, and expiry boundary behavior, commit-pinned file reads, binary/size rejection, and comment pagination. GitHub HTTP responses are mocked; the offline suite does not depend on network availability. CI runs these checks and uploads the demo artifacts.

## Real investigation case study

[Node.js fetch memory leak: evidence review](docs/cases/node-fetch-memory-leak.md) connects a historical issue, follow-up results, pinned source excerpts, and dependency versions. It separates reported runtime behavior from facts verified through our tools.

Recollect its evidence through MCP:

```bash
npm run case:collect -- docs/cases/node-fetch-memory-leak.plan.json
```

The collector executes the read-only calls in the plan and writes `artifacts/case-study-evidence.json`. It does not perform model inference or execute retrieved code. Codex used these tool results to write the case study; the evidence plan makes retrieval repeatable. Source refs in the plan are immutable commits; GitHub issue discussions can change.

## Portfolio walkthrough

1. Explain the problem: debugging requires joining issues, release changes, and runtime evidence.
2. Run `npm run demo` and show the tool trace and report.
3. Show the seconds/milliseconds patch and the reproducer in `src/reproducer.ts`.
4. Connect an AI client and repeat the investigation using the exposed tools.
5. Discuss tradeoffs: bounded evidence, explicit uncertainty, repository scoping, and adapter isolation.

See [design notes](docs/design.md) for decisions and a follow-up roadmap.

## References

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [GitHub issue search API](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests)
- [GitHub compare API](https://docs.github.com/en/rest/commits/commits#compare-two-commits)
