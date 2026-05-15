# Phase 85: Core Real-Fixture Functional Hardening - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** Auto-generated infrastructure context

<domain>
## Phase Boundary

Core workspace, git, file, hook, env, config, and rollback behavior must gain high-value functional coverage through real temp directories, isolated config homes, and local git repositories. This phase improves confidence in stable source behavior; it is not a CLI wording rewrite, prompt-driving expansion, TUI rendering effort, CI setup, or release-finalization pass.

Coverage improvements must come from executing real source modules. Tests must not inline copies of implementation logic or satisfy coverage by asserting against duplicated mock behavior.

</domain>

<decisions>
## Implementation Decisions

### Real-Fixture Priority
- Prefer real temp directories, isolated config homes, local repositories, and bare remotes over broad command-wrapper-only assertions.
- Cover rollback, cleanup, rename, merge, missing path, destructive safety boundaries, sync/pull/push failures, and no-op cases where the behavior is stable and automation-safe.
- Extend existing helpers, especially `tests/helpers.ts`, when shared fixture setup will be reused across this milestone.
- Keep tests focused on meaningful behavior contracts rather than brittle formatting, spinner text, or incidental ordering unless the text/order is part of a safety or machine-readable contract.

### Source Coverage Integrity
- Exercise real `src/lib/**` modules and existing public helper APIs instead of copying implementation logic into test mocks.
- When subprocess isolation or `mock.module()` is needed, follow the custom runner classification and avoid `bun test tests/` directly.
- Use coverage review to find focused core-module gaps after the first three plan areas land, then close only high-value gaps inside this phase boundary.

### Scope Boundary
- In scope: workspace lifecycle, git operations, hook execution, file operations, env/secrets/ports/config, and coverage-report review for core source modules.
- Out of scope: `git-stacks edit` and `git-stacks template edit` flows, broad TUI behavior, external desktop/plugin environments, CI workflows, and milestone finalization.
- Keep Phase 86 command-workflow edges, Phase 87 integration contracts, and Phase 88 readiness gates out of this phase unless a narrow helper is required for Phase 85 tests.

### the agent's Discretion
Exact test file grouping, helper names, fixture factory shape, and the focused coverage-gap closure order are at the agent's discretion as long as they respect the real-fixture and real-source contracts above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` Phase 85 — success criteria for workspace lifecycle, git, hooks, files, env/secrets/ports/config, and real-source coverage.
- `.planning/STATE.md` Phase 85-88 decisions — functional confidence gaps must be closed or classified before v0.17.1 can close.
- `.planning/REQUIREMENTS.md` — CORE and GATE requirements for functional confidence coverage.
- `.planning/PROJECT.md` — v0.17.1 milestone scope and local verification framing.

### Prior phase decisions
- `.planning/phases/84.1-coverage-report-accuracy-and-tui-instrumentation-follow-up/84.1-CONTEXT.md` — canonical `bun run coverage` report and sentinel-hit expectations.
- `.planning/phases/84-local-coverage-gates-docs-and-release-prep/84-CONTEXT.md` — local `bun run verify` gate model and no-CI/no-threshold boundary.
- `.planning/phases/81-workspace-and-git-operation-e2e-coverage/81-CONTEXT.md` — earlier workspace/git E2E coverage boundary to avoid duplicating lower-value cases.

### Codebase maps
- `.planning/codebase/TESTING.md` — custom test runner, mock isolation, helper usage, and required test commands.
- `.planning/codebase/STRUCTURE.md` — source/test layout and core module locations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers.ts` already contains shared temp-directory, isolated-config, git, workspace, template, registry, real-module, and mock helper patterns.
- `scripts/test-runner.ts` is the canonical test entrypoint; files using `mock.module()` must run in isolated processes.
- `scripts/coverage-runner.ts`, `scripts/coverage-preload.ts`, and `scripts/verify-gates.ts` provide the coverage and local gate surfaces that Phase 85 should consume, not redefine.
- Core source targets include `src/lib/workspace-ops.ts`, `src/lib/git.ts`, `src/lib/lifecycle.ts`, `src/lib/files.ts`, `src/lib/env.ts`, `src/lib/secrets.ts`, `src/lib/ports.ts`, and `src/lib/config.ts`.

### Established Patterns
- Tests use `bun:test`, `beforeEach`/`afterEach` temp setup, and `afterAll` cleanup for shared isolated config roots.
- Module-level mocks must be installed before dynamic imports and are process-global, so reusable real-source coverage often needs careful import order.
- Local verification is script-driven through `package.json`, with `bun run test`, `bun run test:unit`, `bun run test:integ`, `bun run coverage`, and `bun run verify` as the maintainer-facing paths.
- Coverage artifacts live under `.coverage/` and should remain disposable generated output.

### Integration Points
- Plan 85-01 should anchor in `src/lib/workspace-ops.ts` and existing workspace lifecycle tests.
- Plan 85-02 should anchor in `src/lib/git.ts` and local bare-remote fixtures.
- Plan 85-03 should anchor in `src/lib/lifecycle.ts`, `src/lib/files.ts`, `src/lib/env.ts`, `src/lib/secrets.ts`, `src/lib/ports.ts`, and `src/lib/config.ts`.
- Plan 85-04 should inspect the generated coverage report and close focused core-module gaps without broadening into Phase 86-88 work.

</code_context>

<specifics>
## Specific Ideas

- The user previously wanted helpers to be used throughout building tests, so extend shared helpers rather than replacing them.
- The user also put editor-launching `git-stacks edit` and `git-stacks template edit` flows out of scope; keep that boundary intact.
- The milestone concern is functional confidence, not just green tests. Prefer scenarios that catch real filesystem, git, config, and rollback regressions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
