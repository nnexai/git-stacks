# Phase 45: Layout Control & App Launching - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend AeroSpace integration with layout control (root layout for workspace), normalization-aware command selection, flatten-before-open tree reset, workspace focus switching, and a commands array for launching arbitrary apps whose windows are detected and moved to the target workspace. AeroSpace auto-tiles windows into its tree — no explicit column positioning (unlike niri).

</domain>

<decisions>
## Implementation Decisions

### Config schema design
- **D-01:** Flat fields at integration config level, following AeroSpace's workspace-centric model. Extends Phase 44's minimal schema (workspace + enabled) with: `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`. All new fields optional with sensible defaults.
- **D-02:** Config shape:
  ```yaml
  aerospace:
    workspace: "2"            # target AeroSpace workspace (from Phase 44)
    layout: h_tiles           # root layout: h_tiles|v_tiles|h_accordion|v_accordion
    normalization: true       # default true; controls command selection strategy
    flatten_before_open: true # reset tree before placing windows
    focus: true               # focus workspace after setup
    commands:                 # apps to launch (auto-tiled by AeroSpace)
      - app: "Visual Studio Code"
      - app: kitty
        cwd: "$GS_WORKSPACE_PATH"
      - command: "open -a Firefox"
  ```

### Commands array structure
- **D-03:** Full niri parity for command entry fields: `app` (direct spawn), `command` (shell string), `source` (bag artifact reference), `repo` (resolves to task_path for cwd), `cwd` (explicit working directory), `args` (array for app mode), `focus` (boolean for window-level focus). Reuse niri's Zod schema shape for command entries to maintain consistency.
- **D-04:** Environment variable expansion in command strings and cwd fields (`$GS_WORKSPACE_NAME`, `$GS_WORKSPACE_BRANCH`, `$GS_WORKSPACE_PATH`), matching niri's `expandVars()` pattern.

### Execution sequencing
- **D-05:** `open()` execution order: flatten → move bag windows → launch commands → apply layout → focus.
  1. `flatten_before_open: true` → call `flattenWorkspaceTree()` to reset tree
  2. Move tier-1 windows (vscode/intellij) from ArtifactBag using `moveNodeToWorkspace()`
  3. Launch `commands` entries with `snapshotWindowIds()` delta detection + move to target workspace
  4. Apply root `layout` to workspace — AFTER all windows are placed so they tile correctly
  5. Apply `focus: true` → switch AeroSpace to target workspace; window-level focus via `focus --window-id`

### Normalization behavior
- **D-06:** Support both normalization paths:
  - `normalization: true` (default): uses `flattenWorkspaceTree()` + `layout` commands. This is the common case since AeroSpace enables normalization by default.
  - `normalization: false`: uses `split`-based alternatives for users who disable normalization in `aerospace.toml`. Both code paths tested.
- **D-07:** `split` command is disabled when normalization flatten is enabled in AeroSpace. The normalization config field exists so git-stacks knows which command strategy to use — it does NOT control AeroSpace's actual normalization setting (that's in aerospace.toml).

### Claude's Discretion
- Exact Zod schema field types and validation rules for new config fields
- Layout command arguments (may need `layout --workspace` targeting)
- snapshotWindowIds() usage pattern for commands (sequential or parallel launches)
- Error handling for failed command launches (warn and continue, matching niri)
- Spinner messaging during the multi-step open() sequence
- Whether `--json` flag on list commands should be preferred over `--format` TSV for internal use

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AeroSpace documentation
- https://nikitabobko.github.io/AeroSpace/guide — Tree/container model, normalization behavior, layout types
- https://nikitabobko.github.io/AeroSpace/commands — CLI command reference: layout, flatten-workspace-tree, split, join-with, move-node-to-workspace, focus, list-windows, list-workspaces with --format and --json

### Integration plugin pattern (primary template)
- `src/lib/integrations/niri.ts` — Direct template: open() with column layout, commands array processing (app/command/source/repo/cwd), snapshotWindowIds() usage, focus handling, spinner pattern, expandVars(), shellQuote()
- `src/lib/integrations/types.ts` — Integration interface, IntegrationContext, ArtifactBag

### Shell wrappers (consumed by this phase)
- `src/lib/aerospace.ts` — Phase 43 output: layout(), flattenWorkspaceTree(), focus(), moveNodeToWorkspace(), snapshotWindowIds(), listWorkspaces()

### Prior phase context
- `.planning/phases/44-core-integration-plugin/44-CONTEXT.md` — Phase 44 decisions: minimal config extended here, purely minimal open() extended here
- `.planning/phases/43-aerospace-shell-wrappers-doctor/43-CONTEXT.md` — Phase 43 decisions: wrapper scope, _exec pattern

### Requirements
- `.planning/REQUIREMENTS.md` — LAYOUT-01 through LAYOUT-04, LAUNCH-01, LAUNCH-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/niri.ts` open() method: Complete reference for multi-step open() with column layout, command processing, source/app/command dispatch, expandVars(), shellQuote(), spinner, focus handling
- `src/lib/aerospace.ts` (Phase 43): All wrappers consumed here — layout(), flattenWorkspaceTree(), focus(), moveNodeToWorkspace(), snapshotWindowIds()
- `src/lib/integrations/aerospace.ts` (Phase 44): Base integration plugin — extend config schema and open() method

### Established Patterns
- Niri's command entry schema (`niriWindowConfigSchema`): app, source, args, repo, cwd, command, focus — reuse for AeroSpace commands
- `expandVars()` pattern for environment variable substitution in commands/cwd
- `shellQuote()` for safe path interpolation
- Partial failure handling: warn and continue on individual command failures
- Spinner with ctx.silent guard

### Integration Points
- `src/lib/integrations/aerospace.ts`: Extend aerospaceConfigSchema with new fields, extend open() with layout/commands logic
- Existing tests: extend aerospace integration tests with layout and commands scenarios

</code_context>

<specifics>
## Specific Ideas

- AeroSpace auto-tiles windows into its tree — no need for explicit column positioning like niri. The config reflects this simpler model: set root layout, launch apps, AeroSpace handles placement.
- `--json` flag available on list commands — may be preferred over `--format` TSV for structured internal use (Claude's discretion to evaluate).
- `join-with` is the preferred container merging command when normalization is active (instead of `split`).

</specifics>

<deferred>
## Deferred Ideas

- **MULTI-01:** Multi-monitor window routing via `move-node-to-monitor` — deferred until multi-monitor patterns established
- **TOML-01:** Auto-detect normalization from `aerospace.toml` — deferred; user config field is simpler

</deferred>

---

*Phase: 45-layout-control-app-launching*
*Context gathered: 2026-03-28*
