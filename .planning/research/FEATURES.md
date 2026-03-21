# Feature Research — v0.6.0 Integration Orchestration & Niri

**Domain:** CLI workspace manager — integration pipeline orchestration, niri compositor integration
**Researched:** 2026-03-21
**Confidence:** HIGH (existing codebase analysis) / MEDIUM (niri IPC patterns from official docs and community examples)

---

## Current State Baseline (v0.5.1)

The integration system today:
- `integrations` array in `src/lib/integrations/index.ts` — order is implicit (vscode, intellij, cmux, tmux)
- `openWorkspace()` runs integrations sequentially, calling `generate()` then `open()` for each
- `open()` returns `Promise<void>` — no return value, no inter-integration communication
- `IntegrationContext` carries `workspace`, `tasksDir`, `config` — no shared mutable bag
- No niri integration exists; niri users cannot get workspace-per-task behavior

What each integration currently produces:
- **vscode**: launches `code-insiders <artifact-path>` — PID not captured
- **intellij**: opens IDE project — PID not captured
- **cmux**: creates/focuses a cmux workspace — `ref` (workspace ID) captured internally but not exported
- **tmux**: creates/focuses a tmux session — session name is `workspace.name` but not exported

---

## Feature Area 1: Integration Artifact System

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `open()` returns an artifact record | Niri integration needs tmux session names and window PIDs to move them onto a workspace. Without a return value, niri has no way to discover what was launched by prior integrations. | MEDIUM | Change signature from `Promise<void>` to `Promise<IntegrationArtifact \| null>`. Requires updating all four existing integrations and the execution loop in `workspace-ops.ts`. |
| Accumulated artifact bag in context | Later integrations (niri) need to see what all earlier integrations produced. The natural place is an extended `IntegrationContext` field like `artifacts: Record<string, IntegrationArtifact>`. | LOW | Mutate the context object between integration runs in the execution loop. No new data structures needed beyond a typed record. |
| Existing integrations return their primary identifier | tmux must return its session name; cmux must return its workspace ref; vscode/intellij should return window PID if detectable. This is what niri consumes. | MEDIUM | tmux session name is `workspace.name` — trivial to return. cmux `ref` already exists inside `open()`. VSCode/IntelliJ PID capture requires `$` spawn tracking or snapshot-diff strategy (see Window Identification below). |
| Backward compatibility — `open()` returning null is valid | Most integrations run standalone and have nothing meaningful to pass forward. A null return must not cause failures. | LOW | Accumulation loop: `if (artifact) context.artifacts[integration.id] = artifact`. Null skipped silently. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Typed artifact schema per integration | Each integration declares what it returns (tmux: `{ sessionName }`, vscode: `{ pid }`, etc.) in its own file. Downstream integrations can safely destructure without casting. | LOW | Add a discriminated union `IntegrationArtifact` type with a `kind` field. Each integration's return type is narrow. |
| Artifact available in post_open hooks via env vars | After integration pipeline completes, export artifact values as env vars (`WS_TMUX_SESSION`, `WS_CMUX_REF`) before running `post_open` hooks. Hooks can then do custom window arrangement without a custom integration. | MEDIUM | Requires mapping artifact fields to env var names. Useful for power users. Could be a v0.6.x addition after the core artifact system ships. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full bidirectional inter-integration messaging (request/reply between plugins) | Seems like a natural extension of artifact passing | Turns simple sequential pipeline into async IPC between plugins. Ordering becomes non-deterministic, deadlock risk, major complexity. | Unidirectional artifact accumulation is sufficient. Niri reads from the bag; it never needs to call back into tmux. |
| Global artifact store persisted to disk | Agent users might want to re-query what windows were opened | Adds persistence complexity, cache invalidation, stale state. A running niri workspace is queried live. | Query niri IPC directly for current window state when needed. |

---

## Feature Area 2: Integration Ordering

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Explicit per-integration ordering | Niri must run last. It depends on tmux/cmux/vscode having already opened their windows. Without ordering guarantees, the system is fragile. | LOW | Add a numeric `order` field to each `Integration` object (default 50). Sort the `integrations` array by `order` before execution in `openWorkspace()`. Niri gets `order: 100`. |
| Order configurable per template/workspace | A template with only niri + tmux may want different order than one with all four. | MEDIUM | `settings.integrations.<id>.order` override in workspace/template YAML. The resolution cascade already exists; add `order` alongside `enabled`. |
| Stable ordering for integrations with same order value | Deterministic execution for testing and predictability. | LOW | Use the position in the `integrations` registry array as a tiebreaker when orders are equal. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `git-stacks config` shows resolved integration order | Users can see the effective execution order before opening a workspace. Useful for debugging niri timing. | LOW | Extend the integration display in TUI detail pane and `config show` to include resolved order. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Dependency-based ordering (integration A declares `after: ["tmux"]`) | Seems more expressive than numeric order | Requires dependency graph resolution, cycle detection, and error messages. Niri always runs last — a simple high order number is sufficient. | Numeric order is unambiguous and easy to reason about. |

---

## Feature Area 3: Niri Integration — Core

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create a niri workspace named after the git-stacks workspace | The core value proposition. One niri workspace = one git-stacks workspace. Without this, niri integration is just another launcher. | MEDIUM | Use `niri msg action set-workspace-name <git-stacks-name>` to name the current empty workspace, or find an existing workspace with that name via `niri msg -j workspaces`. The name must survive niri restarts — named workspaces persist when non-empty. |
| Focus the named niri workspace | After creating the workspace and placing windows on it, the compositor must switch to it. The user should land on their new dev environment. | LOW | `niri msg action focus-workspace <name>` — straightforward IPC call. |
| Check if niri is running before attempting IPC | On non-niri systems or when niri is not the active compositor, `$NIRI_SOCKET` is unset. The integration must silently skip rather than crash. | LOW | `applies()` checks for `process.env.NIRI_SOCKET` (or existence of the socket path). If absent, return false and skip entirely. |
| Move windows spawned by earlier integrations onto the niri workspace | The key orchestration feature. tmux terminal, VSCode window, cmux window should all land on the same niri workspace. | HIGH | See Window Identification section below. This is the hardest part of the feature. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Spawn a tmux terminal inside niri without requiring the tmux integration to be enabled | Niri-only users who don't need tmux layout features still benefit from a terminal being opened on their workspace. If tmux integration is already running, skip this. | MEDIUM | Niri integration checks `artifacts["tmux"]` — if present, re-use that session. If absent and a `terminalCmd` is configured, spawn a new terminal with `kitty --app-id=git-stacks-<workspace>` or similar. |
| `open-on-workspace` niri config snippet generation | Generate a `window-rules` block the user can paste into `~/.config/niri/config.kdl` to permanently associate specific apps with this workspace. | MEDIUM | Purely additive feature. Write the snippet to `.planning/` or print to stdout. Complex to implement correctly for dynamic workspace names. Defer to v0.6.x. |
| Cleanup: unset workspace name on `git-stacks remove`/`clean` | When the git-stacks workspace is deleted, the niri workspace should revert to unnamed (becoming auto-removable when empty). | LOW | Add a hook in `runPreRemoveHooks()` that calls `niri msg action unset-workspace-name <name>`. Only runs if `$NIRI_SOCKET` is present. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Modify niri's `config.kdl` programmatically | Persistent window rules per workspace | Config.kdl manipulation is fragile (comment-stripping, KDL parser needed, file conflicts). Named workspaces created at runtime work fine without config changes. | Runtime `set-workspace-name` via IPC. Only static window rules need config.kdl — omit for v0.6.0. |
| Per-workspace niri layout configuration (column widths, split ratios) | Power users want precise layout control | Niri's layout is inherently dynamic and scrollable. Static layout declarations are at odds with niri's UX model. | Let niri handle layout naturally. If needed, tmux/cmux pane layout config already handles terminal split ratios. |

---

## Feature Area 4: Window Identification and Arrangement

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| tmux session → niri window identification via client lookup | After tmux integration runs, niri needs to know which niri window contains the tmux session. The terminal emulator hosting tmux must be identified. | MEDIUM | Strategy: `tmux list-clients -t <session>` returns the terminal device (e.g., `/dev/pts/3`). Cross-reference with `niri msg -j windows` — windows include PID. Walk `/proc/<pid>/fd/` to find which window has that pts. Medium complexity but no snapshot diff needed. |
| VSCode window identification via snapshot-diff | VSCode does not expose a queryable PID from `code . &`. The safest approach is: capture `niri msg -j windows` before spawning VSCode, spawn, wait briefly, capture again, diff to find new window. | MEDIUM | Snapshot before: list of window IDs. Spawn VSCode. Poll `niri msg -j windows` until a new window with `app_id` matching `code` or `code-insiders` appears (up to ~5 seconds). Diff identifies the specific window. |
| Move identified windows to the niri workspace | Once a window ID is known, move it: `niri msg action move-window-to-workspace <name> --id <window-id>`. | LOW | Straightforward IPC. Window IDs are stable within a compositor session. |
| Graceful degradation when window identification fails | Timeout waiting for VSCode, or tmux client lookup fails. The workspace still opens; only window arrangement is skipped with a warning. | LOW | Wrap in try/catch, log warning, continue. Window identification failure is not a fatal error. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| app_id matching as fallback for VSCode | After snapshot-diff identifies candidates, filter by `app_id` matching `^code` or `^codium` to reduce false positives if multiple VSCode windows are open. | LOW | Combine snapshot-diff (to narrow to new windows) with app_id filter (to confirm identity). Reliable in practice. |
| Event-stream-based window detection instead of polling | Subscribe to `WindowOpenedOrChanged` events; resolve when a matching window appears. Avoids polling sleep. | MEDIUM | Uses `niri msg --json event-stream`. More precise than polling but requires concurrent stream consumption. Suitable for v0.6.x after polling approach is validated. |
| cmux window identification via app_id | cmux is a Wayland application with a known `app_id`. After cmux integration opens its workspace, find the cmux window in `niri msg -j windows` by `app_id == "cmux"` and the most-recent opened timestamp. | LOW | Simpler than tmux because cmux has a known, queryable `app_id`. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| IntelliJ window identification | IntelliJ's app_id varies by version and JetBrains toolbox installation. Multiple IntelliJ windows may be open simultaneously. | The snapshot-diff approach works but IntelliJ takes 15-30 seconds to open, making the diff window unreliable. Window arrangement for IntelliJ should be deferred. | Skip IntelliJ window arrangement in v0.6.0. IntelliJ users can manually move to the workspace. Document as known limitation. |
| X11 window identification (xdotool, wmctrl) | Some users run XWayland apps | X11 ID space is separate from Wayland — adding xdotool/wmctrl is a parallel complexity track. | Scope v0.6.0 to native Wayland windows only. XWayland apps can be moved manually. |

---

## Feature Dependencies

```
Integration Artifact System
    └──enables──> Integration Ordering (ordering only matters once artifacts flow)
    └──enables──> Niri Integration (niri needs tmux/cmux artifacts to identify windows)

Integration Ordering
    └──required-by──> Niri Integration (niri must run AFTER tmux/cmux/vscode)

Niri applies() check ($NIRI_SOCKET)
    └──required-by──> All niri IPC calls (guard against non-niri environments)

Window Identification (tmux client lookup)
    └──requires──> tmux Artifact (session name from tmux integration)

Window Identification (snapshot-diff)
    └──requires──> VSCode already launched (must spawn before diff)
    └──enables──> move-window-to-workspace (need window ID first)

Cleanup (unset-workspace-name on remove)
    └──independent──> Can be added to runPreRemoveHooks() without artifact system
```

### Dependency Notes

- **Artifact system requires interface change**: `open()` signature changes from `Promise<void>` to `Promise<IntegrationArtifact | null>`. All four existing integrations must be updated simultaneously or the interface must have a transitional default.
- **Niri ordering requires artifact system**: The ordering feature is only useful if niri can consume results. Ship both in the same phase.
- **Window identification complexity is isolated**: The snapshot-diff and tmux-client-lookup strategies are internal to the niri integration. If they fail, the rest of the integration pipeline still completes. Implement with explicit fallback paths.
- **Cleanup is independent**: Unsetting the niri workspace name on `git-stacks remove` can be added to `runPreRemoveHooks()` without touching the artifact system. It is a simple IPC call guarded by `$NIRI_SOCKET` presence.

---

## Niri Workspace Lifecycle

This documents the full create-to-cleanup lifecycle that the niri integration must implement:

### Create (during `git-stacks open`)

1. Check `$NIRI_SOCKET` — if unset, `applies()` returns false, skip entirely.
2. Query `niri msg -j workspaces` — check if a workspace named `<git-stacks-name>` already exists (idempotent re-open).
3. If not found: use current empty workspace via `set-workspace-name <name>`, or find any empty workspace and name it.
4. Focus the named workspace: `niri msg action focus-workspace <name>`.
5. Consume artifact bag — for each artifact, identify the corresponding niri window (tmux: client lookup, vscode: snapshot-diff, cmux: app_id match).
6. Move identified windows: `niri msg action move-window-to-workspace <name> --id <window-id>` for each.
7. (Optional) Spawn terminal if no tmux session was provided in artifacts.

### Re-open (idempotent)

1. Query `niri msg -j workspaces` — workspace with this name found.
2. Focus it: `niri msg action focus-workspace <name>`.
3. Skip window arrangement (windows are already on the workspace).

### Cleanup (during `git-stacks remove` or `git-stacks clean`)

1. Check `$NIRI_SOCKET` — if unset, skip.
2. Call `niri msg action unset-workspace-name <name>`.
3. The workspace becomes unnamed and auto-removes when its last window closes.

---

## MVP Definition for v0.6.0

### Launch With

- [ ] `IntegrationArtifact` type and `open()` return type change — foundation for everything else.
- [ ] Artifact accumulation in `openWorkspace()` execution loop.
- [ ] tmux integration returns `{ kind: "tmux", sessionName: string }`.
- [ ] cmux integration returns `{ kind: "cmux", workspaceRef: string }`.
- [ ] VSCode integration returns `{ kind: "vscode", pid: number | null }` (null if PID not captured).
- [ ] Numeric `order` field on `Integration`, niri registered at order 100.
- [ ] Niri integration: `applies()` guards on `$NIRI_SOCKET`, creates/names workspace, focuses it.
- [ ] Window identification: tmux client lookup for tmux sessions; snapshot-diff for VSCode.
- [ ] `move-window-to-workspace` for identified windows.
- [ ] Graceful degradation: all identification failures are warnings, not errors.
- [ ] Cleanup: `unset-workspace-name` called from `runPreRemoveHooks()` when `$NIRI_SOCKET` is set.

### Add After Validation (v0.6.x)

- [ ] Event-stream-based window detection (replace polling in snapshot-diff).
- [ ] Artifact values exported as env vars to `post_open` hooks.
- [ ] `git-stacks config` and TUI detail pane show resolved integration order.
- [ ] Terminal spawning in niri integration when no tmux artifact is present.

### Future Consideration (v0.7.0+)

- [ ] Per-workspace niri layout configuration.
- [ ] IntelliJ window arrangement (app startup timing problem must be solved first).
- [ ] XWayland window identification via xdotool fallback.
- [ ] `open-on-workspace` niri config snippet generation.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `open()` returns artifact | HIGH | MEDIUM | P1 |
| Artifact accumulation in context | HIGH | LOW | P1 |
| tmux artifact (session name) | HIGH | LOW | P1 |
| cmux artifact (workspace ref) | HIGH | LOW | P1 |
| Numeric integration ordering | HIGH | LOW | P1 |
| Niri: applies() + create workspace + focus | HIGH | MEDIUM | P1 |
| Niri: tmux client → window ID lookup | HIGH | MEDIUM | P1 |
| Niri: move-window-to-workspace | HIGH | LOW | P1 |
| VSCode snapshot-diff identification | MEDIUM | MEDIUM | P2 |
| VSCode artifact (PID) | MEDIUM | MEDIUM | P2 |
| Niri cleanup on remove | MEDIUM | LOW | P2 |
| cmux app_id window identification | MEDIUM | LOW | P2 |
| Event-stream window detection | LOW | MEDIUM | P3 |
| Artifact env var export to hooks | LOW | MEDIUM | P3 |
| IntelliJ window arrangement | LOW | HIGH | P3 |

---

## Sources

- Niri IPC wiki: https://github.com/YaLTeR/niri/wiki/IPC
- Niri named workspaces: https://github.com/niri-wm/niri/wiki/Configuration:-Named-Workspaces
- Niri IPC commands (DeepWiki): https://deepwiki.com/YaLTeR/niri/5.2-available-commands
- Niri workspace scripting discussion: https://github.com/niri-wm/niri/discussions/3331
- Niri event types (nirimgr Go package): https://pkg.go.dev/github.com/soderluk/nirimgr/events
- Codebase: `src/lib/integrations/types.ts`, `src/lib/integrations/{tmux,cmux,vscode,intellij}.ts`, `src/lib/workspace-ops.ts` (openWorkspace function)

---
*Feature research for: v0.6.0 Integration Orchestration & Niri compositor*
*Researched: 2026-03-21*
