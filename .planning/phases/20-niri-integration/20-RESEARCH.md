# Phase 20: niri-integration - Research

**Researched:** 2026-03-22
**Domain:** Niri compositor integration plugin — TypeScript, Bun, Integration interface
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Integration id: `niri`, order: `30` (tier 3 — runs after all other integrations)
- Follows the standard Integration interface pattern from `src/lib/integrations/types.ts`
- No `generate()` method needed — niri has no file artifacts
- `open()` consumes ArtifactBag from prior integrations (tmux session name, window PIDs)
- Registered in `src/lib/integrations/index.ts` alongside existing integrations
- Create/reuse named niri workspace via `setNiriWorkspaceName()` (NIRI-01)
- Focus/switch to the named workspace so new windows open there naturally
- Move windows from prior integrations using PID matching from artifact bag (NIRI-02, NIRI-07)
- No hardcoded terminal spawn — user configures arbitrary commands via `commands` config array
- Config schema: `{ enabled: boolean, commands?: string[] }`
- `commands` is an optional array of shell commands to run after workspace creation
- Commands receive hook env vars (WS_WORKSPACE, WS_BRANCH, etc.) — same as hook system
- Empty by default — user sets up their own terminal/window spawning
- Example: `["ghostty -e tmux attach -t ${WS_WORKSPACE}"]`
- On re-open: check if named workspace already exists; skip workspace creation if exists, but still move any new windows from artifact bag
- User-configured commands still run on re-open (user's responsibility to make them idempotent)
- No cleanup on remove — niri workspace naming persists
- Return early with null if `!process.env.NIRI_SOCKET` — silent skip, no error, no log
- Standard `isEnabled()` check via resolveEnabled pattern

### Claude's Discretion
- Internal implementation details of window matching/moving
- Error handling strategy for individual window move failures (recommend: log warning, continue)
- Whether to use snapshotWindowIds for command-spawned windows

### Deferred Ideas (OUT OF SCOPE)
- Cleanup on remove (user may want this later — add as config toggle)
- Per-workspace niri layout configuration (column widths, floating positions) — v0.7.0+
- Aerospace (macOS) compositor integration using same tier-3 pattern
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NIRI-01 | Niri integration creates/reuses a named niri workspace per git-stacks workspace via `set-workspace-name` | `setNiriWorkspaceName()` exists in niri.ts; idempotency via `listNiriWorkspaces()` check before calling |
| NIRI-02 | Niri integration moves windows from prior integrations to the named workspace using artifact bag window info | `moveWindowToWorkspace(windowId, wsName)` exists; WindowArtifact carries `pid`; need niri window list to correlate pid→id |
| NIRI-03 | Niri integration spawns a terminal on the niri workspace attached to tmux session (reads tmux session name from artifact bag) | Superseded by CONTEXT.md: user-configured `commands` array replaces terminal spawn requirement; `runHooks()` executes them |
| NIRI-04 | Niri integration is idempotent on re-open: checks if named workspace exists with expected windows before recreating | `listNiriWorkspaces()` returns `name` field; check `workspaces.some(ws => ws.name === workspaceName)` |
| NIRI-05 | Niri integration cleans up (unnames workspace) when git-stacks workspace is removed | CONTEXT decision: no cleanup on remove — this requirement is intentionally not implemented in Phase 20 |
| NIRI-08 | Niri integration is gated by `NIRI_SOCKET` env var presence (skips gracefully when niri is not running) | `isNiriRunning()` returns `Boolean(process.env.NIRI_SOCKET)`; early return null from open() |
| NIRI-09 | Terminal emulator is configurable (e.g., `terminal: "ghostty"`) with sensible default | CONTEXT decision: replaced by `commands?: string[]` array — no terminal field needed |
| TEST-04 | Niri integration has unit tests with mocked niri shell wrappers covering workspace create, window move, tmux attach, cleanup | mock.module("@/lib/niri", ...) pattern documented in niri.test.ts; cache-busting query param needed |
</phase_requirements>

## Summary

Phase 20 creates the niri compositor integration plugin (`src/lib/integrations/niri.ts`) and registers it in `src/lib/integrations/index.ts`. The integration is a tier-3 plugin (order: 30) that runs after all IDE/terminal integrations have populated the ArtifactBag with window PIDs and tmux session names.

The `open()` method performs four sequential steps: (1) check `NIRI_SOCKET` and return null immediately if not set, (2) create or reuse a named niri workspace for the git-stacks workspace (idempotent via `listNiriWorkspaces()` existence check), (3) focus the niri workspace so subsequent windows land there, (4) move any `WindowArtifact` windows from the bag to the niri workspace by correlating PID to niri window ID via `listNiriWindows()`. After window moves, run user-configured `commands` via `runHooks()` with standard hook env vars (WS_WORKSPACE, WS_BRANCH, WS_TASKS_DIR).

All niri IPC is isolated in `src/lib/niri.ts` (Phase 19). The integration tests use `mock.module("@/lib/niri", ...)` with cache-busting query params — the exact pattern shown in `tests/lib/niri.test.ts` lines 516-532. The implementation requires no changes to workspace-ops.ts, runner.ts, or any other existing file beyond `src/lib/integrations/niri.ts` and `src/lib/integrations/index.ts`.

**Primary recommendation:** Implement as a direct port of the tmux integration pattern, replacing tmux-specific ops with niri IPC calls. The window-move logic is the only novel piece: iterate bag values, find `kind === "window"` artifacts, call `listNiriWindows()` to find the niri window whose `pid` matches, then call `moveWindowToWorkspace(niriWindowId, workspaceName)`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | existing (project) | Config schema validation | All integration configs use Zod; already in package.json |
| `@clack/prompts` | existing (project) | Spinner feedback during open() | All integrations use it for user feedback |
| `bun:test` | existing (project) | Test framework | Project-wide; all integration tests use it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/lib/niri.ts` | Phase 19 | All niri IPC calls | Only call niri through this module — no direct Bun.$ niri calls in integration |
| `src/lib/lifecycle.ts` | existing | `runHooks()` for executing user commands | Used for `commands` array execution |

**Installation:** No new packages required. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

New files:
```
src/lib/integrations/niri.ts     — integration plugin (the new file)
tests/lib/integrations/niri.test.ts  — unit tests
```

Modified files:
```
src/lib/integrations/index.ts    — add niriIntegration to exports array
```

### Pattern 1: Integration Plugin Structure

**What:** Follows the exact shape of tmux.ts — Zod config schema, `isEnabled` via `resolveEnabled`, `open()` returns `IntegrationArtifact | null`, `configurePrompt()`.
**When to use:** Always — this is the mandated Integration interface.

```typescript
// Source: src/lib/integrations/tmux.ts (reference)
import { z } from "zod"
import * as p from "@clack/prompts"
import { resolveEnabled, type Integration, type IntegrationContext, type ArtifactBag } from "./types"
import {
  isNiriRunning,
  listNiriWorkspaces,
  listNiriWindows,
  setNiriWorkspaceName,
  moveWindowToWorkspace,
  focusNiriWorkspace,
  niriSpawn,
} from "../niri"
import { runHooks } from "../lifecycle"

const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  commands: z.array(z.string()).optional(),
})

export const niriIntegration: Integration = {
  id: "niri",
  label: "niri",
  hint: "arranges workspace windows onto a named niri workspace",
  enabledByDefault: false,
  order: 30,
  isEnabled: (ctx) => resolveEnabled("niri", false, ctx),
  // no generate() — no file artifacts
  async open(ctx, _artifactPath, bag): Promise<IntegrationArtifact | null> { ... },
  async configurePrompt(current) { ... },
}
```

### Pattern 2: NIRI_SOCKET Gate (NIRI-08)

**What:** Silent early return when niri is not running. No error, no log, no spinner.
**When to use:** First check inside `open()`, before any other work.

```typescript
// Source: src/lib/niri.ts isNiriRunning() — checks Boolean(process.env.NIRI_SOCKET)
if (!await isNiriRunning()) return null
```

### Pattern 3: Idempotent Workspace Create (NIRI-01, NIRI-04)

**What:** Check existing named workspaces before calling `setNiriWorkspaceName`. Named workspaces are session-scoped and ephemeral — always query, never cache.
**When to use:** At the start of `open()`, after the NIRI_SOCKET gate.

```typescript
// Source: src/lib/niri.ts listNiriWorkspaces()
const workspaces = await listNiriWorkspaces()
const alreadyNamed = workspaces.some(ws => ws.name === workspaceName)
if (!alreadyNamed) {
  await setNiriWorkspaceName(workspaceName)
}
await focusNiriWorkspace(workspaceName)
```

**Note:** `setNiriWorkspaceName(name)` with no second argument targets the currently active workspace. The integration must call `focusNiriWorkspace()` first if there is any doubt about which workspace is active — but since we always call `focusNiriWorkspace` after setting the name, the focus step acts as both UX improvement and state assertion.

### Pattern 4: Window Move via PID Matching (NIRI-02, NIRI-07)

**What:** Iterate ArtifactBag for WindowArtifacts, list niri windows, correlate by PID, move matching windows.
**When to use:** After workspace create/focus, before user commands.

```typescript
// Source: src/lib/integrations/types.ts WindowArtifact
const niriWindows = await listNiriWindows()
for (const [_id, artifact] of Object.entries(bag)) {
  if (artifact?.kind !== "window") continue
  const match = niriWindows.find(w => w.pid === artifact.pid)
  if (!match) continue  // window not found — warn and continue (discretion)
  try {
    await moveWindowToWorkspace(match.id, workspaceName)
  } catch (err) {
    p.log.warn(`niri: could not move window ${match.id}: ${String(err)}`)
    // continue — partial failure is acceptable
  }
}
```

**Key insight:** `NiriWindow.pid` is `number | null | undefined` in the schema. The PID from WindowArtifact is `number`. Must guard: `w.pid != null && w.pid === artifact.pid`.

### Pattern 5: User Commands via runHooks (NIRI-03 replacement)

**What:** Execute user-configured `commands` array using `runHooks()` with hook env vars.
**When to use:** After window moves — user commands run last so windows from IDE/tmux are already on the workspace.

```typescript
// Source: src/lib/lifecycle.ts runHooks()
// Source: openWorkspace() in workspace-ops.ts for env construction pattern
const config = niriConfigSchema.parse(ctx.config.integrations["niri"] ?? {})
if (config.commands?.length) {
  const hookEnv = {
    WS_WORKSPACE: ctx.workspace.name,
    WS_BRANCH: ctx.workspace.branch,
    WS_TASKS_DIR: ctx.tasksDir,
  }
  await runHooks(config.commands, ctx.tasksDir, hookEnv, false)  // abortOnFailure=false
}
```

**Note on `abortOnFailure`:** Use `false` — individual user command failures should not abort the integration. The user's commands are best-effort window spawning, not critical setup steps.

### Pattern 6: Test Mock Setup (TEST-04)

**What:** Use `mock.module("@/lib/niri", ...)` before importing the integration under test. Cache-busting query param isolates test module from other tests.
**When to use:** In `tests/lib/integrations/niri.test.ts`.

```typescript
// Source: tests/lib/niri.test.ts lines 516-532 (documented pattern)
// Source: tests/lib/integrations/artifacts.test.ts (mock.module pattern for integrations)

mock.module("@/lib/niri", () => ({
  isNiriRunning: mock(async () => true),
  listNiriWindows: mock(async () => []),
  listNiriWorkspaces: mock(async () => []),
  setNiriWorkspaceName: mock(async () => {}),
  moveWindowToWorkspace: mock(async () => {}),
  niriSpawn: mock(async () => {}),
  focusNiriWorkspace: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
}))

// Also mock @clack/prompts and @/lib/lifecycle
mock.module("@clack/prompts", () => ({
  spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
  log: { warn: mock(() => {}) },
}))
mock.module("@/lib/lifecycle", () => ({
  runHooks: mock(async () => {}),
}))

const { niriIntegration } = await import(
  // @ts-ignore
  "@/lib/integrations/niri?niri-integration-test"
)
```

### Anti-Patterns to Avoid

- **Calling niri CLI directly:** Never use `Bun.$` with `niri msg` in the integration file. All IPC goes through `src/lib/niri.ts` functions. (Established by NIRI-10/Phase 19.)
- **Persisting niri workspace IDs to YAML:** Niri workspace numeric IDs are session-scoped and change between sessions. Always query via `listNiriWorkspaces()` using the name as the key. (Documented in STATE.md decisions.)
- **Throwing on NIRI_SOCKET absence:** The gate must be a silent `return null`, not `throw`. Other integrations continue unaffected.
- **Using `niriSpawn()` for user commands:** `niriSpawn()` sends commands through the niri compositor (fire-and-forget, no env injection). User commands must go through `runHooks()` for env var injection and error handling.
- **Importing niri.ts functions without cache-busting:** Test files that call `mock.module` must use query-param cache-busting on subsequent imports to get the mocked version.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Niri IPC commands | Custom `Bun.$` niri shell calls | `src/lib/niri.ts` functions | Phase 19 built typed wrappers with error handling, null returns, and Zod validation |
| Shell command execution with env | Custom spawn loop | `runHooks()` from lifecycle.ts | Handles `sh -c`, env merging, stdio, exit code handling |
| Config schema validation | Manual type checks | Zod schema + `.parse()` | All integrations use this pattern; provides runtime type safety |
| Enabled state resolution | Direct config lookup | `resolveEnabled()` | Handles global config + workspace-level override layering |

**Key insight:** The niri integration is intentionally thin. All complexity lives in `src/lib/niri.ts` (Phase 19) and `lifecycle.ts`. The integration file's job is orchestration, not implementation.

## Common Pitfalls

### Pitfall 1: NiriWindow.pid is nullable
**What goes wrong:** `w.pid === artifact.pid` matches null artifacts when both are null/undefined.
**Why it happens:** The Zod schema uses `.nullable().optional()` — `pid` can be `number | null | undefined`.
**How to avoid:** Guard explicitly: `w.pid != null && w.pid === artifact.pid`.
**Warning signs:** Test expects no match but gets one; or TypeScript type error at comparison.

### Pitfall 2: setNiriWorkspaceName targets the active workspace
**What goes wrong:** If the active workspace is not the one we want to name, we name the wrong one.
**Why it happens:** Calling `setNiriWorkspaceName(name)` with no `workspaceRef` targets whichever workspace is currently focused.
**How to avoid:** Always call `focusNiriWorkspace(name)` AFTER `setNiriWorkspaceName(name)` (to confirm focus), not before. The `set-workspace-name` action without `--workspace` targets the focused workspace — this is what we want. If we're not already on the right workspace, we rely on niri's behavior of naming the active workspace and then immediately focusing by name.
**Warning signs:** Integration names a different workspace; re-open creates a duplicate.

**Clarification on the flow:** The safe order is:
1. `listNiriWorkspaces()` — find if our named workspace already exists
2. If not found: `setNiriWorkspaceName(workspaceName)` — names the currently active workspace
3. `focusNiriWorkspace(workspaceName)` — focus by name (works whether just named or pre-existing)

### Pitfall 3: mock.module must be called before import
**What goes wrong:** Test imports integration module first, then calls mock.module — mock has no effect.
**Why it happens:** Bun module cache resolves at import time, not mock.module call time.
**How to avoid:** Always call `mock.module("@/lib/niri", ...)` and `mock.module("@clack/prompts", ...)` BEFORE any `await import(...)` of the integration under test. Use query-param cache-busting on the integration import.
**Warning signs:** Mock functions never called; real niri.ts code runs in tests.

### Pitfall 4: runHooks throws on command failure by default
**What goes wrong:** One failing user command aborts the entire integration, leaving remaining commands unrun.
**Why it happens:** `runHooks()` has `abortOnFailure = true` as default.
**How to avoid:** Pass `false` as the `abortOnFailure` argument when running user commands.
**Warning signs:** Second command never runs when first exits non-zero.

### Pitfall 5: Window moves race with niri settling
**What goes wrong:** `listNiriWindows()` is called immediately after `focusNiriWorkspace()`, before IDE windows have appeared.
**Why it happens:** IDE windows take time to register with niri after being spawned by their respective integrations (vscode, intellij).
**How to avoid:** This is expected behavior — windows that aren't found in `listNiriWindows()` at move time are silently skipped (warn + continue). Users who want windows on the niri workspace reliably should use `commands` to open them after the workspace is focused.
**Warning signs:** Window moves never succeed despite IDE being visible on screen.

## Code Examples

### Full open() flow skeleton

```typescript
// Source: integration patterns from src/lib/integrations/tmux.ts and types.ts
async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null> {
  if (!await isNiriRunning()) return null

  const spinner = p.spinner()
  spinner.start("Setting up niri workspace")

  try {
    const workspaceName = ctx.workspace.name

    // Step 1: Create or reuse named niri workspace (NIRI-01, NIRI-04)
    const workspaces = await listNiriWorkspaces()
    const alreadyNamed = workspaces.some(ws => ws.name === workspaceName)
    if (!alreadyNamed) {
      await setNiriWorkspaceName(workspaceName)
    }

    // Step 2: Focus the workspace (new windows land here)
    await focusNiriWorkspace(workspaceName)

    // Step 3: Move prior integration windows (NIRI-02)
    const niriWindows = await listNiriWindows()
    for (const artifact of Object.values(bag)) {
      if (artifact?.kind !== "window") continue
      const match = niriWindows.find(w => w.pid != null && w.pid === artifact.pid)
      if (!match) continue
      try {
        await moveWindowToWorkspace(match.id, workspaceName)
      } catch (err) {
        p.log.warn(`niri: could not move window ${match.id}: ${String(err)}`)
      }
    }

    // Step 4: Run user-configured commands (NIRI-03 replacement)
    const rawConfig = ctx.config.integrations["niri"] ?? {}
    const parsed = niriConfigSchema.parse(rawConfig)
    if (parsed.commands?.length) {
      const hookEnv = {
        WS_WORKSPACE: workspaceName,
        WS_BRANCH: ctx.workspace.branch,
        WS_TASKS_DIR: ctx.tasksDir,
      }
      await runHooks(parsed.commands, ctx.tasksDir, hookEnv, false)
    }

    spinner.stop("niri workspace ready")
    return null  // no artifact — tier-3 integrations are consumers not producers
  } catch (err) {
    spinner.stop("niri unavailable — skipped")
    p.log.warn(`niri: ${String(err)}`)
    return null
  }
}
```

### Registration in index.ts

```typescript
// Source: src/lib/integrations/index.ts (current)
import { niriIntegration } from "./niri"

export const integrations = [
  vscodeIntegration,
  intellijIntegration,
  cmuxIntegration,
  tmuxIntegration,
  niriIntegration,  // add here — order field (30) controls runtime execution order
]
```

### configurePrompt() skeleton

```typescript
// No interactive prompts needed for commands array in v0.6.0
// Simple enable/disable only — consistent with tmux which also returns minimal config
async configurePrompt(_current: Record<string, unknown>) {
  return { enabled: true }
}
```

### Test file structure

```typescript
// Source: tests/lib/integrations/artifacts.test.ts mock pattern
import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag } from "@/lib/integrations/types"

// ALL mock.module calls BEFORE any imports
const mockIsNiriRunning = mock(async () => false)
const mockListNiriWorkspaces = mock(async () => [])
const mockListNiriWindows = mock(async () => [])
const mockSetNiriWorkspaceName = mock(async () => {})
const mockMoveWindowToWorkspace = mock(async () => {})
const mockFocusNiriWorkspace = mock(async () => {})
const mockRunHooks = mock(async () => {})

mock.module("@/lib/niri", () => ({
  isNiriRunning: mockIsNiriRunning,
  listNiriWorkspaces: mockListNiriWorkspaces,
  listNiriWindows: mockListNiriWindows,
  setNiriWorkspaceName: mockSetNiriWorkspaceName,
  moveWindowToWorkspace: mockMoveWindowToWorkspace,
  focusNiriWorkspace: mockFocusNiriWorkspace,
  niriSpawn: mock(async () => {}),
  snapshotWindowIds: mock(async () => []),
}))
mock.module("@clack/prompts", () => ({
  spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
  log: { warn: mock(() => {}) },
}))
mock.module("@/lib/lifecycle", () => ({
  runHooks: mockRunHooks,
}))

// @ts-ignore
const { niriIntegration } = await import("@/lib/integrations/niri?niri-integration-test")
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10) |
| Config file | none — bun:test is built-in |
| Quick run command | `bun test tests/lib/integrations/niri.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| NIRI-01 | `setNiriWorkspaceName` called when workspace not already named | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-01 | `setNiriWorkspaceName` NOT called when workspace already named | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-02 | `moveWindowToWorkspace` called for each WindowArtifact with matching pid | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-02 | Window with no pid match is skipped (warn + continue) | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-04 | re-open: no duplicate setNiriWorkspaceName when already named | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-04 | re-open: window moves still attempted | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-08 | `open()` returns null immediately when NIRI_SOCKET not set | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-08 | no other niri calls made when gated | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-09 | `commands` array executed via runHooks with hook env vars | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| NIRI-09 | empty/absent `commands` does not call runHooks | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| TEST-04 | integration registered in index.ts (order=30) | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |
| TEST-04 | moveWindowToWorkspace failure does not abort (warn + continue) | unit | `bun test tests/lib/integrations/niri.test.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/integrations/niri.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green (425 existing tests + new niri integration tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/integrations/niri.test.ts` — covers all 12 test cases above (NIRI-01, NIRI-02, NIRI-04, NIRI-08, NIRI-09, TEST-04)

No framework install needed — bun:test is built-in and all test infrastructure is already in place.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single integration loop | runIntegrations() runner with tier ordering | Phase 17 | niri integration auto-receives ArtifactBag |
| void open() return | IntegrationArtifact \| null return | Phase 16 | niri receives typed artifacts from earlier integrations |
| Hardcoded terminal emulator config | `commands?: string[]` array | Phase 20 CONTEXT decision | More flexible; user controls what runs |
| Cleanup on remove (NIRI-05 original) | No cleanup (user decision) | Phase 20 CONTEXT decision | Simpler implementation; no workspace-ops.ts changes needed |

**Deprecated/outdated:**
- NIRI-03 (tmux session attach requirement): Superseded by user-configured `commands` array. The REQUIREMENTS.md shows NIRI-03 as "pending" but the CONTEXT.md locked decision replaces terminal spawn with `commands` array — the planner should implement `commands` array, not a `terminal` config field.
- NIRI-05 (cleanup on remove): User decision to not implement. Mark as intentionally deferred.
- NIRI-09 (terminal emulator configurable): Superseded by `commands` array approach.

## Open Questions

1. **NIRI_SOCKET gate: use `isNiriRunning()` or direct env check?**
   - What we know: `isNiriRunning()` just does `Boolean(process.env.NIRI_SOCKET)` — no shell call
   - What's unclear: Whether to call the wrapper function or inline the env check
   - Recommendation: Use `isNiriRunning()` for consistency with the established abstraction boundary. Cost is zero (no shell call). Testability is marginally better (can control NIRI_SOCKET env in tests).

2. **Return value from open(): null or a new NiriArtifact type?**
   - What we know: No downstream integration currently consumes niri artifacts. ArtifactBag has `niri` key regardless (set to null by runner).
   - What's unclear: Whether a future tier-4 integration might want niri workspace name
   - Recommendation: Return `null` in v0.6.0. The workspace name is trivially available from `ctx.workspace.name` to any future consumer. Adding a NiriArtifact type is deferred work with no current consumer.

3. **focusNiriWorkspace before or after setNiriWorkspaceName?**
   - What we know: `setNiriWorkspaceName(name)` with no workspaceRef targets the currently active workspace. `focusNiriWorkspace(name)` focuses by name.
   - What's unclear: Whether a niri session might have the wrong workspace active when git-stacks runs
   - Recommendation: Call `setNiriWorkspaceName(workspaceName)` first (names whatever is currently active), then `focusNiriWorkspace(workspaceName)` (focuses by name, which now works because we just named it). On re-open where the workspace is already named, `focusNiriWorkspace(workspaceName)` works directly. This order is safe for both first-open and re-open paths.

## Sources

### Primary (HIGH confidence)
- `src/lib/niri.ts` — all 8 IPC wrapper functions, NiriCommands interface, NiriWindow/NiriWorkspace types
- `src/lib/integrations/types.ts` — Integration interface, ArtifactBag, WindowArtifact, resolveEnabled pattern
- `src/lib/integrations/tmux.ts` — reference implementation showing exact pattern to follow
- `src/lib/integrations/runner.ts` — confirms bag is passed to open(); order sort behavior
- `tests/lib/niri.test.ts` (lines 516-532) — mock.module pattern for Phase 20 tests
- `tests/lib/integrations/artifacts.test.ts` — mock.module + cache-busting pattern for integration tests
- `.planning/phases/20-niri-integration/20-CONTEXT.md` — locked user decisions
- `.planning/REQUIREMENTS.md` — requirement IDs and descriptions
- `.planning/STATE.md` — accumulated design decisions from Phases 16-19

### Secondary (MEDIUM confidence)
- `src/lib/lifecycle.ts` — runHooks signature confirmed; abortOnFailure parameter order
- `src/lib/workspace-ops.ts` (openWorkspace) — hookEnv construction pattern for WS_* vars

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies are existing project dependencies, no new installs
- Architecture: HIGH — integration interface is fixed; reference implementations (tmux.ts) are clear; all niri IPC functions exist from Phase 19
- Test patterns: HIGH — mock.module pattern is documented in niri.test.ts with exact code example
- Pitfalls: HIGH — NiriWindow pid nullability verified from Zod schema; mock ordering verified from existing test files
- Open questions: MEDIUM — implementation details under discretion, not blockers

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase — no external dependencies to go stale)
