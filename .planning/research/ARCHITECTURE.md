# Architecture Research

**Domain:** git-stacks v0.14.0 — workflow completion (push, ahead/behind, labels, secrets, stash)
**Researched:** 2026-04-03
**Confidence:** HIGH — all integration points derived from direct code analysis of the affected files; no third-party unknowns

## Context: What Already Exists

This milestone adds five features to an established, stable architecture. Every feature is additive — no contracts break, no existing behavior changes. The five features and their coupling level:

| Feature | New Files | Modified Files | Schema Change |
|---------|-----------|----------------|---------------|
| Ahead/Behind | none | git.ts, workspace-ops.ts, commands/workspace.ts, TUI | no |
| Push | none | git.ts, workspace-ops.ts, commands/workspace.ts, TUI | no |
| Labels | none | config.ts, commands/workspace.ts, commands/label.ts or workspace.ts, workspace-wizard.ts, TUI | additive |
| Secrets | secrets.ts | config.ts, workspace-ops.ts, commands/config.ts | additive |
| Stash-on-Sync | none | git.ts, workspace-ops.ts, commands/workspace.ts | no |

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CLI Commands (src/commands/)                         │
│  workspace.ts: push, list --label, new --label, sync --stash, status         │
│  label.ts (new): label add|remove|list|clear                                  │
│  config.ts: secrets resolver wizard                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                       Business Logic (src/lib/)                               │
│                                                                               │
│  workspace-ops.ts        git.ts               secrets.ts (new)               │
│  ─────────────────        ──────────           ──────────────────            │
│  pushWorkspace()          pushBranch()         parseSecretRef()              │
│  getWorkspaceListInfo()   getCommitsAhead()    resolveSecrets()              │
│  getWorkspaceStatus()     stashPush()          SecretResolver interface      │
│  syncWorkspace()          stashPop()           OpResolver / DopplerResolver  │
│                           (existing:)          EnvResolver / CmdResolver     │
│                           getCommitsBehind()                                 │
│                           isRepoDirty()                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                      Config Layer (src/lib/config.ts)                         │
│  WorkspaceSchema + labels field                                               │
│  TemplateSchema + labels field                                                │
│  GlobalConfigSchema + secrets field                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                     TUI Dashboard (src/tui/dashboard/)                        │
│  WorkspaceRow.tsx: ↑N ↓N badges, label tags                                  │
│  WorkspaceDetail.tsx: per-repo ahead/behind column, label editor             │
│  WorkspaceList.tsx: group-by-label toggle (g), filter extension              │
│  ActionMenu.tsx: push action, edit-labels action                             │
│  types.ts: Action + "push", UIView + "add-label" purpose, RepoStatus fields  │
├──────────────────────────────────────────────────────────────────────────────┤
│                    YAML Storage (~/.config/git-stacks/)                       │
│  workspaces/{name}.yml — labels: [sprint:14, backend] (new optional field)   │
│  templates/{name}.yml  — labels: [...] (new optional field, merged at create) │
│  config.yml            — secrets: { resolvers: [op, env] } (new optional)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Recommended Project Structure

Changes relative to current tree:

```
src/
├── commands/
│   ├── workspace.ts        MODIFIED — push cmd, --stash on sync, --label on list/new
│   └── label.ts            NEW — label add|remove|list|clear subcommand (or keep in workspace.ts)
├── lib/
│   ├── git.ts              MODIFIED — pushBranch, getCommitsAhead, stashPush, stashPop
│   ├── workspace-ops.ts    MODIFIED — pushWorkspace, ahead/behind in list/status, stash in sync
│   ├── config.ts           MODIFIED — labels on WorkspaceSchema/TemplateSchema, secrets on GlobalConfig
│   └── secrets.ts          NEW — SecretResolver interface, built-in resolvers, resolveSecrets()
└── tui/
    ├── workspace-wizard.ts MODIFIED — labels prompt in creation wizard
    └── dashboard/
        ├── types.ts        MODIFIED — Action + "push", UIView "add-label", RepoStatus ahead/behind
        ├── WorkspaceRow.tsx    MODIFIED — ↑N ↓N badges, label tags
        ├── WorkspaceDetail.tsx MODIFIED — per-repo ahead/behind, labels display/edit
        ├── WorkspaceList.tsx   MODIFIED — group-by-label (g key), filter label extension
        └── ActionMenu.tsx      MODIFIED — push action, edit-labels action

tests/
├── lib/
│   ├── git.test.ts             MODIFIED — stashPush/stashPop tests
│   ├── workspace-ops.test.ts   MODIFIED — push, ahead/behind, stash in sync
│   ├── config.test.ts          MODIFIED — label schema validation tests
│   └── secrets.test.ts         NEW — resolver parsing, substitution, failure modes
└── commands/
    └── list-columns.test.ts    NEW — label filter tests, ahead/behind formatting
```

### Structure Rationale

- **`src/lib/secrets.ts` as its own module:** The secret resolver system has its own interface contract, multiple implementations, and dedicated tests. Colocating in `workspace-ops.ts` would bloat that file past 1200 lines and make it hard to test resolvers in isolation. Pattern: same as `src/lib/files.ts` extracting file-op logic from workspace-ops.
- **`label.ts` as its own command file (or kept in `workspace.ts`):** The `label` subcommand is structurally identical to `repo` and `template` — a namespace of 4 sub-operations with their own arg schemas. Extracting to `src/commands/label.ts` is cleaner and consistent with the existing pattern; it requires one `registerLabelCommand` call in `src/index.ts`.
- **No new TUI files:** All TUI changes extend existing components in-place. The dashboard architecture (WorkspaceRow, WorkspaceDetail, WorkspaceList, ActionMenu) is already the right decomposition.

## Architectural Patterns

### Pattern 1: pushWorkspace follows syncWorkspace structure exactly

**What:** `pushWorkspace` in `workspace-ops.ts` is structured identically to `syncWorkspace`:
- `Promise.all` for parallel repo execution
- `onProgress?: (row: PushRow) => void` callback
- Returns `PushResult` discriminated union
- Skips trunk repos (mode check: `r.mode === "worktree"`)
- CWD detection via `resolveWorkspaceArg` (already exists in `commands/workspace.ts`)

**When to use:** Any new workspace-level operation that affects multiple repos in parallel.

**Trade-offs:** Parallel push is safe because each repo's push is independent. If one repo's push fails with non-fast-forward, the others continue — this is the right UX (user may want the clean repos pushed even if one needs a force).

```typescript
export async function pushWorkspace(
  name: string,
  opts: { force?: boolean; forceWithLease?: boolean; dryRun?: boolean; setUpstream?: boolean },
  onProgress?: (row: PushRow) => void
): Promise<PushResult> {
  const workspace = readWorkspace(name)
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
  const skipped = workspace.repos
    .filter((r) => r.mode === "trunk")
    .map((r) => ({ repo: r.name, reason: "trunk" }))

  const results = await Promise.all(
    worktreeRepos.map(async (repo) => {
      onProgress?.({ repo: repo.name, status: "pushing", detail: "" })
      const result = await pushBranch(repo.task_path, workspace.branch, opts)
      // ... build pushed/failed arrays
    })
  )
  // ...
}
```

### Pattern 2: getCommitsAhead mirrors getCommitsBehind exactly

**What:** `getCommitsAhead` is the exact mirror of the existing `getCommitsBehind` function in `git.ts`. The only difference is the argument order to `rev-list`:

- `getCommitsBehind`: `rev-list --count ${head}..${base}` (commits in base not in head)
- `getCommitsAhead`: `rev-list --count ${base}..${head}` (commits in head not in base)

**When to use:** Called in parallel alongside `getCommitsBehind` in `getWorkspaceListInfo` and `getWorkspaceStatus`. Per-repo, parallel via `Promise.all`.

**Trade-offs:** These are local git operations — fast and offline. The only staleness risk is `origin/<branch>` reflecting the last fetch, not the current remote. This is acceptable and is surfaced via the `aheadBehindStale` flag.

```typescript
export async function getCommitsAhead(
  repoPath: string,
  base: string,   // e.g. "origin/main"
  head: string    // e.g. "HEAD"
): Promise<number> {
  const result = await $`git -C ${repoPath} rev-list --count ${base}..${head}`.quiet().nothrow()
  if (result.exitCode !== 0) return 0
  return parseInt(result.stdout.toString().trim(), 10) || 0
}
```

In `getWorkspaceListInfo`, called alongside the existing dirty check:

```typescript
const [ahead, behind] = await Promise.all([
  getCommitsAhead(repoPath, `origin/${baseBranch}`, "HEAD"),
  getCommitsBehind(repoPath, `origin/${baseBranch}`, "HEAD"),
])
```

Aggregate into `WorkspaceListInfo`: `ahead` = sum across all worktree repos, `behind` = max across all.

### Pattern 3: secrets.resolveSecrets inserts between mergeEnv and writeEnvFiles

**What:** Secret resolution is a pure transform step in the env pipeline. It sits between `mergeEnv()` (which produces a raw `Record<string, string>`) and the two consumers of that record: `writeEnvFiles()` and hook injection. The resolved values are never written back to the workspace YAML.

**When to use:** Invoked in `openWorkspace` (and `createWorkspace` if hooks need secrets at creation time). Skipped if `rawEnv` has no `${{ ... }}` references (fast path: scan for the marker string before constructing resolvers).

**Trade-offs:** Secret resolution is async and potentially slow (1Password CLI subprocess per secret). This is unavoidable — secrets cannot be pre-fetched because their values must not be stored on disk.

```typescript
// workspace-ops.ts — openWorkspace, after port allocation
const rawEnv = mergeEnv(wsWithPorts)

// Fast path: skip resolver construction if no references present
const needsResolution = Object.values(rawEnv).some((v) => v.includes("${{"))
const resolvedEnv = needsResolution
  ? await resolveSecrets(rawEnv, buildResolvers(config, opts))
  : rawEnv

writeEnvFiles(wsWithPorts, resolvedEnv, onWarn)
const hookEnv = { ...buildBaseEnv(wsWithPorts, tasksDir, "open"), ...resolvedEnv }
```

`buildResolvers(config, opts)` reads `config.secrets?.resolvers` (the ordered list from global config) and instantiates only the enabled resolver objects. If unconfigured, all built-in resolvers are instantiated (they self-disable via `canResolve()` when their tool isn't installed).

### Pattern 4: stash-on-sync is a pre/post wrapper in syncWorkspace

**What:** The stash logic wraps the existing sync body without restructuring it. Phase 0 (stash dirty repos) happens before the dirty check and sync execution. Phase N (pop stashes in reverse) happens after sync completes, regardless of sync success.

**When to use:** Only when `opts.stash === true`. The stash list is maintained as a local `stashedRepos` array built during Phase 0.

**Trade-offs:** Stash pop conflicts are non-fatal to the sync result but must be surfaced clearly. The design: `SyncResult` gains an optional `stashPopFailures` array. The command layer prints explicit recovery instructions (`git -C <path> stash pop`) for each conflicted repo.

```typescript
// syncWorkspace — before existing dirty check
const stashedRepos: WorkspaceRepo[] = []
if (opts.stash) {
  for (const repo of worktreeRepos.filter(r => existsSync(r.task_path))) {
    if (await isRepoDirty(repo.task_path)) {
      const stash = await stashPush(repo.task_path, "git-stacks auto-stash (sync)")
      if (!stash.ok) return { ok: false, error: `stash failed in ${repo.name}: ${stash.error}` }
      stashedRepos.push(repo)
    }
  }
}
// ... existing sync body ...

// After sync (or failure), pop in reverse
if (stashedRepos.length > 0) {
  const popFailures: SyncResult["stashPopFailures"] = []
  for (const repo of [...stashedRepos].reverse()) {
    const pop = await stashPop(repo.task_path)
    if (!pop.ok) popFailures.push({ repo: repo.name, conflict: pop.conflict ?? false, path: repo.task_path })
  }
  if (popFailures.length > 0) {
    // ok stays as-is from sync; stashPopFailures carries the separate failure signal
    result.stashPopFailures = popFailures
  }
}
```

### Pattern 5: labels as pure metadata — no file path or identity impact

**What:** Labels are an optional `string[]` on `WorkspaceSchema` and `TemplateSchema`. They are purely display/filter metadata. No workspace path, no filename, no identity changes. Template labels are unioned onto the workspace at creation time (one-time copy, not dynamic inheritance).

**When to use:** The `labels` field is always optional. Workspaces without labels work identically to today. Filtering in `getWorkspaceListInfo` is a post-load filter in the command layer, not in the YAML read path.

**Trade-offs:** Labels are case-sensitive. The colon convention (`sprint:14`) is a soft standard — no schema-level namespace enforcement, just the regex `^[A-Za-z0-9._:-]+$`. This keeps the implementation simple.

## Data Flow

### Push flow

```
git-stacks push [name] [--force-with-lease] [--dry-run]
    |
    v
commands/workspace.ts
  resolveWorkspaceArg(name) → workspace name (or CWD detection)
    |
    v
workspace-ops.ts: pushWorkspace(name, opts, onProgress)
  workspace.repos.filter(r => r.mode === "worktree")
    |
    v (parallel Promise.all)
git.ts: pushBranch(repo.task_path, workspace.branch, opts)
  git push [-u] [--force-with-lease | --force] origin <branch>
  parse stderr: non-fast-forward | no upstream | auth failure
    |
    v
PushResult: { pushed[], skipped[], failed[] }
    |
    v
commands/workspace.ts: format table output
  "→ git-stacks integration github pr create <name>"  (if forge configured)
```

### Ahead/behind data flow (in getWorkspaceListInfo)

```
getWorkspaceListInfo(workspace)
    |
    v (existing parallel dirty check + new ahead/behind per repo)
Promise.all over worktree repos:
  [isRepoDirty, getCommitsAhead, getCommitsBehind] per repo
    |
    v
Aggregate: ahead = sum, behind = max
Staleness: stat .git/FETCH_HEAD mtime > 15min → aheadBehindStale = true
    |
    v
WorkspaceListInfo: { ahead, behind, aheadBehindStale, dirty, dirtyRepos, ... }
    |
    v
commands/workspace.ts: list output adds AHEAD/BEHIND columns
tui/dashboard/WorkspaceRow.tsx: renders ↑N ↓N inline
```

### Secret resolution data flow (in openWorkspace)

```
openWorkspace(name, opts)
  mergeEnv(workspace) → rawEnv: Record<string, string>
    |
    v (only if any value matches "${{")
secrets.ts: resolveSecrets(rawEnv, buildResolvers(config, opts))
  for each value: parseSecretRef(value)
    null → pass through unchanged
    {id, path} → find resolver where resolver.id === id
      resolver.resolve(path) → subprocess (op read / doppler / pass / sh -c)
    |
    v
resolvedEnv: Record<string, string>  (references replaced with actual values)
    |
    v (two consumers, neither writes back to YAML)
writeEnvFiles(workspace, resolvedEnv)    ← writes .env file in each worktree
hookEnv = { ...baseEnv, ...resolvedEnv } ← injected into hook subprocesses
    |
    v
writeWorkspace(wsWithPorts)   ← called with PRE-resolution workspace (refs preserved)
```

### Labels data flow

```
Workspace YAML (labels: [sprint:14, backend])
    |
    v (on listWorkspaces / readWorkspace)
WorkspaceListInfo.labels: string[] (new field)
    |
    ├─ commands/workspace.ts list: --label filter (AND: all specified labels present)
    ├─ tui/dashboard/WorkspaceRow.tsx: rendered as dim tags
    └─ tui/dashboard/WorkspaceList.tsx:
         filter "/" extension: matches name OR label
         group-by toggle "g": groups into per-label sections with [unlabeled] at bottom
```

## Integration Points: New vs Modified Files

### New files

| File | Purpose | Interface |
|------|---------|-----------|
| `src/lib/secrets.ts` | SecretResolver interface, 5 built-in resolvers, `resolveSecrets()`, `parseSecretRef()`, `buildResolvers()` | Consumed by `workspace-ops.ts:openWorkspace` only |
| `tests/lib/secrets.test.ts` | Unit tests for resolver parsing, built-in resolvers (mocked subprocess), error paths | None (test file) |

### Modified files

| File | What Changes | Dependencies Added |
|------|-------------|-------------------|
| `src/lib/git.ts` | Add `getCommitsAhead`, `pushBranch`, `stashPush`, `stashPop` | none |
| `src/lib/workspace-ops.ts` | Add `pushWorkspace`, extend `getWorkspaceListInfo` + `getWorkspaceStatus` with ahead/behind, stash logic in `syncWorkspace`, call `resolveSecrets` in `openWorkspace` | `secrets.ts`, `git.ts` new exports |
| `src/lib/config.ts` | Add `labels` to `WorkspaceSchema` + `TemplateSchema`, add `secrets` to `GlobalConfigSchema` | none |
| `src/commands/workspace.ts` | Register `push` command, `--stash` on `sync`/`merge`, `--label` on `list`/`new`, ahead/behind in `list` + `status` output | `pushWorkspace` from workspace-ops |
| `src/commands/label.ts` (or `workspace.ts`) | `label add|remove|list|clear` — reads/writes workspace YAML directly | `readWorkspace`, `writeWorkspace` from config |
| `src/index.ts` | Register `labelCommand` if extracted to its own file | `commands/label.ts` |
| `src/tui/workspace-wizard.ts` | Add labels prompt (optional, skip on empty) | none |
| `src/tui/dashboard/types.ts` | `Action` + `"push"`, `UIView` + `add-label` purpose, `RepoStatus` + `ahead`/`behind` | none |
| `src/tui/dashboard/WorkspaceRow.tsx` | Render `↑N ↓N` and label tags | types.ts |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Per-repo ahead/behind column, labels section | types.ts |
| `src/tui/dashboard/WorkspaceList.tsx` | Group-by-label toggle `g`, filter label extension | types.ts |
| `src/tui/dashboard/ActionMenu.tsx` | Add `"push"` and `"edit-labels"` actions | types.ts |
| `src/commands/config.ts` | Secrets resolver config in wizard | config.ts |

### Internal module boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `workspace-ops.ts` → `secrets.ts` | Direct import: `resolveSecrets`, `buildResolvers` | No circular dependency risk — secrets.ts has no workspace-ops import |
| `workspace-ops.ts` → `git.ts` | Direct import: 4 new functions added to existing import list | Same pattern as existing git imports |
| `commands/workspace.ts` → `workspace-ops.ts` | Direct import: `pushWorkspace` added to existing import | No change to call pattern |
| `commands/label.ts` → `config.ts` | Direct import: `readWorkspace`, `writeWorkspace` | Labels command bypasses workspace-ops (pure YAML mutation, no git side-effects) |
| TUI `types.ts` → `config.ts` | Type import only: `Workspace` | `Workspace` already imported; no new imports needed |

## Build Order

The five features have three dependency levels. Features within the same level can be built in parallel.

```
Level 1 (no dependencies on other new features):
  ├─ Ahead/Behind
  │   1. git.ts: add getCommitsAhead
  │   2. workspace-ops.ts: update getWorkspaceListInfo + getWorkspaceStatus
  │   3. commands/workspace.ts: list + status output
  │   4. tui/dashboard/types.ts + WorkspaceRow.tsx + WorkspaceDetail.tsx
  │   5. tests: workspace-ops.test.ts
  │
  └─ Labels (schema first, CLI, then TUI)
      1. config.ts: add labels to WorkspaceSchema + TemplateSchema
      2. commands/workspace.ts: --label filter on list, --label on new
      3. commands/label.ts (or workspace.ts): label subcommand
      4. src/index.ts: register labelCommand (if extracted)
      5. tui/workspace-wizard.ts: labels prompt
      6. tui/dashboard/types.ts + WorkspaceRow + WorkspaceList + WorkspaceDetail + ActionMenu
      7. tests: config.test.ts (schema), list-columns.test.ts (filter)

Level 2 (depends only on git.ts):
  ├─ Push
  │   1. git.ts: add pushBranch
  │   2. workspace-ops.ts: add pushWorkspace + PushResult/PushRow types
  │   3. commands/workspace.ts: register push command
  │   4. tui/dashboard/types.ts + ActionMenu.tsx (push action)
  │   5. tests: workspace-ops.test.ts (push alongside pull tests)
  │
  └─ Stash-on-Sync
      1. git.ts: add stashPush + stashPop
      2. workspace-ops.ts: --stash logic in syncWorkspace (+ optionally mergeWorkspace)
      3. commands/workspace.ts: --stash option on sync + merge
      4. tests: git.test.ts (stash primitives), workspace-ops.test.ts (stash in sync flow)

Level 3 (depends on config.ts schema changes):
  └─ Secrets
      1. config.ts: add secrets to GlobalConfigSchema
      2. src/lib/secrets.ts: new file — interface + 5 resolvers + resolveSecrets + buildResolvers
      3. workspace-ops.ts: call resolveSecrets in openWorkspace (after mergeEnv, before writeEnvFiles)
      4. commands/config.ts: secrets resolver config in wizard
      5. tests: secrets.test.ts (new), workspace-ops.test.ts (open with mock resolver)
```

**Rationale for this order:**

Ahead/behind and Labels are pure read-path or additive schema work — zero risk of breaking existing behavior. Building them first means the TUI has meaningful data before any write-path features (push, stash) are wired. Push and stash-on-sync both require `git.ts` changes but are otherwise independent of each other and of labels/ahead-behind. Secrets is last because it touches `openWorkspace` (the most complex function in workspace-ops.ts) and requires a new subsystem with its own test coverage to build confidently.

## Anti-Patterns

### Anti-Pattern 1: Writing resolved secret values back to workspace YAML

**What people do:** Pass `resolvedEnv` to `writeWorkspace()` instead of the original workspace object, or merge resolved values into `workspace.env` before writing.

**Why it's wrong:** The entire purpose of secret references is that plaintext values are never stored on disk. Writing resolved values defeats this and creates a security regression. The workspace YAML must always contain only `${{ ... }}` references.

**Do this instead:** Call `writeWorkspace(wsWithPorts)` (the pre-resolution object) before or after secret resolution. Resolved values exist only in the `resolvedEnv` variable in memory, and are consumed by `writeEnvFiles` and `hookEnv` — both of which are ephemeral (process-scoped).

### Anti-Pattern 2: Sequential ahead/behind fetches per repo

**What people do:** Loop `for repo of repos` and `await getCommitsAhead(...)` then `await getCommitsBehind(...)` sequentially.

**Why it's wrong:** `getWorkspaceListInfo` already pays the cost of parallel dirty checks via `Promise.all`. Adding sequential ahead/behind calls would triple the wall-clock time for a 4-repo workspace (currently ~parallel, becomes serial for each count).

**Do this instead:** Extend the existing `Promise.all` in `getWorkspaceListInfo` to include ahead/behind alongside dirty checks, all parallelized across repos.

### Anti-Pattern 3: Filtering by labels in the YAML read path

**What people do:** Add label filtering to `listWorkspaces()` in `config.ts` to avoid loading workspaces that don't match.

**Why it's wrong:** `listWorkspaces()` returns raw workspace objects. Filtering there would make the function context-dependent and break all callers (TUI, status, etc.) that need all workspaces regardless of label filter. The label filter belongs in the command layer, applied after `getWorkspaceListInfo` returns.

**Do this instead:** Call `listWorkspaces()` as normal, map to `getWorkspaceListInfo`, then filter the resulting array by label in `commands/workspace.ts`. This is consistent with how `--status` filtering already works.

### Anti-Pattern 4: Making stash pop failure abort the entire sync result

**What people do:** Return `{ ok: false, error: "stash pop conflict in ..." }` from `syncWorkspace` when a pop conflict occurs.

**Why it's wrong:** The sync itself succeeded — commits were rebased, the workspace is now up to date. Marking the overall result as failed misleads the user and any callers (TUI, scripts) about the sync state. The conflict is in the stash layer, not the sync layer.

**Do this instead:** Return `ok: true` (or whatever the sync result was) with a separate `stashPopFailures` array in `SyncResult`. The command layer treats `stashPopFailures` as a distinct warning, printing explicit `git -C <path> stash pop` recovery instructions. The TUI can surface this as a warning badge rather than a failed sync.

### Anti-Pattern 5: Installing secret resolvers globally at module load time

**What people do:** Instantiate all resolver objects in a module-level `const RESOLVERS = [new OpResolver(), ...]` so they're available immediately.

**Why it's wrong:** Resolver construction triggers `which op`, `which doppler`, etc. (tool availability checks). Running these at module load time means every `git-stacks` invocation pays the subprocess cost of checking for 5 tools, even commands that never touch env or secrets (e.g., `git-stacks list`).

**Do this instead:** `buildResolvers(config, opts)` is called lazily, only when `resolveSecrets` is actually needed (i.e., only in `openWorkspace` when `needsResolution` is true). Resolver objects are ephemeral to the `openWorkspace` call.

## Sources

- `src/lib/git.ts` — direct code analysis: existing primitives (getCommitsBehind, pullFFOnly, fetchOrigin, rebaseBranch), patterns to mirror for new functions
- `src/lib/workspace-ops.ts` — direct code analysis: syncWorkspace, openWorkspace, getWorkspaceListInfo, mergeEnv/writeEnvFiles pipeline, ProgressCallback pattern
- `src/lib/config.ts` — direct code analysis: WorkspaceSchema, TemplateSchema, GlobalConfigSchema, Zod patterns
- `src/tui/dashboard/types.ts` — direct code analysis: existing Action, UIView, RepoStatus, WorkspaceStatus types
- `FEATURES.md` — canonical feature specs: function signatures, type definitions, CLI flags, failure handling
- `.planning/PROJECT.md` — milestone goal and context

---

*Architecture research for: git-stacks v0.14.0 workflow completion and workspace UX*
*Researched: 2026-04-03*
