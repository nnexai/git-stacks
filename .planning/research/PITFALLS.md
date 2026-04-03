# Pitfalls Research

**Domain:** CLI workspace manager — adding push, ahead/behind tracking, labels, secret resolution, and auto-stash to a git worktree multi-repo manager
**Researched:** 2026-04-03
**Confidence:** HIGH — grounded in direct reads of `src/lib/git.ts` (existing primitives), `src/lib/workspace-ops.ts` (syncWorkspace, mergeWorkspace, getWorkspaceListInfo patterns), `FEATURES.md` (full v0.14.0 design specs), `PROJECT.md` (system constraints, existing hook/env pipeline), and verified against git documentation and community sources

---

## Critical Pitfalls

### Pitfall 1: `--force-with-lease` Defeated by Background Fetch

**What goes wrong:**
`git push --force-with-lease` only protects against overwriting remote commits that the _local remote-tracking ref_ does not show. If anything runs `git fetch` in the background after the local tracking ref was established but before the push fires, `--force-with-lease` uses the newly fetched ref as its expectation, making it functionally equivalent to `--force`. A user on a branch with a CI bot, another developer, or any other fetch-triggering process can have their remote commits silently overwritten.

In this codebase specifically: `fetchOrigin()` is called during `syncWorkspace` in the same code path. If `pushWorkspace` runs immediately after a sync (the designed workflow: sync → push), the fetch that sync triggered has updated the remote-tracking refs. `--force-with-lease` after that fetch will allow the push to overwrite new remote commits that appeared _after_ the fetch but before the push.

**Why it happens:**
Developers believe `--force-with-lease` is always safe. The protection is real but narrowly scoped: it checks the _local tracking ref_, not the current remote state. Any fetch in the pipeline resets the tracking ref, removing the protection window.

**How to avoid:**
Use `--force-with-lease=<refname>:<expected-sha>` (the explicit form) rather than bare `--force-with-lease`. Capture the SHA of `origin/<branch>` before any fetch, and pass it as the expected value:

```ts
const expectedSha = await $`git -C ${repoPath} rev-parse origin/${branch}`.quiet().nothrow()
// ... do not fetch between here and the push ...
await $`git push --force-with-lease=${branch}:${expectedSha} origin ${branch}`
```

If using bare `--force-with-lease`, document the narrow protection window clearly. For the MVP, bare `--force-with-lease` is acceptable given the single-developer use case, but must not be described as "safe force push" in help text without qualification.

**Warning signs:**
- `pushWorkspace` calls `fetchOrigin` before executing the push (breaks lease protection)
- `--force-with-lease` described as unconditionally safe in `--help` output
- No test verifying `--force-with-lease` is rejected when remote has a commit the local ref doesn't know about

**Phase to address:**
Push implementation phase. The git primitive `pushBranch` must either document the limitation or use the explicit SHA form.

---

### Pitfall 2: Parallel Push Race on Shared Git Object Database

**What goes wrong:**
`pushWorkspace` runs `Promise.all` across repos (by design — they are "independent"). In a git worktree setup, all worktrees share the same `.git` object database and reflog. Running concurrent `git push` commands across multiple worktrees of the _same repo_ (if a template has the same repo in two modes, or if two workspace push calls fire simultaneously) can hit lock contention on the shared index and ref files, producing `cannot lock ref` or `fatal: unable to auto-detect email address` errors from the second concurrent push.

The more common failure: two `git push` processes against the _same remote_ with different branches (frontend, api, shared — all pushing to the same `origin`) can trigger rate limiting, credential prompts, or SSH multiplexer contention on the remote side.

**Why it happens:**
`Promise.all` is natural for independent I/O operations. The repos are independent at the workspace level, but git's underlying transport layer (SSH connection pooling, HTTP credential caching, `.git/config` lock) is shared per repo origin. For worktrees of the _same repo_, the shared object database creates a hard concurrency constraint.

**How to avoid:**
Keep `Promise.all` for pushes across _different repos_ (different remotes, different `.git` directories). Do not run concurrent pushes for multiple worktrees of the same underlying repo. The current workspace model rarely has two worktrees of the same repo, but the code should guard this:

```ts
// Group repos by main_path (same main_path = same .git object store)
// Push groups sequentially; push within-group sequentially too
const groups = groupBy(worktreeRepos, r => r.main_path)
for (const group of Object.values(groups)) {
  await Promise.all(group.map(repo => pushBranch(repo.task_path, ...)))
}
```

In practice: `Promise.all` across repos with distinct `main_path` values is safe. Add the guard anyway — defensive coding against future template configurations.

**Warning signs:**
- `Promise.all(worktreeRepos.map(repo => pushBranch(repo.task_path, ...)))` with no deduplication on `main_path`
- No test for the case where two repos share a `main_path`

**Phase to address:**
Push implementation phase. The grouping logic goes in `pushWorkspace` in `workspace-ops.ts`.

---

### Pitfall 3: Ahead/Behind Counts Silent Zero When Remote-Tracking Ref Missing

**What goes wrong:**
`getCommitsAhead(repoPath, "origin/main", "HEAD")` returns `0` when `rev-list --count` fails with exit code non-zero. `getCommitsBehind` (already in `git.ts`) uses the same pattern. The failure path returns `0` silently. If a worktree's remote-tracking ref for `origin/<baseBranch>` does not exist — because the repo has never been fetched, the remote was renamed, or the base branch was deleted on the remote — the count silently reports `0 ahead, 0 behind`. The TUI and `list` command then show "clean" status for a repo that has never synced with the remote.

This is especially common for **newly added repos** or repos where `fetchOrigin` has not run since the worktree was created.

**Why it happens:**
`rev-list` with a missing ref exits non-zero. The error-to-zero fallback is a reasonable "don't crash" choice, but it conflates two distinct states: "truly zero distance from remote" and "remote ref unknown." The `aheadBehindStale` flag in the spec is meant to address this, but only for the case of a stale fetch, not a missing ref entirely.

**How to avoid:**
Before calling `rev-list`, verify the remote-tracking ref exists with `checkRemoteTrackingRef` (already in `git.ts`). If it does not exist, return a distinct sentinel rather than `0`:

```ts
// In getCommitsAhead / getCommitsBehind, or in the caller:
const hasRef = await checkRemoteTrackingRef(repoPath, baseBranch)
if (!hasRef) return null  // null = "unknown", not 0 = "up to date"
```

Surface `null` in the TUI as `?` or `—` rather than `↑0 ↓0`. The `aheadBehindStale` flag should also be set to `true` when any repo returns `null`.

**Warning signs:**
- `getCommitsAhead` returns `0` and the caller does not distinguish this from a ref-missing failure
- `WorkspaceListInfo.aheadBehindStale` is only set based on `FETCH_HEAD` mtime, not on missing ref detection
- TUI shows `↑0 ↓0` for a freshly cloned worktree that has never fetched

**Phase to address:**
Ahead/behind implementation phase. The `null` return type must be part of the primitive signature from the start — changing it later requires updating all callers.

---

### Pitfall 4: FETCH_HEAD mtime Staleness Check Unreliable Across Worktrees

**What goes wrong:**
The spec uses `FETCH_HEAD` mtime (15-minute threshold) to determine `aheadBehindStale`. In a git worktree setup, `FETCH_HEAD` lives in the main `.git` directory (e.g. `{workspace_root}/main/{repo}/.git/FETCH_HEAD`), not in the worktree's `.git` file (which is just a reference to the main `.git` dir). The worktree task path is `{workspace_root}/tasks/{workspace}/{repo}/` — a git worktree, not a clone. Reading `FETCH_HEAD` from the worktree path resolves correctly only if the path resolution follows the `.git` file link to the main `.git` dir.

Additionally, `FETCH_HEAD` is written by `git fetch origin` regardless of which worktree triggered the fetch. If any worktree (or a background IDE process) fetches the same repo, `FETCH_HEAD` mtime resets, making all worktrees appear "fresh" even if the specific workspace branch has not been updated.

**Why it happens:**
FETCH_HEAD as a staleness proxy is a common shortcut, but in worktree setups the path is non-obvious. Most developers writing `join(repoPath, ".git", "FETCH_HEAD")` will compute the wrong path for a worktree because the worktree's `.git` is a file (not a directory) containing `gitdir: /path/to/main/.git/worktrees/name`.

**How to avoid:**
Resolve the actual `GIT_DIR` for a worktree using:
```ts
const gitDirResult = await $`git -C ${repoPath} rev-parse --git-common-dir`.quiet().nothrow()
const commonGitDir = gitDirResult.stdout.toString().trim()
const fetchHeadPath = join(commonGitDir, "FETCH_HEAD")
```

`--git-common-dir` (not `--git-dir`) returns the shared `.git` directory for all worktrees of a repo. Use this as the base for the FETCH_HEAD mtime check.

**Warning signs:**
- FETCH_HEAD path constructed as `join(repoPath, ".git", "FETCH_HEAD")` — wrong for worktrees
- `statSync` throwing ENOENT on a worktree (the `.git` entry is a file, not a dir)
- `aheadBehindStale` reports true for worktrees even immediately after a fresh fetch

**Phase to address:**
Ahead/behind implementation phase. Test `checkRemoteTrackingRef` against a worktree path (not a main clone path) to catch the path resolution issue early.

---

### Pitfall 5: Secret Values Written to Workspace YAML on Certain Error Paths

**What goes wrong:**
The spec states: "resolved values are never written back to the workspace YAML." This is correct for the happy path. The failure mode is in error-recovery paths: if `openWorkspace` catches an error and writes a diagnostic workspace update (e.g., setting a status field, updating a timestamp), and if at that point the in-memory workspace object has been mutated to contain resolved values (because `mergeEnv` was called on the workspace object), those resolved plaintext secrets get written to the YAML file.

A second failure mode: if `resolveSecrets` is called on the raw `workspace.env` object directly (mutating it), subsequent `writeWorkspace(workspace)` calls anywhere in the function (even in cleanup paths) will persist the resolved values.

**Why it happens:**
`mergeEnv` in the current codebase returns a new `Record<string, string>` — it does not mutate the workspace. If `resolveSecrets` follows this pattern (takes and returns the env map, does not touch the workspace object), the risk is low. But if a developer "simplifies" by resolving in-place on `workspace.env`, the mutation propagates to any subsequent `writeWorkspace` call.

**How to avoid:**
`resolveSecrets` must accept and return a plain `Record<string, string>` — never a workspace object. Never assign resolved values back to any workspace or template field. In `openWorkspace`, the flow must be:

```ts
const rawEnv = mergeEnv(workspace)      // returns new Record — workspace untouched
const resolved = await resolveSecrets(rawEnv, resolvers)  // returns new Record
writeEnvFiles(workspace, resolved, ...)  // reads workspace for paths, uses resolved values
const hookEnv = { ...baseEnv, ...resolved }
// workspace object is never mutated — only rawEnv and resolved are derived copies
```

Add a test: call `openWorkspace` with a secret reference, then read the workspace YAML from disk and assert no resolved value appears in any env field.

**Warning signs:**
- `resolveSecrets(workspace.env, ...)` pattern where `workspace.env` is mutated in-place
- `writeWorkspace` called after `resolveSecrets` in the same function scope with the workspace object
- No test checking that workspace YAML on disk does not contain resolved secret values after `openWorkspace`

**Phase to address:**
Secrets implementation phase. The constraint must be in the function signature design — `resolveSecrets` should not accept a workspace object, only a plain record.

---

### Pitfall 6: Secret Resolver Subprocess Hangs Blocking Workspace Open

**What goes wrong:**
`op read <path>`, `doppler secrets get ...`, and `pass show <path>` are subprocesses. Any of them can hang indefinitely: the 1Password CLI hangs waiting for biometric auth when the system is locked; Doppler CLI hangs waiting for network when the corporate VPN is not connected; `pass` opens a GPG pinentry dialog in some desktop configurations.

Without a timeout, `openWorkspace` stalls forever. The user sees no indication whether it is hung or slow. The TUI's `runHooksCaptured()` workaround does not help here — the hang is in the secret resolution step before hooks run.

**Why it happens:**
External CLI tools designed for interactive terminal use often block on auth or I/O without a timeout flag. The 1Password CLI specifically is documented to hang on `op read` when the desktop app integration requires a biometric confirmation.

**How to avoid:**
Wrap every resolver subprocess in a timeout using `Promise.race`:

```ts
const RESOLVER_TIMEOUT_MS = 10_000
const resolverPromise = $`op read ${path}`.quiet().nothrow()
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error(`resolver timeout after ${RESOLVER_TIMEOUT_MS}ms`)), RESOLVER_TIMEOUT_MS)
)
const result = await Promise.race([resolverPromise, timeout])
```

Surface timeout as a clear error: `[git-stacks] Secret resolver 'op' timed out (10s). Is 1Password unlocked?`

**Warning signs:**
- Resolver `resolve()` method calls subprocess with no timeout
- No test for resolver timeout behavior (mock resolver that delays `> 10s`)
- No mention of timeout in `--help` output or error messages

**Phase to address:**
Secrets implementation phase. The timeout must be in the base resolver infrastructure, not added later per-resolver.

---

### Pitfall 7: Auto-stash Pop Leaves Repo in Conflict State Silently Across Multiple Repos

**What goes wrong:**
`stashPop` exits non-zero with `CONFLICT` in stderr. The spec correctly says: leave stash, report clearly, continue to other repos. The failure mode is in the `SyncResult` reporting: if the overall `syncWorkspace` returns `{ ok: true }` (because the rebase itself succeeded) while individual repos have stash pop conflicts, the user's command exits 0 and the failure is only visible in the progress output — which may have scrolled off or been suppressed in non-verbose mode.

Additionally, after a stash pop conflict, the repo's working tree is in a half-applied state: some hunks applied, conflict markers inserted. The repo appears dirty but `isRepoDirty` returns true, which means any subsequent `git-stacks sync --stash` will try to stash the conflict markers, producing a second stash on top of the conflict state.

**Why it happens:**
`git stash pop` with conflicts does NOT remove the stash from the stash list (confirmed by git documentation). The stash entry remains at `stash@{0}`. The working tree has conflict markers. The developer does not notice because the overall sync command reported success (rebase succeeded). On the next `--stash` invocation, `stashPush` runs again on the dirty (conflicted) working tree, creating `stash@{0}` which pushes the previous stash to `stash@{1}`. The stash list grows; nothing is ever cleanly popped.

**How to avoid:**
`SyncResult.ok` must be `false` if any stash pop failed, not just if the rebase failed. The distinction: `syncFailed` (rebase) vs `stashPopFailed` (post-sync cleanup). Both should set `ok: false` to force a non-zero exit code.

Also check for existing stash entries before pushing a new stash: if `stash@{0}` has the `git-stacks auto-stash` message, warn and refuse to double-stash rather than silently stacking stashes.

```ts
// Before stashPush, check if a git-stacks stash already exists:
const existing = await $`git -C ${path} stash list --format="%gd %s"`.quiet().nothrow()
if (existing.stdout.toString().includes("git-stacks auto-stash")) {
  return { ok: false, error: "unresolved git-stacks stash already exists — pop it first" }
}
```

**Warning signs:**
- `syncWorkspace` returns `{ ok: true }` when `popFailures.length > 0`
- No test: stash pop conflict → `SyncResult.ok === false` and exit code non-zero
- No guard against double-stashing when a previous `git-stacks auto-stash` stash exists

**Phase to address:**
Stash implementation phase. The `SyncResult` extension and the double-stash guard are part of the minimum viable implementation.

---

### Pitfall 8: `stash push --include-untracked` Stashes Files That Should Not Be Stashed

**What goes wrong:**
`git stash push --include-untracked` stashes _all_ untracked files, including generated files, build outputs, and IDE files that are not in `.gitignore`. In a worktree with a monorepo or a repo with a large `node_modules` (if `.gitignore` is incomplete), `--include-untracked` can stash thousands of files, making the stash operation take 10–30 seconds and the pop operation even slower.

More critically: files in `.gitignore` paths that happen to contain runtime state (pid files, lock files, database files used by running dev servers) get stashed, breaking the running process. When the stash is popped, the files come back but the running process may have already failed or created new state, leading to file conflicts.

**Why it happens:**
`--include-untracked` is specified in the FEATURES.md design without caveats. It is the right default for "stash everything the user is working on" but has unintended consequences for large repos or repos with running dev servers.

**How to avoid:**
Use `git stash push --include-untracked` but add `--pathspec-from-file` limited to tracked and staged files if the repo has more than N untracked files. A simpler approach: check the count of untracked files before stashing and warn the user if it is large:

```ts
const untracked = await $`git -C ${path} ls-files --others --exclude-standard`.quiet()
const lines = untracked.stdout.toString().split("\n").filter(Boolean)
if (lines.length > 100) {
  onProgress?.(`⚠ stash in ${repoName}: ${lines.length} untracked files — this may be slow`)
}
```

Alternative: use `git stash push` without `--include-untracked` for the initial MVP and only add the flag when explicitly needed.

**Warning signs:**
- `stashPush` uses `--include-untracked` with no size guard
- No test measuring stash time on a repo with many untracked files
- No `--skip-untracked` flag option exposed in the `--stash` implementation

**Phase to address:**
Stash implementation phase. Size check or flag exposure before shipping the default `--include-untracked` behavior.

---

### Pitfall 9: Label Filter AND-logic Across CLI and TUI Implemented Inconsistently

**What goes wrong:**
The spec says `--label sprint:14 --label urgent` is AND (both required). If the CLI filter and the TUI filter (`/backend`) are implemented independently, they are likely to disagree on AND vs OR semantics, especially since the TUI already has a text filter that uses substring matching (OR-like behavior). A user who filters by `sprint:14` in the CLI and sees 3 results, then opens the TUI and filters `/sprint:14`, may see different results if TUI filter treats multiple terms as OR.

Additionally, the TUI filter extension to match labels adds a code path that runs on every keypress during filtering. If label matching runs `workspace.labels?.includes(term)` per keystroke across 50 workspaces, it is negligible. But if it runs `workspace.labels?.some(l => l.includes(term))` (substring search), it produces false positives: filtering for `sprint` matches `sprint:14`, `sprint:15`, and a label named `constraint` (contains `aint`... no, but `type:sprint-task` would match).

**Why it happens:**
Label filter logic is written separately in `commands/workspace.ts` (CLI filter) and `tui/dashboard/WorkspaceList.tsx` (TUI filter), with no shared utility function. Each implementation makes independent choices about case sensitivity, substring vs exact match, and AND vs OR.

**How to avoid:**
Extract a shared `matchesLabels(workspace: Workspace, terms: string[]): boolean` utility into `lib/workspace-ops.ts` or `lib/config.ts`. Both CLI and TUI call the same function. Define the semantics once: case-sensitive, AND across terms, exact match per label (no substring on a single label unless `label:` prefix is used as described in the spec).

**Warning signs:**
- Label filter logic copied separately into `commands/workspace.ts` and `WorkspaceList.tsx` without extracting to a shared function
- No test: `matchesLabels(ws, ["sprint:14", "backend"])` returns false when ws only has `["sprint:14"]`
- TUI filter produces different results than CLI `--label` for the same workspace and same label value

**Phase to address:**
Labels implementation phase. Write the shared filter function before implementing the UI — it becomes the single source of truth for filter semantics.

---

### Pitfall 10: `cmd:` Resolver Is an Arbitrary Shell Injection Vector

**What goes wrong:**
The `cmd` resolver executes `sh -c <path>` where `<path>` is the content of the YAML env value after the `cmd:` prefix. If a workspace YAML is committed to a shared repo or received from an untrusted source, any `${{ cmd:... }}` value becomes arbitrary code execution during `openWorkspace`.

Unlike the other resolvers (op, doppler, pass) which call a fixed binary with a controlled argument, `cmd:` passes the entire string to `sh -c`. A value like `${{ cmd:rm -rf ~ }}` would execute `rm -rf ~` during workspace open.

**Why it happens:**
`cmd:` is explicitly positioned as a "last resort escape hatch" in the spec. Escape hatches are frequently underestimated as attack surfaces because they are rarely used, have no formal API contract, and are treated as "the user's problem."

**How to avoid:**
Add an explicit security warning in the `cmd:` resolver's documentation and in `git-stacks config` wizard output. Do not enable `cmd:` by default in the global config `resolvers` list — require it to be explicitly added:

```yaml
secrets:
  resolvers: [op, env, cmd]   # cmd must be explicitly listed to enable
```

In the config wizard, warn when `cmd:` is added: "The 'cmd' resolver executes arbitrary shell commands from YAML config. Only enable if you fully control workspace YAML files."

Add a log line when `cmd:` resolver fires during workspace open: `[git-stacks] Executing cmd resolver: sh -c "..."` — makes the execution visible rather than silent.

**Warning signs:**
- `cmd:` resolver in the default resolver list (enabled without explicit config)
- No security warning in `--help` or config wizard output
- No log line when `cmd:` resolver executes

**Phase to address:**
Secrets implementation phase. The default resolver list and the warning must be part of the initial implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Bare `--force-with-lease` without explicit SHA | Simple one-liner | Protection defeated by any background fetch; false sense of safety | Acceptable for MVP with documented limitation in help text |
| Silent `0` return when remote-tracking ref missing in ahead/behind | No null propagation through callers | "Up to date" shown for repos that have never synced with remote | Never — use `null` or a distinct type from the start |
| `FETCH_HEAD` staleness from `join(repoPath, ".git", "FETCH_HEAD")` | Simple path construction | Wrong path for worktrees; `statSync` throws ENOENT on worktrees | Never — use `git rev-parse --git-common-dir` |
| Label filter logic duplicated in CLI and TUI | Faster to write each independently | AND/OR semantics diverge; bug in one doesn't fix the other | Never — shared function from the start |
| `cmd:` resolver enabled by default | No config required | Arbitrary code execution from shared YAML files | Never — require explicit opt-in |
| `stashPop` failure leaves `SyncResult.ok = true` | "Sync succeeded" is technically true | User misses stash conflict; next `--stash` double-stacks | Never — any pop failure sets `ok: false` |
| `resolveSecrets` mutates `workspace.env` in place | Fewer allocations | Resolved plaintext written to YAML on any `writeWorkspace` call | Never — always return a new Record |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| 1Password CLI (`op`) | No timeout; hangs when desktop app needs biometric | `Promise.race` with 10s timeout; surface "Is 1Password unlocked?" in error |
| Doppler CLI | No timeout; hangs when VPN/network unavailable | Same timeout pattern; error: "Is Doppler accessible?" |
| `pass` (GPG) | Opens pinentry dialog in some desktop configs, freezing TUI | Same timeout; note: `pass` in a TUI context may need `GPG_TTY` set |
| `env:` resolver | Silently returns empty string for missing env vars | Distinguish missing (`undefined`) from empty string (`""`); warn when missing |
| `cmd:` resolver | Executes from `sh -c` with full user permissions | Require explicit opt-in in global config; log every execution |
| git push (SSH) | SSH multiplexer contention when pushing N repos in parallel | Group repos by remote host; push repos with same remote host sequentially |
| git push (HTTPS) | Credential helper prompts block all parallel pushes | Use `GIT_TERMINAL_PROMPT=0` (already used in `fetchOrigin`, `isBranchGoneOnRemote`) |
| git stash (GPG-signed commits) | `stash push` fails if `commit.gpgsign=true` and GPG unavailable | Pass `-c commit.gpgsign=false` to `git stash push` subprocess |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `getCommitsAhead` + `getCommitsBehind` called in serial per repo in `getWorkspaceListInfo` | `git-stacks list` takes 2–4s for 5-repo workspace | Call both in `Promise.all([ahead, behind])` per repo; all repos in parallel | With 3+ repos in a workspace |
| `rev-list --count` on missing remote-tracking ref (no fetch yet) | Returns 0 silently; then `rev-list` runs again on next poll | Check ref exists first with `checkRemoteTrackingRef`; skip `rev-list` on miss | Every cold-start or new worktree |
| Resolver subprocesses called sequentially for each env var | Workspace open takes N × resolver_time for N secrets | Batch all refs for the same resolver (`op batch read`); resolve all `op://` refs in one subprocess call | With 5+ secret references in a workspace |
| Secret resolution on every `openWorkspace` call | Re-resolves secrets even when values haven't changed | Cache resolved values in memory for the process lifetime (not to disk); only re-resolve on explicit `--refresh-secrets` | Every `git-stacks open` call |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Resolved secret values written to workspace YAML | Plaintext secrets committed to config repo, leaked in backups | `resolveSecrets` operates only on derived Records; never on workspace object; test: YAML on disk has no resolved values |
| `cmd:` resolver enabled by default | Arbitrary code execution from shared YAML | Require explicit `resolvers: [..., cmd]` in global config; not in default list |
| Resolved secrets passed through `process.env` to child hooks | Secrets visible via `/proc/{pid}/environ` on Linux | Inject only into the specific hook subprocess env via `spawn({env: ...})`; do not set on `process.env` globally |
| `--skip-secrets` substitutes empty string silently | Commands run with empty API keys, potentially writing to wrong environments | Log a visible warning per skipped secret: `[git-stacks] WARNING: secret ${{ op://... }} skipped — using empty string` |
| Secret references in `env_file` written paths | If env_file path is inside the repo, resolved secrets committed to repo | Validate that `env_file` paths are outside the repo working tree, or are in `.gitignore` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Push failure output swallowed in parallel execution | User sees "3 repos pushed" but misses one silent failure | Collect all failures; display after parallel push completes; return non-zero exit code if any failed |
| Ahead/behind shows `0/0` for repos with no remote-tracking ref | User thinks everything is synced; actually state is unknown | Show `?` or `—` for unknown; show tooltip/note "run sync to fetch remote state" |
| Stash pop conflict message only in progress output | User misses conflict if they run non-verbose or pipe output | Write conflict warning to stderr explicitly; include the exact `git -C <path> stash pop` recovery command |
| Label regex error produces cryptic Zod message | User tries `sprint 14` (with space) and gets a schema error | Validate label format early with `parseSecretRef`-style helper; return human-readable error: "Labels cannot contain spaces — use 'sprint:14' not 'sprint 14'" |
| `--dry-run` push shows "would push X commits" but X is ahead count, not commits since last push | User confused when count differs from `git log origin/<branch>..HEAD` count | Use `rev-list --count origin/<branch>..HEAD` (the actual "not yet pushed" count), not the total `ahead` count |

---

## "Looks Done But Isn't" Checklist

- [ ] **Push: non-zero exit on any failure:** `pushWorkspace` returns `ok: false` and the CLI command exits non-zero if any repo push fails — not just if _all_ repos fail
- [ ] **Push: trunk repos excluded:** Repos with `mode: "trunk"` are never pushed — verify in test with a mixed-mode workspace
- [ ] **Push: GIT_TERMINAL_PROMPT=0:** `pushBranch` uses `GIT_TERMINAL_PROMPT=0` to prevent credential prompts blocking the CLI (same pattern as `fetchOrigin`)
- [ ] **Ahead/behind: null for missing ref:** `getCommitsAhead` returns `null` (not `0`) when `origin/<branch>` tracking ref does not exist
- [ ] **Ahead/behind: FETCH_HEAD path via --git-common-dir:** Staleness check reads FETCH_HEAD from the common git dir, not from `join(repoPath, ".git", "FETCH_HEAD")`
- [ ] **Secrets: no mutation of workspace.env:** After `openWorkspace`, read the workspace YAML from disk and confirm no `${{ ... }}` reference has been replaced by a resolved value
- [ ] **Secrets: `cmd:` requires explicit config:** `cmd` resolver does not fire unless explicitly listed in `config.yml secrets.resolvers` array
- [ ] **Secrets: timeout on every resolver:** Each resolver subprocess is wrapped in a 10s timeout; hanging resolver surfaces a clear error message
- [ ] **Labels: shared filter function:** Both `commands/workspace.ts` and `WorkspaceList.tsx` call the same `matchesLabels()` utility — not independent implementations
- [ ] **Labels: template labels unioned at creation time only:** Modifying template labels after workspace creation does not change the workspace's label list
- [ ] **Stash: ok=false on pop conflict:** `syncWorkspace` with `--stash` returns `{ ok: false }` when any `stashPop` call reports conflict
- [ ] **Stash: double-stash guard:** If `stash list` already contains a `git-stacks auto-stash` entry, `stashPush` refuses to add another and returns `{ ok: false, error: ... }`
- [ ] **Stash: recovery command in output:** Pop conflict message includes the exact `git -C <path> stash pop` command for user recovery

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `--force-with-lease` overwrite remote commits | HIGH | `git push --force-with-lease` does not help; user must `git fetch`, `git log origin/<branch>`, reconcile manually |
| Secret values written to YAML | HIGH | Rotate all affected secrets immediately; scrub YAML from git history (`git filter-repo`); audit who has access to the repo |
| Stash pop conflict | LOW | User runs `git -C <path> stash pop` manually; resolves conflicts; drops stash with `git stash drop` |
| Double-stash accumulation | MEDIUM | User runs `git stash list` to see all stashes; pops/drops in order; no data loss if working tree is clean |
| Resolver subprocess hang (op/doppler) | LOW | Kill the `git-stacks open` process (Ctrl+C); unlock 1Password/connect VPN; retry |
| `cmd:` resolver executes malicious command | HIGH | Audit YAML files for `${{ cmd:... }}` references; disable `cmd:` resolver in global config |
| Missing remote-tracking ref shows `0/0` (old behavior) | LOW | Run `git-stacks sync --fetch` to fetch and refresh tracking refs; recalculate |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `--force-with-lease` defeated by background fetch | Push: `pushBranch` implementation | Test: remote has new commits after local fetch → bare `--force-with-lease` still pushes (document this); explicit SHA form blocks it |
| Parallel push shared .git lock contention | Push: `pushWorkspace` implementation | Test: two repos with same `main_path` → pushes are sequential, not `Promise.all` |
| Ahead/behind silent zero for missing ref | Ahead/behind: `getCommitsAhead` signature | Test: worktree with no fetch → returns `null`, not `0`; TUI shows `?` |
| FETCH_HEAD wrong path for worktrees | Ahead/behind: staleness check | Test: check FETCH_HEAD mtime via `--git-common-dir` on an actual worktree path |
| Secret values written to YAML | Secrets: `resolveSecrets` function design | Test: open workspace with secret refs → read YAML from disk → no resolved values present |
| Secret resolver subprocess hang | Secrets: resolver infrastructure | Test: mock resolver that hangs → `openWorkspace` returns error after 10s |
| `cmd:` injection via shared YAML | Secrets: default config | Test: config with no explicit `cmd:` in resolvers list → `cmd:` resolver throws "not enabled" |
| Auto-stash pop conflict masked as success | Stash: `syncWorkspace` result | Test: stash push succeeds, sync succeeds, stash pop fails → `SyncResult.ok === false` |
| `--include-untracked` stashes too much | Stash: `stashPush` implementation | Test: repo with 200+ untracked files → warning emitted before stash |
| Label filter AND/OR inconsistency | Labels: shared utility extraction | Test: `matchesLabels(ws, ["a", "b"])` — same function used in CLI and TUI; ws with only `["a"]` returns false |
| `cmd:` default-enabled injection | Secrets: default resolver list | Test: workspace with `${{ cmd:echo hello }}` and no explicit `cmd:` in config → resolver returns error |

---

## Sources

- `src/lib/git.ts` — `fetchOrigin`, `pullFFOnly`, `rebaseBranch`, `getCommitsBehind`, `checkRemoteTrackingRef` implementations — confirmed patterns and failure-return conventions
- `src/lib/workspace-ops.ts` — `syncWorkspace` sequential/dirty-check flow; `mergeWorkspace` force-flag behavior; `getWorkspaceListInfo` shape
- `FEATURES.md` — full design specs for push (PushResult type, parallel execution, trunk-skip), ahead/behind (staleness, FETCH_HEAD threshold, per-repo detail), secrets (`resolveSecrets`, built-in resolvers, `--skip-secrets`), labels (schema, filter AND logic), auto-stash (pop failure handling, double-stash risk)
- Git official docs — `git push --force-with-lease` explicit vs bare form: https://git-scm.com/docs/git-push
- Atlassian blog — `--force-with-lease` defeated by background fetch: https://www.atlassian.com/blog/it-teams/force-with-lease
- Git official docs — `git-worktree`: `.git` file structure in worktrees, shared object database: https://git-scm.com/docs/git-worktree
- Git official docs — `git stash`: conflicts leave stash in list, stash is not dropped on conflict: https://git-scm.com/docs/git-stash
- 1Password community — CLI hangs requiring biometric auth: https://www.1password.community/discussions/developers/cli-hangs-when-requesting-items/95850
- Git worktree lock contention — concurrent operations can corrupt shared `.git` state: https://github.com/kaeawc/auto-worktree/issues/176
- GitGuardian — secrets in environment variables, subprocess leakage patterns: https://blog.gitguardian.com/secure-your-secrets-with-env/

---
*Pitfalls research for: v0.14.0 — push, ahead/behind, labels, secrets, auto-stash in git-stacks*
*Researched: 2026-04-03*
