# Historical investigation: Node.js fetch memory leak

Question: What evidence supports the reported fetch/AbortController memory leak in Node v18.16.0, and what changed in a release reported to resolve it?

Codex reviewed evidence retrieved through this project's MCP server. This is a historical evidence review, not a newly reproduced bug or a claim that we fixed Node.js. No upstream reproduction repository was cloned or executed.

## Reported behavior

[Node.js issue #48478](https://github.com/nodejs/node/issues/48478) reports memory growth after at least 1,000 native fetch calls with an AbortController signal on v18.16.0. It links a minimal reproduction and an upstream Undici fix. The reporter says v18.15.0 did not show the issue. These are reporter observations, not measurements made by this project.

## Discussion changes the assessment

Reading the issue alone misses useful evidence:

- [An early comment](https://github.com/nodejs/node/issues/48478#issuecomment-1603463197) reports a leak in v18.9.1 too. That makes a universal “first introduced in v18.16.0” claim unsupported.
- [A later follow-up](https://github.com/nodejs/node/issues/48478#issuecomment-1650225682) reports the problem in v18.16.1 and resolution in v18.17.0.
- [A subsequent comparison](https://github.com/nodejs/node/issues/48478#issuecomment-1879382635) supplies an out-of-memory trace for v18.16.0 and output reaching 10,000 iterations on v18.19.0.

The tool returned all four comments on one page, with no body clipping and no next page at collection time. The issue was closed. Closure alone is not evidence that every related memory problem is resolved.

## Facts verified in pinned source

The file tool resolved both release tags, then read the files at their commit SHAs:

| Release | Resolved commit | Bundled Undici |
| --- | --- | --- |
| v18.16.0 | `43d167a262d0772a73ec1e21316e722bad71e4f8` | [5.21.0](https://github.com/nodejs/node/blob/43d167a262d0772a73ec1e21316e722bad71e4f8/deps/undici/src/package.json#L3) |
| v18.17.0 | `a39b8a2a3e8414c8a54650bdfe4a46998282d88a` | [5.22.1](https://github.com/nodejs/node/blob/a39b8a2a3e8414c8a54650bdfe4a46998282d88a/deps/undici/src/package.json#L3) |

In the older Request implementation, the abort callback directly captures its AbortController, and finalizer registration uses the Request as the target. See [v18.16.0 source, lines 354–370](https://github.com/nodejs/node/blob/43d167a262d0772a73ec1e21316e722bad71e4f8/deps/undici/src/lib/fetch/request.js#L354-L370).

The later implementation stores the controller on the Request, uses a WeakRef inside the abort callback, and changes the finalizer target to the controller. See [v18.17.0 source, lines 355–385](https://github.com/nodejs/node/blob/a39b8a2a3e8414c8a54650bdfe4a46998282d88a/deps/undici/src/lib/fetch/request.js#L355-L385).

Those are directly visible code differences. They support investigating signal/controller retention and agree with the direction of the reported dependency fix. They do not independently prove the runtime retention mechanism or isolate the exact fixing commit: other changes landed between these releases.

## Assessment and remaining verification

Confidence is high that the selected releases bundle different Undici versions and have the cited lifecycle changes. Confidence in the reported runtime resolution comes from the linked discussion; this project did not independently measure it.

A causal diagnosis would require running a reviewed reproducer with matched workloads on the affected and comparison runtimes, measuring retained heap after warm-up and garbage collection, and testing the same workload without a signal. The signal and no-signal cases should run in separate processes with the same response-body handling. A leak assertion should use sustained retained growth rather than one noisy memory sample. Historical runtimes would be isolated for this experiment.

No application logs were configured. The MCP log tool explicitly returned unavailable. We did not infer that all fetch leaks share this cause, that a newer runtime is affected, or that the initial crash issue #66714 is related.

## Reproduce the evidence collection

```bash
npm ci
npm run case:collect -- docs/cases/node-fetch-memory-leak.plan.json
```

The plan records the issue, discussion page, immutable source windows, package manifests, and missing-log check. The collector writes actual MCP results and timings to `artifacts/case-study-evidence.json`. It is a retrieval runner, not a diagnosis engine. GitHub issues and comments remain mutable; pinned source citations remain tied to the inspected revisions.

## Portfolio value

The two added tools materially improve the investigation: discussion prevents an unsupported version claim, and pinned source connects the reported behavior to concrete dependency and implementation changes. The useful result includes both evidence and a clear stopping point where runtime verification is still required.
