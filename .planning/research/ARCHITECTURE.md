# Architecture Research

**Domain:** CLI workspace manager — multi-agent workspace tooling features (v0.10.0)
**Researched:** 2026-03-25
**Confidence:** HIGH (primary source: live codebase analysis of all affected files)

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Command Layer (src/commands/)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ workspace.ts │  │ template.ts  │  │   repo.ts    │  │  config.ts  │  │
│  │ + paths cmd  │  │              │  │              │  │  doctor.ts  │  │
│  │ + pull cmd   │  │              │  │              │  │             │  │
│  │ + env cmd    │  │              │  │              │  │             │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬────┘  │
├─────────┴──────────────────┴──────────────────┴─────────────────┴───────┤
│                       Business Logic (src/lib/)                           │
│  ┌────────────────┐  ┌──────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │ workspace-ops  │  │  git.ts  │  │    config.ts   │  │  lifecycle  │  │
│  │ + pullWorkspace│  │ +pullBranch│ │ TemplateSchema │  │   .ts       │  │
│  │ + getWorkspace │  │          │  │ + includes:[]  │  │             │  │
│  │     Env()      │  │          │  │ +composeTemplates│ │             │  │
│  └────────┬───────┘  └──────────┘  └────────────────┘  └─────────────┘  │
├───────────┴─────────────────────────────────────────────────────────────┤
│                         TUI Layer (src/tui/)                              │
│  ┌───────────────────────────────────┐  ┌──────────────────────────────┐ │
│  │    dashboard/ (SolidJS + OpenTUI) │  │  template-wizard.ts          │ │
│  │    WorkspaceRow + "N behind" badge│  │  + includes: multi-select    │ │
│  │    WorkspaceDetail per-repo behind│  │  workspace-wizard.ts         │ │
│  │    useWorkspaces + behinds signal │  │  + multi-template compose    │ │
│  │    types.ts: RepoStatus.behind    │  │                              │ │
│  └───────────────────────────────────┘  └──────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                          Config Store (~/.config/git-stacks/)             │
│  ┌─────────────────┐  ┌───────────────────────┐  ┌────────────────────┐  │
│  │  registry.yml   │  │  templates/{name}.yml  │  │ workspaces/{n}.yml │  │
│  │  (repo paths)   │  │  + includes: [names]   │  │  (self-contained)  │  │
│  └─────────────────┘  └───────────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `src/commands/workspace.ts` | Commander.js command registration | Existing — add `paths`, `pull`, `env` registrations |
| `src/lib/workspace-ops.ts` | Core workspace business logic | Existing — add `pullWorkspace()`, `getWorkspaceEnv()` |
| `src/lib/git.ts` | All git subprocess wrappers | Existing — add `pullBranch()` |
| `src/lib/config.ts` | Zod schemas + YAML I/O | Existing — add `includes` to `TemplateSchema`; add `composeTemplates()` |
| `src/tui/dashboard/types.ts` | TypeScript contracts for TUI components | Existing — extend `RepoStatus` with `behind` |
| `src/tui/dashboard/hooks/useWorkspaces.ts` | Reactive workspace + status loading | Existing — add staleness behind-count signal |
| `src/tui/dashboard/WorkspaceRow.tsx` | Single row in workspace list | Existing — add "N behind" badge |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Selected workspace detail pane | Existing — add per-repo behind count |
| `src/tui/template-wizard.ts` | Interactive template creation/edit | Existing — add `includes:` multi-select prompt step |
| `src/tui/workspace-wizard.ts` | Interactive workspace creation | Existing — support composed template list |

---

## Feature Integration Map

### Feature 1: `git-stacks paths`

**Spine:** `workspace.ts` (new command) → `readWorkspace()` → format `task_path`/`main_path` per repo.

No new lib functions. `WorkspaceRepo` already has both `task_path` (worktree) and `main_path` (main clone). The command is a thin formatter that reads existing data.

```
paths <workspace> [--prefix <flag>] [--worktrees-only] [--format json]
  readWorkspace(name)
    → ws.repos.map(r => r.mode === "worktree" ? r.task_path : r.main_path)
    → if --prefix: emit "--prefix path" pairs (one per repo for agent CLI injection)
    → if --format json: emit [{name, path, mode}] array
    → else: one path per line
```

**Files modified:** `src/commands/workspace.ts` (add command block only).
**Files added:** none.
**New lib functions:** none.

---

### Feature 2: `git-stacks pull`

**Spine:** `workspace.ts` (new command) → `pullWorkspace()` in `workspace-ops.ts` → `pullBranch()` in `git.ts`.

```
pull <workspace>
  pullWorkspace(name, opts, onProgress)
    readWorkspace(name)
    → Promise.all(repos.map(repo =>
        worktree: pullBranch(repo.task_path)   [pulls workspace branch via tracking]
        trunk:    pullBranch(repo.main_path)   [pulls default_branch]
      ))
    → returns PullResult { ok, pulled[], skipped[], errors[] }
```

**Key distinction:** Trunk repos pull from `main_path` (the actual clone). Worktree repos pull from `task_path`. The mode determines which path and semantically which branch gets pulled. `repo.base_branch` (already on `WorkspaceRepo`) documents the default branch for trunk repos but the pull itself uses `git pull` on whatever tracking branch is configured.

`pullBranch()` uses `git pull --ff-only` to refuse merges — it either fast-forwards or fails with a clear error. This prevents silent divergence.

**Files modified:**
- `src/lib/git.ts` — add `pullBranch()`
- `src/lib/workspace-ops.ts` — add `pullWorkspace()`, `PullResult` type
- `src/commands/workspace.ts` — add `pull` command registration

**Files added:** none.

---

### Feature 3: `git-stacks env`

**Spine:** `workspace.ts` (new command) → `getWorkspaceEnv()` in `workspace-ops.ts` → format output.

`mergeEnv()` and `buildBaseEnv()` already exist in `workspace-ops.ts` and do the layering for hooks. `getWorkspaceEnv()` assembles the same map and returns it to the caller instead of only using it internally.

```
env <workspace> [--format shell|dotenv|json]
  getWorkspaceEnv(name)
    readWorkspace(name)
    readGlobalConfig()
    → mergeEnv(workspace)       [workspace.env fields]
    → buildBaseEnv(workspace, tasksDir, "env-cmd")  [GS_* injected vars]
    → return merged Record<string, string>
  format:
    shell:  "export KEY=VALUE\n" per entry
    dotenv: "KEY=VALUE\n" per entry
    json:   JSON.stringify(map, null, 2)
```

**Files modified:**
- `src/lib/workspace-ops.ts` — add `getWorkspaceEnv()`
- `src/commands/workspace.ts` — add `env` command registration

**Files added:** none.

---

### Feature 4: Template Composition

**Spine:** Schema change (`config.ts`) → `composeTemplates()` pure function (`config.ts`) → wizard integration (`template-wizard.ts`, `workspace-wizard.ts`).

#### Schema change

Add to `TemplateSchema` in `src/lib/config.ts`:

```typescript
includes: z.array(z.string()).optional(),
```

Backward compatible: old YAML without `includes` parses with `includes: undefined`. No migration needed.

#### `composeTemplates(templates: Template[]): Template`

New pure function in `config.ts`. Takes an ordered list of resolved `Template` objects and merges them:

| Field | Merge Rule |
|-------|-----------|
| `repos` | Union by `repo` registry name — if same name appears twice, `worktree` mode wins over `trunk` |
| `hooks.*` | Array concatenation — included template hooks run before base template hooks |
| `env` | Shallow merge — later template overrides earlier keys |
| `name`, `description`, `env_file`, `files`, `integrations` | Last-writer-wins (base template, the last in the list, wins) |

The function is pure (no I/O), making it fully unit-testable without YAML fixtures.

#### `resolveIncludes(templateName, visited?)` in `config.ts`

Helper that recursively resolves `includes` lists and returns a flat ordered `Template[]` ready for `composeTemplates`. Carries a `Set<string>` to detect cycles.

```typescript
function resolveIncludes(name: string, visited = new Set<string>()): Template[] {
  if (visited.has(name)) throw new Error(`Circular template includes: ...${name}`)
  visited.add(name)
  const tpl = readTemplate(name)
  const deps = (tpl.includes ?? []).flatMap(n => resolveIncludes(n, visited))
  return [...deps, tpl]  // deps first, base last
}
```

#### Wizard integration

**`template-wizard.ts`** (`runTemplateNew`, `runTemplateEdit`): Add a "Include other templates?" multi-select prompt step after the description prompt. Store selected names in `includes` field on the template YAML.

**`workspace-wizard.ts`** and **`workspace-clone.ts`**: When creating a workspace from a template, call `resolveIncludes(templateName)` then `composeTemplates(resolved)` to get the effective template. The workspace YAML stores `template: templateName` (not the composed list) for informational display — the composition is ephemeral.

**Ad-hoc `--template a --template b` on `git-stacks new`**: The `new` command's `--from` option currently accepts a single template name. Extend to accept multiple `--template` flags (or comma-separated list). The wizard receives a list of names, calls `composeTemplates(names.map(readTemplate))`, and proceeds with the result. This bypasses `includes` resolution — the explicit list is composed directly in order.

**Files modified:**
- `src/lib/config.ts` — `TemplateSchema.includes`, `composeTemplates()`, `resolveIncludes()`
- `src/tui/template-wizard.ts` — add `includes:` prompt step
- `src/tui/workspace-wizard.ts` — compose templates before workspace creation
- `src/tui/workspace-clone.ts` — same composition step for clone flow
- `src/commands/workspace.ts` — extend `new` command for multi-`--template`

**Files added:** none.

---

### Feature 5: TUI Upstream Staleness Indicator

**Spine:** `git.ts` (existing `getCommitsBehind`) → new `useStaleness` hook → `WorkspaceRow` + `WorkspaceDetail` badge rendering.

`getCommitsBehind(repoPath, base, head)` already exists in `git.ts`. It calls `git rev-list --count HEAD..origin/<branch>`. The staleness feature reuses it.

#### Type extension: `RepoStatus` in `types.ts`

```typescript
export type RepoStatus = {
  name: string
  exists: boolean
  dirty: boolean
  branch: string
  mode: "trunk" | "worktree"
  behind: number | null   // null = not checked, 0 = up to date, N = N commits behind
}
```

All existing code that reads `RepoStatus` only accesses `name/exists/dirty/branch/mode` — `behind: null` is additive and does not break existing consumers.

#### Staleness data flow

```
useStaleness hook (new):
  createSignal(new Map<wsName, Map<repoName, number>>())

  trigger on:
    - workspace row gets focused (lazy-load on focus, not global poll)
    - user presses 'r' (manual refresh)

  per focused workspace:
    fetchBehinds(workspace):
      → git fetch origin (quiet, background) for each worktree repo
      → getCommitsBehind(repo.task_path, `origin/${branch}`, "HEAD") per repo
      → setBehinds(prev => new Map(prev).set(wsName, repoMap))

TTL cache: track lastChecked Map<wsName, timestamp>
  → skip fetch if checked within 2 minutes
  → clear on manual 'r' refresh
```

The fetch call is a network operation and can take 1–30 seconds. The indicator must render `null` (no badge) while the check is in flight, then update reactively. This follows the same pattern as `getWorkspaceStatus` in `useWorkspaces.ts` which updates `setEntries(prev => ...)` as each status arrives.

#### Rendering

`WorkspaceRow.tsx`: after the `~${dirty}` count in the counts column, add `▲${total_behind}` in yellow when any repo in the workspace has `behind > 0`.

`WorkspaceDetail.tsx`: in the per-repo section, next to the dirty indicator, add `▲${behind}` per repo.

**Files modified:**
- `src/tui/dashboard/types.ts` — extend `RepoStatus`
- `src/tui/dashboard/hooks/useWorkspaces.ts` — add `behinds` signal + staleness refresh logic (or extract to new `useStaleness.ts`)
- `src/tui/dashboard/WorkspaceRow.tsx` — add badge rendering
- `src/tui/dashboard/WorkspaceDetail.tsx` — add per-repo behind count

**Files added:** optionally `src/tui/dashboard/hooks/useStaleness.ts` — separating the staleness concern from the workspace list loading concern is cleaner.

---

## Build Order and Dependencies

```
Phase 1: paths command
  deps: none (reads existing WorkspaceRepo fields)
  blast radius: workspace.ts only

Phase 2: env command
  deps: getWorkspaceEnv() in workspace-ops.ts (calls existing mergeEnv + buildBaseEnv)
  blast radius: workspace-ops.ts + workspace.ts

Phase 3: pull command
  deps: pullBranch() in git.ts → pullWorkspace() in workspace-ops.ts
  blast radius: git.ts + workspace-ops.ts + workspace.ts

Phase 4: template composition
  deps: TemplateSchema.includes + composeTemplates() in config.ts → wizard files
  blast radius: config.ts + template-wizard.ts + workspace-wizard.ts + workspace-clone.ts + workspace.ts

Phase 5: TUI staleness indicator
  deps: getCommitsBehind() already in git.ts → RepoStatus.behind → hook → render
  blast radius: types.ts + useWorkspaces.ts + WorkspaceRow.tsx + WorkspaceDetail.tsx
```

Phases 1, 2, 3 are fully independent of each other and of Phases 4 and 5.

Phase 4 is independent of 1–3 and 5 but is the most blast-radius-wide (touches wizard files, config schema, multiple TUI flows).

Phase 5 is independent of 1–4.

**Recommended sequence:** 1 → 2 → 3 (CLI commands first, lowest risk) → 5 (TUI staleness, self-contained) → 4 (template composition, widest blast radius, save for last).

---

## Patterns to Follow

### Thin command, fat lib

All new commands (`paths`, `pull`, `env`) follow the established split: `src/commands/workspace.ts` parses args and formats output; `src/lib/workspace-ops.ts` contains all business logic. No git operations or YAML reads inside command files.

### Discriminated union return types

All new `workspace-ops.ts` functions return `{ ok: boolean; ... }` unions and do not throw. Match existing `SyncResult` / `openWorkspace` return shapes.

```typescript
export type PullResult = {
  ok: boolean
  pulled: string[]
  skipped: Array<{ repo: string; reason: string }>
  errors: Array<{ repo: string; error: string }>
}
```

### `composeTemplates` is pure

`composeTemplates(templates: Template[]): Template` must have no I/O side effects. Callers resolve template objects via `resolveIncludes()` first, then pass them in. This keeps the composition logic fully unit-testable.

### Progressive TUI disclosure

The "N behind" badge follows the existing dirty indicator convention: render `null` (no badge) while data is pending, update reactively. Never block the workspace list render on a network fetch.

### Schema backward compatibility

`includes: z.array(z.string()).optional()` — old YAML without `includes` parses cleanly. Callers check `template.includes?.length` before resolving. `composeTemplates([singleTemplate])` returns the template unchanged.

---

## Anti-Patterns to Avoid

### Writing composed templates to disk

**What people do:** Save the merged template to `~/.config/git-stacks/templates/composed-xyz.yml` for caching.

**Why it's wrong:** Creates a derived artifact that diverges from its sources when source templates change. The workspace YAML is already self-contained — the composed template does not need to persist beyond creation time.

**Do this instead:** Compute the composed Template in memory at workspace creation time. Store `workspace.template = "a,b"` for informational display only.

### Blocking TUI render on staleness fetch

**What people do:** Await all `git fetch` calls before rendering the workspace list.

**Why it's wrong:** Each fetch can take 1–30s. The workspace list today renders in ~50ms.

**Do this instead:** Render with `behind: null` immediately. Update via `setBehinds(prev => ...)` as each fetch completes, matching the pattern of `fetchStatuses()` in `useWorkspaces.ts`.

### Pulling trunk repos using `task_path`

**What people do:** Loop over all repos and call `pullBranch(repo.task_path)`.

**Why it's wrong:** For trunk repos, `task_path === main_path` (same path), but the semantic is different — trunk repos pull their default branch, not the workspace branch. Using `task_path` unconditionally conflates the two modes.

**Do this instead:**

```typescript
if (repo.mode === "worktree") {
  await pullBranch(repo.task_path)   // pulls workspace branch from upstream
} else {
  await pullBranch(repo.main_path)   // pulls default branch
}
```

### Circular `includes` without cycle detection

**What people do:** Implement `includes` resolution as a recursive `readTemplate()` without a visited set.

**Why it's wrong:** `template-a includes template-b includes template-a` stack-overflows or hangs.

**Do this instead:** Pass a `Set<string>` of visited names through `resolveIncludes`. Throw a descriptive error on the first repeated name: `"Circular template includes: a → b → a"`.

### Global staleness poll across all workspaces

**What people do:** Set a 2-minute interval that fetches behind counts for every workspace in the list.

**Why it's wrong:** N workspaces × M repos = N×M concurrent `git fetch` calls. At 10 workspaces with 3 repos each, that is 30 network calls every 2 minutes running in the background while the developer is working.

**Do this instead:** Fetch only for the currently focused workspace, on focus transition and on manual `r` refresh. Cache per-workspace with a 2-minute TTL.

---

## Integration Points Summary

| Feature | Files Modified | New Functions | New Files |
|---------|---------------|---------------|-----------|
| `paths` command | `workspace.ts` | none | none |
| `pull` command | `git.ts`, `workspace-ops.ts`, `workspace.ts` | `pullBranch()`, `pullWorkspace()` | none |
| `env` command | `workspace-ops.ts`, `workspace.ts` | `getWorkspaceEnv()` | none |
| Template composition | `config.ts`, `template-wizard.ts`, `workspace-wizard.ts`, `workspace-clone.ts`, `workspace.ts` | `composeTemplates()`, `resolveIncludes()` | none |
| TUI staleness indicator | `types.ts`, `hooks/useWorkspaces.ts`, `WorkspaceRow.tsx`, `WorkspaceDetail.tsx` | staleness fetch logic | optionally `hooks/useStaleness.ts` |

All five features are additive changes to existing files. No new top-level modules. No YAML schema migrations. No breaking changes to existing function signatures.

---

## Sources

- Live codebase analysis (direct file reads, 2026-03-25):
  - `src/lib/git.ts` — `getCommitsBehind`, `fetchOrigin`, existing patterns
  - `src/lib/workspace-ops.ts` — `mergeEnv`, `buildBaseEnv`, `syncWorkspace`, `PullResult` shape
  - `src/lib/config.ts` — `TemplateSchema`, `WorkspaceRepoSchema`, YAML I/O patterns
  - `src/commands/workspace.ts` — Commander.js registration patterns
  - `src/tui/dashboard/types.ts` — `RepoStatus`, `WorkspaceEntry`, `WorkspaceStatus`
  - `src/tui/dashboard/hooks/useWorkspaces.ts` — reactive status loading pattern
  - `src/tui/dashboard/WorkspaceRow.tsx` — row layout, badge rendering conventions
  - `src/tui/dashboard/WorkspaceDetail.tsx` — detail pane repo section
  - `src/tui/template-wizard.ts` — prompt flow structure
  - `src/tui/workspace-wizard.ts` — template resolution at creation time
- `.planning/PROJECT.md` — v0.10.0 milestone specification and architectural decisions log
- `CLAUDE.md` — project conventions: error handling, import patterns, TUI input rules

---

*Architecture research for: git-stacks v0.10.0 multi-agent workspace tooling features*
*Researched: 2026-03-25*
