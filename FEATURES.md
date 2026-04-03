# Planned Features

Detailed specs for the next round of features. Each section covers motivation,
design decisions, schema changes, new primitives, and the files that need touching.

---

## 1. `git-stacks push`

### Motivation

The core workspace workflow is incomplete without push:

```
new → open → work → sync (rebase from base) → push → PR → merge
```

`sync` pulls the base branch _into_ the workspace. `push` sends the workspace branch
_to_ the remote. Without it, working across 3–4 repos means manually `cd`-ing into
each one. The forge integrations (`integration github pr create`) are already wired
up — push is the missing link that makes them usable without leaving git-stacks.

### Behaviour

```
git-stacks push [name] [options]
```

- If `name` is omitted, detect from CWD (same pattern as `sync`, `status`, etc.)
- Pushes all **worktree-mode** repos' workspace branch to `origin`
- Trunk repos are skipped (their branch is the default branch — not ours to push)
- Parallel across repos (they're independent)
- Reports per-repo: `pushed  api  (3 commits)` / `skipped  shared  (trunk)` / `failed  frontend  (...)`

### Options

| Flag | Behaviour |
|---|---|
| `--force-with-lease` | Safe force-push; fails if remote has new commits we haven't seen |
| `--force` | Hard force-push (`--force-with-lease` preferred; `--force` for escape hatch) |
| `--dry-run` | Show what would be pushed without executing |
| `--set-upstream` | Explicitly pass `-u` to `git push`; auto-applied on first push anyway |

No `--force` without explicit flag — too destructive as a default.

### Return type

Mirror the shape of `SyncResult` / `PullResult` for consistency:

```ts
export type PushResult = {
  ok: boolean
  pushed:  Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  failed:  Array<{ repo: string; reason: string }>
  error?: string
}

export type PushRow = {
  repo: string
  status: "pending" | "pushing" | "pushed" | "skipped" | "failed"
  detail: string
}
```

### Files to touch

**`src/lib/git.ts`** — new function:

```ts
export async function pushBranch(
  repoPath: string,
  branch: string,
  opts: { force?: boolean; forceWithLease?: boolean; setUpstream?: boolean }
): Promise<{ ok: boolean; reason?: string }>
```

Internally: `git push [-u] [--force | --force-with-lease] origin <branch>`.
Parse stderr for common failure reasons (non-fast-forward, no upstream, auth failure)
and return structured errors — same pattern as `pullFFOnly`.

**`src/lib/workspace-ops.ts`** — new function `pushWorkspace`:

```ts
export async function pushWorkspace(
  name: string,
  opts: { force?: boolean; forceWithLease?: boolean; dryRun?: boolean },
  onProgress?: (row: PushRow) => void
): Promise<PushResult>
```

Parallel execution via `Promise.all` (no ordering dependency between repos).
Dry-run prints what branch/remote each push would target.

**`src/commands/workspace.ts`** — register the command, `--force-with-lease` and
`--force` flags, `--dry-run`, `--json` output (consistent with `sync --json`). CWD
detection fallback when name is omitted.

**`src/tui/dashboard/ActionMenu.tsx`** — add `"push"` to the `Action` union in
`types.ts` and wire up a push flow in `App.tsx` (same pattern as sync: show a
`ProgressView` with live rows).

**`tests/lib/workspace-ops.test.ts`** — push tests alongside pull tests.

### Relationship to forge integrations

After `push` succeeds, suggest the next step if a forge is configured:

```
pushed   api       (3 commits)
pushed   frontend  (1 commit)

  → git-stacks integration github pr create my-feature
```

---

## 2. Ahead/Behind Tracking

### Motivation

`getWorkspaceListInfo` computes `dirty: boolean` but nothing about commit distance.
You can't tell from `git-stacks list` or the TUI whether a workspace is one commit
ahead (ready to push) or two weeks behind the base (needs an urgent sync). This is
the most actionable git status metric for a workspace manager.

### Design

Ahead/behind is tracked **per repo** (they can diverge independently) and surfaced
at two levels:

- **Workspace aggregate** (for `list` and TUI row): sum of `ahead` commits across
  all repos, max `behind` across all repos. If any repo is behind, the workspace is
  behind.
- **Per-repo detail** (for `status` and workspace detail pane): individual counts.

### Schema / type changes

**`WorkspaceListInfo`** in `workspace-ops.ts`:

```ts
export type WorkspaceListInfo = {
  // ... existing fields ...
  ahead: number       // total commits ahead across worktree repos
  behind: number      // max commits behind across worktree repos (0 = up to date)
  aheadBehindStale: boolean  // true if origin hasn't been fetched recently
}
```

**`RepoStatus`** in `tui/dashboard/types.ts`:

```ts
export type RepoStatus = {
  // ... existing fields ...
  ahead: number
  behind: number
}
```

### New git primitive

**`src/lib/git.ts`**:

```ts
export async function getCommitsAhead(
  repoPath: string,
  base: string,   // e.g. "origin/main"
  head: string    // e.g. "HEAD" or branch name
): Promise<number> {
  const result = await $`git -C ${repoPath} rev-list --count ${base}..${head}`.quiet().nothrow()
  if (result.exitCode !== 0) return 0
  return parseInt(result.stdout.toString().trim(), 10) || 0
}
```

`getCommitsBehind` already exists with the same shape (`head..base`) — `getCommitsAhead`
is its mirror (`base..head`).

Both can be called in parallel per repo:

```ts
const [ahead, behind] = await Promise.all([
  getCommitsAhead(repoPath, `origin/${baseBranch}`, "HEAD"),
  getCommitsBehind(repoPath, `origin/${baseBranch}`, "HEAD"),
])
```

### Staleness

`origin/<branch>` reflects the last fetch, not current remote state. The counts are
useful but can be stale. Approach:

- Compute from existing local state — no network call during `list` or TUI render
- Add `aheadBehindStale` flag (true if `git fetch` hasn't run recently — check mtime
  of `.git/FETCH_HEAD` against a 15-minute threshold)
- `git-stacks status --fetch` triggers a fetch before computing counts (same opt-in
  pattern as `sync`)

### Display

**`git-stacks list`** column additions:

```
NAME         BRANCH           AHEAD  BEHIND  DIRTY  AGE
my-feature   feature/my-feat    3       0     yes    2d
old-work     feature/old        1      14      no    3w  ← stale: sync needed
```

**`git-stacks status <name>`** — per-repo rows:

```
api        feature/my-feat   ↑3  ↓0   dirty
frontend   feature/my-feat   ↑1  ↓0   clean
shared     main              —   —    (trunk)
```

**TUI `WorkspaceRow`** — compact indicators after the branch name:
`↑3` (ahead), `↓14` (behind), rendered with dim styling when zero.

**TUI `WorkspaceDetail`** — per-repo table with full counts.

### Files to touch

- `src/lib/git.ts` — add `getCommitsAhead`
- `src/lib/workspace-ops.ts` — update `getWorkspaceListInfo`, `getWorkspaceStatus`
- `src/commands/workspace.ts` — update `list` and `status` output formatting
- `src/tui/dashboard/types.ts` — extend `RepoStatus`
- `src/tui/dashboard/WorkspaceRow.tsx` — render `↑N ↓N`
- `src/tui/dashboard/WorkspaceDetail.tsx` — per-repo ahead/behind column
- `tests/lib/workspace-ops.test.ts` — ahead/behind in list info tests

---

## 3. Secrets / Env Var References

### Motivation

`env` and `env_file` store values in plaintext YAML. For real team use — API keys,
database passwords, service tokens — this is a footgun. The injection pipeline
(`mergeEnv` → `writeEnvFiles` → hooks) is already correct; only the _value resolution
step_ is missing.

### Reference syntax

Any env value that matches `${{ resolver:path }}` is treated as a secret reference.
The raw reference is stored in YAML; the resolved value is used at runtime only.

```yaml
# template or workspace YAML
env:
  API_KEY:      "${{ op://Personal/my-api/credential }}"
  DB_PASSWORD:  "${{ doppler:my-project/prod/DB_PASSWORD }}"
  FROM_SHELL:   "${{ env:MY_CORP_TOKEN }}"
  GIT_TOKEN:    "${{ cmd:security find-generic-password -s gh-token -w }}"
```

The `${{ ... }}` syntax is borrowed from GitHub Actions — familiar and unambiguous
inside YAML strings. Plain values (no `${{`) pass through unchanged.

### Resolver interface

**`src/lib/secrets.ts`** — new file:

```ts
export interface SecretResolver {
  /** Matches the prefix before `:` in the reference, e.g. "op", "doppler" */
  id: string
  /** Return true if this resolver should handle the given reference path */
  canResolve(ref: string): boolean
  /** Resolve the secret. Throws on failure (caller surfaces the error). */
  resolve(ref: string): Promise<string>
}

export const REF_PATTERN = /^\$\{\{\s*(\w+):(.+?)\s*\}\}$/

/** Parse a value into resolver id + path, or null if not a reference. */
export function parseSecretRef(value: string): { id: string; path: string } | null {
  const m = value.match(REF_PATTERN)
  if (!m) return null
  return { id: m[1], path: m[2].trim() }
}

/**
 * Resolve all secret references in an env map.
 * Plain values are passed through. Unresolvable references throw with context.
 */
export async function resolveSecrets(
  env: Record<string, string>,
  resolvers: SecretResolver[]
): Promise<Record<string, string>>
```

### Built-in resolvers

| Resolver id | Tool | Command |
|---|---|---|
| `op` | 1Password CLI | `op read <path>` |
| `doppler` | Doppler | `doppler secrets get <key> --project <proj> --config <cfg> --plain` |
| `pass` | pass (Unix password store) | `pass show <path>` |
| `env` | Shell environment | `process.env[path]` (no subprocess) |
| `cmd` | Arbitrary shell command | `sh -c <path>` — last resort escape hatch |

Each resolver checks for tool availability (`which op`) and surfaces a helpful error
if the tool isn't installed.

### Global config

```yaml
# ~/.config/git-stacks/config.yml
secrets:
  resolvers: [op, env]   # tried in order; first to claim the ref id wins
```

Default resolver list when unconfigured: `[op, doppler, pass, env, cmd]` (all enabled,
resolved by id match — not ordered priority, since each handles a distinct `id:`
prefix).

**`GlobalConfigSchema`** addition:

```ts
secrets: z.object({
  resolvers: z.array(z.string()).optional(),
}).optional(),
```

### Integration point

Secret resolution runs in `openWorkspace` (and `createWorkspace`), after `mergeEnv()`
collects the raw values and before they're injected into hooks or written to env files:

```ts
// workspace-ops.ts — openWorkspace, after mergeEnv()
const rawEnv = mergeEnv(wsWithPorts)
const resolvedEnv = await resolveSecrets(rawEnv, buildResolvers(config))
writeEnvFiles(wsWithPorts, resolvedEnv, ...)
const hookEnv = { ...baseEnv, ...resolvedEnv }
```

**Critical**: resolved values are **never written back to the workspace YAML** —
only the original `${{ ... }}` references are stored. `writeWorkspace` is called
with the pre-resolution workspace object.

### Failure handling

- Missing resolver tool: `[git-stacks] Cannot resolve ${{ op://... }}: 'op' not found. Install 1Password CLI.`
- Resolver error: `[git-stacks] Failed to resolve ${{ op://vault/item/field }}: exit 1 (item not found)`
- By default: fatal — `openWorkspace` returns `{ ok: false, error: ... }`
- With `--skip-secrets`: log warnings and substitute empty string (escape hatch for
  environments without access to the secret store)

### Files to touch

- `src/lib/secrets.ts` — new file: interface, built-in resolvers, `resolveSecrets`
- `src/lib/config.ts` — add `secrets` to `GlobalConfigSchema`
- `src/lib/workspace-ops.ts` — call `resolveSecrets` in `openWorkspace`
- `src/commands/config.ts` — add secrets resolver config to the wizard
- `tests/lib/secrets.test.ts` — new test file: resolver parsing, substitution, failure modes

---

## 4. Labels / Grouping

### Motivation

With more than ~10 workspaces the flat list becomes noisy. There's no way to express
"these 4 workspaces belong to client-X", "these are experimental", "these are
sprint-14". Labels are the minimal structure that scales without adding a rigid folder
hierarchy.

### Schema changes

**`WorkspaceSchema`** in `config.ts`:

```ts
labels: z.array(
  z.string().regex(/^[A-Za-z0-9._:-]+$/, "Label may only contain letters, digits, dots, colons, hyphens, underscores")
).optional(),
```

**`TemplateSchema`** — same field. Labels defined on a template are merged into
workspaces created from it (union, not override — workspace can add its own).

No changes to file paths or workspace names — labels are purely metadata.

### Label rules

- Labels are case-sensitive (`backend` ≠ `Backend`)
- A workspace can have 0–N labels
- The colon allows namespaced labels: `sprint:14`, `client:acme`, `type:bugfix`
- Template labels are unioned onto the workspace at creation time, not inherited
  dynamically (workspace YAML is the source of truth after creation)

### CLI

**Filtering on `list`:**

```
git-stacks list --label backend
git-stacks list --label sprint:14 --label urgent   # AND: both required
```

**Setting labels on `new`:**

```
git-stacks new my-feature --label backend --label sprint:14
```

Wizard also asks: "Labels (optional, comma-separated):" — empty = skip.

**`git-stacks label` subcommand** (new):

```
git-stacks label add <workspace> <label...>     # adds one or more labels
git-stacks label remove <workspace> <label...>  # removes specific labels
git-stacks label list <workspace>               # prints current labels
git-stacks label clear <workspace>              # removes all labels
```

These write directly to the workspace YAML without opening the editor. Useful for
scripting (e.g., an agent labeling a workspace after it finishes a task).

### TUI changes

**`WorkspaceRow`** — labels rendered as small dim tags after the branch:

```
my-feature   feature/my-feat   [backend] [sprint:14]   ↑3  clean  2d
```

Truncated to fit terminal width (first N labels shown, `+N more` if clipped).

**Filter (`/` in WorkspaceList)** — extend the existing filter to match labels:

```
/backend          → matches workspace name OR any label containing "backend"
/label:sprint:14  → match only against labels (explicit prefix)
```

**Group by label (new keypress `g` in WorkspaceList)**:

Toggles between flat list and grouped view. Grouped view:

```
[backend]
  ├─ my-feature      feature/my-feat   ↑3  clean  2d
  └─ other-feature   feature/other     ↑1  dirty  5d

[sprint:14]
  ├─ my-feature      (same workspace, appears in both groups)
  └─ another         feature/another   ↑0  clean  1h

[unlabeled]
  └─ old-thing       feature/old       ↑0  clean  3w
```

Workspaces appear in each group they belong to. Unlabeled workspaces collect at the
bottom. The `g` toggle state is ephemeral (not persisted).

### UIView addition

```ts
// tui/dashboard/types.ts
| { view: "inline-input"; index: number; purpose: "rename" | "clone-template" | "add-label"; prefill: string }
```

### Files to touch

- `src/lib/config.ts` — add `labels` to `WorkspaceSchema`, `TemplateSchema`
- `src/commands/workspace.ts` — `--label` filter on `list`, `--label` flag on `new`
- `src/commands/workspace.ts` (or new `src/commands/label.ts`) — `label` subcommand
- `src/index.ts` — register `labelCommand` if extracted to its own file
- `src/tui/workspace-wizard.ts` — prompt for labels in creation wizard
- `src/tui/dashboard/types.ts` — extend `Action`, `UIView`
- `src/tui/dashboard/WorkspaceRow.tsx` — render label tags
- `src/tui/dashboard/WorkspaceList.tsx` — group-by-label toggle, filter extension
- `src/tui/dashboard/WorkspaceDetail.tsx` — show/edit labels
- `src/tui/dashboard/ActionMenu.tsx` — "Edit labels" action
- `tests/lib/config.test.ts` — label schema tests
- `tests/commands/list-columns.test.ts` — label filter tests

---

## 5. `--stash` on Sync (maybe)

### Motivation

`syncWorkspace` and `mergeWorkspace` refuse when worktrees are dirty. The workaround
is to manually stash in each repo, sync, then pop — tedious for 3+ repos. A
`--stash` flag automates this.

This is labelled "maybe" because the failure modes (stash pop conflicts) are messy
to handle cleanly in a CLI context, and the right answer for dirty worktrees is
usually "commit your work before syncing". That said, mid-task syncs are common
enough that automating the stash cycle has real value.

### Behaviour

```
git-stacks sync my-feature --stash
```

1. For each dirty worktree repo:
   - `git stash push --include-untracked -m "git-stacks auto-stash (sync)"`
   - Record that this repo was stashed
2. Run the sync (rebase/merge) as normal
3. For each stashed repo (in reverse order):
   - `git stash pop`
   - If pop fails (conflict): leave stash in place, report clearly

### Failure handling (the hard part)

Stash pop can produce conflicts if the sync changed lines that the stashed changes
also touch. The tool should:

- Not abort or hide this — it must be visible
- Report clearly: `⚠ stash pop conflict in frontend — stash preserved. Run: git -C <path> stash pop`
- Continue popping remaining repos (don't let one conflict block others)
- Return `ok: false` in the `SyncResult` if any pop failed

### New git primitives

**`src/lib/git.ts`**:

```ts
export async function stashPush(
  repoPath: string,
  message: string
): Promise<{ ok: boolean; stashRef?: string; error?: string }>

export async function stashPop(
  repoPath: string
): Promise<{ ok: boolean; conflict?: boolean; error?: string }>
```

`stashPush` returns `stashRef` (e.g. `stash@{0}`) for logging. Uses
`git stash push --include-untracked`.
`stashPop` detects conflict from exit code + stderr (`CONFLICT` in output).

### Integration point

In `syncWorkspace` (and `mergeWorkspace`), before the dirty check:

```ts
if (opts.stash) {
  // Phase 0: stash all dirty repos
  const stashedRepos = []
  for (const repo of worktreeRepos) {
    if (existsSync(repo.task_path) && await isRepoDirty(repo.task_path)) {
      const result = await stashPush(repo.task_path, "git-stacks auto-stash (sync)")
      if (!result.ok) return { ok: false, error: `stash failed for ${repo.name}: ${result.error}` }
      stashedRepos.push(repo)
    }
  }
  // ... run sync as normal ...
  // Phase N: pop in reverse
  const popFailures = []
  for (const repo of [...stashedRepos].reverse()) {
    const pop = await stashPop(repo.task_path)
    if (!pop.ok) popFailures.push({ repo: repo.name, conflict: pop.conflict })
  }
  if (popFailures.length > 0) { /* report but don't fail the sync itself */ }
}
```

### Options interaction

`--stash` is incompatible with `--dry-run` (nothing to stash in a dry run).
`--stash` + `--force` is redundant (`--force` already skips the dirty check) but
harmless — document that `--force` takes precedence.

### Files to touch

- `src/lib/git.ts` — `stashPush`, `stashPop`
- `src/lib/workspace-ops.ts` — `--stash` in `syncWorkspace`, possibly `mergeWorkspace`
- `src/commands/workspace.ts` — `--stash` option on `sync` and `merge` commands
- `tests/lib/git.test.ts` — stash primitive tests
- `tests/lib/workspace-ops.test.ts` — stash integration in sync flow

---

## Cross-cutting notes

### Ordering recommendation

1. **Ahead/behind** — pure read path, no schema changes, lowest risk. Unlocks
   meaningful status in TUI without any behaviour change.
2. **Push** — completes the existing workflow. Parallel to forge integration work.
3. **Labels** — schema additive, zero migration risk (field is optional). High UX
   value as workspace count grows.
4. **Secrets** — most architectural surface area (new subsystem, touches open path).
   Worth doing carefully with good test coverage before shipping.
5. **Stash** — lower priority; implement after the above are stable.

### Shared test patterns

All new workspace-ops functions should follow the existing test pattern:
- Set `GIT_STACKS_CONFIG_DIR` to a temp dir via `helpers.ts:makeTmpDir`
- Use `bun test` isolation (mock-heavy tests in separate process via the test runner)
- Return `{ ok, error }` discriminated unions, never throw on expected failures
