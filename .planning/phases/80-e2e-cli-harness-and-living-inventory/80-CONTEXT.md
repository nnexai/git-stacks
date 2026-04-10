# Phase 80: E2E CLI Harness and Living Inventory - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Phase 80 foundation for v0.17.1 E2E coverage: a real-process CLI harness that runs `git-stacks` inside isolated test homes/config directories, plus a machine-parseable inventory of the in-scope non-TUI, non-integration command and user-flow surface that later phases will map to concrete E2E coverage.

This phase is about harness and inventory foundations only. It does not add the later command-family coverage itself, does not cover TUI or external integrations, and does not turn Phase 80 into a documentation-heavy effort. The canonical inventory artifact is the machine-parseable source itself.

</domain>

<decisions>
## Implementation Decisions

### Harness primitives
- **D-01:** Extend `tests/helpers.ts` with shared real-process CLI harness primitives instead of creating a separate E2E harness subsystem.
- **D-02:** Keep the shared layer small: a reusable `runCli`-style subprocess wrapper, isolated config/git env setup, and reusable fixture builders for disposable repo/template/workspace/config scenarios.
- **D-03:** Keep assertions in each test file. The shared layer provides execution and fixture setup, not a scenario DSL.

### Inventory source and scope
- **D-04:** The canonical inventory source is a typed TypeScript module checked into the repo.
- **D-05:** Inventory entries use stable flow-level IDs. A raw command/subcommand gets its own item only when it truly matches a standalone user flow.
- **D-06:** The inventory does not require a separate human-readable surface. The TypeScript source itself is the canonical artifact.
- **D-07:** Do not invest in hand-maintained prose or a parallel documentation layer for the inventory.

### Failure diagnostics
- **D-08:** Passing E2E scenarios stay quiet by default.
- **D-09:** Failing scenarios emit a rich failure bundle including argv, cwd, exit code, stdout, stderr, and relevant artifact paths.
- **D-10:** Failure diagnostics include only a curated, redacted env subset relevant to the scenario, not the full process environment.

### Claude's Discretion
- Exact helper names and the precise split between `tests/helpers.ts` and nearby test-support files, as long as the shared harness remains an extension of the existing helper layer rather than a separate subsystem.
- Exact inventory type shapes and any optional convenience rendering around the canonical TypeScript source.
- Exact formatting of the failure bundle and the helper boundaries for env redaction.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` §Phase 80 — goal, success criteria, and current inventory/documentation requirement language.
- `.planning/REQUIREMENTS.md` §Coverage Inventory and Harness (`E2E-01` through `E2E-07`) — required outcomes for the inventory, harness, and failure diagnostics.
- `.planning/STATE.md` — locked milestone decisions: non-TUI/non-integration scope, no CI requirement in this milestone, extend `tests/helpers.ts`, and keep the inventory machine-parseable.
- `.planning/PROJECT.md` §What This Is / Core Value / Recent State — project purpose and current milestone narrative.

### Existing test architecture to extend
- `CLAUDE.md` — required test commands and the constraint to use `bun run test` rather than `bun test tests/`.
- `.planning/codebase/TESTING.md` — current test-runner split, isolation model, and existing helper/mocking patterns.
- `scripts/test-runner.ts` — current isolated-process classification for command/integration-style tests.
- `tests/helpers.ts` — existing temp-dir, git-env, isolated-config, and fixture primitives that Phase 80 must extend.

### Existing CLI subprocess patterns
- `tests/commands/template-list.test.ts` — current real CLI spawn pattern using isolated config and decoded stdout/stderr.
- `tests/commands/status-json.test.ts` — current real git repo fixture + CLI JSON assertion pattern.
- `tests/commands/env.test.ts` — current env-sensitive CLI invocation pattern and assertion style.
- `src/index.ts` — real CLI entrypoint the harness should invoke in subprocess tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers.ts`: `makeTmpDir`, `cleanup`, `getTestGitEnv`, `gitExecOptions`, `applyTestGitEnv`, `makeGitRepo`, and `useIsolatedConfig` already solve most of the temp filesystem and git-environment setup that Phase 80 needs.
- Existing command tests already use small local `Bun.spawnSync(["bun", "run", "src/index.ts", ...])` wrappers; these are the concrete pattern to consolidate into shared helpers.
- `scripts/test-runner.ts` already runs `tests/commands/*` in isolated per-file subprocesses, which matches the intended E2E shape.

### Established Patterns
- CLI command tests run the real entrypoint via `bun run src/index.ts` with `stdio: ["pipe", "pipe", "pipe"]`, then decode/assert on stdout and stderr explicitly.
- Config isolation is done with `GIT_STACKS_CONFIG_DIR`, while git-sensitive tests also isolate `HOME`, global git config, and prompt behavior through helper-managed env injection.
- Test helpers provide setup plumbing; assertions remain local to each test file.
- Integration-style test isolation is file-based via the custom runner, not via a separate embedded harness runtime.

### Integration Points
- `tests/helpers.ts` is the main extension point for shared Phase 80 harness primitives and fixture builders.
- `tests/commands/` is the first consumer surface for the shared harness and where later phases will map inventory entries to actual files.
- `scripts/test-runner.ts` and the existing test scripts are the place where any inventory-aware validation or generated inventory output must fit without slowing normal non-coverage runs.
- `src/index.ts` remains the canonical subprocess entrypoint for the harness.

</code_context>

<specifics>
## Specific Ideas

- The TypeScript inventory is the primary artifact and the canonical surface for later planning, mapping, and gates.
- Phase 80 should spend effort on the inventory data model and mapping workflow, not on a parallel documentation layer.
- The harness should feel like a thin standardization of the existing command-test pattern, not a parallel testing framework.

</specifics>

<deferred>
## Deferred Ideas

- Any optional report/export layer built on top of the canonical TypeScript inventory source.

</deferred>

---

*Phase: 80-e2e-cli-harness-and-living-inventory*
*Context gathered: 2026-04-10*
