# Phase 88: Functional Coverage Readiness Gate - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** Auto-generated autonomous context

<domain>
## Phase Boundary

Maintainers need a functional coverage readiness gate that distinguishes green tests, covered source, accepted gaps, deferred external-environment coverage, and must-fix-before-release gaps. This phase produces readiness evidence and local gates for the newly covered Phase 85-87 functional core.

This phase stops before milestone lifecycle finalization. It may prepare release-readiness evidence, update local gates, and classify gaps, but it must not archive the milestone, tag a release, or run `$gsd-complete-milestone`.

</domain>

<decisions>
## Implementation Decisions

### Readiness Evidence
- Produce and document a functional-only coverage view that excludes broad TUI rendering and real external-environment plugins while keeping core integration contracts in scope.
- Classify uncovered functional areas as accepted gap, deferred external-environment coverage, or must-fix-before-release.
- Preserve a clear distinction between "green suite", "covered source", and "functional confidence" in requirements, inventories, and release-readiness docs.

### Gate Strategy
- Prefer targeted sentinel gates for the high-value functional surfaces covered in Phases 85-87 unless numeric thresholds are clearly more stable and useful.
- Local verification remains script-driven; do not add CI workflows.
- Gates should aggregate actionable findings rather than fail-fast on the first gap.
- The canonical `bun run coverage` report remains the source artifact; scoped reports may be generated for analysis but should not force maintainers to manually piece together release readiness.

### Scope Boundary
- In scope: functional-only coverage evidence, accepted-gap classification, local readiness gates, inventory/requirements clarity, and release-readiness documentation.
- Out of scope: broad TUI rendering coverage, real external integration environments, live forge auth, browser/window-manager launches, CI, archive/tag/publish, and milestone lifecycle finalization.

### the agent's Discretion
Exact sentinel list, coverage filtering implementation, output file naming, and docs structure are at the agent's discretion as long as the readiness result is machine-checkable enough for local verification and human-readable enough for release review.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` Phase 88 — success criteria for readiness evidence, accepted gaps, local gates, and release-readiness docs.
- `.planning/REQUIREMENTS.md` GATE-04 and COVR-05 plus out-of-scope coverage exclusions.
- `.planning/STATE.md` Phase 85-88 decisions — green tests are not enough; functional confidence gaps must be closed or classified.

### Prior phase decisions
- `.planning/phases/84.1-coverage-report-accuracy-and-tui-instrumentation-follow-up/84.1-CONTEXT.md` — canonical coverage report and sentinel-hit accuracy gate.
- `.planning/phases/84-local-coverage-gates-docs-and-release-prep/84-CONTEXT.md` — local `bun run verify` workflow, no-CI boundary, and aggregate gate style.
- `.planning/phases/85-core-real-fixture-functional-hardening/85-CONTEXT.md` — core functional surfaces expected to become readiness sentinels.
- `.planning/phases/86-workspace-command-workflow-edge-coverage/86-CONTEXT.md` — command workflow surfaces expected to become readiness sentinels.
- `.planning/phases/87-integration-contract-and-source-module-coverage/87-CONTEXT.md` — integration contract surfaces expected to become readiness sentinels.

### Codebase maps and implementation surfaces
- `.planning/codebase/TESTING.md` — test runner and coverage command usage.
- `scripts/coverage-runner.ts` — canonical coverage report generation.
- `scripts/verify-gates.ts` and `scripts/verify.ts` — local gate and umbrella verification surfaces.
- `tests/e2e-inventory.ts` — machine-parseable command coverage inventory.
- `.coverage/coverage-final.json` — generated source coverage input after `bun run coverage`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-gates.ts` already aggregates local gate findings and is the likely home for readiness sentinels.
- `scripts/verify.ts` already runs the local verification sequence and can compose additional readiness checks.
- `scripts/coverage-runner.ts` already emits `.coverage/coverage-final.json`, `.coverage/coverage-summary.json`, `.coverage/lcov.info`, and `.coverage/index.html`.
- Phase 84.1 already proved sentinel-hit checks for specific source files are practical.

### Established Patterns
- Verification remains local-only and script-driven.
- Gate failures should be actionable in one pass.
- Coverage commands remain opt-in and must not slow normal test runs.
- Generated `.coverage/` artifacts stay out of git; committed evidence should be summaries, docs, or scripts, not raw reports.

### Integration Points
- Plan 88-01 should analyze current coverage and classify accepted/deferred/must-fix gaps.
- Plan 88-02 should implement readiness gates and update release evidence without running milestone finalization.

</code_context>

<specifics>
## Specific Ideas

- Use Phase 85-87 source targets as readiness sentinels: core workspace/git/hooks/files/env/config, workspace command workflows, and integration utilities/contracts.
- Treat real external integration environments as deferred, not failed, if source-level injected-executor contracts are covered.
- Make the final docs explicit that passing tests alone is not the same as functional confidence.

</specifics>

<deferred>
## Deferred Ideas

- Milestone audit, archive, cleanup, tagging, and release publishing are intentionally deferred because the user requested stopping before finalizing the milestone.

</deferred>
