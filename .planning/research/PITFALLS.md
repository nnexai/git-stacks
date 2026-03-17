# Pitfalls Research

**Domain:** Multi-repo workspace manager CLI (PoC to production maturation)
**Researched:** 2026-03-17
**Confidence:** HIGH (findings sourced directly from codebase analysis + training knowledge on git worktree internals)

---

## Critical Pitfalls

### Pitfall 1: Partial Failure Leaves Repo State Corrupt or Inconsistent

**What goes wrong:**
Multi-repo operations (`merge`, `clean`, `sync`, `remove`) iterate repos sequentially. When an operation fails mid-way — e.g., `mergeNoFF` succeeds on repos 1–3 but fails on repo 4 — the workspace is in a split state: some repos have been merged and their worktrees removed, others have not. The YAML config may also be deleted (`unlinkSync(workspacePath(name))`) before all repos are processed, making recovery difficult. There is no rollback.

**Why it happens:**
Sequentially applying irreversible git operations without a pre-flight atomicity check. The merge flow does a conflict pre-check but then executes individual `git checkout` + `git merge` pairs that can still fail due to working-tree state, lock files, or merge commits diverging from the pre-check.

**How to avoid:**
- Run all destructive phases as a two-stage process: verify/stage everything first, then commit all side effects.
- Do not delete workspace YAML until all operations are confirmed successful.
- Log which repos were acted on before failure so recovery is possible.
- Add a `--dry-run` flag that shows exactly what would happen without doing it.

**Warning signs:**
- `mergeWorkspace` deletes the workspace YAML at line 348 before the `post_merge` hooks run — if hooks fail, the workspace is gone.
- `removeWorkspace` and `cleanWorkspace` iterate repos one by one with no partial-success handling.
- Error messages from git operations say "failed" but do not indicate the intermediate state.

**Phase to address:** Destructive operation hardening phase (safety, dry-run, rollback paths).

---

### Pitfall 2: `listWorkspaces` / `listStacks` Silently Drop Corrupt Files

**What goes wrong:**
`listWorkspaces()` and `listStacks()` in `config.ts` iterate YAML files and parse each one with `readYaml()`. Any file that fails Zod parsing throws, which is caught externally nowhere — actually `listStacks` calls `readStack` which calls `readYaml` which calls `schema.parse()`. If one workspace YAML is corrupt (e.g., a field was added manually and violated the schema), `listWorkspaces()` will throw and the entire CLI becomes unusable — not just the corrupt workspace.

**Why it happens:**
The `readYaml` helper does not have any per-file try/catch. One bad file breaks all commands that call `listWorkspaces`. There is a comment in `CONCERNS.md` noting that YAML parse errors are "silently ignored" — but the current code does not actually have try/catch in `listWorkspaces`. A single schema violation makes every command fail.

**How to avoid:**
- Wrap each file read in `listWorkspaces`/`listStacks` in try/catch, log a `stderr` warning, and continue.
- Add a `--strict` flag to `doctor` that also validates schema compliance.
- Include the file path in the error message so users know which file to fix.

**Warning signs:**
- Any manual edit of a workspace YAML can break `ws list`, `ws open`, `ws status` for all workspaces.
- No test covers what happens when one file in the directory is malformed.

**Phase to address:** Config robustness / error handling phase.

---

### Pitfall 3: `renameWorkspace` Leaves Worktrees Registered Under Wrong Path in Git's Internal State

**What goes wrong:**
`renameWorkspace` calls `renameSync(oldTaskDir, newTaskDir)` to move the filesystem directory, then updates the workspace YAML with the new `task_path` values. But git itself maintains a `.git/worktrees/` metadata directory inside the main clone that stores the worktree's linked path. After a filesystem rename, git's `.git/worktrees/<name>/gitdir` and `commondir` files still point to the old path. The worktree is effectively broken — git commands inside it will fail with "not a git repository" or "working tree not found."

**Why it happens:**
The worktree metadata link is bidirectional: the worktree directory contains `.git` (a file, not a folder) pointing back to the main clone, and the main clone's `.git/worktrees/<name>/` stores the absolute path of the worktree directory. A filesystem rename breaks only the main-clone side of the link unless the worktree's `.git` file is also updated.

**How to avoid:**
- Instead of `renameSync`, use: (1) `git worktree remove --force` on the old path, then (2) `git worktree add` with the new path and same branch. This re-registers the worktree correctly.
- Run `git worktree prune` after the move as a safety measure.
- Add a test: rename a workspace, then verify `git status` succeeds inside the new task_path.

**Warning signs:**
- After rename, `git status` inside the worktree returns an error.
- `git worktree list` in the main clone shows the old path (not updated to new path).
- The current implementation has no call to any git worktree command during rename — only filesystem ops.

**Phase to address:** Git operation hardening phase; must include rename-specific integration test.

---

### Pitfall 4: `mergeNoFF` Switches `HEAD` of the Main Clone

**What goes wrong:**
`mergeNoFF` runs `git checkout <baseBranch>` and then `git merge --no-ff <branch>` inside `repo.main_path` (the main clone, not the worktree). Switching the main clone's `HEAD` is dangerous when any worktrees exist against that clone: it can cause "HEAD detached" issues in worktrees that track the same base branch, and it leaves the main clone's checked-out branch in a modified state after the operation. If merge fails after checkout, the main clone is stranded on `baseBranch` instead of wherever it was.

**Why it happens:**
Merging requires being on the target branch (`baseBranch`). The instinctive approach is `git checkout baseBranch && git merge`, but this mutates the main clone's state.

**How to avoid:**
- Use `git merge --no-ff <branch> --into-name <baseBranch>` (Git 2.38+) or perform the merge via `git merge-tree` to avoid switching HEAD.
- Alternatively, create a temporary worktree for `baseBranch`, merge there, push, then delete it.
- Save and restore `HEAD` of main clone before/after merge.
- Check Git version and fail with a clear message if the safe approach is not available.

**Warning signs:**
- After `ws merge`, `git branch` in the main clone shows `baseBranch` as current instead of the branch it was on before.
- If any other worktree tracks `baseBranch`, it may see unexpected state changes.
- No test covers what the main clone's HEAD state is after `mergeWorkspace`.

**Phase to address:** Git operation hardening / merge safety phase.

---

### Pitfall 5: Zod Schema Adding Required Fields Breaks Existing User Config Files

**What goes wrong:**
If a new required field is added to `WorkspaceSchema` or `StackSchema` without a `.default()` or `.optional()`, all existing user YAML files that predate the field will fail Zod validation. Every command that calls `readWorkspace()` or `readStack()` will throw. Users who upgrade the CLI but have existing configs are suddenly broken with an opaque Zod parse error that does not tell them which field is missing.

**Why it happens:**
Adding a field to the Zod schema feels natural and low-risk. The impact on existing files is not obvious unless you track "schema compatibility as a contract." There is no versioning mechanism or migration path in the current schema design.

**How to avoid:**
- All new schema fields must be `.optional()` or have a `.default()` — no exceptions.
- Treat the Zod schemas as a public API contract; document breaking changes explicitly.
- Add a `schema_version` field to YAML files and run migrations on read when upgrading.
- For the immediate term: add a schema compatibility test that parses a "minimal valid PoC YAML" (the oldest expected format) and verifies it still passes.

**Warning signs:**
- A new field added to `WorkspaceSchema` without `.optional()` or `.default()`.
- No fixture file in tests representing the "oldest supported schema format."
- No CI check that reads a known-good existing YAML sample.

**Phase to address:** Config robustness / schema compatibility phase (early, before any schema additions).

---

### Pitfall 6: Testing Git Operations Without a Real Git Repo Leads to Incomplete Coverage

**What goes wrong:**
The current test suite uses `makeTmpDir` for filesystem isolation but has zero tests for `git.ts` or `workspace-ops.ts`. Teams frequently defer git-operation tests because they "require a real git repo" — then never implement them, reasoning "we can test manually." When a regression occurs in `createWorktree`, `rebaseBranch`, or `removeWorktree`, it is caught only in production.

**Why it happens:**
Setting up a minimal git repo in tests feels like overhead. `bun:test` and Jest both support async test setup, making this straightforward, but developers avoid it initially.

**How to avoid:**
- Add a test helper `makeGitRepo(tmpDir)` that runs `git init`, `git config user.email`, `git config user.name`, and makes an initial commit. This is 5 lines and runs in milliseconds.
- Write integration tests for: `createWorktree` (new branch, existing branch), `removeWorktree` (registered, already-gone), `rebaseBranch` (clean rebase, conflict + abort), `mergeNoFF` (success, conflict).
- Gate these tests with `bun test --timeout 10000` — real git ops are fast in tmpfs.

**Warning signs:**
- `src/lib/git.ts` has 0 tests after any sprint.
- `src/lib/workspace-ops.ts` has 0 tests after any sprint.
- The only test coverage for git-adjacent code is `vscode.test.ts` artifact generation.

**Phase to address:** Test infrastructure phase (build the `makeGitRepo` helper), then git operations phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `process.env.HOME` mutation in tests | Redirects config path without refactoring | Race conditions when `bun test` parallelizes files; already documented as fragile | Only in MVP; must be replaced with DI before adding more tests that need it |
| Error-swallowing in `listStacks`/`listWorkspaces` | Doesn't crash on one bad file | Breaks all commands on one bad file OR silently hides corruption | Never — should warn to stderr at minimum |
| No rollback in multi-repo operations | Simpler code | Leaves users in unrecoverable split state | Never for destructive ops (`remove`, `merge`) |
| Dual artifact generator entry points (`src/lib/vscode.ts` and `src/lib/integrations/vscode.ts`) | Existing code still works | Logic divergence over time; unclear which to modify | Acceptable temporarily; consolidate in integration cleanup phase |
| Absolute paths embedded in workspace YAML (`task_path`, `main_path`) | Simple path resolution | Machine-specific configs; breaks when user moves `workspace_root` | Acceptable for PoC; needs relative-or-derived path approach for portability |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| git worktrees + rename | `mv` / `renameSync` without re-registering with git | `git worktree remove` + `git worktree add` on the new path |
| git worktrees + `git checkout` in main clone | Switches HEAD, breaks dependent worktrees | Use `git merge-tree` or a temporary worktree for merge target |
| shell completions + filesystem reads | Completion scripts assume config dir is fast/local | Cache workspace/stack names; handle missing dir gracefully |
| hook env injection + `sh -c` | Unquoted env vars with spaces/metacharacters cause shell splitting | Document that hook authors must quote `$WS_*` vars; sanitize on injection side |
| cmux session IDs in workspace YAML | ID becomes stale after session recreation; silent error | Always re-resolve session by name on open; store name not ID |
| `@clack/prompts` text input | Direct `p.text()` returns `undefined` on empty submit | Enforce `safeText()` wrapper everywhere; ban raw `p.text()` via lint rule |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Serial git ops in `status` command | `ws status` noticeably slow with 5+ repos | `Promise.all()` already used in `getWorkspaceStatus` — keep it; don't regress to serial in new commands | ~4+ repos on slow disks |
| Re-reading all YAML files per command | Startup latency grows linearly with workspace count | Acceptable for <20 workspaces; add in-process cache (`Map`) if needed | ~50+ workspaces |
| `ws sync --all` sequential across workspaces | Long-running for many workspaces | Parallelize workspace-level sync loop when safe to do so | ~10+ workspaces |
| Shell completion reads config dir on every Tab | Tab completion latency > 100ms | Ensure completion script handles missing dir fast (empty return); consider caching | NFS / slow disks |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hook commands passed directly to `sh -c` from user-authored YAML | Hooks from shared/untrusted stack templates can run arbitrary commands | Document clearly in stack-sharing UX; do not silently execute hooks from imported stacks without user confirmation |
| `env_file` path not validated to stay within workspace root | Crafted YAML could point `env_file` at `/etc/passwd` or sensitive paths | Validate `env_file` is a filename (no path separators) or is within workspace directory |
| Injected `WS_*` env vars not sanitized before `sh -c` interpolation | Workspace names with metacharacters (`;`, `$(...)`) can escape the hook context | Validate workspace and branch names on creation to allow only `[a-zA-Z0-9_.-]`; document restriction |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Destructive ops succeed silently and irreversibly | User runs `ws remove`, it completes, realizes they needed uncommitted work | Require explicit confirmation (exists), plus add `--dry-run` mode showing what would be deleted |
| `ws merge` deletes workspace YAML before confirming all repos merged | On partial failure, workspace record is gone; user cannot recover via `ws open` | Only delete YAML after all operations complete |
| `doctor` emits fix commands as text | Users must copy-paste to fix; slows recovery | Add `doctor --fix` auto-apply mode |
| Error messages from git failures are raw stderr | "error: pathspec 'main' did not match any file(s) known to git" is confusing | Wrap git errors with actionable context: which workspace, which repo, what operation was attempted |
| `ws sync` partially succeeds (some repos synced, some skipped) | User thinks sync is done; some repos are actually stale | Always summarize exactly which repos synced and which were skipped, with reason |
| Workspace name embedded in `task_path` and `main_path` | After rename, paths in YAML are string-replaced but git's metadata is not updated | See Pitfall 3; use derived paths or re-register worktrees on rename |

---

## "Looks Done But Isn't" Checklist

- [ ] **`ws rename`:** Moves the directory and updates YAML — but does NOT re-register worktrees with git. Verify `git status` and `git worktree list` inside the renamed path work after rename.
- [ ] **`ws merge`:** Conflict pre-check passes — but merge can still fail after checkout. Verify main clone's HEAD is restored to original branch after merge completes or fails.
- [ ] **`ws remove --force`:** Removes worktrees and YAML — but orphaned `.git/worktrees/<name>` metadata may remain in the main clone. Verify `git worktree list` is clean after remove. Run `git worktree prune` as part of cleanup.
- [ ] **Schema additions:** New field added with `.default()` — but existing YAML files predate the field. Verify a "minimally valid v0 workspace YAML" (no new fields) still parses without error.
- [ ] **Hook failure in `cleanWorkspace`:** Hook fails, function returns `{ ok: false }` — but some worktrees may have already been removed before the hook ran. Verify clean is atomic or that partial state is documented.
- [ ] **Shell completions:** Completions work in bash/zsh/fish — but fail silently when `~/.config/git-stacks/` doesn't exist yet. Verify completions return empty (not an error) on a fresh install.
- [ ] **Integration `open()` functions:** They call `code`, `idea`, `tmux`, `cmux` by name — but silently fail if not on PATH. Verify error messages are actionable when the binary is missing.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Partial merge (some repos merged, workspace YAML deleted) | HIGH | Manually identify which repos were merged; manually run `git branch -d <branch>` and `git worktree remove` for those; recreate workspace YAML from scratch for the rest |
| Corrupt workspace YAML breaking `listWorkspaces` | LOW | Open `~/.config/git-stacks/workspaces/<name>.yml` in editor; fix YAML syntax; re-run command |
| Broken worktree after rename | MEDIUM | Run `git worktree prune` in main clone; `git worktree add <new-path> <branch>` |
| Schema migration failure on upgrade | MEDIUM | Back up YAML files; run `ws doctor` to identify failures; manually add missing fields or downgrade CLI |
| process.env.HOME test parallelism race | LOW | Mark affected test files as serial with `bun test --no-parallel` or add DI layer |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Partial failure leaves corrupt state | Destructive operation hardening | Integration test: simulate failure mid-merge; verify state is consistent |
| Silent YAML parse failures break all commands | Config robustness phase | Test: one corrupt YAML in directory; verify `ws list` still shows healthy workspaces |
| `renameWorkspace` breaks git worktree registration | Git operation hardening | Integration test: rename workspace; `git status` succeeds in new path |
| `mergeNoFF` switches main clone HEAD | Git operation hardening | Integration test: merge workspace; verify main clone HEAD is unchanged |
| New schema field breaks existing configs | Config compatibility phase (early) | CI fixture test: parse PoC-era minimal YAML; must pass on every schema change |
| No git operation test coverage | Test infrastructure phase | Gate: `git.ts` and `workspace-ops.ts` must have >80% statement coverage |
| `process.env.HOME` test fragility | Test infrastructure phase | Replace with DI for config path; tests pass under `bun test --rerun-each 3` |

---

## Sources

- Direct codebase analysis: `src/lib/git.ts`, `src/lib/workspace-ops.ts`, `src/lib/lifecycle.ts`, `src/lib/config.ts`, `src/commands/workspace.ts`, `src/commands/doctor.ts`
- `.planning/codebase/CONCERNS.md` — existing technical debt analysis
- `.planning/codebase/TESTING.md` — existing test coverage gaps
- Training knowledge: git worktree internals (`.git/worktrees/` metadata, bidirectional link structure), Zod schema evolution patterns, CLI tool hardening patterns, `bun:test` async patterns
- Confidence: HIGH for all findings derived from direct code reading; MEDIUM for git worktree internal behavior (training data, well-established since Git 2.5)

---
*Pitfalls research for: multi-repo workspace manager CLI (PoC to production)*
*Researched: 2026-03-17*
