# Architecture Research

**Domain:** CLI workspace manager — engine hardening & plugin contracts
**Researched:** 2026-04-05
**Confidence:** HIGH (primary sources: full codebase read)

---

## Current Architecture (Baseline)

```
commands/ (CLI parsing + Commander.js routing)
    ↓ calls
workspace-ops.ts (facade / re-export hub)
    ↓ delegates to
workspace-lifecycle.ts  workspace-env.ts  workspace-status.ts
workspace-git.ts        workspace-yaml.ts
    ↓ both use
config.ts (Zod schemas + scan-based YAML I/O)  git.ts (Bun shell ops)
    ↓ persistence
~/.config/git-stacks/{workspaces,templates,registry}.yml  (flat YAML files)

tui/ (wizards + SolidJS dashboard — parallel adapter, not layered above commands/)
integrations/ (runner.ts orchestrates 10 plugins via Integration interface)
```

---

## Features and Their Integration Points

### 1. Template Labels to Workspace Propagation

**Current state:** Partially done.

The TUI wizard (`src/tui/workspace-wizard.ts:390-391`) already merges `template.labels` into workspace labels at creation time. The schema supports `labels` on both `TemplateSchema` and `WorkspaceSchema` (`src/lib/config.ts:106,186`). The `label add/remove/list/clear` CLI commands (`src/commands/label.ts`) work only on workspaces.

**What is missing:**

- The `workspace-clone` path (`src/tui/workspace-clone.ts`) does not propagate labels from the source workspace or its originating template.
- No CLI surface for managing template labels (only workspace labels exist via `label` command).
- `listTemplates()` and `readTemplate()` already return labels from YAML, but no command exposes them.

**New vs modified:**

| Target | New/Modified | Work |
|--------|-------------|------|
| `src/commands/label.ts` | Modified | Add `label add/remove/list/clear <template>` subcommands via `--template` flag or separate subcommand tree |
| `src/tui/workspace-clone.ts` | Modified | Propagate source workspace labels into clone |
| `src/tui/workspace-wizard.ts` | No change needed | Already propagates template labels |
| `src/lib/labels.ts` | Modified | Add `matchesLabels` variant for templates if filter parity needed |

**Data flow for propagation (creation path):**

```
git-stacks new --template <name>
    → workspace-wizard.ts reads template.labels
    → merges into workspace.labels at line 390-391
    → writeWorkspace() persists

git-stacks clone <source>
    → workspace-clone.ts reads source.labels (currently ignored)
    → should copy source.labels into clone YAML  ← gap
```

**Build order:** Label CLI for templates first (schema already supports it). Clone propagation second. No new modules needed.

---

### 2. Operation Runner With Rollback

**Current state:** None. Failures in `openWorkspace`, `cleanWorkspace`, `mergeWorkspace` are best-effort via discriminated unions. Partial state (e.g. some worktrees created, integration not opened) is left on disk with no cleanup plan.

**Proposed module:** `src/lib/operation-runner.ts`

**Responsibilities:**
- Execute a sequence of named steps, each returning `{ ok: true } | { ok: false; error: string }`
- On step failure: run registered rollback/undo actions in reverse order
- Emit structured progress events via callback (compatible with existing `ProgressCallback` signature)
- Optionally persist an operation log to JSONL for post-mortem visibility

**Interface shape:**

```typescript
type Step<T = void> = {
  name: string
  run: () => Promise<{ ok: true; result?: T } | { ok: false; error: string }>
  rollback?: () => Promise<void>   // Called in reverse order on failure
}

type OperationResult =
  | { ok: true }
  | { ok: false; failedAt: string; error: string; rolledBack: boolean }

async function runOperation(
  name: string,
  steps: Step[],
  onProgress?: ProgressCallback
): Promise<OperationResult>
```

**Integration with existing lifecycle modules:**

Each `workspace-lifecycle.ts` function currently composes steps inline with manual if/return error chains. The operation runner replaces that composition pattern.

```
workspace-lifecycle.ts (modified)
    → builds Step[] array (worktree creation, hook execution, integration open, etc.)
    → calls runOperation(steps, onProgress)
    → returns OperationResult

workspace-ops.ts (facade — minimal change)
    → still exports openWorkspace/cleanWorkspace/etc with same signatures
    → delegates to updated lifecycle functions
```

**Rollback scope per operation:**

| Operation | Rollback if step N fails |
|-----------|--------------------------|
| openWorkspace | kill integration sessions created so far via cleanup(), undo port allocation |
| cleanWorkspace | no rollback (destructive by intent), but log partial state |
| mergeWorkspace | abort git merge if started, re-open worktrees on failure |

**New file:** `src/lib/operation-runner.ts` — new module

**Modified files:** `src/lib/workspace-lifecycle.ts` — refactor internal step composition to use operation runner

**Operation log path (optional):** `~/.config/git-stacks/ops/{workspace}.jsonl` parallel to `messages/`

---

### 3. Indexed Config Store

**Current state:** `config.ts` has `findWorkspaceFile()` and `findTemplateFile()` that scan all `.yml` files in the directory on every lookup. `readWorkspace(name)` is O(n) filesystem reads. `listWorkspaces()` reads and parses every file every call.

**Proposed module:** `src/lib/config-index.ts`

**Strategy:** Keep YAML files as source of truth (human-editable). Add an in-process cache layer populated lazily on first access and invalidated on write. File-modification-time (`mtime`) comparison handles external edits.

```typescript
// In-memory index built from YAML directory scans
type IndexEntry<T> = { filePath: string; mtime: number; data: T }

type ConfigIndex = {
  workspaces: Map<string, IndexEntry<Workspace>>
  templates:  Map<string, IndexEntry<Template>>
}

// Drop-in cached equivalents — same return types as config.ts functions
export function readWorkspaceCached(name: string): Workspace | null
export function listWorkspacesCached(): Workspace[]
export function invalidateWorkspace(name: string): void   // Called by writeWorkspace()
```

**Integration points:**

`config.ts` `writeWorkspace()` and `writeTemplate()` call `invalidateWorkspace()`/`invalidateTemplate()` from the index module after writing. No callers need to change — the cache is internal to config.ts.

The TUI dashboard calls `listWorkspaces()` and `listTemplates()` in reactive SolidJS accessors. These benefit most from caching because the dashboard polls on keypress events.

**Alternative considered:** SQLite index file at `~/.config/git-stacks/index.db`. Rejected for this milestone: adds a binary dependency and complicates the human-editable config story. YAML-with-mtime-cache is lower risk and reversible.

**New file:** `src/lib/config-index.ts` — new module
**Modified file:** `src/lib/config.ts` — `writeWorkspace()` and `writeTemplate()` call invalidation; `listWorkspaces()` and `readWorkspace()` delegate to cache

---

### 4. Integration Plugin Capability Contracts

**Current state:** The `Integration` interface (`src/lib/integrations/types.ts`) is already solid — id, label, order, isEnabled(), applies(), generate(), open(), cleanup(), commands(), configExample, windowDetector. The runner orchestrates correctly.

**Gaps identified from `PROJECT-DIRECTION.md`:**

1. **Capability declaration:** Plugins do not declare what they require (e.g. "needs tmux binary", "only macOS", "requires forge CLI"). Doctor checks are ad-hoc per plugin rather than driven by declared capabilities.

2. **Isolated failure handling:** `runIntegrationCleanup()` already catches and logs, but `runIntegrations()` propagates throws from `open()`. A plugin crash stops the entire integration chain.

3. **Third-party plugin path:** No external plugin registration mechanism. This milestone can lay the contract foundation without implementing dynamic loading.

**Proposed additions to `Integration` interface:**

```typescript
// Add to src/lib/integrations/types.ts

export type Capability =
  | { kind: "binary"; name: string; hint: string }
  | { kind: "platform"; os: "darwin" | "linux" | "win32" }
  | { kind: "forge"; type: "github" | "gitlab" | "gitea" }

// On the Integration interface:
capabilities?: Capability[]       // Declared requirements — checked by doctor
isolatedFailure?: boolean         // If true, open() failure is non-fatal
```

**Runner changes (`runner.ts`):**

```typescript
// Wrap open() for isolated plugins
const artifact = await (async () => {
  try {
    return await integration.open(ctx, artifactPath, bag)
  } catch (err) {
    if (integration.isolatedFailure) {
      console.warn(`[${integration.id}] open failed (non-fatal): ${err}`)
      return null
    }
    throw err
  }
})()
```

**Doctor integration:** A new `checkCapabilities(integration)` helper in `doctor.ts` reads `integration.capabilities` and runs binary/platform/forge checks — replacing current per-plugin ad-hoc checks scattered across individual plugin files.

**Modified files:**
- `src/lib/integrations/types.ts` — add `Capability` type and new fields on `Integration`
- `src/lib/integrations/runner.ts` — isolated failure handling in `runIntegrations()`
- `src/commands/doctor.ts` — capability-driven checks
- Individual plugin files (10 plugins) — add `capabilities` and `isolatedFailure` declarations

**No new module needed.** Interface extensions and runner behavior changes only.

---

### 5. Broader DI and Structured Logging

**Current state:** `src/lib/observability.ts` uses logtape with `timeOperation()` wrapper. DI for subprocess execution uses the `_exec` mutable object pattern (one per module). Structured logging produces only timing/debug lines.

**DI status by module:**

| Module | Has `_exec` injectable | Test coverage via mock |
|--------|----------------------|----------------------|
| `workspace-yaml.ts` | Yes (`spawnEditor`) | Yes |
| All 10 integration plugins | Yes (`_exec` per plugin) | Yes |
| `git.ts` | No (uses `$` shell directly) | Tests use real git in tmp dirs |
| `lifecycle.ts` | No (`runHooks` calls `Bun.spawn` directly) | Mock via `mock.module()` |
| `workspace-lifecycle.ts` | No | Relies on git.ts mocks |

**Gaps to close:**

- `lifecycle.ts` (`runHooks`) uses `Bun.spawn` with no injectable seam. Adding `_exec.spawn` here allows lifecycle unit tests to avoid `mock.module()` entirely.
- `observability.ts` logs timing but not structured operation context (which workspace, which step). Adding optional key-value context to `logDebug` enables richer tracing without breaking callers.

**Proposed additions:**

```typescript
// src/lib/lifecycle.ts — add injectable seam
export const _exec = {
  spawn: (cmd: string[], opts: SpawnOptions) => Bun.spawn(cmd, opts)
}
```

```typescript
// src/lib/observability.ts — extend logDebug for structured context
export function logDebug(
  category: string,
  detail: string,
  context?: Record<string, string | number | boolean>
): void
```

**No new modules.** Additions to two existing files.

---

## System Overview After v0.17.0

```
commands/ (CLI — unchanged structure)
    ↓
workspace-ops.ts (facade — unchanged surface)
    ↓
workspace-lifecycle.ts  (modified: uses operation-runner.ts internally)
workspace-env.ts        workspace-status.ts
workspace-git.ts        workspace-yaml.ts

lib/
  operation-runner.ts  ← NEW: step sequencing + rollback
  config-index.ts      ← NEW: in-memory YAML cache with mtime invalidation
  config.ts            (modified: delegates reads to config-index, calls invalidation on writes)
  observability.ts     (modified: optional context param on logDebug)
  lifecycle.ts         (modified: injectable _exec.spawn seam)

integrations/
  types.ts             (modified: Capability type + capabilities/isolatedFailure fields)
  runner.ts            (modified: isolated failure handling)
  *.ts (10 plugins)    (modified: add capabilities/isolatedFailure declarations)

commands/
  label.ts             (modified: add template label subcommands)
  doctor.ts            (modified: capability-driven checks)

tui/
  workspace-clone.ts   (modified: propagate labels from source workspace)
```

---

## Component Responsibilities

| Component | Responsibility | Changes in v0.17.0 |
|-----------|---------------|-------------------|
| `operation-runner.ts` | Step sequencing, rollback orchestration, op log | NEW |
| `config-index.ts` | In-memory YAML cache, mtime-based invalidation | NEW |
| `workspace-lifecycle.ts` | Business logic for open/clean/close/merge/remove | Modified: delegates step composition to operation-runner |
| `config.ts` | Zod schemas, atomic YAML reads/writes | Modified: write functions call invalidation |
| `integrations/types.ts` | Plugin contracts (Integration interface) | Modified: Capability type added |
| `integrations/runner.ts` | Orchestration across 10 plugins | Modified: isolated failure handling |
| `observability.ts` | Structured debug logging and timing | Modified: context parameter on logDebug |
| `lifecycle.ts` | Hook execution (runHooks/runHooksCaptured) | Modified: injectable _exec.spawn |

---

## Data Flow Changes

### Workspace Open (current)

```
openWorkspace(name)
    → allocatePorts()
    → buildWorkspaceEnv()
    → runHooks(pre_open)
    → createWorktree() per repo
    → runIntegrations()
    → runHooks(post_open)
    → return { ok }
```

### Workspace Open (after operation-runner)

```
openWorkspace(name)
    → runOperation("open", [
        { name: "allocate-ports",    run: allocatePorts,   rollback: releasePorts },
        { name: "resolve-env",       run: buildWorkspaceEnv, rollback: noop },
        { name: "pre-open-hooks",    run: runPreOpenHooks, rollback: noop },
        { name: "create-worktrees",  run: createWorktrees, rollback: removeCreatedWorktrees },
        { name: "run-integrations",  run: runIntegrations, rollback: runIntegrationCleanup },
        { name: "post-open-hooks",   run: runPostOpenHooks, rollback: noop },
      ], onProgress)
    → OperationResult
```

Callers (`workspace.ts`, TUI dashboard) receive the same `{ ok: boolean; error?: string }` shape — the facade signature is unchanged.

### Config Read (after config-index)

```
readWorkspace(name)              listWorkspaces()
    → config-index.ts                → config-index.ts
    → stat() each file for mtime     → stat() scan (no full parse)
    → parse only stale entries        → return cached Map values
    → return cached entry
```

---

## Build Order (Dependency-Aware)

| Step | Feature | Depends On | Risk |
|------|---------|-----------|------|
| 1 | Template label CLI (`label add/remove/list/clear <template>`) | Schema already supports it | Low |
| 2 | Clone label propagation | Step 1 for consistency | Low |
| 3 | `_exec.spawn` in `lifecycle.ts` | None | Low |
| 4 | `logDebug` context parameter in `observability.ts` | None | Low |
| 5 | `Capability` type + `capabilities`/`isolatedFailure` on `Integration` | None | Low |
| 6 | Isolated failure handling in `runner.ts` | Step 5 | Low |
| 7 | Plugin `capabilities` declarations (all 10 plugins) | Step 5 | Medium (touches 10 files) |
| 8 | Doctor capability-driven checks | Step 7 | Medium |
| 9 | `config-index.ts` module | None | Medium |
| 10 | Wire index into `config.ts` | Step 9, tests passing | Medium |
| 11 | `operation-runner.ts` module | None | Medium |
| 12 | Wire operation-runner into `workspace-lifecycle.ts` | Step 11 | High (core logic change) |

Steps 1-4 are pure additions with no cross-dependencies. Steps 5-8 are interface additions with low blast radius. Steps 9-10 and 11-12 are higher-risk pairs — each should ship as a separate phase with regression tests before moving on.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Operation Runner as God Object

**What people do:** Pass the full `Workspace`, `GlobalConfig`, `tasksDir`, and every helper function into the runner core.

**Why it's wrong:** The runner's job is step sequencing and rollback bookkeeping. Domain knowledge (what to rollback for a worktree) belongs in the step definitions, not the runner.

**Do this instead:** Steps are closures. Each step captures its own context. The runner only knows `{ name, run, rollback }`.

---

### Anti-Pattern 2: Config Index as Write-Through Cache

**What people do:** Write to the index first, then flush to disk asynchronously.

**Why it's wrong:** git-stacks writes YAML atomically (tmp+fsync+rename) to avoid corruption. Async flush breaks that guarantee. If the process dies between index write and YAML flush, the index diverges from disk.

**Do this instead:** Write to YAML first (atomic, as today). Then invalidate the index entry. The next read re-parses from disk. The cache is read-only.

---

### Anti-Pattern 3: Capability Checks Inside Plugin `open()`

**What people do:** `if (!which("tmux")) return null` inside the plugin's open() method.

**Why it's wrong:** Doctor cannot report missing capabilities until the user actually tries to open a workspace. Errors surface at the wrong time with no guidance.

**Do this instead:** Declare capabilities on the plugin. Doctor checks them upfront on `git-stacks doctor`. `open()` can assume capabilities are met.

---

### Anti-Pattern 4: Rollbacks Bypassing the `_exec` Injectable Pattern

**What people do:** Rollback closures call real side effects directly with production imports rather than through the injectable `_exec` object.

**Why it's wrong:** Rollback steps become impossible to test in isolation without real filesystem/git state.

**Do this instead:** Rollback closures capture the same `_exec` object the forward step used. They are testable by the same mock substitution as the forward step.

---

## Integration Points Summary

| Boundary | Direction | Notes |
|----------|-----------|-------|
| `operation-runner.ts` ← `workspace-lifecycle.ts` | lifecycle calls runner | Runner is a pure utility with no domain imports |
| `config-index.ts` ← `config.ts` | config.ts delegates | Index has no knowledge of Zod schemas; config.ts owns parsing |
| `integrations/types.ts` ← all 10 plugins | plugins implement interface | Additive — existing plugins need capabilities and isolatedFailure added |
| `integrations/runner.ts` uses `isolatedFailure` | runner reads plugin property | No new dependency; runner already imports Integration interface |
| `doctor.ts` ← `integrations/types.ts` | doctor reads `capabilities` | Reduces ad-hoc binary checks to a loop over declared capabilities |
| `label.ts` ← `config.ts` | label command reads/writes templates | `readTemplate()`/`writeTemplate()` already exist; label command needs template-path variant |
| `workspace-clone.ts` ← `config.ts` | clone reads source labels | `source.labels` is already present in parsed Workspace; one-line addition |

---

## Sources

- `/home/nnex/dev/prj/git-stacks/src/lib/config.ts` — Zod schemas and scan-based I/O (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/types.ts` — Integration interface (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/runner.ts` — orchestration logic (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-lifecycle.ts` — lifecycle step composition (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/observability.ts` — logtape wrapper (direct read)
- `/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts` — existing label propagation at lines 390-391 (direct read)
- `/home/nnex/dev/prj/git-stacks/src/commands/label.ts` — current workspace-only label commands (direct read)
- `/home/nnex/dev/prj/git-stacks/PROJECT-DIRECTION.md` — author architectural intent (direct read)
- `/home/nnex/dev/prj/git-stacks/.planning/PROJECT.md` — v0.17.0 milestone requirements (direct read)

---

*Architecture research for: git-stacks v0.17.0 Engine Hardening & Template Labels*
*Researched: 2026-04-05*
