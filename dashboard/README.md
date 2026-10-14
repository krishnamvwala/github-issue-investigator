# Trace — investigation replay

A static, browser-only viewer for two recorded MCP investigations. No model calls, GitHub token, build framework, or runtime backend is required.

From the repository root:

```bash
npm run dashboard
```

Open `http://127.0.0.1:4173`. `PORT=4174 npm run dashboard` selects another port. Stop with Ctrl+C.

To build static hosting files:

```bash
npm run dashboard:build
```

The output is `dashboard/dist/`. The tracked `.openai/hosting.json` identifies the private Sites preview. Source files also work with ordinary static hosting; serve ES modules over HTTP rather than opening index.html directly from disk.

## Interaction

- Choose the historical Node.js case or synthetic login regression.
- Replay, pause, reset, adjust speed, or reveal one call at a time.
- Select completed calls to inspect arguments, readable evidence, or the raw MCP response.
- Inspect issue comments, commit-pinned source excerpts, diffs, and logs.
- Download the selected case trace as JSON.
- Review findings, confidence, and missing evidence after the replay completes.

Replay pacing is illustrative. The timing badges and total are the saved tool durations. Findings are authored assessments, not generated in the browser. No live AI or GitHub requests occur.

## Snapshot provenance

`data.js` contains two curated snapshots from actual saved MCP traces:

- `node-fetch`: `artifacts/case-study-evidence.json`, produced by the checked-in Node.js case plan.
- `login-regression`: `artifacts/trace.json`, produced by `npm run demo`.

All Node.js material comes from public GitHub data. The login case is synthetic and labeled throughout. Original full traces remain downloadable from the interface; each source file read includes its resolved commit SHA and line window. These snapshots intentionally do not auto-refresh, preserving a reproducible demo.

When adding a case, review the snapshot for secrets and private data before editing `data.js`. The dashboard renders retrieved text using textContent and only turns HTTPS github.com citations into external links.

## Browser verification

Checked at 1366px desktop and 390px mobile widths: no document-level horizontal overflow, case switching, reset, stepping, replay completion, evidence/raw tabs, source excerpt display, and no browser console errors. The in-app browser did not expose a completed download event during automation, so saving the JSON file remains a browser-level verification limitation.

See [two-minute walkthrough](../docs/walkthrough.md).
