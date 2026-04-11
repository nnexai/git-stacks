# Phase 84: Local Coverage Gates, Docs, and Release Prep - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the local verification and release-prep layer that keeps the machine-parseable E2E inventory, mapped test coverage, Phase 83 coverage outputs, and existing quality commands aligned for maintainers working outside CI.

This phase is about local gates, focused docs/release updates, and the README debug-format refresh. It does not introduce CI, does not add mandatory numeric coverage thresholds, and does not turn into a broad rewrite of the entire testing documentation story.

</domain>

<decisions>
## Implementation Decisions

### Verification entrypoint
- **D-01:** Add one stable `bun run verify` umbrella command as the primary maintainer-facing local verification path.
- **D-02:** Documentation should still show the underlying component commands beneath `bun run verify` so maintainers can run or debug individual checks directly.

### Gate failure style
- **D-03:** Inventory and mapping gates should aggregate all detected problems into one report, then exit non-zero.
- **D-04:** The local gate UX should optimize for maintenance cleanup in one pass rather than fail-fast reruns for each missing inventory entry or unmapped test.

### Docs and release-prep scope
- **D-05:** README/CHANGELOG/version updates should stay tightly focused on the new coverage command(s), the `bun run verify` workflow, the inventory gates, and required release metadata.
- **D-06:** Do not broaden Phase 84 into a general rewrite of testing architecture docs or unrelated CLI documentation.

### Debug logging documentation
- **D-07:** Replace the existing older bracket/timing README examples in place with examples that match the shipped key/value stderr format.
- **D-08:** Document `GS_DEBUG` as the primary debug interface, while still noting `GIT_STACKS_DEBUG=1` as a legacy compatibility alias rather than the main recommendation.

### Locked upstream constraints
- **D-09:** Phase 84 gates must treat the Phase 80 machine-parseable inventory as the canonical source of truth for in-scope command coverage.
- **D-10:** Phase 84 must consume the stable `.coverage/` outputs produced by Phase 83 rather than redefining the coverage artifact contract.
- **D-11:** Verification remains local-only for this milestone; do not add CI workflows or mandatory numeric coverage thresholds here.

### the agent's Discretion
- Exact breakdown of helper scripts beneath `bun run verify`, as long as the top-level maintainer entrypoint stays stable and documented.
- Exact formatting of the aggregated gate report, including whether it groups by missing inventory entry, unmapped test, or supporting artifact issue.
- Exact scope of version/changelog edits needed for release prep, as long as they stay focused on the shipped E2E/coverage/verification surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` §Phase 84 — goal and success criteria for local gates, documented verification path, release prep, and the README debug-format refresh.
- `.planning/REQUIREMENTS.md` §Local Regression Gates (`GATE-01` through `GATE-03`) — required outcomes for inventory/test mapping gates and compatibility with existing quality commands.
- `.planning/REQUIREMENTS.md` §Coverage Reporting (`COVR-01` through `COVR-04`) — artifact expectations Phase 84 will consume from Phase 83.
- `.planning/STATE.md` — locked milestone decisions: local-only verification, canonical machine-parseable inventory, no CI, and backlog 999.2 promoted into Phase 84 success criteria.
- `.planning/PROJECT.md` §Current Milestone: v0.17.1 E2E Test Coverage — broader milestone narrative tying inventory, coverage, and local verification together.

### Prior phase decisions that constrain Phase 84
- `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md` — inventory source-of-truth and thin-harness decisions that the local gates must respect.
- `.planning/phases/83-istanbul-based-subprocess-coverage-reporting/83-CONTEXT.md` — locked coverage command surface, artifact bundle, `.coverage/` directory, and full-source accounting decisions that Phase 84 must consume.
- `.planning/phases/82.1-support-commands-and-error-path-e2e-coverage/82.1-CONTEXT.md` — milestone boundary reminder that broad coverage tooling belongs in the later coverage/gates phases.

### Existing verification and release-prep surfaces
- `package.json` — current script surface where `bun run verify` and related helpers will live.
- `scripts/test-runner.ts` — current split test runner that Phase 84 verification must keep compatible with existing `test`, `test:unit`, and `test:integ` flows.
- `.gitignore` — existing ignore file that will need to cover the stable `.coverage/` directory introduced by Phase 83.
- `README.md` §Debug Output — current examples still describe the older bracket/timing format and need an in-place refresh to the shipped key/value format.
- `CHANGELOG.md` — current released documentation surface that will need focused release-prep updates for the new coverage and verification workflow.
- `src/lib/observability.ts` — source of truth for the shipped key/value debug-line format the README examples must match.
- `src/index.ts` — source of truth for `GS_DEBUG` / `GIT_STACKS_DEBUG` observability bootstrap behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` already exposes the project's canonical maintainer workflows through Bun scripts, which makes it the natural home for a stable `bun run verify` command.
- `scripts/test-runner.ts` already separates unit and integration runs cleanly, so the Phase 84 verification flow can compose existing commands instead of inventing a second testing interface.
- `src/lib/observability.ts` already emits the shipped key/value stderr format (`op=... module=... msg=...`), which gives the README refresh a concrete runtime source of truth.

### Established Patterns
- Maintainer-facing workflows are script-driven and documented in `README.md`, not hidden behind CI-only automation.
- The current README debug section is slightly stale: it still explains the old bracket/timing output style even though the shipped implementation now emits key/value lines.
- The repo currently has no umbrella `verify` script and no implemented inventory gate surface, so Phase 84 is defining a new maintainer workflow rather than tweaking an existing one.

### Integration Points
- `package.json` is the main entrypoint for the new `bun run verify` workflow and any underlying helper scripts.
- The Phase 80 inventory artifact and Phase 83 coverage artifacts are the primary inputs that Phase 84 gates must validate together.
- `README.md`, `CHANGELOG.md`, and version metadata are the user-facing release-prep surfaces this phase must touch.

</code_context>

<specifics>
## Specific Ideas

- `bun run verify` should feel like a clean local release-readiness check, with the component commands still visible underneath for debugging.
- Gate failures should be actionable in one pass: show every missing inventory entry or unmapped test instead of making maintainers rerun repeatedly.
- README changes should be surgical: update the verification/coverage path and fix the debug examples to match the real shipped key/value stderr format.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 84-local-coverage-gates-docs-and-release-prep*
*Context gathered: 2026-04-11*
