# Phase 19: niri-shell-wrappers - Research

**Researched:** 2026-03-22
**Domain:** niri Wayland compositor IPC, Bun shell wrappers, Zod validation, bun:test mock patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None declared in discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NIRI-06 | Window identification uses snapshot-diff of `niri msg -j windows` (before/after spawn) | `listNiriWindows()` + `snapshotWindowIds()` implement this; JSON fields confirmed from docs.rs |
| NIRI-07 | Window identification uses PID matching from artifact bag for windows spawned by other integrations | `listNiriWindows()` exposes `pid: Option<i32>` field; callers filter by pid |
| NIRI-10 | Niri shell wrappers isolated in `src/lib/niri.ts` with clean mock boundary for automated tests | `mock.module("@/lib/niri", ...)` pattern from artifacts.test.ts + runner.test.ts |
| TEST-01 | Niri shell wrappers have a mockable interface — automated tests never call real `niri msg` | Module-level export + mock.module cache-busting pattern; `NIRI_SOCKET` absent in test env |
</phase_requirements>

## Summary

Phase 19 creates `src/lib/niri.ts` — a self-contained module that wraps every `niri msg` IPC call the codebase will ever make. The module exposes a flat set of typed async functions. Phase 20 (niri-integration) imports these functions and mocks them entirely in its test suite using bun's `mock.module()` system, so no real niri process is ever invoked during CI.

The niri IPC protocol speaks via a Unix domain socket identified by `$NIRI_SOCKET`. The `niri msg` CLI is a thin wrapper: pass `--json` (or `-j`) for stable JSON output, or use the socket directly via a library. For git-stacks the CLI approach is correct — same pattern as git.ts and tmux.ts.

The niri JSON schema is versioned and stable (docs.rs guarantees no field renames or removals). Window objects carry `id: u64`, `app_id: Option<String>`, `title: Option<String>`, `pid: Option<i32>`, and `workspace_id: Option<u64>`. Workspace objects carry `id: u64`, `name: Option<String>`, `is_active: bool`, `is_focused: bool`, `idx: u8`, and `output: Option<String>`. These map cleanly to Zod-validated TypeScript types.

The snapshot-diff strategy for `snapshotWindowIds()` requires two calls to `niri msg -j windows` separated by a configurable polling loop with exponential backoff. The "new windows" are the set difference of IDs after spawn minus IDs before spawn. The same `Bun.$` pattern used in git.ts applies here. For testability, the internal polling delay should use an injectable sleep function (defaults to a real `setTimeout`-based delay), so tests can pass a no-op.

**Primary recommendation:** Implement as a flat module of exported async functions using `Bun.$` for output capture (matching git.ts), Zod for JSON validation, and an injectable `sleep` parameter on `snapshotWindowIds()` for test control. Export a `NiriCommands` interface type that Phase 20 tests mock wholesale via `mock.module("@/lib/niri", ...)`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:shell` (`$`) | Built-in (Bun ≥ 1.0) | Run `niri msg` subprocesses and capture JSON stdout | Same pattern as git.ts and tmux.ts throughout the codebase |
| `zod` | ^3.25.76 (project dep) | Validate and parse niri JSON output at runtime | All external JSON in this project goes through Zod |
| `bun:test` (`mock`, `mock.module`) | Built-in | Mock the entire niri module in Phase 20 tests | Established pattern: runner.test.ts, artifacts.test.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Bun.spawn` | Built-in | Fire-and-forget spawn (niriSpawn wraps this) | When niri should launch a terminal and not block |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Bun.$` for niri msg | Direct Unix socket + `niri-ipc` Rust bindings | Socket is faster but adds binary dependency; CLI is sufficient for workspace setup |
| Zod parse | Manual JSON shape checks | Zod gives typed output and runtime safety with zero extra deps |

**Installation:** No new packages — all dependencies already present in project.

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    niri.ts           # All niri IPC calls — single source of truth
tests/
  lib/
    niri.test.ts      # Unit tests; NIRI_SOCKET must NOT be present
```

### Pattern 1: Flat exported async functions with Zod validation

**What:** Each public function is a named export. Zod schemas live at module top. No class wrappers.
**When to use:** Always — matches tmux.ts and git.ts exactly.
**Example:**
```typescript
// Source: mirrors tmux.ts and git.ts patterns in this codebase
import { $ } from "bun"
import { z } from "zod"

const NiriWindowSchema = z.object({
  id: z.number(),
  title: z.string().nullable().optional(),
  app_id: z.string().nullable().optional(),
  pid: z.number().nullable().optional(),
  workspace_id: z.number().nullable().optional(),
  is_focused: z.boolean(),
  is_floating: z.boolean(),
  is_urgent: z.boolean(),
})

export type NiriWindow = z.infer<typeof NiriWindowSchema>

const NiriWorkspaceSchema = z.object({
  id: z.number(),
  idx: z.number(),
  name: z.string().nullable().optional(),
  output: z.string().nullable().optional(),
  is_urgent: z.boolean(),
  is_active: z.boolean(),
  is_focused: z.boolean(),
  active_window_id: z.number().nullable().optional(),
})

export type NiriWorkspace = z.infer<typeof NiriWorkspaceSchema>

export async function isNiriRunning(): Promise<boolean> {
  return Boolean(process.env.NIRI_SOCKET)
}

export async function listNiriWindows(): Promise<NiriWindow[]> {
  const result = await $`niri msg -j windows`.quiet().nothrow()
  if (result.exitCode !== 0) return []
  return z.array(NiriWindowSchema).parse(JSON.parse(result.text()))
}
```

### Pattern 2: Mockable interface type export

**What:** Export a `NiriCommands` interface that exactly matches the public function signatures. Phase 20 tests can pass a mock object that satisfies this interface, or use `mock.module("@/lib/niri", ...)` to replace the whole module.
**When to use:** Required for TEST-01. Enables two mock strategies (module-level and value-level).
**Example:**
```typescript
// Export interface matching all public functions — Phase 20 tests can mock.module the whole module
export interface NiriCommands {
  isNiriRunning(): Promise<boolean>
  listNiriWindows(): Promise<NiriWindow[]>
  listNiriWorkspaces(): Promise<NiriWorkspace[]>
  setNiriWorkspaceName(name: string, workspaceRef?: string | number): Promise<void>
  moveWindowToWorkspace(windowId: number, workspaceRef: string | number): Promise<void>
  niriSpawn(command: string[]): Promise<void>
  snapshotWindowIds(
    spawnFn: () => Promise<void>,
    opts?: SnapshotOpts
  ): Promise<number[]>
}
```

### Pattern 3: snapshotWindowIds with injectable sleep

**What:** Before spawning, capture the set of window IDs. Call the spawn callback. Poll `listNiriWindows()` with exponential backoff until at least one new ID appears or timeout is reached. Return the new IDs.
**When to use:** Required by NIRI-06 for identifying windows spawned by niriSpawn.
**Example:**
```typescript
export type SnapshotOpts = {
  timeoutMs?: number      // default 10_000
  initialDelayMs?: number // default 200
  maxDelayMs?: number     // default 2_000
  _sleep?: (ms: number) => Promise<void>  // injectable for tests
}

export async function snapshotWindowIds(
  spawnFn: () => Promise<void>,
  opts: SnapshotOpts = {}
): Promise<number[]> {
  const {
    timeoutMs = 10_000,
    initialDelayMs = 200,
    maxDelayMs = 2_000,
    _sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts
  const before = new Set((await listNiriWindows()).map((w) => w.id))
  await spawnFn()
  const deadline = Date.now() + timeoutMs
  let delay = initialDelayMs
  while (Date.now() < deadline) {
    await _sleep(delay)
    const after = (await listNiriWindows()).map((w) => w.id)
    const newIds = after.filter((id) => !before.has(id))
    if (newIds.length > 0) return newIds
    delay = Math.min(delay * 2, maxDelayMs)
  }
  return [] // timeout — caller handles gracefully
}
```

### Pattern 4: CLI action command syntax

**What:** Each action maps to a `niri msg action <name> [flags]` invocation. The `--json` flag is for query commands (`windows`, `workspaces`), not action commands.
**When to use:** For setNiriWorkspaceName, moveWindowToWorkspace, niriSpawn.

```typescript
// set-workspace-name: positional name, optional --workspace <ref>
// ref can be workspace name string or index number
export async function setNiriWorkspaceName(
  name: string,
  workspaceRef?: string | number
): Promise<void> {
  if (workspaceRef !== undefined) {
    await $`niri msg action set-workspace-name ${name} --workspace ${String(workspaceRef)}`.quiet().nothrow()
  } else {
    await $`niri msg action set-workspace-name ${name}`.quiet().nothrow()
  }
}

// move-window-to-workspace: workspace as positional, optional --window-id
export async function moveWindowToWorkspace(
  windowId: number,
  workspaceRef: string | number
): Promise<void> {
  await $`niri msg action move-window-to-workspace ${String(workspaceRef)} --window-id ${windowId}`.quiet().nothrow()
}

// spawn: command as array via niri msg action spawn -- cmd arg1 arg2
export async function niriSpawn(command: string[]): Promise<void> {
  await $`niri msg action spawn -- ${command}`.quiet().nothrow()
}
```

### Anti-Patterns to Avoid

- **Calling niri msg directly in integration files:** All niri IPC must go through `src/lib/niri.ts`. No `$\`niri msg ...\`` anywhere else.
- **Using `niri msg` without `--json` for parsing:** Non-JSON output is explicitly unstable per niri docs. Always use `-j` or `--json` for query commands.
- **Persisting niri workspace IDs:** Workspace IDs are session-scoped and ephemeral. Never write them to YAML. Use workspace names as the stable reference.
- **Hard-polling without backoff:** Sleep loops with a fixed short delay under concurrency add unnecessary latency. Use exponential backoff.
- **Blocking on niriSpawn:** Terminal spawn should be fire-and-forget (exitCode check via `.nothrow()` is fine, but don't await process exit).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON output validation | Custom shape-check functions | Zod schemas (already a project dep) | Runtime safety, TypeScript types for free, matches all other IPC in project |
| Mock isolation | Complex class-based DI or parameter injection | `mock.module("@/lib/niri", () => ({ ... }))` + query-string cache-busting | Established project pattern — runner.test.ts and artifacts.test.ts both use this |
| Exponential backoff | Hand-rolled with setTimeout | Inline in snapshotWindowIds with injectable `_sleep` | Keeps the function self-contained; `_sleep` injection is the only test hook needed |

**Key insight:** The bun mock.module pattern makes a full injectable DI system unnecessary. The entire `src/lib/niri.ts` module is replaced in tests — no per-function injection needed at the call site.

## Common Pitfalls

### Pitfall 1: niri JSON field optionality
**What goes wrong:** `niri msg -j windows` returns `null` (not absent) for `app_id`, `title`, `pid`, `workspace_id` when a window has no value. Zod `.nullable()` is required on all `Option<T>` Rust fields.
**Why it happens:** Rust's `Option<T>` serializes as `null` in JSON when `None`, not as a missing key.
**How to avoid:** Use `.nullable().optional()` on all Option fields in Zod schemas so both `null` and missing-key are accepted.
**Warning signs:** Zod parse failures at runtime when windows lack app_id or workspace_id.

### Pitfall 2: NIRI_SOCKET absent in test environment
**What goes wrong:** Tests call real `niri msg` which fails with "error connecting to socket" causing test failures that look like logic bugs.
**Why it happens:** `NIRI_SOCKET` is set by the niri compositor at runtime; CI/test environments don't run niri.
**How to avoid:** Tests MUST use `mock.module("@/lib/niri", ...)` before importing any module that transitively imports niri.ts. Never call listNiriWindows() or any niri function in tests without mocking.
**Warning signs:** `error: Connection refused` or `NIRI_SOCKET not set` in test output.

### Pitfall 3: Bun module cache — mock.module order
**What goes wrong:** `mock.module()` called after `import` has no effect because bun has already cached the real module.
**Why it happens:** Bun resolves module imports at parse time; `mock.module()` must be registered before any `await import()` that loads the module.
**How to avoid:** Register `mock.module("@/lib/niri", ...)` at the top of the test file before any `await import("@/lib/integrations/niri?...")` call. Use the `?unit-test` query-string cache-busting pattern (established in runner.test.ts and artifacts.test.ts).
**Warning signs:** Mock functions are never called; real implementation runs instead.

### Pitfall 4: snapshotWindowIds race condition
**What goes wrong:** If a window appears before `spawnFn()` returns (extremely fast apps), the before-snapshot already missed it.
**Why it happens:** niri might show the window created during the spawn call itself.
**How to avoid:** Take the before-snapshot synchronously just before calling `spawnFn()`. This is already the correct order in the recommended pattern above.
**Warning signs:** `snapshotWindowIds` returns an empty array even though the window launched successfully.

### Pitfall 5: move-window-to-workspace workspace reference format
**What goes wrong:** Passing a workspace ID (u64 number) when niri expects a workspace name string — or vice versa.
**Why it happens:** `WorkspaceReferenceArg` accepts Id(u64), Index(u8), or Name(String). The CLI maps these to different flag values.
**How to avoid:** The wrapper function signature should accept `string | number` — strings are treated as names, numbers as indices. Document this explicitly. In Phase 20, callers always pass the workspace name string (the git-stacks workspace name).
**Warning signs:** niri reports "workspace not found" when using numeric IDs that aren't indices.

## Code Examples

Verified patterns from official sources:

### Querying windows (community scripts, verified JSON field names)
```typescript
// Source: docs.rs/niri-ipc/latest/niri_ipc/struct.Window.html (field types)
// Community scripts confirm: niri msg -j windows, niri msg --json windows both work
const result = await $`niri msg -j windows`.quiet().nothrow()
// result.text() is a JSON array of Window objects
const windows = z.array(NiriWindowSchema).parse(JSON.parse(result.text()))
// windows[0].id       → number (u64)
// windows[0].app_id   → string | null | undefined
// windows[0].pid      → number | null | undefined  (i32)
// windows[0].workspace_id → number | null | undefined (u64)
```

### Action: set-workspace-name
```typescript
// Source: community example from discussion #3331 + deepwiki docs
// Syntax: niri msg action set-workspace-name <name> [--workspace <ref>]
await $`niri msg action set-workspace-name ${"my-workspace"}`.quiet().nothrow()
// With workspace targeting:
await $`niri msg action set-workspace-name ${"my-workspace"} --workspace ${"1"}`.quiet().nothrow()
```

### Action: move-window-to-workspace
```typescript
// Source: community discussion #1096 confirms --window-id flag; deepwiki docs confirm workspace positional
// Syntax: niri msg action move-window-to-workspace <workspace-ref> [--window-id <id>]
await $`niri msg action move-window-to-workspace ${"my-workspace"} --window-id ${windowId}`.quiet().nothrow()
```

### Action: spawn (fire-and-forget)
```typescript
// Source: docs.rs Action::Spawn { command: Vec<String> }
// CLI: niri msg action spawn -- <cmd> [args...]
await $`niri msg action spawn -- ${["ghostty", "-e", "tmux", "new-session", "-A", "-s", "my-ws"]}`.quiet().nothrow()
```

### Detecting niri is running
```typescript
// Source: niri IPC docs — NIRI_SOCKET env var set by compositor at runtime
export async function isNiriRunning(): Promise<boolean> {
  return Boolean(process.env.NIRI_SOCKET)
}
```

### Full mock.module pattern for Phase 20 tests
```typescript
// Source: established pattern from tests/lib/integrations/runner.test.ts and artifacts.test.ts
import { mock } from "bun:test"

const mockListNiriWindows = mock(async () => [])
const mockListNiriWorkspaces = mock(async () => [])
const mockSetNiriWorkspaceName = mock(async () => {})
const mockMoveWindowToWorkspace = mock(async () => {})
const mockNiriSpawn = mock(async () => {})
const mockSnapshotWindowIds = mock(async () => [])
const mockIsNiriRunning = mock(async () => true)

mock.module("@/lib/niri", () => ({
  isNiriRunning: mockIsNiriRunning,
  listNiriWindows: mockListNiriWindows,
  listNiriWorkspaces: mockListNiriWorkspaces,
  setNiriWorkspaceName: mockSetNiriWorkspaceName,
  moveWindowToWorkspace: mockMoveWindowToWorkspace,
  niriSpawn: mockNiriSpawn,
  snapshotWindowIds: mockSnapshotWindowIds,
}))

// Then cache-busting import:
const { niriIntegration } = await import(
  "@/lib/integrations/niri?niri-test"
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| niri IPC via raw Unix socket + socat | `niri msg` CLI with `--json` flag | niri 0.1.x | CLI is stable, JSON output stability guaranteed |
| Window IDs absent (string-only refs) | Numeric u64 window IDs added | niri 0.1.9 | Enables reliable per-window operations by ID |
| Workspace IDs absent (index only) | Numeric u64 workspace IDs + named workspaces | niri 0.1.x | Named workspaces persist by name across moves |

**Deprecated/outdated:**
- Non-JSON `niri msg` output: explicitly unstable, must not parse it for automation.
- Workspace index-based references: work but fragile if user reorders workspaces. Name-based references are preferred.

## Open Questions

1. **`niri msg action spawn` with `--` separator**
   - What we know: Rust docs show `Spawn { command: Vec<String> }`. Community uses `niri msg action spawn -- cmd args`.
   - What's unclear: Whether the `--` separator is strictly required or just conventional when args might look like flags.
   - Recommendation: Always include `--` before the command to be safe. Bun's `$` template literal handles this correctly when passing an array.

2. **`niriSpawn` needs focus-workspace pre-step?**
   - What we know: niri spawns windows on the currently focused workspace. Phase 20 must focus the named workspace before calling niriSpawn.
   - What's unclear: Whether the focus step belongs in niri.ts or in the integration layer (Phase 20).
   - Recommendation: Keep niri.ts purely as wrappers. Add `focusNiriWorkspace(ref)` as an exported function. Phase 20 orchestrates the focus-then-spawn sequence.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, no config file needed) |
| Config file | none — `bun test tests/` per CLAUDE.md |
| Quick run command | `bun test tests/lib/niri.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NIRI-06 | snapshotWindowIds returns diff of new window IDs after spawn | unit | `bun test tests/lib/niri.test.ts -t "snapshotWindowIds"` | Wave 0 |
| NIRI-06 | snapshotWindowIds returns [] on timeout (no new windows) | unit | `bun test tests/lib/niri.test.ts -t "timeout"` | Wave 0 |
| NIRI-07 | listNiriWindows returns pid field for PID-matching use | unit | `bun test tests/lib/niri.test.ts -t "listNiriWindows"` | Wave 0 |
| NIRI-10 | All niri.ts functions callable without NIRI_SOCKET | unit | `bun test tests/lib/niri.test.ts` | Wave 0 |
| TEST-01 | mock.module replaces niri.ts cleanly (Phase 20 pattern demo) | unit | `bun test tests/lib/niri.test.ts -t "mock"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/niri.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/niri.test.ts` — covers all five requirement rows above (new file, does not exist yet)

*(Existing test infrastructure covers the framework — only the new test file is missing)*

## Sources

### Primary (HIGH confidence)
- [docs.rs/niri-ipc/latest/niri_ipc/struct.Window.html](https://docs.rs/niri-ipc/latest/niri_ipc/struct.Window.html) — authoritative Window struct field names and types
- [docs.rs/niri-ipc/latest/niri_ipc/struct.Workspace.html](https://docs.rs/niri-ipc/latest/niri_ipc/struct.Workspace.html) — authoritative Workspace struct field names and types
- [docs.rs/niri-ipc/latest/niri_ipc/enum.Action.html](https://docs.rs/niri-ipc/latest/niri_ipc/enum.Action.html) — SetWorkspaceName, MoveWindowToWorkspace, Spawn action variant parameters
- [docs.rs/niri-ipc/latest/niri_ipc/enum.WorkspaceReferenceArg.html](https://docs.rs/niri-ipc/latest/niri_ipc/enum.WorkspaceReferenceArg.html) — Id/Index/Name variants
- Project codebase — git.ts, tmux.ts, runner.test.ts, artifacts.test.ts (established patterns)

### Secondary (MEDIUM confidence)
- [github.com/niri-wm/niri/discussions/1096](https://github.com/niri-wm/niri/discussions/1096) — `niri msg -j windows` field names confirmed by community scripts using `.id`, `.app_id`, `.title`, `is_urgent`
- [github.com/niri-wm/niri/discussions/3331](https://github.com/niri-wm/niri/discussions/3331) — `move-window-to-workspace <workspace> --window-id <id>` syntax confirmed
- [deepwiki.com/YaLTeR/niri/5.2-available-commands](https://deepwiki.com/YaLTeR/niri/5.2-available-commands) — `niri msg -j windows`, `niri msg -j workspaces`, action CLI overview
- [github.com/niri-wm/niri/discussions/2484](https://github.com/niri-wm/niri/discussions/2484) — spawn focus-workspace sequencing pattern

### Tertiary (LOW confidence)
- WebSearch consensus — `set-workspace-name <name> --workspace <ref>` CLI flag format (need to verify by running `niri msg action set-workspace-name --help` when niri is available)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps, established project patterns
- Architecture patterns: HIGH — Window/Workspace field types from docs.rs (authoritative Rust docs), mock pattern from project codebase
- CLI syntax (action commands): MEDIUM — confirmed from community scripts for move-window-to-workspace; set-workspace-name `--workspace` flag is HIGH per discussion example; spawn `--` separator is conventional
- Pitfalls: HIGH — based on Rust Option<T> serialization rules and established bun mock.module behavior

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (niri IPC JSON is stability-guaranteed; CLI flags change rarely)
