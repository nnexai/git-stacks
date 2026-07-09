---
created: 2026-07-09
status: ready
source: .planning/todos/pending/2026-07-09-plan-broader-code-quality-improvement-run.md
findings: 33
provisional_phases: 104-109
---

# Broader Code Quality Improvement Run

## Outcome

Resolve all 33 remaining review findings without widening the product surface. The run establishes a trustworthy test baseline first, fixes destructive-operation safety before lower-risk cleanup, and finishes with one traceability and verification gate.

Phases 104-109 are provisional sequencing labels only. This plan does not assign the work to `v0.19.0`, change package/tag state, or activate a new milestone; that release decision is separate because several choices below intentionally change shipped hook, integration, or TUI semantics.

## Verified Baseline

Checks run on 2026-07-09:

- `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test` is not green: 678/679 shared-process unit tests passed and all 85 isolated integration files passed. The failing `ensureUpstreamTracking` fixture assumes a globally configured initial branch; its bare remote has an invalid `master` HEAD under an isolated Git config.
- `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun test tests/commands/istanbul-smoke.test.ts` passes in isolation. TOOL-02 is therefore a dependency-resolution and error-reporting weakness that can be environment/suite sensitive, not an always-red assertion.
- `bun run typecheck` passes.
- `bun run test:deps` passes with no circular dependency.

Phase 104 must make the isolated full suite reproducibly green before product fixes use it as red/green evidence.

## Non-Negotiable Rules

1. Add a focused regression that fails for the reported behavior before each production fix.
2. Complete every destructive preflight and every abort-capable hook before the first mutation.
3. Treat post-commit hook/integration failures as explicit partial-completion warnings; never imply that committed mutations were rolled back when they were not.
4. Exercise Git safety with real temporary repositories and local bare remotes. Platform integrations remain mocked behind executor seams; no live tmux, cmux, Niri, AeroSpace, editor, or forge service is required.
5. Keep each finding owned by exactly one work package in the traceability table.
6. Use `bun test <file...>` for focused checks. The repository's `bun run test` wrapper does not accept positional test paths.
7. Do not combine checked execution, integration config resolution, detector polling, and forge origin parsing into a generic utilities layer; their failure contracts are different.

## Product and API Decisions

### D1 — `clean --gone` is all-repos and fail-closed

A workspace with zero worktree repositories is ineligible. Otherwise it is gone only when every unique worktree Git identity reports the branch missing. Resolve/deduplicate repositories by canonical common Git directory, not repeated raw config entries. Any present ref keeps the workspace. Failure to resolve Git identity or an operational `ls-remote` failure makes it indeterminate; after completing the scan, any indeterminate workspace aborts the whole command before mutation and is reported with its repo/error.

### D2 — Merge preflight is a structured contract

Replace the empty-array ambiguity with `clean | conflicted | error`. Missing refs, invalid repositories, unsupported Git behavior, and unparseable nonzero output are errors. Merge requires every worktree repo to be clean before hooks or mutation. Sync consumes the same contract and must report errors as failures, including in best-effort mode.

### D3 — Lifecycle operations use prepare and commit barriers

Run all abort-capable hooks while the original workspace and every worktree still exist. The prepare order is `pre_close`, workspace `pre_clean`, every repo `pre_clean`, then `pre_merge` and/or `pre_remove` as applicable. This explicitly supersedes the v0.7 interleaved repo cleanup and abort-on-post-hook behavior. Integration cleanup and destructive steps start only after the full prepare barrier. Every `post_close`, `post_clean`, `post_remove`, and `post_merge` hook is a non-aborting warning with a documented fallback cwd.

For multi-repo merge, first create every merge commit in detached temporary worktrees without moving a base ref. Only after all commits exist, compare-and-swap each base ref from its recorded old SHA to the prepared SHA. If a later CAS fails, restore earlier refs only when they still equal this transaction's prepared SHA. Hooks and external integration cleanup are not called atomic or reversible.

After base updates, cleanup may partially complete. Workspace YAML deletion is the cleanup commit point: if integration/worktree/folder cleanup or YAML deletion fails, preserve the YAML and every feature ref and report `bases merged; cleanup incomplete` with explicit manual recovery. Once YAML deletion succeeds, delete feature refs only as best-effort post-commit cleanup, so one failed branch deletion can leave a safe orphan but cannot make recorded workspace recovery inconsistent.

### D4 — Pull fails on branch mismatch

Never checkout or update another ref implicitly. A worktree must be on `workspace.branch`; trunk must be on `base_branch ?? "main"`. A different branch or detached HEAD is a failed repo with current/expected branch details, and `pullFFOnly` is not invoked.

### D5 — Recreate synchronizes operational template state, not identity snapshots

Use the composed template and an explicit provenance matrix. Because existing workspace YAML has no field-level provenance, recreate makes template-owned operational fields authoritative and documents that manual edits to those fields are overwritten.

| Ownership | Fields |
|---|---|
| Template-authoritative | Repo membership/order/mode/base branch/commands; registry-derived repo name/type/main path; workspace hooks/commands/env/env file/files/integrations; port declarations |
| Preserved workspace state | Name, schema version, branch, created/last-opened timestamps, template reference, description, labels, forge source, cmux runtime id, unrelated settings, and same-repo hooks/files that templates cannot define |
| Creation-time only | `branch_pattern` and template-label copying |

For a still-declared null port, retain its current numeric allocation; explicit/new values validate under the allocation lock, removed keys disappear, and `--reallocate` retains its documented meaning. `--force` skips confirmation only and never bypasses dirty checks. Byte-equivalent YAML rollback applies before the atomic YAML commit; post-commit open/integration failure is explicit partial completion.

### D6 — Honor the shipped AeroSpace `normalization` contract

Keep the field and implement the previously approved false path without raising the AeroSpace version floor. `flatten_before_open` remains an independent explicit step for either normalization value. `normalization: true` (default) uses the direct four-value layout command after any requested flatten. `normalization: false` maps the configured layout to checked, window-targeted `split` plus layout-family commands: horizontal/vertical from the `h_`/`v_` prefix, then `tiles`/`accordion` from the suffix. The [official command reference](https://nikitabobko.github.io/AeroSpace/commands) documents the required window-targeted `split` and layout forms. Add exact command-sequence tests for all four layouts plus false-with-flatten ordering. If implementation research disproves this mapping, stop for an explicit breaking-change decision rather than silently removing a shipped option.

### D7 — Integration config precedence is strategy-specific

Centralize lookup mechanics while keeping enabled-state resolution separate. Niri and AeroSpace retain their most-specific-object/full-replacement semantics. VSCode `cmd` and Jira `open_cmd` use field-level workspace-over-global fallback because those are the ignored fields in INT-06. Parse the effective config once; an invalid most-specific object is an error and must not silently fall back. `config show` and runtime execution must resolve the same value.

### D8 — Remove template multi-selection from the dashboard

Current selection is an unordered `Set<number>` tied to filtered indices, while composition precedence is ordered and every action uses only the focused template. Remove the checkbox/Space/batch-bar affordance and retain single-template actions. Ordered multi-template composition with a precedence preview is a future feature, not a correctness patch.

### D9 — YAML `name` remains canonical

Doctor fixes filename drift by renaming the exact source storage file to the YAML name after collision/schema checks. It does not rename logical workspace/template identity, task directories, branches, or references. Fix operations retain the existing public `action` and `name` fields while adding an exact source stem/path. Use same-directory no-clobber rename, refuse duplicate canonical identities/target filenames, and invalidate config indexes.

### D10 — Doctor health ignores passing checks

Separate all diagnostic `checks` from the existing public `issues` array. `issues` contains warning/failure entries only, so the established invariant remains `healthy === (issues.length === 0)`. Installed configured forge CLIs and other passes may appear in additive `checks`, but cannot make a healthy installation unhealthy.

### D11 — Forge identity comes from exact origins

Normalize standard and SCP-style remotes, compare exact lowercase hostnames, and classify source URLs through built-in or configured provider origins. Unknown or multiply configured PR-like origins return typed errors; they never default to Gitea.

## Dependency Graph

```text
104 Verification reliability
          |
          v
105 Destructive lifecycle and workspace transactions
          |
          +----------------+----------------+
          v                v                v
106 Integration      107 TUI/IPC       108 Core validation
    contracts            safety             and diagnostics
          +----------------+----------------+
                           |
                           v
                    109 Closure gate
```

Phases 106-108 may execute concurrently after Phase 105. Within a phase, work that shares `src/lib/integrations/types.ts`, `src/tui/dashboard/App.tsx`, or `src/lib/config.ts` must be assigned to one agent or serialized.

## Phase 104 — Verification Reliability

**Goal:** The canonical isolated suite is a trustworthy baseline and failures point at the real child-process error.

### 104-A — Isolate every mutating Git fixture (TOOL-01)

Files:

- `tests/helpers.ts`
- `tests/lib/git.test.ts`
- `tests/commands/workspace-source.test.ts`
- `tests/commands/release-rc.test.ts`
- Any other fixture setup found by the Git-command audit

Work:

- Make the test Git config explicit about identity, disabled signing/hooks, and `init.defaultBranch=main`.
- Route fixture init/commit/branch/tag/push commands through `gitExecOptions(cwd, baseDir)` or the equivalent isolated environment.
- Preserve read-only assertions, but remove reliance on developer-global Git config from all fixture construction.
- Add a hostile-global-config regression with signing and hooks enabled outside the isolated home.

Focused proof:

- A bare-origin fixture has a valid `main` HEAD under `/dev/null` global config.
- Source and release fixtures can commit/tag when the user's global config mandates signing or hooks.
- `ensureUpstreamTracking` remote-only coverage is stable in isolation.

### 104-B — Make the Istanbul smoke fixture self-resolving (TOOL-02)

Files:

- `tests/support/istanbul-smoke.ts`
- `tests/commands/istanbul-smoke.test.ts`

Work:

- Give the temporary runtime an explicit dependency path, preferably a fixture-local `node_modules` link, and run with `cwd: fixtureRoot`.
- Decode stdout/stderr and check the child exit code first.
- Check coverage-file existence second and parse JSON only third.
- Include argv, exit code, and stderr in the surfaced error; distinguish child failure, missing file, and malformed coverage.

Focused proof:

- Normal instrumented execution produces nonzero statement/function coverage.
- A forced module-resolution failure reports child stderr rather than `ENOENT` for coverage JSON.
- A zero-exit child that omits the file reports a distinct missing-artifact error.

### Phase 104 gate

Run the isolated full suite twice, followed by the component gates:

```bash
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test
bun run typecheck
bun run test:deps
bun run verify:gates
```

Do not start Phase 105 while this gate is red or flaky.

## Phase 105 — Destructive Lifecycle and Workspace Transactions

**Goal:** Cleanup, merge, pull, clone, and recreate fail before mutation or compensate only resources created by the current transaction.

### 105-A — Typed remote-branch classification (CORE-02)

Files: `src/lib/git.ts`, `src/commands/workspace.ts`, `tests/lib/core-source-coverage-gaps.test.ts`, `tests/commands/workspace-clean-gone.test.ts`.

- Replace `isBranchGoneOnRemote(): boolean` with `present | missing | error`; interpret `ls-remote` exit `0` as present, `2` as missing, and other exits as operational errors with stderr.
- Scan all unique worktree remotes and apply D1 before dirty checks, prompts, or removal.
- Test mixed present/missing repos, all missing, auth/bad-origin errors, zero-worktree ineligibility, canonical Git-dir deduplication, and the command-wide fail-closed case where one definitely-gone workspace plus one indeterminate workspace results in no removals.

### 105-B — Structured merge preflight (CORE-03)

Files: `src/lib/git.ts`, `src/lib/workspace-lifecycle.ts`, `src/lib/workspace-git.ts`, their mocks, and focused lifecycle/Git tests.

- Introduce `MergePreflightResult` with clean, conflicted filenames, and operational error variants.
- Require clean results for every worktree repo. A missing base/feature ref is an error, not a skipped repo.
- Migrate sync's normal and best-effort paths in the same change.
- Prove with real repos that a later repo error/conflict leaves hooks, integrations, worktrees, base refs, and YAML untouched.

### 105-C — Prepare/commit lifecycle barrier (CORE-04)

Files: primarily `src/lib/workspace-lifecycle.ts`, with narrow checked ref helpers in `src/lib/git.ts` or compensation support in `src/lib/operation-runner.ts`.

- Split nested close/clean behavior into prepare and commit helpers.
- Prepare remove in this order: validation/dirty checks, `pre_close`, workspace `pre_clean`, every repo `pre_clean`, then `pre_remove`.
- Prepare merge after Git preflight, then the same hook barrier plus `pre_merge` and `pre_remove` before mutation.
- Commit close as integration cleanup followed by non-aborting `post_close`.
- Commit clean/remove as integration cleanup, `post_close`, worktree removals, non-aborting `post_clean`, optional workspace-folder deletion, config deletion for remove, then non-aborting `post_remove`.
- Commit merge by preparing every detached merge commit first, then CAS-updating base refs from recorded SHAs. On CAS failure, restore prior transaction refs conditionally. Only after every base update succeeds perform integration cleanup, `post_close`, worktree removal, `post_clean`, and folder cleanup.
- Treat workspace YAML deletion as the cleanup commit point. On any failure through that deletion, retain YAML and all feature refs, report `bases merged; cleanup incomplete`, and print explicit manual recovery; do not promise that the full pre-hook barrier can be rerun after worktrees are gone. After successful YAML deletion, delete feature refs best-effort, then run `post_remove` and `post_merge` as warnings.
- Run post hooks as warnings after commit and define their fallback cwd explicitly.

Tests must cover a failing second-repo `pre_clean`, failing `pre_remove`/`pre_merge` cwd, no integration cleanup before the complete prepare barrier, ref compensation, post-hook warnings, dry-run order with no hooks or mutations, cleanup/YAML failure preserving every feature ref plus config, and a post-commit branch-delete failure producing only an orphan warning.

### 105-D — Checked-out branch invariant for pull (CORE-07)

Files: `src/lib/workspace-git.ts`, optional defense in `src/lib/git.ts`, and `tests/lib/workspace-git.test.ts`/real-remote tests.

- Add `getCurrentBranch` to the executor seam and enforce D4 before pulling.
- Test wrong worktree branch, wrong trunk branch, detached HEAD, and unchanged success/no-op behavior on the expected branch.

### 105-E — Shared creation compensation and clone migration (TUI-03)

Files: `src/lib/git.ts`, `src/lib/workspace-lifecycle.ts`, `src/tui/workspace-clone.ts`, creation/clone tests.

- Return provenance from worktree creation: whether this transaction created the worktree, created the local branch, or moved an existing branch via `-B`.
- Prefer an equivalence preflight that avoids `-B` for an existing branch. If a ref must move, record and restore its prior SHA on rollback.
- Roll back only owned resources, in reverse order: remove a transaction-created worktree, then delete a newly-created branch or restore a moved branch. An existing-worktree no-op must never register a removal undo.
- Preflight destination paths and preserve the original forward error alongside rollback errors.
- Route interactive and noninteractive clone through shared `createWorkspace()` with an explicit source snapshot; preserve labels and integration overrides and drop runtime-only `last_opened`/cmux state.
- Prove a two-repo late failure leaves no destination YAML, repo-1 worktree, or newly-created branch, while preserving pre-existing branches and the source workspace.

### 105-F — Desired-state recreate planner and transaction (CORE-08)

Files: new `src/lib/workspace-recreate.ts` (or `workspace-reconcile.ts`), shared template-to-workspace materializer, slim command wiring, and recreate tests.

- Add a pure `planWorkspaceRecreate(...)` returning desired state, human changes, and worktree operations.
- Resolve the composed template and every registry entry before side effects.
- Apply the D5 matrix, including cleared integration settings, preserved cmux/runtime state, mode transitions, registry path/type changes, and locked deterministic port semantics.
- Preflight every affected worktree as clean. Apply reversible worktree operations with compensation, then atomically write YAML as the commit point.
- Treat post-commit open/integration failure as rerunnable partial completion.

Mode/path transitions remove using the old main/task path and create using the desired registry/main path. Acceptance includes added/removed repos, worktree/trunk/dir transitions, included-template drift, deleted settings, missing registry entries, path collisions, dirty worktrees, pre-commit rollback to byte-equivalent YAML, preserved/moved branch restoration, stable/null/explicit port cases, and preserved branch/labels/cmux id.

### Phase 105 gate

Run focused files after each package, then:

```bash
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test
bun run typecheck
bun run test:deps
```

## Phase 106 — Integration Execution Correctness

**Goal:** Platform mutations cannot report success after nonzero subprocesses, and configuration/detection/forge identity follow one explicit contract.

### 106-A — Checked platform execution and tmux pane safety (INT-02, INT-04)

Files: new `src/lib/platform-exec.ts`; low-level tmux/Niri/AeroSpace/cmux adapters; their integration wrappers and tests.

- Standardize `{ exitCode, stdout, stderr }` plus a typed checked-mutation error while preserving each adapter's injectable executor seam.
- Read-only probes may return false/null/unavailable; mutating helpers must throw on nonzero and multi-step setup stops at the first required failure.
- Do not emit artifacts, persist cmux refs, or stop spinners with `ready` after required setup fails. Best-effort per-window failures end as `setup incomplete`.
- Make `getTmuxMainPane()` return `string | null`; reject nonzero/empty/malformed output and never invent `%0`.

Focused tests cover representative mutator failures in every adapter, stopped command chains, no success artifacts/messages, and no pane commands after a null lookup.

### 106-B — Config cascade, workspace path, examples, and AeroSpace correction (INT-01, INT-05, INT-06, INT-09)

Files: `src/lib/integrations/types.ts`, VSCode/Jira/Niri/AeroSpace integrations, README/changelog, integration tests.

- Add strategy-aware D7 lookup helpers: field fallback for VSCode/Jira, full replacement for Niri/AeroSpace, and separate enabled-state resolution. Make config display and runtime share them.
- Expand `GS_WORKSPACE_PATH` to `join(ctx.tasksDir, ctx.workspace.name)`.
- Apply D6 with a checked `split` adapter and the four exact false-path mappings; normalization selects only the layout strategy, while an explicit flatten runs first for either value.
- Register an integration config validator/schema with each config example and generically parse every example. Correct Niri to `columns[].windows[]` with width on the column.

Tests cover workspace `cmd`/`open_cmd` precedence, Niri/AeroSpace full replacement, enabled-state separation, config-show/runtime parity, invalid override failure, actual spawned cwd expansion, all examples parsing, every AeroSpace normalization command sequence, and `normalization:false + flatten_before_open:true` ordering.

### 106-C — Detector availability, bounded polling, and skip parity (INT-07, INT-08)

Files: `src/lib/integrations/types.ts`, new `window-detection.ts`, `runner.ts`, Niri/AeroSpace detectors and tests.

- Make snapshots an `available: false | true` union and never resolve unavailable snapshots.
- Build one active integration list after skip/enabled/applicability filters; derive both opens and detectors from it.
- Share a deadline helper whose sleep is capped to remaining time, with injected clock/sleep for deterministic tests.
- Replace the real ~11-second timeout test with fake-time coverage.

Tests cover zero begin/resolve side effects for skipped owners, immediate unavailable return, split polling deadlines, and artifact population only for active detectors.

### 106-D — Exact forge host and configured-origin parsing (INT-10, INT-11)

Files: new `forge-origin.ts`, `forge-utils.ts`, `forge-source.ts`, workspace-source inputs/wizard wiring, docs and tests.

- Parse URL and SCP-style SSH remotes, normalize exact host/origin, and reject hostname substrings/spoofing.
- Build a provider-origin catalog from public defaults plus global/provider and repo metadata.
- Require exactly one provider match before route-shape parsing completes; return typed unconfigured/ambiguous origin errors before fetch.

Tests include SSH/HTTPS exact hosts, spoofed hosts, GitHub Enterprise, self-hosted GitLab/Gitea, unconfigured PR-like URLs, and an origin configured for two providers.

### Phase 106 gate

```bash
bun test tests/lib/tmux.test.ts tests/lib/niri.test.ts tests/lib/aerospace.test.ts tests/lib/cmux.test.ts
bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts tests/lib/integrations/cmux.test.ts
bun test tests/lib/integrations/runner.test.ts tests/lib/integrations/window-detector.test.ts
bun test tests/lib/integrations/forge-utils.test.ts tests/lib/integrations/forge-source.test.ts
bun run typecheck
bun run test:deps
```

## Phase 107 — Dashboard State and IPC Safety

**Goal:** A second dashboard, arbitrary byte chunking, stale async loads, and failed mutations cannot corrupt or misreport dashboard state.

### 107-A — Socket ownership and bounded NDJSON framing (TUI-02, TUI-08)

Files: `src/tui/dashboard/run.tsx` plus extracted socket/frame helpers and a new `tests/tui/dashboard/run.test.ts`.

- Probe an existing socket. Refuse a second live dashboard without unlinking the owner; replace only a stale socket after inode recheck.
- Record the bound socket's device/inode and unlink during cleanup only when ownership still matches.
- Buffer per-connection newline-delimited JSON using a streaming decoder; support split/coalesced frames and UTF-8, retain partial tails, recover after malformed lines, and close an oversized-frame connection with a bounded diagnostic.

### 107-B — UTF-8-safe command output (TUI-09)

Extract/test the command stream drain helper in a new `tests/tui/dashboard/command-stream.test.ts`. Decode chunks with `{ stream: true }`, flush once at EOF, and prove an emoji or other multibyte sequence split across chunks remains intact.

### 107-C — Fail-closed creation, accurate batch result, and mutation lock (TUI-04, TUI-05, TUI-06)

Files: one cohesive change to `src/tui/dashboard/App.tsx` plus integration tests.

- Resolve all template repos before creation; reject empty/missing sets with all missing names and never call lifecycle creation.
- Keep batch operations best-effort, count successes/failures, and finish failed when any result is not ok.
- Move the running create-progress guard ahead of every global tab shortcut so no overlapping mutation can start.

Tests use deferred promises in the wizard/tab coverage plus a new `tests/tui/dashboard/integ-batch-progress.test.tsx` to prove no tab/view escape during creation, no lifecycle side effects after preflight failure, and failed batch completion with per-workspace diagnostics.

### 107-D — Latest-load-wins workspace state (TUI-07)

Add a generation token to `useWorkspaces`; only the latest generation may publish entries/status or clear loading. Add `tests/tui/dashboard/useWorkspaces.test.tsx` with an older deferred load resolving after a newer one.

### 107-E — Composed wizard defaults and honest template UX (TUI-10, TUI-11)

- Use the already composed template for inherited `branch_pattern` defaults; do not reread the raw top-level template.
- Apply D8 and update contextual help/snapshots while leaving repo multi-selection unchanged.

### Phase 107 gate

```bash
bun test tests/tui/dashboard/run.test.ts tests/tui/dashboard/command-stream.test.ts
bun test tests/tui/dashboard/useWorkspaces.test.tsx tests/tui/dashboard/integ-batch-progress.test.tsx
bun test tests/tui/workspace-wizard.test.ts
bun test tests/tui/dashboard/integ-wizard.test.tsx tests/tui/dashboard/integ-tab-switching.test.tsx
bun run typecheck
```

## Phase 108 — Core Validation and Diagnostics

**Goal:** Invalid identifiers/state cannot be persisted or rendered as shell syntax, and diagnostic/path helpers use canonical shared contracts.

### 108-A — Environment identifiers and duplicate ports (CORE-09, CORE-10)

Files: `src/lib/config.ts`, `src/lib/env.ts`, `src/lib/ports.ts`, env/port tests.

- Add a shared shell identifier schema: `^[A-Za-z_][A-Za-z0-9_]*$` for environment and port keys at config parse time.
- Keep a formatter-level guard so programmatic callers cannot interpolate an invalid export name.
- Detect duplicate explicit port values inside one workspace. Without `--reallocate`, fail with every colliding name/value; with it, keep the first declaration and reallocate later duplicates deterministically.

### 108-B — Canonical filename repair and health calculation (CORE-11, CORE-14)

Files: `src/commands/doctor.ts`, narrow config storage rename helper, doctor tests.

- Apply D9 with collision-safe, atomic storage-file rename operations carrying compatible public fields plus exact source stem/path and canonical name; invalidate caches after success.
- Apply D10 with warning/failure-only `issues` and an additive `checks` collection.
- Test workspace/template filename drift, duplicate logical identities, target collision refusal, no task/reference rename, cache refresh, installed forge CLI pass checks, and the `healthy === (issues.length === 0)` invariant.

### 108-C — Registry schema boundary and active repo paths (CORE-12, CORE-13)

Files: `src/commands/repo.ts`, `src/lib/config.ts`, `src/commands/workspace.ts`, repo/cd tests.

- Validate add/rename names with `NameSchema` for actionable CLI errors and schema-parse the complete registry inside `writeRegistry()` before atomic write.
- Use `getRepoPath()` for `git-stacks cd <workspace> <repo>` so worktree, trunk, and dir modes resolve consistently.

### Phase 108 gate

```bash
bun test tests/lib/env.test.ts tests/lib/ports.test.ts
bun test tests/commands/doctor-fix.test.ts tests/commands/doctor-json.test.ts
bun test tests/commands/repo.test.ts tests/commands/repo-add.test.ts tests/commands/workspace-wrapper-edges.test.ts
bun run typecheck
bun run test:deps
```

## Phase 109 — Documentation, Traceability, and Closure Gate

**Goal:** Every finding is demonstrably closed and intentional behavior changes are ready to ship.

Work:

- Update README/help and the unreleased changelog section for all-repos `clean --gone`, lifecycle prepare/commit semantics, branch-mismatch pull failure, recreate rules, AeroSpace normalization behavior, exact forge origins, and the explicit removal of template multi-select. Do not bump a version, move tags, or assign a milestone in this plan.
- Audit test names against all 33 IDs; each must have a focused regression and one owning package below.
- Run the canonical full verification from a neutral Git environment and retain failure output if anything is red.
- Review the diff for unrelated refactors, hidden API changes, and platform success messages that can still follow a failed mutation.

Final commands:

```bash
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test
bun run typecheck
bun run test:deps
bun run verify:gates
bun run verify
```

## Finding Traceability

| Finding | Owner | Required proof |
|---|---|---|
| CORE-02 | 105-A | All worktree remotes missing; operational error aborts all mutation |
| CORE-03 | 105-B | Conflict/error are distinct and every repo preflights before mutation |
| CORE-04 | 105-C | Abort hooks run from original cwd before mutation; merge compensation works |
| CORE-07 | 105-D | Wrong/detached branch never calls pull |
| CORE-08 | 105-F | Full composed-template diff applies transactionally or rolls back |
| CORE-09 | 108-A | Invalid env/port identifiers fail parse and cannot render shell exports |
| CORE-10 | 108-A | Same-workspace duplicate explicit ports reject/reallocate deterministically |
| CORE-11 | 108-B | Doctor renames storage filename only |
| CORE-12 | 108-C | Add/rename cannot persist a registry that fails its schema |
| CORE-13 | 108-C | `cd` resolves worktree/trunk/dir through `getRepoPath` |
| CORE-14 | 108-B | `issues` excludes passes and preserves the health/length invariant |
| INT-01 | 106-B | False normalization follows the promised checked split/layout sequence |
| INT-02 | 106-A | Nonzero platform mutation cannot yield ready/artifact state |
| INT-04 | 106-A | Failed/empty tmux lookup returns null and never targets `%0` |
| INT-05 | 106-B | Workspace path expands to the concrete workspace directory |
| INT-06 | 106-B | Workspace VSCode/Jira commands override global execution config |
| INT-07 | 106-C | Unavailable detector returns immediately; sleeps respect deadline |
| INT-08 | 106-C | Skipped integration has no detector side effects |
| INT-09 | 106-B | Every built-in config example parses its registered schema |
| INT-10 | 106-D | Exact parsed hostname rejects spoofed hosts |
| INT-11 | 106-D | Configured self-hosted origin wins; unknown/ambiguous origin rejects |
| TUI-02 | 107-A | Second dashboard cannot unlink a live socket; cleanup is owner-only |
| TUI-03 | 105-E | Late clone failure removes owned worktree/branch/YAML only |
| TUI-04 | 107-C | Missing/empty template repos fail before lifecycle creation |
| TUI-05 | 107-C | Any failed batch member yields failed completion with counts |
| TUI-06 | 107-C | Tab shortcuts cannot escape a running create |
| TUI-07 | 107-D | Older reload cannot publish after a newer generation |
| TUI-08 | 107-A | NDJSON handles split/coalesced/invalid/oversized frames safely |
| TUI-09 | 107-B | Split multibyte output decodes without replacement corruption |
| TUI-10 | 107-E | Included template supplies interactive branch pattern |
| TUI-11 | 107-E | Misleading template multi-select affordance is removed |
| TOOL-01 | 104-A | Hostile global Git config cannot affect fixtures |
| TOOL-02 | 104-B | Fixture resolves dependencies and reports child failure before artifacts |

## Efficient Agent Assignment

- **Wave 0:** two agents in parallel for 104-A and 104-B; a verifier owns the isolated full-suite gate.
- **Wave 1:** serialize shared Git/lifecycle contracts: 105-A/105-B, then 105-C/105-D, then 105-E, then 105-F. Test research may run in parallel, but no two agents edit `git.ts` or `workspace-lifecycle.ts` concurrently.
- **Wave 2:** Phase 106 serializes 106-A before 106-B/106-C because all three touch Niri/AeroSpace/types; one adapter owner should integrate B/C, while independent 106-D may run in parallel. Phase 107 can run alongside it, but one agent owns every `App.tsx` change. Phase 108 can also run alongside it, with one owner serializing 108-A and 108-C because both modify `config.ts`; 108-B is independent.
- **Wave 3:** a fresh review/verifier agent performs Phase 109 traceability, destructive-safety review, and full verification. It must not be the primary author of the lifecycle work.

Each work package should be one reviewable behavior commit plus its regression. Documentation and any intentionally breaking migration belong in the same phase, not deferred to a final surprise.
