# Phase 83: Istanbul-Based Subprocess Coverage Reporting - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an explicit local coverage workflow that spans the existing shared-process unit runner and isolated subprocess command/E2E files, then emits Istanbul-format reports developers can inspect and Phase 84 can consume.

This phase is about coverage generation and reporting only. It does not replace the current test runner architecture, does not turn coverage into a CI concern, and does not use documentation caveats as a substitute for real subprocess source coverage.

</domain>

<decisions>
## Implementation Decisions

### Coverage command surface
- **D-01:** Add `bun run coverage` as the primary full-suite entrypoint for coverage generation.
- **D-02:** Also add `bun run coverage:unit` and `bun run coverage:integ` so coverage flows mirror the repo's existing `test`, `test:unit`, and `test:integ` split instead of introducing a new flag-only interface.

### Report bundle
- **D-03:** Default coverage runs emit a terminal summary, a browsable HTML report, and machine-readable Istanbul artifacts in the same pass.
- **D-04:** The machine-readable bundle should include at least merged `coverage-final.json`, summary JSON, and LCOV output so later local gates and tooling can consume stable artifacts without extra conversion steps.

### Artifact layout and cleanup
- **D-05:** Final coverage outputs live in a stable ignored `.coverage/` directory at the repo root.
- **D-06:** Instrumented source trees and per-process scratch artifacts are disposable implementation details: rebuild them each run rather than preserving them as long-lived debugging assets.

### Coverage accounting
- **D-07:** Coverage reports should include all `src/**/*.ts` files, not only files exercised during a given run.
- **D-08:** Untouched source files should appear as 0% covered so the reports remain honest and future local gates can reason about the full shipped source surface.

### Locked upstream constraints
- **D-09:** Build on the Phase 82.1 Istanbul proof and the milestone spike findings: use Istanbul-compatible source instrumentation plus per-process coverage collection/merge rather than reopening Bun V8/c8-only approaches.
- **D-10:** Coverage stays opt-in. Normal `bun run test`, `bun run test:unit`, and `bun run test:integ` flows should keep their current non-coverage behavior and avoid material slowdown unless a coverage command is invoked.

### the agent's Discretion
- Exact implementation split between `package.json` scripts, dedicated helper scripts, and any coverage-specific runner modules, as long as the user-facing command surface stays `coverage`, `coverage:unit`, and `coverage:integ`.
- Exact intermediate artifact naming and temp-directory structure under `.coverage/` or system temp space, as long as final outputs remain stable and disposable intermediates do not accumulate across runs.
- Exact include/exclude handling beyond the locked `src/**/*.ts` accounting rule, such as whether generated files or obvious non-runtime support files need explicit exclusion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` §Phase 83 — goal and success criteria for the coverage command, subprocess source coverage, stable artifact directory, and opt-in performance expectations.
- `.planning/REQUIREMENTS.md` §Coverage Reporting (`COVR-01` through `COVR-04`) — required outcomes for full-suite coverage, subprocess inclusion, artifact stability, and non-coverage performance.
- `.planning/STATE.md` — locked milestone decisions and spike findings proving Istanbul source instrumentation works under Bun subprocesses while `NODE_V8_COVERAGE`/`c8` do not satisfy the requirement.
- `.planning/PROJECT.md` §Current Milestone: v0.17.1 E2E Test Coverage — milestone narrative and the explicit subprocess-aware coverage goal.

### Prior phase decisions that constrain Phase 83
- `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md` — thin shared harness, existing helper extension strategy, and the canonical machine-parseable inventory model that later coverage gates will consume.
- `.planning/phases/82.1-support-commands-and-error-path-e2e-coverage/82.1-CONTEXT.md` — the dedicated pre-Phase-83 Istanbul proof handoff and the decision to keep full coverage tooling in Phase 83 rather than smuggling it into support-command work.

### Existing runner and test harness surfaces
- `CLAUDE.md` — required test commands and the rule to use `bun run test` rather than `bun test tests/`.
- `package.json` — current script surface (`test`, `test:unit`, `test:integ`, `typecheck`) that the new coverage commands should mirror.
- `scripts/test-runner.ts` — current unit-vs-integration split runner with no coverage path yet.
- `.planning/codebase/TESTING.md` — current test isolation model, subprocess test patterns, and helper conventions.
- `tests/helpers.ts` — reusable temp-dir, git-env, and config-isolation primitives that any coverage runner support code should extend instead of bypassing.
- `tests/commands/env.test.ts` — representative real CLI subprocess pattern with controlled env and decoded stdout/stderr assertions.
- `tests/commands/status-json.test.ts` — representative isolated config + real repo subprocess pattern for command-style E2E assertions.

### Repo hygiene and artifact placement
- `.gitignore` — current ignore surface; Phase 83 needs to add the stable `.coverage/` artifact directory here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/test-runner.ts`: already classifies the suite into shared-process unit files and isolated integration files, which is the behavioral split the coverage flow must preserve.
- `tests/helpers.ts`: already provides temp directories, isolated git env, and config isolation primitives that can support instrumentation scratch space and hermetic coverage fixtures.
- Existing `tests/commands/*.test.ts` files: already prove the real `bun run src/index.ts` subprocess pattern that coverage must account for rather than sidestep.

### Established Patterns
- The current developer UX is script-driven from `package.json`, with a clear full-suite command plus narrower `:unit` and `:integ` variants.
- Command/E2E tests are isolated per file, while unit tests share a Bun process unless they use `mock.module()`.
- There is no current coverage pipeline, artifact directory, or ignore rule in the repo, so Phase 83 is introducing a new surface rather than extending an existing one.

### Integration Points
- `package.json` is the user-facing home for the new coverage commands.
- `scripts/test-runner.ts` or nearby coverage-specific scripts are the natural orchestration point for reusing the current suite split under instrumentation.
- `.gitignore` must absorb `.coverage/` so the stable output location does not pollute the working tree.
- Phase 84 local gates will depend on the artifact shapes chosen here, so output naming and placement need to stay stable.

</code_context>

<specifics>
## Specific Ideas

- The coverage UX should feel like the existing test UX: one obvious full-suite command plus matching scoped helpers for debugging.
- The default report bundle should be useful without extra tooling: quick terminal summary for fast feedback, HTML for inspection, and standard Istanbul artifacts for automation.
- `.coverage/` should be a clean landing zone for final outputs, not a graveyard of old instrumented source trees and scratch shards.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 83-istanbul-based-subprocess-coverage-reporting*
*Context gathered: 2026-04-11*
