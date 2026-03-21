# Architecture Research

**Domain:** Integration orchestration pipeline with artifact passing and niri compositor integration — v0.6.0 milestone
**Researched:** 2026-03-21
**Confidence:** HIGH for integration interface changes (verified against live source); HIGH for niri API (verified against running niri binary); HIGH for consolidation approach (verified all 4 loop sites)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Call Sites (4 today → 1 after consolidation)                                │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │workspace-ops  │  │ workspace-wizard  │  │ workspace-clone  │              │
│  │ openWorkspace │  │  (generate only)  │  │  (generate only) │              │
│  └───────┬───────┘  └────────┬─────────┘  └────────┬─────────┘              │
│          │                   │                      │                         │
│          │         ┌─────────┘──────────────────────┘                        │
│          │         │  App.tsx (generate only — TUI create path)               │
│          │         └────────────────────────────────────────────────────┐     │
│          │                                                               │     │
│          ▼                                                               ▼     │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │  src/lib/integrations/runner.ts  (NEW — consolidated loop)            │   │
│  │                                                                        │   │
│  │  runIntegrationGenerate(ctx, integrations[]) → ArtifactBag            │   │
│  │  runIntegrationOpen(ctx, bag, integrations[]) → void                  │   │
│  └──────────┬────────────────────────────────────────────────────────────┘   │
│             │ calls in order                                                   │
│  ┌──────────▼────────────────────────────────────────────────────────────┐   │
│  │  Integration plugins (each reads from ArtifactBag, writes to it)      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │  vscode  │  │ intellij │  │   cmux   │  │   tmux   │              │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │   │
│  │                                           ┌──────────────┐             │   │
│  │                                           │    niri      │ ← runs last  │   │
│  │                                           │  (NEW file)  │             │   │
│  │                                           └──────────────┘             │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  External tools invoked by open()                                             │
│  niri msg -j windows (snapshot-diff)   tmux list-clients   code-insiders     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `src/lib/integrations/types.ts` | Integration interface, ArtifactBag type, IntegrationContext | Modify — add `ArtifactBag`, change `open()` signature |
| `src/lib/integrations/runner.ts` | Consolidated generate+open loop, shared bag threading | New file |
| `src/lib/integrations/index.ts` | Integration registry array | Modify — register niri last |
| `src/lib/integrations/vscode.ts` | Generate `.code-workspace`, open code binary, return window id | Modify — return artifact |
| `src/lib/integrations/tmux.ts` | Open/focus tmux session, return session name | Modify — return artifact |
| `src/lib/integrations/cmux.ts` | Open/focus cmux workspace, return workspace ref | Modify — return artifact |
| `src/lib/integrations/intellij.ts` | Open IntelliJ, return artifact | Modify — return artifact |
| `src/lib/integrations/niri.ts` | Create niri workspace, spawn terminal into tmux, arrange windows | New file |
| `src/lib/workspace-ops.ts` (openWorkspace) | Call runner instead of inline loop | Modify — ~8 lines |
| `src/tui/workspace-wizard.ts` | Call runner for generate phase | Modify — ~8 lines |
| `src/tui/workspace-clone.ts` | Call runner for generate phase | Modify — ~8 lines |
| `src/tui/dashboard/App.tsx` | Call runner for generate phase | Modify — ~8 lines |

---

## Artifact Type Design

### ArtifactBag Shape

```typescript
// src/lib/integrations/types.ts (additions)

export interface TmuxArtifact {
  type: "tmux"
  sessionName: string
}

export interface CmuxArtifact {
  type: "cmux"
  workspaceRef: string
}

export interface VscodeArtifact {
  type: "vscode"
  pid: number | null          // process pid returned from spawn, if available
  windowId: number | null     // niri window id, populated via snapshot-diff if niri present
}

export interface IntellijArtifact {
  type: "intellij"
  pid: number | null
  windowId: number | null
}

export type IntegrationArtifact =
  | TmuxArtifact
  | CmuxArtifact
  | VscodeArtifact
  | IntellijArtifact

/**
 * Shared bag accumulating artifacts from all preceding integrations.
 * Passed read-write through the open() pipeline.
 * Keyed by integration id for O(1) lookup.
 */
export type ArtifactBag = Partial<{
  tmux: TmuxArtifact
  cmux: CmuxArtifact
  vscode: VscodeArtifact
  intellij: IntellijArtifact
}>
```

### Updated Integration Interface

The key change: `open()` receives `bag` (read access to prior artifacts) and returns `IntegrationArtifact | null` (its contribution).

```typescript
export interface Integration {
  id: string
  label: string
  hint: string
  enabledByDefault: boolean

  applies?(workspace: Workspace): boolean
  isEnabled(ctx: IntegrationContext): boolean
  configurePrompt(current: Record<string, unknown>): Promise<Record<string, unknown> | null>

  /**
   * Write artifact files to disk. Returns artifact path or null.
   * Unchanged from current interface.
   */
  generate?(ctx: IntegrationContext): string | null

  /**
   * Launch / activate the integration.
   * Receives ArtifactBag from preceding integrations (read-only for non-niri).
   * Returns this integration's artifact contribution, or null.
   *
   * Backward compat: existing integrations that don't use bag can ignore it.
   * Existing integrations that return void are updated to return null.
   */
  open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>
}
```

The `bag` parameter is the third argument. Existing integrations pass `_bag` and return `null` — a mechanical update with no logic change.

---

## Consolidated Runner

### Why Consolidate

Four separate inline loops exist today:

1. `workspace-ops.ts:openWorkspace` lines 573-579 — runs generate + open
2. `workspace-wizard.ts` lines 458-464 — runs generate only (no open)
3. `workspace-clone.ts` lines 165-171 — runs generate only (no open)
4. `App.tsx` lines 790-793 — runs generate only (no open)

Each duplication is a maintenance vector: if filtering logic (applies/isEnabled) changes, all 4 sites must change. The consolidation should live in a new `runner.ts` file, not in `workspace-ops.ts`, because the generate-only callers live in TUI code that should not depend on workspace-ops.

### runner.ts Design

```typescript
// src/lib/integrations/runner.ts

import type { Integration, IntegrationContext, ArtifactBag, IntegrationArtifact } from "./types"

/**
 * Run the generate phase for all applicable integrations.
 * Returns a map of integration id → artifact path (for callers that log artifact paths).
 * Used by: workspace-wizard, workspace-clone, App.tsx (create flow)
 */
export function runIntegrationGenerate(
  ctx: IntegrationContext,
  integrationList: Integration[] = integrations
): Map<string, string | null> {
  const paths = new Map<string, string | null>()
  for (const integration of integrationList) {
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    const path = integration.generate?.(ctx) ?? null
    paths.set(integration.id, path)
  }
  return paths
}

/**
 * Run generate + open phases with artifact threading.
 * Returns the final ArtifactBag after all integrations have run.
 * Used by: openWorkspace (the only caller that runs open())
 */
export async function runIntegrations(
  ctx: IntegrationContext,
  skip: Set<string> = new Set(),
  integrationList: Integration[] = integrations
): Promise<ArtifactBag> {
  const bag: ArtifactBag = {}
  for (const integration of integrationList) {
    if (skip.has(integration.id)) continue
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    const artifactPath = integration.generate?.(ctx) ?? null
    const artifact = await integration.open(ctx, artifactPath, bag)
    if (artifact) {
      // TypeScript-safe bag mutation — discriminated union ensures correct key
      (bag as Record<string, IntegrationArtifact>)[integration.id] = artifact
    }
  }
  return bag
}
```

The generate-only callers replace their loops with `runIntegrationGenerate(ctx)`. The `openWorkspace` caller replaces its loop with `runIntegrations(ctx, skip)`.

---

## Niri Integration Design

### Window Identification: Snapshot-Diff Strategy

Niri has no "spawn this command and return me the resulting window id" API. The approach:

1. Take `before` snapshot: `niri msg -j windows` → array of `{ id, app_id, title, workspace_id, pid }`
2. Spawn the terminal command (e.g. `ghostty -e tmux attach-session -t {name}`)
3. Poll `niri msg -j windows` until new window appears (up to 5s, 100ms intervals)
4. The new window is the diff: id present in `after` but not in `before`
5. Return that window id as the artifact

```typescript
// Verified niri window JSON shape (from live niri on this machine):
// { id: number, title: string, app_id: string, pid: number, workspace_id: number,
//   is_focused: boolean, is_floating: boolean, is_urgent: boolean,
//   layout: { ... }, focus_timestamp: { secs, nanos } }
```

### Niri Workspace: Named Workspaces

`niri msg action focus-workspace <REFERENCE>` accepts a workspace name. Niri workspaces can have names. The approach:

1. Before spawning windows: `niri msg action focus-workspace -- {workspaceName}` creates/focuses named workspace
2. All subsequent spawns land on that workspace (niri places new windows on focused workspace)
3. After all windows are spawned: `niri msg action focus-workspace -- {workspaceName}` re-focuses

Niri does not have a "create named workspace" command — it creates the workspace on focus if it doesn't exist. Naming is done via niri config (`workspace` block in config.kdl) or the workspace automatically gets a name when focused by name.

**Confirmed from live `niri msg -j workspaces`:** workspace `name` field is `null` for unnamed workspaces. A named workspace set via `niri msg action focus-workspace my-name` will create workspace with that name.

### Terminal Spawning for tmux

Niri does not directly attach to tmux sessions. The niri integration spawns a terminal (configurable, default: `ghostty`) with a command to attach to the tmux session:

```
niri msg action spawn -- ghostty -e tmux attach-session -t {sessionName}
```

This requires tmux to have already run. Since tmux runs before niri (ordering enforced by position in integration array), `bag.tmux?.sessionName` is available.

If tmux is not in the bag (not enabled), niri spawns a plain terminal in the workspace directory instead.

### Window-to-Workspace Movement

After all terminals/IDEs are spawned by preceding integrations, niri needs to move those windows to the git-stacks workspace. The challenge: vscode/intellij spawn their own windows without going through `niri msg action spawn` (they use `Bun.$`), so their windows appear on whatever workspace is currently focused.

Strategy: niri runs last and uses `--window-id` on `move-window-to-workspace`:

```
niri msg action move-window-to-workspace --window-id {id} {workspaceName}
```

This is why window IDs from preceding integrations are critical. If vscode puts its PID in the artifact, niri can match `windows[].pid === artifact.pid` to find the window id, then move it.

**Confirmed from live niri:** `niri msg action move-window-to-workspace --window-id <WINDOW_ID> <REFERENCE>` is a real command with exactly this syntax.

### Niri Integration Config Schema

```typescript
const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  terminal: z.string().default("ghostty"),     // terminal binary to spawn
  terminal_flags: z.string().default(""),      // extra flags passed before -e
  workspace_name_prefix: z.string().default("gs-"),  // prefix for niri workspace name
  arrange_windows: z.boolean().default(true),  // move preceding integration windows
})
```

The niri workspace name is `{prefix}{workspaceName}`. Default: `gs-my-feature`.

### Niri open() Implementation Flow

```
niri.open(ctx, _artifactPath, bag):
  1. Resolve config (terminal, prefix, arrange_windows)
  2. niriWorkspaceName = prefix + ctx.workspace.name
  3. niri msg action focus-workspace -- niriWorkspaceName
     (creates workspace if not exists, switches to it)
  4. If bag.tmux exists:
       sessionName = bag.tmux.sessionName
       Snapshot before = niri msg -j windows
       niri msg action spawn -- {terminal} -e tmux attach-session -t {sessionName}
       Poll until new window appears (up to 5s)
       terminalWindowId = diff(before, after)[0].id
     Else:
       Snapshot before = niri msg -j windows
       niri msg action spawn -- {terminal} -- sh -c "cd {tasksDir}/{name} && {terminal}"
       Poll until new window appears
       terminalWindowId = diff(before, after)[0].id
  5. If arrange_windows:
       For each window_id in [bag.vscode?.windowId, bag.intellij?.windowId] (non-null):
         niri msg action move-window-to-workspace --window-id {id} -- niriWorkspaceName
  6. niri msg action focus-workspace -- niriWorkspaceName
  7. Return { type: "niri", workspaceName: niriWorkspaceName, windowIds: [...] }
```

### Populating windowId in vscode/intellij Artifacts

VSCode: `code-insiders path` spawns asynchronously and returns before the window exists. To get the window id:
- Snapshot before, run the command, snapshot-diff after. Same pattern as terminal.
- Store the result in `VscodeArtifact.windowId`. If niri is not running (check: `WAYLAND_DISPLAY` + `niri msg -j workspaces` succeeds), skip the snapshot.

IntelliJ: Same approach. `intellij.sh` is fire-and-forget. Snapshot-diff works.

tmux: No window to track — tmux is a session, not a GUI window. The terminal spawned by niri to attach tmux is tracked by niri's snapshot. `TmuxArtifact` only needs `sessionName`.

The key insight: snapshot-diff is only needed when niri is in the integration list and enabled. The vscode/intellij integrations can skip the niri-specific window tracking if they don't know niri is enabled. Alternatively, they always track the window (cheap: one `niri msg` call) and store `null` if niri is not running.

Recommendation: always attempt window id capture in vscode/intellij if `WAYLAND_DISPLAY` is set. Store `null` on failure. This way vscode/intellij have no dependency on niri's enabled state.

---

## Data Flow

### openWorkspace with Artifacts

```
git-stacks open my-feature
  → openWorkspace("my-feature", opts)
  → ctx = { workspace, tasksDir, config }
  → runIntegrations(ctx, skip)
      bag = {}
      vscode.generate(ctx) → writes .code-workspace
      vscode.open(ctx, path, bag={}) → spawns code-insiders, snapshot-diff → window_id
        → returns VscodeArtifact { type: "vscode", pid, windowId }
        → bag.vscode = { ... }
      tmux.open(ctx, null, bag={vscode}) → opens session "my-feature"
        → returns TmuxArtifact { type: "tmux", sessionName: "my-feature" }
        → bag.tmux = { ... }
      niri.open(ctx, null, bag={vscode, tmux})
        → focus-workspace gs-my-feature
        → spawn ghostty -e tmux attach-session -t my-feature
        → move-window-to-workspace --window-id {vscode.windowId} gs-my-feature
        → returns NiriArtifact { type: "niri", workspaceName: "gs-my-feature", windowIds: [...] }
  → post_open hooks
  → update last_opened
```

### Generate-Only Flow (workspace create)

```
workspace-wizard.ts creates new workspace
  → runIntegrationGenerate(ctx)
      for each integration: check enabled + applies, call generate?()
      returns Map<id, artifactPath>
  → log artifact paths (p.log.success)
  → no open() called — open() happens later on `git-stacks open`
```

---

## Integration Ordering

Order is determined by position in the `integrations` array in `index.ts`. No dynamic reordering. Niri must be last.

```typescript
// src/lib/integrations/index.ts
export const integrations = [
  vscodeIntegration,    // 1. generate + open: writes .code-workspace, spawns IDE
  intellijIntegration,  // 2. generate + open: writes .idea/, spawns IDE
  cmuxIntegration,      // 3. no generate, open: creates cmux workspace
  tmuxIntegration,      // 4. no generate, open: creates tmux session → produces TmuxArtifact
  niriIntegration,      // 5. no generate, open: creates niri workspace, spawns terminal, arranges
]
```

This ordering guarantees `bag.tmux` is populated when niri runs. If a user wants to run only niri + vscode (no tmux), niri spawns a plain terminal instead (gracefully degraded from tmux-attach to plain terminal).

Configurable ordering is explicitly out of scope for v0.6.0 per the milestone — it can be addressed later by adding an `order: number` field to each integration's global config.

---

## Architectural Patterns

### Pattern 1: Bag Threading Through Sequential Integration Loop

**What:** The runner passes a single mutable `ArtifactBag` object through all integrations in order. Each integration reads artifacts from preceding ones (via `bag.tmux`, `bag.vscode`, etc.) and writes its own artifact back. The bag starts empty and grows.

**When to use:** Any time a later integration needs to act on the output of an earlier one (niri needs tmux session name, niri needs vscode window id).

**Trade-offs:** Simple and explicit. No publish/subscribe. No async coordination — integrations run sequentially, so bag is always populated before the next integration reads from it. Sequential is correct here because each integration may need to wait for its predecessor's window to appear before the next one starts. Parallelism would require complex synchronization with no benefit.

**Example:**
```typescript
// niri.ts reads from bag
async open(ctx, _artifactPath, bag) {
  const sessionName = bag.tmux?.sessionName  // undefined if tmux not enabled
  if (sessionName) {
    await $`niri msg action spawn -- ${terminal} -e tmux attach-session -t ${sessionName}`
  } else {
    await $`niri msg action spawn -- ${terminal}`
  }
}
```

### Pattern 2: Snapshot-Diff for Window Identification

**What:** Take a `niri msg -j windows` snapshot before spawning a window, then poll after spawn until a new window id appears in the diff.

**When to use:** Any time a window must be identified after a fire-and-forget spawn command (vscode, intellij, terminal). Used by: niri.open(), and optionally by vscode.open()/intellij.open() for pre-populating windowId.

**Trade-offs:** Polling is slightly fragile (window may take >5s on slow systems). Prefer 100ms intervals with a 5s ceiling. The diff approach is correct because window ids are monotonically increasing integers in niri — the new window will have a higher id than any pre-existing window.

**Example:**
```typescript
async function spawnAndFindWindow(command: string[]): Promise<number | null> {
  const before = await getNiriWindowIds()
  await $`niri msg action spawn -- ${command}`.quiet().nothrow()
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100)
    const after = await getNiriWindowIds()
    const newIds = after.filter(id => !before.includes(id))
    if (newIds.length > 0) return newIds[0]
  }
  return null
}

async function getNiriWindowIds(): Promise<number[]> {
  const result = await $`niri msg -j windows`.quiet().nothrow()
  if (result.exitCode !== 0) return []
  const windows = JSON.parse(result.stdout.toString()) as Array<{ id: number }>
  return windows.map(w => w.id)
}
```

### Pattern 3: Runner Accepts Optional Integration List (Testability)

**What:** Both `runIntegrationGenerate` and `runIntegrations` accept an optional `integrationList` parameter that defaults to the full `integrations` array. Tests pass a controlled subset.

**When to use:** Everywhere that integration loops are called. Avoids global state coupling in tests.

**Trade-offs:** Slightly more verbose call site in tests. Benefit: tests can pass `[mockIntegration]` without mocking the module. Production call sites pass nothing (default to full list).

---

## Anti-Patterns

### Anti-Pattern 1: Integrations Reading Other Integrations' Config Directly

**What people do:** `niri.open()` reads `ctx.workspace.settings.integrations.tmux` to find the session name.

**Why it's wrong:** Tight coupling between integration implementations. If tmux config schema changes, niri breaks. Also, the computed session name (after normalization) differs from the raw config value.

**Do this instead:** Consume from the bag. `bag.tmux.sessionName` is the computed, normalized session name that the tmux integration actually used.

### Anti-Pattern 2: Open() Returning Void for All Integrations

**What people do:** Keep `open()` returning `Promise<void>` for existing integrations, only adding return values to new integrations.

**Why it's wrong:** The type system then cannot enforce that niri's bag consumption is safe. ArtifactBag entries will be `any` or require casts.

**Do this instead:** Update all `open()` signatures to `Promise<IntegrationArtifact | null>` at once. The update is mechanical: add `return null` to the end of each existing `open()`. The type change enables the compiler to enforce correctness on niri's bag reads.

### Anti-Pattern 3: Global Mutable Bag Object Shared Across Calls

**What people do:** Create `const globalBag: ArtifactBag = {}` at module scope, reuse across `openWorkspace` calls.

**Why it's wrong:** Stale artifacts from a previous workspace open would bleed into the next call. This is a correctness bug in long-running processes (TUI, daemon mode).

**Do this instead:** Create a fresh `const bag: ArtifactBag = {}` inside `runIntegrations()` each invocation.

### Anti-Pattern 4: Niri Polling Without Timeout

**What people do:** `while (true) { await poll(); if (found) break }`.

**Why it's wrong:** If the spawned application crashes immediately, the loop runs forever.

**Do this instead:** Fixed iteration count with sleep — `for (let i = 0; i < 50; i++) { await Bun.sleep(100); ... }` gives a 5-second ceiling. Return `null` on timeout. Niri integration must gracefully handle `null` window ids.

### Anti-Pattern 5: Duplicating the Integration Loop at New Call Sites

**What people do:** Add a 5th inline integration loop for a new workflow (e.g., `git-stacks clone`).

**Why it's wrong:** Defeats the consolidation effort. Each inline loop must independently handle filtering, bag threading, and skip logic.

**Do this instead:** Call `runIntegrationGenerate(ctx)` or `runIntegrations(ctx, skip)` from `runner.ts`.

---

## Integration Points

### New vs Modified Components

| Component | Action | Scope |
|-----------|--------|-------|
| `src/lib/integrations/types.ts` | Modify | Add `ArtifactBag`, `IntegrationArtifact` types; change `open()` signature |
| `src/lib/integrations/runner.ts` | New | `runIntegrationGenerate`, `runIntegrations` |
| `src/lib/integrations/niri.ts` | New | Full niri integration plugin |
| `src/lib/integrations/index.ts` | Modify | Import + register `niriIntegration` last |
| `src/lib/integrations/vscode.ts` | Modify | Return `VscodeArtifact` from `open()` |
| `src/lib/integrations/tmux.ts` | Modify | Return `TmuxArtifact` from `open()` |
| `src/lib/integrations/cmux.ts` | Modify | Return `CmuxArtifact` from `open()` |
| `src/lib/integrations/intellij.ts` | Modify | Return `IntellijArtifact` from `open()` |
| `src/lib/workspace-ops.ts` | Modify | Replace inline loop with `runIntegrations(ctx, skip)` |
| `src/tui/workspace-wizard.ts` | Modify | Replace inline loop with `runIntegrationGenerate(ctx)` |
| `src/tui/workspace-clone.ts` | Modify | Replace inline loop with `runIntegrationGenerate(ctx)` |
| `src/tui/dashboard/App.tsx` | Modify | Replace inline loop with `runIntegrationGenerate(ctx)` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `runner.ts` ↔ integration plugins | Direct function calls, `ArtifactBag` passed by reference | Bag is mutated in-place in runner, not returned from plugin |
| `niri.ts` ↔ `bag.tmux` | Read `bag.tmux?.sessionName` | Optional — degrades gracefully if tmux not enabled |
| `niri.ts` ↔ `bag.vscode` / `bag.intellij` | Read `windowId` | Optional — skips window arrangement if null |
| `vscode.ts` ↔ niri CLI | `niri msg -j windows` snapshot-diff | Only executed when `WAYLAND_DISPLAY` set |
| `niri.ts` ↔ niri CLI | `niri msg action spawn`, `niri msg action focus-workspace`, `niri msg action move-window-to-workspace --window-id` | All via `Bun.$` shell |
| `workspace-ops.ts` ↔ `runner.ts` | Import and call `runIntegrations` | Replaces the 7-line inline loop at line 573 |

### Backward Compatibility

- Existing workspace YAML files: no schema change. Artifact data is not persisted (it's runtime-only).
- Existing integration configs: no change. `niri` integration adds a new key under `config.integrations.niri` only when the user runs `git-stacks config`.
- `open()` signature change: the `bag` parameter is new but integrations that ignore it require only adding `_bag: ArtifactBag` to the parameter list. Return type changes from `Promise<void>` to `Promise<IntegrationArtifact | null>`, requiring `return null` at the end. These are mechanical, non-breaking updates.
- Callers of `integration.open()` that exist outside `runner.ts` (none currently, but tests may mock it): must be updated to match new signature.

---

## Build Order

Dependencies flow bottom-up. Build in this order:

1. **`types.ts` changes** — `ArtifactBag`, `IntegrationArtifact` union, updated `open()` signature. Everything else depends on this. This is the only change that creates a TypeScript compile error cascade — address it first to unblock all other work.

2. **Mechanical `open()` return-type updates** — vscode, tmux, cmux, intellij each get `_bag: ArtifactBag` parameter and `return null`. No logic change. All 4 files, ~2 lines each. Restores compile green.

3. **`runner.ts`** — new file with `runIntegrationGenerate` and `runIntegrations`. Depends on updated types from step 1. Does not depend on any integration-specific logic.

4. **Replace inline loops** — workspace-ops, workspace-wizard, workspace-clone, App.tsx each replace their loop with runner calls. This is safe to do before niri exists because runner behavior is identical to the old loops for integrations that return null.

5. **tmux artifact population** — update `tmux.ts` `open()` to actually return `TmuxArtifact` with `sessionName`. This is the dependency for niri's terminal attach path.

6. **vscode/intellij window id** — update `vscode.ts` and `intellij.ts` to do snapshot-diff and populate `windowId`. This is the dependency for niri's window arrangement path. Can be deferred to after niri basics work (niri can skip arrangement for these if windowId is null).

7. **`niri.ts`** — new integration. Depends on steps 1-5. Reads `bag.tmux?.sessionName`. Builds the niri-workspace create, terminal spawn, and window arrange flows incrementally.

8. **`index.ts` registration** — add niriIntegration as the last entry. One line.

9. **Tests** — integration tests for runner (unit), niri snapshot-diff helper (unit, can mock niri CLI), and end-to-end open flow with bag threading.

---

## Niri API Reference (Verified on Live System)

All commands confirmed against running niri binary on this machine.

| Command | Purpose | Notes |
|---------|---------|-------|
| `niri msg -j windows` | List all windows as JSON | Returns `Array<{id,title,app_id,pid,workspace_id,...}>` |
| `niri msg -j workspaces` | List all workspaces | Returns `Array<{id,idx,name,output,is_active,...}>`. `name` is null for unnamed. |
| `niri msg action focus-workspace <name>` | Create+focus named workspace | Creates if not exists |
| `niri msg action spawn -- <cmd>` | Spawn process on focused workspace | Window appears on current workspace |
| `niri msg action move-window-to-workspace --window-id <id> <name>` | Move specific window to workspace | `--window-id` flag confirmed |

---

## Sources

- `src/lib/integrations/types.ts` — verified current Integration interface
- `src/lib/integrations/tmux.ts` — verified current tmux open() pattern
- `src/lib/integrations/cmux.ts` — verified current cmux open() + artifact ref pattern
- `src/lib/integrations/vscode.ts` — verified current vscode open() pattern
- `src/lib/integrations/index.ts` — verified current integration ordering
- `src/lib/workspace-ops.ts` lines 573-579 — verified inline loop location
- `src/tui/workspace-wizard.ts` lines 458-464 — verified generate-only loop
- `src/tui/workspace-clone.ts` lines 165-171 — verified generate-only loop
- `src/tui/dashboard/App.tsx` lines 790-793 — verified generate-only loop (TUI create path)
- `niri msg -j windows` — live output verified, JSON shape documented
- `niri msg -j workspaces` — live output verified, workspace name field confirmed as null for unnamed
- `niri msg action move-window-to-workspace --help` — `--window-id` flag confirmed
- `niri msg action spawn --help` — `-- <COMMAND>...` syntax confirmed
- `niri msg action focus-workspace --help` — REFERENCE arg confirmed

---
*Architecture research for: v0.6.0 integration orchestration, artifact passing, niri compositor integration*
*Researched: 2026-03-21*
