# Stack Research

**Domain:** Bun CLI tool — v0.6.0 additions (niri compositor integration + integration orchestration)
**Researched:** 2026-03-21
**Confidence:** HIGH (all niri commands verified against live `niri 25.11` installation; integration interface verified against installed source)

---

## Scope

This document covers **only the additions needed for v0.6.0**. The existing stack (Bun, TypeScript, Commander.js, `@opentui/solid`, SolidJS, YAML + Zod, `@clack/prompts`, OpenTUI test renderer) is unchanged and not re-researched.

Two questions answered:

1. What niri IPC commands are available, what do they return, and how do we use them for workspace management and window identification?
2. What interface changes are needed to the integration plugin system to support artifact passing and ordering?

---

## Finding 1: Niri IPC via `niri msg` — Fully Sufficient for Integration Needs

Niri 25.11 (installed) exposes all required compositor operations via `niri msg`. No Wayland protocol library, no socket-level IPC, and no Rust bindings are needed. The `niri msg` CLI is the correct interface.

All commands verified against the live compositor. HIGH confidence.

### The JSON Output Contract

Pass `-j` / `--json` to any query command to get machine-readable output. The `action` subcommand does not support `-j` (it has no return value to serialize).

**`niri msg -j workspaces`** — returns a JSON array:

```typescript
type NiriWorkspace = {
  id: number          // stable compositor-assigned ID (survives focus changes)
  idx: number         // 1-based display index on this output
  name: string | null // user-set name, null if unnamed
  output: string      // monitor name, e.g. "eDP-1"
  is_urgent: boolean
  is_active: boolean  // true if this workspace is visible on its output
  is_focused: boolean // true if this workspace has keyboard focus
  active_window_id: number | null
}
```

**`niri msg -j windows`** — returns a JSON array:

```typescript
type NiriWindow = {
  id: number          // stable window ID — persists until window is closed
  title: string | null
  app_id: string | null  // Wayland app_id, e.g. "com.mitchellh.ghostty", "google-chrome"
  pid: number | null  // PID of the process that owns the window surface
  workspace_id: number | null
  is_focused: boolean
  is_floating: boolean
  is_urgent: boolean
  layout: {
    pos_in_scrolling_layout: [number, number] | null
    tile_size: [number, number]
    window_size: [number, number]
    tile_pos_in_workspace_view: [number, number] | null
    window_offset_in_tile: [number, number]
  }
  focus_timestamp: { secs: number; nanos: number } | null
}
```

**`niri msg -j focused-window`** — same shape as a single `NiriWindow` entry.

**`niri msg -j focused-output`** — returns monitor info (not needed for this milestone).

### Key Action Commands

All verified via `niri msg action <cmd> --help`:

| Command | Signature | Notes |
|---------|-----------|-------|
| `focus-workspace` | `<REFERENCE>` | REFERENCE = index (number) or name (string) |
| `set-workspace-name` | `<NAME> [--workspace REFERENCE]` | Can name any workspace, not just focused |
| `move-window-to-workspace` | `<REFERENCE> [--window-id ID] [--focus true\|false]` | Can move by window ID without focusing first |
| `focus-window` | `--id <ID>` | Focus by stable window ID |
| `spawn` | `-- <COMMAND>...` | Spawns command; fire-and-forget (no return value) |
| `spawn-sh` | `-- <COMMAND>...` | Same as spawn but routes through shell |

**Critical capability**: `move-window-to-workspace --window-id <ID> --focus false` moves a specific window to a named workspace **without switching focus to that workspace**. This is the key primitive for the niri integration's "gather all spawned windows onto the workspace" step.

### Niri Workspace Model

- Named workspaces are created on-demand: `niri msg action focus-workspace my-name` creates a workspace named `my-name` if it does not exist.
- Workspace names are user-visible and persist in the compositor's workspace list.
- The `id` field is a stable compositor-assigned integer. The `name` field is null until explicitly set.
- `set-workspace-name` accepts `--workspace REFERENCE` to name any workspace by index or existing name — it does not require the workspace to be focused first.

### Event Stream (Available but Not Needed for v0.6.0)

`niri msg event-stream` streams compositor events as text lines (non-JSON in the live output; JSON events when the IPC socket is used directly). It emits `Window opened or changed: ...`, `Workspaces changed: ...`, etc. Useful for reactive window tracking but introduces a subprocess that must be managed. The snapshot-diff approach (below) avoids this complexity for v0.6.0.

---

## Finding 2: Window Identification Strategy — Snapshot-Diff via PID

The challenge: after a terminal emulator window is spawned, we need to find its niri window ID to move it to the workspace. Niri windows expose a `pid` field — the PID of the process that owns the Wayland surface.

**Recommended approach: Bun.spawn PID + poll `niri msg -j windows` by pid match.**

```
1. Before spawning: take snapshot of current window IDs (niri msg -j windows → Set<id>)
2. Spawn the terminal via Bun.spawn(), capture child.pid
3. Poll niri msg -j windows (up to ~3s, 200ms intervals)
4. Find window where window.pid === child.pid OR window.pid is in the process subtree of child.pid
5. Return window.id
```

Why PID match over snapshot-diff: snapshot-diff returns only "what's new" but cannot distinguish which new window belongs to which spawned process when multiple windows appear simultaneously. PID match is precise.

**PID subtree consideration**: when spawning `ghostty --working-directory /path`, the ghostty window's `pid` in niri equals the direct child PID. Verified by cross-referencing `/run/user/1000/systemd/transient/app-niri-ghostty-<PID>.scope` — niri uses the spawned process's PID directly in the scope name. Direct PID match is sufficient; no process tree traversal needed.

**Tmux client PID lookup**: tmux exposes `#{client_pid}` via `tmux list-clients -F "#{client_pid} #{session_name}"`. This returns the PID of the terminal emulator attached to the session. When the tmux artifact is `{ sessionName: string }`, the niri integration can run `tmux list-clients` to find the terminal PID and then match against niri windows.

---

## Finding 3: Integration Artifact System — Interface Changes Required

Currently `open()` returns `Promise<void>`. The new contract must return spawned window/session identifiers so downstream integrations (niri) can locate and arrange them.

### New `IntegrationArtifact` Type

```typescript
// src/lib/integrations/types.ts — add alongside existing exports

export type IntegrationArtifact =
  | { kind: "tmux-session"; sessionName: string }
  | { kind: "cmux-workspace"; ref: string }
  | { kind: "vscode-window"; pid: number }
  | { kind: "niri-workspace"; workspaceName: string; windowIds: number[] }
  | { kind: "process"; pid: number }
  | null

export interface IntegrationResult {
  artifact: IntegrationArtifact
}
```

### Updated `Integration` Interface

```typescript
// open() return type changes from Promise<void> to Promise<IntegrationArtifact>
open(ctx: IntegrationContext, artifactPath: string | null): Promise<IntegrationArtifact>
```

### Updated `IntegrationContext`

```typescript
export interface IntegrationContext {
  workspace: Workspace
  tasksDir: string
  config: GlobalConfig
  // Artifacts from integrations that ran before this one (in pipeline order)
  priorArtifacts: IntegrationArtifact[]
}
```

### Integration Ordering

The `integrations` array in `src/lib/integrations/index.ts` is already ordered. Explicit ordering is enforced by the array position — niri goes last. Configurable per-workspace ordering is a v0.7.0 concern; for v0.6.0, position in the array is sufficient.

The workspace-ops loop becomes:

```typescript
const priorArtifacts: IntegrationArtifact[] = []
for (const integration of integrations) {
  if (skip.has(integration.id)) continue
  if (!integration.isEnabled(ctx)) continue
  if (integration.applies && !integration.applies(workspace)) continue
  const artifactPath = integration.generate?.(ctx) ?? null
  const ctxWithArtifacts = { ...ctx, priorArtifacts }
  const artifact = await integration.open(ctxWithArtifacts, artifactPath)
  if (artifact !== null) priorArtifacts.push(artifact)
}
```

---

## Finding 4: Niri Integration Config Schema

The niri integration needs minimal config — whether it's enabled and the terminal command to spawn (defaulting to the user's `$TERM` or a configured terminal).

```typescript
const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  terminal: z.string().optional(), // e.g. "ghostty", "foot", "alacritty" — defaults to $TERM_PROGRAM or "foot"
})
```

The niri integration does not need a `panes` layout config — it arranges windows based on what prior integrations spawned (via `priorArtifacts`). Layout control is a v0.7.0 concern.

---

## Recommended Stack Additions

### No New npm Dependencies Required

| Need | Approach | Why No Library |
|------|----------|---------------|
| Niri IPC | `Bun.$\`niri msg -j ...\`` shell calls | `niri msg` is the correct API; socket-level IPC adds complexity with no benefit at this scale |
| JSON parsing | `JSON.parse()` + Zod validation | Already used throughout the codebase |
| PID-based window lookup | Bun `$` shell + `JSON.parse` | No library adds value over direct shell calls |
| Process spawning | `Bun.spawn()` (already used) | Returns `.pid` directly |
| Polling / retry | Simple `await sleep()` loop in `niri.ts` | Overkill for a 3s poll with 200ms intervals |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/niri.ts` | Shell wrappers for `niri msg` commands (mirrors `src/lib/tmux.ts` pattern) |
| `src/lib/integrations/niri.ts` | Niri integration plugin |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/integrations/types.ts` | Add `IntegrationArtifact`, `IntegrationResult`; update `open()` return type and `IntegrationContext` |
| `src/lib/integrations/index.ts` | Register `niriIntegration` last in the array |
| `src/lib/integrations/tmux.ts` | Return `{ kind: "tmux-session", sessionName }` from `open()` |
| `src/lib/integrations/cmux.ts` | Return `{ kind: "cmux-workspace", ref }` from `open()` |
| `src/lib/integrations/vscode.ts` | Return `{ kind: "process", pid }` from `open()` (or null if not launched) |
| `src/lib/integrations/intellij.ts` | Return `{ kind: "process", pid }` from `open()` (or null if not launched) |
| `src/lib/workspace-ops.ts` | Thread `priorArtifacts` through the integration loop |

---

## The `niri.ts` Shell Wrapper API (Mirrors `tmux.ts`)

```typescript
// src/lib/niri.ts

// Check if niri compositor is running (NIRI_SOCKET env var is set by niri)
export function isNiriRunning(): boolean

// List all current workspaces
export async function listNiriWorkspaces(): Promise<NiriWorkspace[]>

// List all current windows
export async function listNiriWindows(): Promise<NiriWindow[]>

// Focus or create a named workspace
export async function focusNiriWorkspace(name: string): Promise<void>

// Set the name of a workspace (by reference — name or index)
export async function setNiriWorkspaceName(name: string, workspace?: string | number): Promise<void>

// Move a specific window to a named workspace without following focus
export async function moveWindowToWorkspace(windowId: number, workspaceName: string, followFocus?: boolean): Promise<void>

// Spawn a command via niri (runs in compositor context)
export async function niriSpawn(command: string[]): Promise<void>

// Poll windows until a window with the given pid appears (timeout in ms, default 3000)
export async function waitForWindowByPid(pid: number, timeoutMs?: number): Promise<NiriWindow | null>

// Snapshot current window IDs (for snapshot-diff if needed)
export async function snapshotWindowIds(): Promise<Set<number>>
```

The implementation of each function follows the exact pattern of `tmux.ts`: `await $\`niri msg ...\`.quiet().nothrow()` and parse stdout.

---

## Installation

No new packages required.

```bash
# Verify nothing broken
bun install

# No new packages needed
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `niri-ipc` npm package (if one exists) | The niri IPC socket protocol is internal and subject to change. `niri msg` is the stable, versioned CLI interface. The compositor maintainers explicitly ship `niri msg` as the intended API surface. | `Bun.$\`niri msg ...\`` |
| `@wayland-protocols` / any Wayland library | Requires native bindings, incompatible with Bun's module resolution for most native addons; massively over-engineered for reading compositor state. | `niri msg -j` JSON parsing |
| `event-stream` subprocess for window tracking | Requires managing a long-lived subprocess, error recovery, and line parsing. The 3-second poll approach is simpler and sufficient since windows appear within 500ms in practice. | PID-match poll loop in `waitForWindowByPid` |
| Configurable integration ordering in YAML (v0.6.0) | Array position in `integrations` index is sufficient — niri must run last and that's the only ordering constraint. Per-workspace ordering is a v0.7.0 concern. | Hard-coded array order in `src/lib/integrations/index.ts` |
| `child_process.execSync` / Node `exec` | Project uses Bun `$` shell throughout. Mixing APIs creates inconsistency. | `Bun.$\`...\`` with `.quiet().nothrow()` |

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| niri | 25.11 (installed) | `move-window-to-workspace --window-id` verified as supported |
| `niri msg -j` | 25.11 | JSON output flag verified working on all query commands |
| Bun | 1.3.10 (project runtime) | `Bun.spawn()` returns `.pid`; `$` shell available |
| Zod | installed (project) | Schema validation for parsed niri JSON |

---

## Sources

- `niri msg --help`, `niri msg action --help` — full command list verified, HIGH confidence (live compositor 25.11)
- `niri msg -j workspaces` live output — workspace JSON schema verified, HIGH confidence (live output)
- `niri msg -j windows` live output — window JSON schema with `pid`, `app_id`, `id`, `workspace_id` fields verified, HIGH confidence (live output)
- `niri msg action move-window-to-workspace --help` — `--window-id` flag confirmed, HIGH confidence (live compositor)
- `niri msg action set-workspace-name --help` — `--workspace` flag confirmed, HIGH confidence (live compositor)
- `/run/user/1000/systemd/transient/app-niri-ghostty-<PID>.scope` — niri spawns via systemd transient scopes using the process PID, confirming PID match strategy, HIGH confidence (live filesystem)
- `src/lib/integrations/types.ts` (installed source) — current `Integration.open()` signature returns `Promise<void>`, HIGH confidence (installed source)
- `src/lib/integrations/tmux.ts` (installed source) — pattern for shell wrappers and `open()` implementation, HIGH confidence (installed source)
- `src/lib/workspace-ops.ts` (installed source) — integration loop structure confirmed, HIGH confidence (installed source)

---

*Stack research for: git-stacks v0.6.0 — niri compositor integration and integration orchestration*
*Researched: 2026-03-21*
