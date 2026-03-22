# Phase 24: Mock Architecture Refactor - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add injectable `_exec` objects to shell-wrapper modules (`tmux.ts`, `cmux.ts`, `lifecycle.ts`) and create a `prompts` wrapper in `tui/utils.ts`. Update the direct unit tests for these modules to use injection instead of `mock.module()`. This establishes the pattern for future test improvements without a risky full-codebase sweep.

Out of scope: refactoring callers (workspace-ops, TUI, commands) to stop using `mock.module()` — those tests work fine after Phase 23 fixes.

</domain>

<decisions>
## Implementation Decisions

### Shell wrappers get `_exec` objects
- **D-01:** `tmux.ts`, `cmux.ts`, and `lifecycle.ts` each get a mutable `_exec` exported object, following the proven `niri.ts` pattern
- **D-02:** `_exec` shape has two methods: `run(args): Promise<{ exitCode, stdout }>` for commands that return output, and `spawn(args)` for process-spawning where the caller needs a handle (pid, streams, exit promise) rather than waiting for full output. The exact `spawn` return type is at Claude's discretion per module needs (e.g., lifecycle.ts needs stream access for `runHooksCaptured`).
- **D-03:** `git.ts` does NOT get `_exec` — git tests use real git commands against temp repos. Git stays completely unmocked.

### Prompts wrapper in tui/utils.ts
- **D-04:** Extend `src/tui/utils.ts` to export a `prompts` object re-exporting all `@clack/prompts` functions: `text`, `select`, `confirm`, `multiselect`, `spinner`, `intro`, `outro`, `log`, `isCancel`
- **D-05:** Production files that import `@clack/prompts` directly switch to importing from `@/tui/utils`
- **D-06:** Tests for wizard/command files that mock `@clack/prompts` switch to replacing `prompts` object properties — no more `mock.module("@clack/prompts")`

### Scope: direct unit tests only
- **D-07:** Update tests that directly test the refactored modules (e.g., `tmux.test.ts`, `lifecycle.test.ts`) to use `_exec` injection
- **D-08:** Caller tests (workspace-wizard, dashboard, workspace-edit) that mock these modules via `mock.module()` are NOT changed in this phase — they continue working as-is

### Claude's Discretion
- Exact function grouping within `_exec` (which tmux functions use `run` vs `spawn`)
- Whether `lifecycle.ts` needs `spawn` in addition to `run` on its `_exec`
- Handling of `safeText` — whether it stays separate or moves into the `prompts` object

</decisions>

<specifics>
## Specific Ideas

- The `_exec` pattern in `niri.ts` is the gold standard — same shape, same naming convention across all shell wrappers
- `spawn` on `_exec` is for commands where output is expected to be large and unnecessary to capture
- The prompts wrapper establishes a clean abstraction that future phases can build on if a full sweep is ever warranted

</specifics>

<canonical_refs>
## Canonical References

### Existing injectable pattern (model implementation)
- `src/lib/niri.ts` — `_exec` object with `run` method, proven injectable pattern (lines 85-92)
- `tests/lib/niri.test.ts` — How tests use `_exec.run` replacement with cache-busting import

### Shell wrapper modules (refactor targets)
- `src/lib/tmux.ts` — Tmux shell commands, needs `_exec` with `run` + `spawn`
- `src/lib/cmux.ts` — Cmux shell commands, needs `_exec`
- `src/lib/lifecycle.ts` — Hook execution via `Bun.spawn`, needs `_exec`

### Prompt wrapper target
- `src/tui/utils.ts` — Already wraps `safeText`; will be extended with full `prompts` object

### Test infrastructure
- `tests/helpers.ts` — `useIsolatedConfig`, `makeGitRepo`, `makeTmpDir` — existing helpers that enable real I/O testing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_exec` pattern in `niri.ts` — direct model for tmux.ts, cmux.ts, lifecycle.ts
- `safeText()` wrapper in `tui/utils.ts` — proves the wrapper pattern works for clack

### Established Patterns
- Mutable exported object with default implementation — tests replace properties
- Cache-busting dynamic imports (`await import("@/lib/foo?test-id")`) — used for module isolation

### Integration Points
- Production files importing `@clack/prompts` must switch to `@/tui/utils`
- Shell wrapper test files switch from `mock.module()` to `_exec` property replacement

</code_context>

<deferred>
## Deferred Ideas

- Full sweep to zero `mock.module()` across all test files (wsOps object, integration registry params) — do if the pattern proves valuable and the remaining mock.module calls cause pain
- Consolidating `_exec` type definitions into a shared type if patterns converge across modules
- Removing cache-busting query params if mock.module elimination makes them unnecessary

</deferred>

---

*Phase: 24-mock-architecture-refactor*
*Context gathered: 2026-03-22*
