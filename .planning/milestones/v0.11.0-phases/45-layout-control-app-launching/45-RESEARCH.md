# Phase 45: Layout Control & App Launching - Research

**Researched:** 2026-03-28
**Phase:** 45 — Layout Control & App Launching

## Research Question

What do we need to know to plan the extension of the AeroSpace integration plugin with layout control (root layout, normalization-aware commands, flatten-before-open), workspace focus, and a commands array for launching arbitrary apps with snapshot-delta detection?

## Existing Code to Extend

### Phase 44 Integration Plugin (src/lib/integrations/aerospace.ts)

Phase 44 creates a minimal integration with:

```typescript
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),
})
```

And an `open()` method that: gate check → parse config → validate workspace → move bag windows → done.

Phase 45 must extend:
1. The config schema with `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`
2. The `open()` method with the full execution sequence: flatten → move bag windows → launch commands → apply layout → focus

### Phase 43 Shell Wrappers (src/lib/aerospace.ts)

Available wrappers consumed by Phase 45:

| Function | Phase 45 Usage |
|----------|---------------|
| `isAerospaceRunning()` | Already used in Phase 44 gate |
| `listWindows()` | Snapshot-delta for commands array |
| `listWorkspaces()` | Already used in Phase 44 validation |
| `moveNodeToWorkspace()` | Move command-launched windows to target workspace |
| `focusWindow()` | Window-level focus for `focus: true` on command entries |
| `setLayout()` | Apply root layout to workspace |
| `flattenWorkspaceTree()` | Reset tree before placing windows |
| `snapshotWindowIds()` | Detect windows from commands array launches |

### Niri Integration Pattern (src/lib/integrations/niri.ts)

The niri `open()` method is the direct template for Phase 45. Key patterns to replicate:

1. **expandVars()**: Environment variable expansion in command strings and cwd fields
   ```typescript
   const vars: Record<string, string> = {
     GS_WORKSPACE_NAME: ctx.workspace.name,
     GS_WORKSPACE_BRANCH: ctx.workspace.branch ?? "",
     GS_WORKSPACE_PATH: ctx.tasksDir,
   }
   const expandVars = (s: string): string =>
     s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")
   ```

2. **shellQuote()**: Path quoting for safe shell interpolation
   ```typescript
   function shellQuote(s: string): string {
     return "'" + s.replace(/'/g, "'\\''") + "'"
   }
   ```

3. **Command entry dispatch**: `source` → resolve from bag, `app` → direct spawn, `command` → shell spawn
4. **Window-level focus tracking**: `focusWindowId` set from `focus: true` on command entries
5. **Partial failure handling**: warn and continue on individual command failures

## Config Schema Extension

### Extended aerospaceConfigSchema

```typescript
const aerospaceCommandSchema = z.object({
  app: z.string().optional(),
  command: z.string().optional(),
  source: z.string().optional(),
  repo: z.string().optional(),
  cwd: z.string().optional(),
  args: z.array(z.string()).optional(),
  focus: z.boolean().optional(),
})

const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),
  layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional(),
  normalization: z.boolean().optional().default(true),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
})
```

The `aerospaceCommandSchema` reuses niri's field names for consistency: `app`, `command`, `source`, `repo`, `cwd`, `args`, `focus`. No `width` field — AeroSpace auto-tiles, no explicit column sizing.

### Config Example (YAML)

```yaml
settings:
  integrations:
    aerospace:
      enabled: true
      workspace: "2"
      layout: h_tiles
      normalization: true
      flatten_before_open: true
      focus: true
      commands:
        - app: "Visual Studio Code"
        - app: kitty
          cwd: "$GS_WORKSPACE_PATH"
        - command: "open -a Firefox"
```

## open() Execution Sequence

Per CONTEXT.md D-05, the execution order is:

1. **Gate check** (existing Phase 44 code)
2. **Parse config** (extend Phase 44 parsing to include new fields)
3. **Validate workspace** (existing Phase 44 code)
4. **flatten_before_open** → call `flattenWorkspaceTree(targetWorkspace)` if enabled
5. **Move bag windows** (existing Phase 44 code — moves vscode/intellij windows)
6. **Launch commands** → process `commands[]` array with snapshot-delta detection:
   - For each command entry:
     - `source`: resolve window IDs from `bag[source]` artifact
     - `app`: spawn via `Bun.spawn(["open", "-a", app, ...args])` with `snapshotWindowIds()`
     - `command`: spawn via `Bun.spawn(["sh", "-c", cmd])` with `snapshotWindowIds()`
   - Move detected windows to target workspace via `moveNodeToWorkspace()`
   - Track window-level focus if `focus: true`
7. **Apply layout** → call `setLayout(layout, windowId)` targeting the workspace (AFTER all windows are placed)
8. **Focus** → call `focusWindow(windowId)` for window-level focus, then focus workspace if `focus: true`

### App Launching on macOS

AeroSpace is macOS-only. On macOS, launching apps uses:

- **`app` field**: `open -a "AppName"` (uses macOS `open` command)
  - With args: `open -a "AppName" --args arg1 arg2`
  - Example: `open -a "Visual Studio Code"` or `open -a kitty`
- **`command` field**: Direct shell execution via `sh -c "command"`
  - Example: `sh -c "open -a Firefox"`
- **`source` field**: Resolves from ArtifactBag — no spawning needed, just move existing windows

Since AeroSpace only runs on macOS, `open -a` is the standard way to launch apps. The `Bun.spawn` approach works cleanly:

```typescript
// For app entries
await snapshotWindowIds(async () => {
  const args = ["open", "-a", expandedApp]
  if (expandedArgs.length) args.push("--args", ...expandedArgs)
  Bun.spawn(args, { stdout: "ignore", stderr: "ignore" })
}, { _listWindows: listWindows })

// For command entries
await snapshotWindowIds(async () => {
  Bun.spawn(["sh", "-c", expandedCommand], {
    stdout: "ignore",
    stderr: "ignore",
    cwd: resolvedCwd,
  })
}, { _listWindows: listWindows })
```

**Key difference from niri**: Niri uses `niriSpawn` and `niriSpawnSh` which are niri-specific spawn wrappers. AeroSpace doesn't have its own spawn mechanism — apps are launched via standard macOS commands, and AeroSpace auto-tiles any new window that appears.

### Normalization-Aware Layout Commands

Per CONTEXT.md D-06 and D-07:

**When `normalization: true` (default):**
- `split` command is disabled by AeroSpace when normalization is enabled
- Use `flattenWorkspaceTree()` to reset tree, then `setLayout(layout)` to set root container layout
- This is the common case since AeroSpace enables normalization by default

**When `normalization: false`:**
- User has disabled normalization in `aerospace.toml`
- `split` works but is not used by git-stacks (per D-07 and Out of Scope in REQUIREMENTS.md)
- Use `setLayout(layout)` directly — works in both modes
- Flatten can still be used if configured

**Practical implication**: The `normalization` field doesn't change the commands git-stacks uses — `setLayout()` works in both modes. The field exists to document the user's AeroSpace configuration state. However, if we need to use `split`-based alternatives in the future for non-normalization setups, this field signals which code path to take.

For Phase 45 implementation:
- `normalization: true` path: `flattenWorkspaceTree()` + `setLayout(layout)`
- `normalization: false` path: `setLayout(layout)` directly (no flatten needed since user manages tree structure)
- The flatten step is separate from normalization — `flatten_before_open` is an explicit user choice

### Layout Application Targeting

The `setLayout` wrapper from Phase 43 supports `--window-id` targeting. To apply layout to the workspace root container:

- Focus a window in the target workspace first
- Call `setLayout(layout)` without `--window-id` — applies to the focused window's parent container
- Since we just moved/launched windows into the workspace, there will be focused windows there

Alternative: Use `flattenWorkspaceTree(workspace)` first (which resets to a flat tree), then `setLayout(layout)` which will set the now-flat root container's layout. This is the cleanest approach when `flatten_before_open` is enabled.

### Workspace Focus

Per CONTEXT.md D-05 step 5:
- `focus: true` at config level → switch AeroSpace to target workspace
- This requires a `focus` wrapper in Phase 43's `src/lib/aerospace.ts`

Checking Phase 43 plan: `focusWindow(windowId)` is available (focus --window-id). But there's no `focusWorkspace(workspace)` wrapper.

**Gap identified**: Phase 43 provides `focusWindow(windowId)` but not `focusWorkspace(workspace)`. To focus an AeroSpace workspace, we need to focus any window in that workspace. Strategy:

1. After all windows are placed, get the window list for the target workspace
2. Focus the first (or focused) window in that workspace
3. This effectively switches AeroSpace to show that workspace

Alternative: AeroSpace has `workspace <workspace-name>` command that switches to a workspace. But this isn't in the Phase 43 wrappers. We can either:
- Add a `focusWorkspace()` wrapper inline in the integration
- Use `focusWindow()` on a window known to be in the target workspace
- Use `_exec.run(["workspace", targetWorkspace])` directly from the integration

The simplest approach: import `_exec` from `../aerospace` and call `_exec.run(["workspace", targetWorkspace])` for workspace focus. Or add a dedicated helper.

**Decision for planner**: The integration should handle workspace focus by finding a window in the target workspace and calling `focusWindow()`, OR by calling `_exec.run(["workspace", targetWorkspace])` directly. Both work. The `_exec.run` approach is cleaner since it doesn't depend on having windows in the workspace.

Actually, reading Phase 43 more carefully: the `_exec` object is exported. So the integration can import it:

```typescript
import { _exec } from "../aerospace"
// ...
await _exec.run(["workspace", targetWorkspace])
```

This is clean and testable (tests can mock `_exec`).

## Test Strategy

### Test File Extension

Tests go in `tests/lib/integrations/aerospace.test.ts` (Phase 44 creates this file). Phase 45 adds test blocks for:

1. **Config schema parsing**: Verify extended schema accepts layout, normalization, flatten_before_open, focus, commands fields
2. **open() with layout**: Mock `setLayout`, verify called with correct layout value after window movement
3. **open() with flatten_before_open**: Mock `flattenWorkspaceTree`, verify called before window movement
4. **open() with focus**: Verify workspace focus is applied after setup
5. **open() with commands array**: Mock snapshot-delta, verify commands are launched and windows moved
6. **Normalization paths**: Test both `normalization: true` and `normalization: false` code paths
7. **expandVars**: Test environment variable expansion in command strings and cwd
8. **Partial failure**: Verify one failed command doesn't block others

### Mock Setup

The Phase 44 test file already mocks `src/lib/aerospace`. Phase 45 needs to add mocks for:
- `focusWindow()` — already in Phase 44 mock
- `setLayout()` — already in Phase 44 mock
- `flattenWorkspaceTree()` — already in Phase 44 mock
- `snapshotWindowIds()` — needs functional mock that returns new window IDs

## Validation Architecture

### Dimension 1: Unit Test Coverage
- Config schema parsing with all new fields (layout, normalization, flatten_before_open, focus, commands)
- open() execution order verified (flatten before move, move before commands, commands before layout, layout before focus)
- Commands array: app, command, source dispatch tested individually
- expandVars tested with GS_WORKSPACE_NAME, GS_WORKSPACE_BRANCH, GS_WORKSPACE_PATH
- Normalization true vs false code paths tested

### Dimension 2: Integration Contracts
- Extended config schema backward-compatible (workspace-only configs from Phase 44 still parse)
- All new aerospace.ts functions called with correct arguments

### Dimension 3: Error Handling
- Individual command launch failures don't block remaining commands
- Missing source in bag produces warning, continues
- Layout application failure doesn't block focus

### Dimension 4: Requirement Coverage
- LAYOUT-01: layout field applies root layout via setLayout()
- LAYOUT-02: normalization field controls flatten+layout vs layout-only paths
- LAYOUT-03: flatten_before_open calls flattenWorkspaceTree() before window placement
- LAYOUT-04: focus field switches to target workspace after setup
- LAUNCH-01: commands array launches arbitrary apps
- LAUNCH-02: launched command windows detected via snapshotWindowIds and moved

## RESEARCH COMPLETE
