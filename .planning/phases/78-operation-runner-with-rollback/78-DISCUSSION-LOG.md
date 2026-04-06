# Phase 78: Operation Runner with Rollback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 78-operation-runner-with-rollback
**Areas discussed:** Runner coverage & extraction, Runner API shape, Step scope, Error contract, Commit order, Caller migration, YAML-as-step

---

## Runner coverage & extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Create only + extract shared fn | New `createWorkspace()` in `workspace-lifecycle.ts` uses the runner. Both wizard and `App.tsx` call it — fixes CONCERNS.md:51-55 duplication. Remove/clean/merge stay on the existing cascade. | ✓ |
| Create + remove/merge, all via runner | Extract `createWorkspace()` AND refactor remove/clean/merge to runner steps. More uniform but rollback for teardown is semantically empty. | |
| Create only, don't extract — wire runner inside wizard | Runner wired inline in `workspace-wizard.ts` and `App.tsx` separately. Leaves duplication in place. | |

**User's choice:** Create only + extract shared fn (Recommended)
**Notes:** Phase 78 resolves the long-standing "Dashboard Duplicates Workspace Creation Logic" concern as a natural side-effect. `workspace-ops.ts` facade stays locked per Phase 75 D-11.

---

## Runner API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Imperative `runner.do(fwd, undo)` | Each call runs forward immediately and pushes undo. On throw, LIFO rollback. Matches existing `App.tsx:883-911` proto-pattern. | ✓ |
| Declarative step list `runner.run([{name, do, undo}, ...])` | Build array of Step objects, then runner walks them. Easier to dry-run but awkward closure capture for dependent values. | |
| `withRollback(async tx => { tx.step(fwd, undo) })` | Transaction-wrapper style. Adds a callback-hell layer for a sequential script. | |

**User's choice:** Imperative `runner.do(fwd, undo)` (Recommended)
**Notes:** Smallest API, reads inline with the creation flow, lets later steps close over values from earlier steps (worktree paths, env vars, etc.).

---

## Step scope (which side-effects get compensation)

| Option | Description | Selected |
|--------|-------------|----------|
| Worktrees + file-ops + env-files; YAML last, hooks/integrations NOT rolled back | Reversible steps tracked; YAML as commit point; hooks stay inside try-block but aren't pushed; integrations run post-commit with log-only failure. | ✓ |
| Worktrees only — minimal rollback | Only `createWorktree` has an undo. File ops and env files leak on failure. | |
| Full rollback including integration cleanup | Wires `runIntegrationCleanup` into the stack. Requires reordering, novel cleanup territory per integration. | |

**User's choice:** Worktrees + file-ops + env-files; YAML last, hooks/integrations NOT rolled back (Recommended)
**Notes:** Matches ENGN-03 best-effort spirit and stays honest about what can actually be undone. Hooks are user shell and cannot be inverted.

---

## Error contract

| Option | Description | Selected |
|--------|-------------|----------|
| Return `{ ok: false, error, rollbackErrors[] }`; `onProgress` for forward+rollback; undo failures prefixed `Rollback error:` | Matches CLAUDE.md discriminated-union convention; success criterion 2 text ("through the existing `onProgress` callback") satisfied literally. | ✓ |
| Return `{ ok, error }`; undo failures go to `console.error` only | Simpler shape but `console.error` corrupts the OpenTUI alternate screen (same reason `runHooksCaptured` exists). | |
| Throw `ForwardError` with attached rollback report | Violates "never throw for expected failures" convention and forces caller-side try/catch. | |

**User's choice:** Return `{ ok: false, error, rollbackErrors[] }`; `onProgress` for forward+rollback (Recommended)
**Notes:** No new progress channels. Dashboard stays TUI-safe because all output flows through `onProgress`, which the caller can route to wherever they want (clack log, dashboard state, etc.).

---

## Commit order

| Option | Description | Selected |
|--------|-------------|----------|
| Hooks before commit, integrations after (preserves current behavior) | `pre_create → worktrees → file ops → env files → post_create → writeWorkspace → runIntegrationGenerate`. Zero behavior change; `post_create` failure still aborts creation. | ✓ |
| Commit first, then hooks + integrations (two-phase) | `writeWorkspace` before `post_create`. Cleaner two-phase commit but changes user-visible behavior — failing `post_create` no longer aborts creation. | |
| Hooks last, after integrations | `post_create` after `runIntegrationGenerate`. Not a pattern git-stacks currently uses. | |

**User's choice:** Hooks before commit, integrations after (Recommended)
**Notes:** Preserves today's semantics exactly. The only behavior change on failure is that orphaned worktrees and file-op artifacts get cleaned up instead of being left on disk.

---

## Caller migration

| Option | Description | Selected |
|--------|-------------|----------|
| Both wizard and dashboard in this phase | `workspace-wizard.ts` and `dashboard/App.tsx` both call `createWorkspace()` in phase 78. Fully resolves CONCERNS.md:51-55. | ✓ |
| Wizard only; dashboard in a later phase | Smaller diff but leaves duplication unresolved and means phase 78 ships with two creation paths. | |
| Dashboard only; wizard keeps its current path | Unlikely; wizard is the primary CLI entry point. | |

**User's choice:** Both wizard and dashboard in this phase (Recommended)
**Notes:** Dashboard's per-repo `CreateRow` state machine can be driven from the runner's `onProgress` messages; planner should verify whether a richer progress-event shape is needed or whether string-matching on step names suffices.

---

## YAML-as-step vs commit point

| Option | Description | Selected |
|--------|-------------|----------|
| Commit point, not a step | Step loop runs all reversible work. On success, `createWorkspace()` calls `writeWorkspace()` once and returns ok. YAML is unreachable on failure → never written. | ✓ |
| Tracked step with `deleteWorkspace` undo | `writeWorkspace` pushed onto stack with undo. More symmetric but interacts awkwardly with Phase 77 cache invalidation and adds "YAML written but rollback triggered" edge cases. | |

**User's choice:** Commit point, not a step (Recommended)
**Notes:** Satisfies success criterion 1 ("workspace YAML is not written") by construction. Simplest model; zero edge cases around rolled-back commits.

---

## Claude's Discretion

- Internal data structure of the compensation stack (array of `{ name, undo }` tuples is the obvious choice)
- Exact signature of `createWorkspace()` — assembled inputs vs raw template/CLI args. Leaning toward assembled inputs (wizard and dashboard both currently assemble before the side-effect phase).
- Whether `ensureUpstreamTracking` lives inside `createWorkspace()` or stays in the callers — best-effort either way.
- Test file layout (likely `tests/lib/operation-runner.test.ts` for the pure runner + integration tests that force failures via existing `workspace-git._exec` / `lifecycle._exec` seams).

## Deferred Ideas

- Wrapping `cleanWorkspace`/`removeWorkspace`/`mergeWorkspace` in the runner — explicitly rejected; teardown is forward-only.
- Dry-run rendering of the planned step list — not needed with imperative API.
- Dedicated `_exec` seam on the runner — not needed because all underlying modules already have Phase 75 seams.
- On-disk persistence of in-flight operations for crash recovery — explicitly out of scope.
- Migrating template creation flow to a similar runner — template creation is a single YAML write, no compensation needed.
