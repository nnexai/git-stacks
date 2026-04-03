# Phase 43: AeroSpace Shell Wrappers & Doctor - Research

**Researched:** 2026-03-28
**Phase:** 43 — AeroSpace Shell Wrappers & Doctor

## Research Question

What do we need to know to plan typed AeroSpace CLI wrappers in `src/lib/aerospace.ts` with injectable `_exec`, platform-gated running detection, and `git-stacks doctor` binary check on macOS?

## AeroSpace CLI Command Reference

### Command: `list-windows`

**Syntax:**
```
aerospace list-windows [-h|--help] (--workspace <workspace>...|--monitor <monitor>...)
             [--monitor <monitor>...] [--workspace <workspace>...]
             [--pid <pid>] [--app-bundle-id <app-bundle-id>] [--format <output-format>]
             [--count] [--json]
aerospace list-windows [-h|--help] --all [--format <output-format>] [--count] [--json]
aerospace list-windows [-h|--help] --focused [--format <output-format>] [--count] [--json]
```

**Default format:** `%{window-id}%{right-padding} | %{app-name}%{right-padding} | %{window-title}`

**Format variables for windows:**
- `%{window-id}` (Number): Unique window identifier
- `%{window-title}` (String): Window title
- `%{window-is-fullscreen}` (Boolean): AeroSpace fullscreen status
- `%{window-layout}` / `%{window-parent-container-layout}` (String): Parent container layout
- `%{app-bundle-id}` (String): Application bundle identifier
- `%{app-name}` (String): Application name (can contain spaces, e.g. "Google Chrome")
- `%{app-pid}` (Number): Process ID
- `%{app-exec-path}` (String): Executable path
- `%{app-bundle-path}` (String): Bundle path
- `%{workspace}` (String): Workspace name
- `%{monitor-id}` (1-based Number): Monitor sequential number
- `%{monitor-name}` (String): Monitor name
- `%{right-padding}` (String): Auto-calculated spacing
- `%{tab}` (String): Literal tab character
- `%{newline}` (String): Literal newline character

### Command: `list-workspaces`

**Syntax:**
```
aerospace list-workspaces [-h|--help] --monitor <monitor>... [--visible [no]] [--empty [no]]
                [--format <output-format>] [--count] [--json]
aerospace list-workspaces [-h|--help] --all [--format <output-format>] [--count] [--json]
aerospace list-workspaces [-h|--help] --focused [--format <output-format>] [--count] [--json]
```

**Default format:** `%{workspace}`

**Format variables for workspaces:**
- `%{workspace}` (String): Workspace name
- `%{workspace-is-focused}` (Boolean): Whether workspace has focus
- `%{workspace-is-visible}` (Boolean): Whether workspace is visible
- `%{workspace-root-container-layout}` (String): Root container layout
- `%{monitor-id}` (1-based Number): Monitor index
- `%{monitor-name}` (String): Monitor name
- `%{monitor-is-main}` (Boolean): Whether monitor is primary

### Command: `move-node-to-workspace`

**Syntax:**
```
aerospace move-node-to-workspace [-h|--help] [--focus-follows-window] [--wrap-around]
                       [--stdin|--no-stdin] (next|prev)
aerospace move-node-to-workspace [-h|--help] [--focus-follows-window] [--fail-if-noop]
                       [--window-id <window-id>] <workspace-name>
```

**Key flags:**
- `--window-id <window-id>`: Target specific window by ID (critical for automation)
- `--focus-follows-window`: Move focus along with window
- `--fail-if-noop`: Exit with error if already in target workspace

### Command: `focus`

**Syntax:**
```
aerospace focus [-h|--help] [--ignore-floating] [--boundaries <boundary>]
      [--boundaries-action <action>] (left|down|up|right)
aerospace focus [-h|--help] --window-id <window-id>
aerospace focus [-h|--help] --dfs-index <dfs-index>
```

**Key for automation:** `--window-id <window-id>` to focus a specific window by ID.

### Command: `layout`

**Syntax:**
```
aerospace layout [-h|--help] [--window-id <window-id>]
       (h_tiles|v_tiles|h_accordion|v_accordion|tiles|accordion|
        horizontal|vertical|tiling|floating)...
```

**Layout types:**
- `h_tiles` / `v_tiles`: Horizontal/vertical tiling
- `h_accordion` / `v_accordion`: Horizontal/vertical accordion
- `tiles` / `accordion`: Change layout type without changing orientation
- `horizontal` / `vertical`: Change orientation without changing layout type
- `tiling` / `floating`: Toggle float/tile mode

**Behavior:** If multiple arguments provided, applies first layout that differs from current.

### Command: `flatten-workspace-tree`

**Syntax:**
```
aerospace flatten-workspace-tree [-h|--help] [--workspace <workspace>]
```

**Key flag:** `--workspace <workspace>` targets a specific workspace (defaults to focused).

## Key Differences from Niri

### Output Format

| Aspect | Niri | AeroSpace |
|--------|------|-----------|
| Output format | JSON via `niri msg -j` | TSV via `--format` with `%{tab}` separator |
| Parsing | `JSON.parse()` + Zod | Tab-split + Zod on parsed fields |
| Running detection | `NIRI_SOCKET` env var | `process.platform === "darwin"` + `which aerospace` |
| Command prefix | `niri msg action` | `aerospace` (direct CLI) |
| Window IDs | Numeric (from JSON) | Numeric (from `%{window-id}`) |
| Workspace refs | Name or index | Name only (string) |

### Parsing Strategy

AeroSpace uses `--format` with interpolation variables. For reliable tab-separated parsing:

```
--format '%{window-id}%{tab}%{app-name}%{tab}%{window-title}%{tab}%{app-pid}%{tab}%{workspace}'
```

Then split each line on `\t`. This avoids issues with spaces in app names (e.g., "Google Chrome", "Microsoft Edge").

For workspaces:
```
--format '%{workspace}%{tab}%{workspace-is-focused}%{tab}%{workspace-is-visible}%{tab}%{monitor-id}'
```

### _exec Pattern Adaptation

Niri uses `_exec.run(args: string[])` which maps to `niri msg ${args}`. For AeroSpace:

```typescript
export const _exec = {
  run: async (args: string[]): Promise<AerospaceCmdResult> => {
    const result = await $`aerospace ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}
```

The args array contains the subcommand and all flags. Example: `["list-windows", "--all", "--format", "%{window-id}%{tab}%{app-name}"]`.

## Doctor Check Pattern

Existing pattern in `src/commands/doctor.ts`:

```typescript
const binaries = [
  { name: "git", required: true, install: "https://git-scm.com" },
  { name: "code", required: false, install: "https://code.visualstudio.com" },
  // ...
]
```

AeroSpace should be added as a **macOS-only** entry. The existing binary check loop does not have platform gating, so either:

1. **Option A**: Add platform check inline before pushing the issue (simplest)
2. **Option B**: Extend the binary config with an optional `platform` field

Option A is simpler and consistent with the minimal change approach. The check becomes:

```typescript
if (process.platform === "darwin") {
  const aerospaceAvailable = await checkBinary("aerospace")
  binaryIssues.push({
    icon: aerospaceAvailable ? "pass" : "warn",
    entity: "aerospace",
    message: aerospaceAvailable ? "installed" : "not installed — AeroSpace window management unavailable",
    fix: aerospaceAvailable ? undefined : { action: "info", message: "Install: https://github.com/nikitabobko/AeroSpace" },
  })
}
```

On non-macOS, this block is skipped entirely — users never see AeroSpace in doctor output.

## Zod Schema Design

### AerospaceWindow

```typescript
const AerospaceWindowSchema = z.object({
  windowId: z.number(),
  appName: z.string(),
  windowTitle: z.string(),
  appPid: z.number(),
  workspace: z.string(),
})
```

### AerospaceWorkspace

```typescript
const AerospaceWorkspaceSchema = z.object({
  workspace: z.string(),
  isFocused: z.boolean(),
  isVisible: z.boolean(),
  monitorId: z.number(),
})
```

Boolean fields in `--format` output as literal strings "true"/"false", requiring parsing: `z.preprocess(v => v === "true" || v === true, z.boolean())` or a manual parse step before Zod.

## snapshotWindowIds Pattern

Same exponential-backoff strategy as niri.ts — snapshot before, poll after, return deltas. The injectable `_listWindows` parameter allows tests to control window appearance timing.

Key difference: AeroSpace `list-windows --all` is the equivalent of niri's `listNiriWindows()`.

## Exported Interface

Following `NiriCommands` pattern:

```typescript
export interface AerospaceCommands {
  isAerospaceRunning(): Promise<boolean>
  listWindows(): Promise<AerospaceWindow[]>
  listWorkspaces(): Promise<AerospaceWorkspace[]>
  moveNodeToWorkspace(windowId: number, workspace: string): Promise<void>
  focusWindow(windowId: number): Promise<void>
  setLayout(layout: string, windowId?: number): Promise<void>
  flattenWorkspaceTree(workspace?: string): Promise<void>
  snapshotWindowIds(spawnFn: () => Promise<void>, opts?: SnapshotOpts): Promise<number[]>
}
```

## Validation Architecture

### Dimension 1: Unit Test Coverage
- All 6 wrapper functions + `isAerospaceRunning` + `snapshotWindowIds` tested via `_exec` injection
- TSV parsing edge cases: multi-word app names, empty output, malformed rows, boolean parsing

### Dimension 2: Integration Contracts
- `AerospaceCommands` interface structural test (same pattern as `NiriCommands`)
- Doctor check produces correct Issue shape on macOS platform

### Dimension 3: Error Handling
- Non-zero exit codes return empty arrays (wrappers never throw)
- Malformed TSV rows are silently skipped
- Platform gate prevents any subprocess calls on non-macOS

### Dimension 4: Platform Behavior
- `isAerospaceRunning()` returns false on Linux (no subprocess spawned)
- Doctor binary check only appears on macOS
- All tests pass on Linux CI without `aerospace` binary

---

*Research completed: 2026-03-28*
*Sources: [AeroSpace Commands](https://nikitabobko.github.io/AeroSpace/commands), [AeroSpace GitHub](https://github.com/nikitabobko/AeroSpace), existing niri.ts and doctor.ts patterns*
