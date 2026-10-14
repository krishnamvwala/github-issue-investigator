# Design decisions

## Why an MCP server?

The useful integration is a stable set of evidence tools that different AI clients can call. Keeping inference in the client lets the project run without model credentials and makes tool behavior independently testable. The demo is a deterministic MCP client, not an autonomous investigator.

## Why one repository per server?

Operator configuration establishes a narrow retrieval scope. Tools do not accept arbitrary URLs or repository names. This simplifies permissions and reduces accidental cross-repository queries. Search qualifiers and boolean operators are rejected to keep queries inside that scope.

## Why an evidence adapter?

Protocol code should not know GitHub response shapes or fixture storage details. The EvidenceSource interface returns normalized issues and comparisons; the GitHub adapter owns HTTP error handling, validation, and response bounds. The fixture adapter enables reproducible demos without pretending synthetic records are real GitHub data.

## Evidence completeness

Returning an unbounded repository diff makes clients slow and obscures useful evidence. Responses include truncation indicators, null patches where unavailable, source URLs, and commit totals. Issue search and comparisons do not paginate automatically. Discussion callers can request subsequent pages with the comment tool. A client should request narrower revision ranges when data is incomplete.

## Source excerpts and discussion

The file reader resolves a supplied tag or branch before retrieving content, so the returned evidence and its permalink refer to the same immutable commit. It never follows download URLs. Paths are repository-relative and encoded by segment. UTF-8 decoding is strict, binary data is rejected, and source windows preserve line offsets while limiting context.

Comments use numeric page parameters and read only GitHub's next-page indicator, rather than following arbitrary Link URLs. A response distinguishes the next page from clipping within a comment body. Users must inspect both before treating the discussion as complete.

## Confidence

The scripted demo reports high confidence only for its synthetic case: issue, diff, logs, and executable reproducer agree. Live clients are prompted to explain confidence and identify missing evidence. A numerical probability without calibration would be misleading.

## Follow-up roadmap

- Add pagination for issue search and commit comparisons. Comments already support pages, and source reads resolve refs to commit SHAs.
- Add evaluation cases with misleading issues, missing logs, and unrelated changes; measure citation correctness and unsupported conclusions.
- Add a local trace viewer after stabilizing the evidence schema.
- Support GitHub App authentication and remote transport only when a hosted use case requires them.
- Add real-repository demonstrations with maintainer-permitted, sanitized data.
