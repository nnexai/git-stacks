# Stack Research

**Domain:** Bun CLI tool — v0.10.0 Multi-Agent Workspace Tooling
**Researched:** 2026-03-25
**Confidence:** HIGH (all findings verified against current source, official git docs, Commander.js README, and SolidJS docs)

---

## Scope

This document covers **only what is new for v0.10.0**. The existing stack (Bun runtime, TypeScript strict, Commander.js 12.1.0, SolidJS 1.9.11 + @opentui/core 0.1.87, Zod 3.25.76 + yaml 2.8.2, @clack/prompts 0.9.1) is unchanged and not re-researched.

Five features, three questions:

1. `git-stacks paths` and `git-stacks pull` — what git CLI patterns are needed beyond what already exists?
2. `git-stacks env` — how do the three output formats (shell, dotenv, json) map to implementation?
3. TUI staleness indicator — how should periodic background git checks integrate with the existing SolidJS/OpenTUI hook pattern?
4. Template composition — what does `includes:` field resolution and multi-template `--template a --template b` require?
5. What NOT to add — libraries that are tempting but wrong for this context.

---

## Recommended Stack

### Core Technologies

All existing. No new runtime, framework, or language additions required for v0.10.0.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Bun `$` shell | (runtime) | git pull, git rev-list behind check | Already used for all git ops in `src/lib/git.ts`; add `pullBranch()` alongside existing functions |
| Commander.js | 12.1.0 | `paths`, `pull`, `env` commands + multi-value `--template` | Already installed; `.option('-t, --template <name...>')` variadic syntax supports repeated flag natively |
| Zod | 3.25.76 | `includes:` field on TemplateSchema | Already installed; add `z.array(z.string()).optional()` field, Zod handles forward-compat via `.optional()` |
| SolidJS `onCleanup` + `setInterval` | 1.9.11 | Periodic background staleness polling in TUI | Already used for periodic tick in `useMessages.ts`; same pattern with `setInterval` + `onCleanup` |

### Supporting Libraries

No new dependencies are required. All capabilities map to existing tools or Bun built-ins.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | — |

### Development Tools

No changes to dev tooling.

---

## Feature-Specific Implementation Notes

### `git-stacks paths` Command

**What it does:** Outputs repo paths from a workspace YAML — one per line, or with a `--prefix` string prepended to each.

**Implementation:** Pure TypeScript over existing `readWorkspace()` + `WorkspaceRepo`. No new git calls needed. The `--prefix` flag maps directly to string concatenation before `console.log`. Output goes to stdout so it is pipeline-composable.

**Format variants:**
- Default: one absolute path per line
- `--prefix <str>`: `${prefix}${path}` per line (e.g. `--prefix --repo=` produces `--repo=/path/to/repo`)
- `--format json`: JSON array of objects `{ name, path, mode }` (add alongside `--prefix` as independent flag)

**Commander.js pattern:** No special syntax needed; standard `.option()` flags.

**Integration point:** Reads from `WorkspaceRepo.task_path` (worktree repos) or `WorkspaceRepo.main_path` (trunk repos). Existing `readWorkspace()` in `src/lib/config.ts` provides this directly.

**Confidence:** HIGH — entirely additive over existing data structures.

---

### `git-stacks pull` Command

**What it does:** For each repo in a workspace, runs `git pull` (or `git fetch` + `git merge --ff-only`) to bring the local branch up to date with its upstream.

**git CLI approach:** Use `git -C <path> pull --ff-only` for both worktree and trunk repos. `--ff-only` aborts on non-fast-forward to prevent unexpected merge commits, which is the safe default for multi-repo automation. A `--rebase` flag can be offered as an opt-in.

**Why not `git pull` plain?** Plain `git pull` with merge strategy can create merge commits, which is undesirable for automated multi-repo sync. `--ff-only` keeps the operation safe and predictable.

**Bun `$` pattern:** Add a `pullBranch(repoPath: string, opts?: { rebase?: boolean }): Promise<{ ok: boolean; error?: string }>` function to `src/lib/git.ts`, consistent with existing patterns like `rebaseBranch()` and `mergeBranchFF()`.

**Worktree vs trunk distinction:**
- Worktree repos: pull the workspace branch (`repo.task_path`, branch = `workspace.branch`)
- Trunk repos: pull the default branch (`repo.main_path`, branch = registry `default_branch`)

This is consistent with how `syncWorkspace()` currently handles per-mode logic in `workspace-ops.ts`.

**Output:** Per-repo progress via `ProgressCallback` pattern already established. `--json` flag for machine-readable results.

**Confidence:** HIGH — `git pull --ff-only` is standard; pattern mirrors `fetchOrigin()` and `rebaseBranch()` already in `git.ts`.

---

### `git-stacks env` Command

**What it does:** Dumps the merged env var set for a workspace — global config → template env → workspace env → injected GS_* vars.

**Merge chain:** The existing `mergeEnv()` in `workspace-ops.ts` only merges `workspace.env`. The `env` command needs the full chain:

```
template.env (from workspace.template reference)
  → workspace.env
    → buildBaseEnv() GS_* vars
```

**Reading env_file:** If `workspace.env_file` is set, read the file and parse it into key=value pairs, then merge (workspace YAML `env` field wins over `env_file` on key collision). This is a new read path — currently `writeEnvFiles()` only writes, never reads back.

**Output formats — no new libraries needed:**

| Format | Output | Implementation |
|--------|--------|----------------|
| `shell` (default) | `export KEY=VALUE` | String template, one per line |
| `dotenv` | `KEY=VALUE` | Same as `writeEnvFiles()` existing format |
| `json` | `{ "KEY": "VALUE" }` | `JSON.stringify(envMap, null, 2)` |

All three formats are trivial string transformations. `JSON.stringify` is a Bun/Node built-in. No `dotenv` npm package is needed — the format is so simple it's not worth a dependency.

**Confidence:** HIGH — formats are string-trivial; merge logic extends existing `mergeEnv()`/`buildBaseEnv()` without new patterns.

---

### TUI Upstream Staleness Indicator

**What it does:** Periodically checks how many commits each repo is behind its upstream. Displays a "N behind" badge in `WorkspaceDetail` (or `WorkspaceRow`).

**git CLI:** `git rev-list --count HEAD..origin/<branch>` already exists as `getCommitsBehind()` in `src/lib/git.ts`. No new git functions needed.

**Periodic polling pattern:** The existing `useMessages.ts` hook uses `setInterval` + `onCleanup` for periodic message refresh. The same pattern applies here:

```typescript
// In a new useStalenessPoll hook or extended useWorkspaces
const POLL_INTERVAL_MS = 60_000  // 1 minute

onCleanup(() => clearInterval(id))
const id = setInterval(async () => {
  const result = await getCommitsBehind(repoPath, "origin/" + branch, "HEAD")
  setBehinds(prev => ({ ...prev, [repoName]: result }))
}, POLL_INTERVAL_MS)
```

**Why NOT `@solid-primitives/timer`:** The project currently has zero dependencies on `@solid-primitives/*`. The `setInterval` + `onCleanup` pattern is already used in the codebase (`useMessages.ts`). Adding a new package for something that is two lines of code is not justified.

**Fetch requirement:** `getCommitsBehind` uses local remote-tracking refs (`origin/<branch>`) which require a prior `git fetch`. The existing `fetchOrigin()` function handles this. The polling implementation should:
1. Call `fetchOrigin(repoPath)` first to update remote-tracking refs
2. Then call `getCommitsBehind()` for the count

This matches the existing pattern in `syncWorkspace()`.

**Cache strategy:** The result is stored in a `createSignal` map keyed by `repoName`. It is refreshed on workspace focus change (existing reload trigger) and by the interval. No external caching library needed.

**RepoStatus type extension:** Add `behind?: number` to `RepoStatus` in `types.ts`. This is backward-compatible (optional field) and avoids a breaking change to the existing status pipeline.

**Confidence:** HIGH — all git operations already exist; SolidJS polling pattern already used in the same codebase.

---

### Template Composition

**What it does:**
- `includes:` field on TemplateSchema: a template can list other template names; at workspace creation time, all included templates are resolved and merged.
- `--template a --template b` on `git-stacks new`: ad-hoc multi-template selection from CLI.

**Schema change — Zod:**

```typescript
// In TemplateSchema, add:
includes: z.array(z.string()).optional(),
```

This is a backward-compatible additive change. Existing template YAML files without `includes:` parse fine (Zod `.optional()` default is `undefined`).

**Commander.js multi-value option:**

```javascript
// Variadic option using ... syntax (Commander.js 12 native):
.option('-t, --template <name...>', 'template(s) to use')

// OR collect pattern (both work in Commander.js 12):
const collect = (val: string, acc: string[]) => { acc.push(val); return acc }
.option('-t, --template <name>', 'template (repeatable)', collect, [])
```

The variadic `<name...>` syntax is simpler; the `collect` pattern is more explicit. Either works. The `collect` pattern is preferable because it handles single `--template foo` and multiple `--template foo --template bar` identically, and is consistent with how Commander.js handles this in the existing completion generator's flag traversal.

**Merge rules (per PROJECT.md):**
- Repos: union, worktree mode wins on conflict
- Hooks: concatenate (all pre_create arrays merged in order)
- Env: shallow merge, later template wins on key collision
- `includes:` resolution is depth-first, cycle detection required

**Cycle detection:** When resolving `includes:`, track visited template names in a `Set<string>`. If a template name is encountered twice in the resolution path, skip with a warning. No dedicated graph library needed — this is a simple DFS with a seen set.

**Confidence:** HIGH — Zod schema extension is additive; Commander.js variadic options are documented; merge logic is pure TypeScript object manipulation.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `git pull --ff-only` in Bun `$` | `simple-git` npm package | Adds a production dependency for git operations the project already handles directly via Bun `$`; `simple-git` is designed for Node.js, not Bun |
| `setInterval` + `onCleanup` for polling | `@solid-primitives/timer` | Already used in the codebase; zero new dependency for two lines of code |
| `JSON.stringify` for env JSON output | `json-stringify-pretty-compact` or similar | Overkill; `JSON.stringify(obj, null, 2)` is sufficient and built-in |
| Custom merge function for template composition | `deepmerge` or `deepmerge-ts` | The merge rules are domain-specific (hooks concatenate, repos union, env shallow-merge) — no generic deep-merge library handles this correctly without configuration that is as complex as writing it directly |
| Zod `.optional()` for `includes:` field | Schema migration shim | Not needed; `.optional()` is backward-compatible with existing template YAML files |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `dotenv` npm package | Parses `.env` files but the project's env output formats are string-trivial; adds a production dep for 3 lines of code | String templates: `export K=V`, `K=V`, `JSON.stringify` |
| `@solid-primitives/timer` | Wraps `setInterval`/`setTimeout` reactively — good library, but the codebase already uses `setInterval` + `onCleanup` directly | The existing `useMessages.ts` polling pattern |
| `simple-git` | Node.js-oriented wrapper around git — redundant with Bun `$` shell and the established `src/lib/git.ts` patterns | Bun `$` + functions in `git.ts` |
| `deepmerge` / `deepmerge-ts` | Generic deep merge can't express the domain-specific rules: hooks concatenate (not merge), repos union with worktree-wins, env shallow-merge | Plain TypeScript: union with a `Map` for repos, `concat` for hook arrays, `Object.assign` for env |
| `p-limit` or `p-map` | Concurrency limiting for pull operations — the existing `useWorkspaces.ts` already implements a manual `CONCURRENCY = 5` batching pattern | Existing batch loop pattern in `fetchStatuses()` |

---

## Stack Patterns by Variant

**If `git-stacks pull` encounters a repo that is not on its remote branch:**
- Return `{ ok: false, error: "no upstream tracking" }` from `pullBranch()`
- Report per-repo in output, continue with remaining repos (non-fatal per-repo failure)
- Do NOT abort the entire pull on one missing upstream — same philosophy as `syncWorkspace()`

**If template `includes:` creates a cycle:**
- Detect via `Set<string>` in resolution DFS
- Skip the cycling template, log a warning: `[git-stacks] Warning: circular template include '${name}' — skipping`
- Do NOT throw — workspace creation should still succeed with the resolvable subset

**If multiple `--template` values have conflicting repos (same registry name, different modes):**
- Worktree mode wins over trunk (per PROJECT.md spec)
- First-seen base_branch wins (templates are merged left-to-right in argument order)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Commander.js 12.1.0 | Variadic `<name...>` options | Supported since Commander.js 7; verified in v12 README and `options-variadic.js` example |
| Zod 3.25.76 | `z.array(z.string()).optional()` on existing schema | Fully backward-compatible; `.optional()` means undefined if key missing |
| SolidJS 1.9.11 | `setInterval` + `onCleanup` | Standard SolidJS lifecycle pattern; used in same codebase already |

---

## Installation

No new packages to install for v0.10.0. All capabilities are covered by the existing dependency set plus Bun built-ins.

```bash
# No new dependencies
```

---

## Sources

- `src/lib/git.ts` — verified existing `getCommitsBehind()`, `fetchOrigin()`, `rebaseBranch()` patterns (HIGH confidence)
- `src/lib/workspace-ops.ts` — verified `mergeEnv()`, `buildBaseEnv()`, `writeEnvFiles()`, `syncWorkspace()` patterns (HIGH confidence)
- `src/tui/dashboard/hooks/useMessages.ts` — verified `setInterval` + `onCleanup` polling pattern already in use (HIGH confidence)
- `src/tui/dashboard/types.ts` — verified `RepoStatus` structure; `behind?: number` extension is additive (HIGH confidence)
- Commander.js 12 README (github.com/tj/commander.js) — verified variadic `<name...>` option syntax and `collect` function pattern (HIGH confidence)
- SolidJS docs (docs.solidjs.com) — confirmed `createEffect`/`onCleanup` pattern for intervals; `@solid-primitives/timer` noted but not needed (MEDIUM confidence — docs current as of 2025)
- git-scm.com/docs/git-rev-list — confirmed `--count HEAD..origin/<branch>` syntax for behind count (HIGH confidence)
- git-scm.com/docs/git-pull — confirmed `--ff-only` and `--rebase` flags (HIGH confidence)
- package.json — current dependency versions confirmed (HIGH confidence)

---

*Stack research for: git-stacks v0.10.0 Multi-Agent Workspace Tooling*
*Researched: 2026-03-25*
