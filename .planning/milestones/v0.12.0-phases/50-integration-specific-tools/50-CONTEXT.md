# Phase 50: Integration Specific Tools - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add utility subcommands to `git-stacks integration` — config introspection (`config example`, `config show`), integration listing (`list`), and standalone actions (`aerospace focus`, `vscode open`). No new integrations are added; this extends the existing command surface.

</domain>

<decisions>
## Implementation Decisions

### Config introspection architecture
- **D-01:** Generic handler in `src/commands/integration.ts` — register `config` subcommand group once for ALL integrations. `config example` reads a new `configExample?: string` property from the `Integration` interface. `config show [workspace]` reads `globalConfig.integrations[id]` and workspace overrides via `resolveEnabled()`. Zero per-integration code needed for these commands.
- **D-02:** Integrations without a `configExample` string show a fallback message: `"No configuration example available for <id>. See: git-stacks integration <id> config show"`. Every integration gets `config example` — consistent, no surprises.

### Output format
- **D-03:** Both `integration list` and `config show` support `--json` flag for machine-readable output. Matches existing pattern (doctor, status, list all have `--json`).

### Standalone open/focus behavior
- **D-04:** `git-stacks integration vscode open <workspace>` calls `generate()` to create/update `.code-workspace` file, then `open()` with an empty ArtifactBag. No hooks, no other integrations. Reuses existing integration methods.
- **D-05:** `git-stacks integration aerospace focus <workspace>` resolves which AeroSpace workspace to focus: find the workspace entry with `focus: true`; if none has focus, use `workspaces[0]`. Mirrors runtime behavior in `open()` post-loop focus.

### Integration list
- **D-06:** `git-stacks integration list [workspace]` is a top-level subcommand on `integrationCommand`, registered directly alongside the per-integration subcommands. Not per-integration — it shows ALL integrations.
- **D-07:** Table columns: ID, Label, Enabled, Configured. Workspace-aware when argument provided (enabled column reflects workspace override cascade).

### Claude's Discretion
- Table formatting approach for `list` output (padEnd alignment vs library)
- Whether `config show` dumps raw YAML or formatted key-value pairs
- Error messages for missing workspace argument in focus/open commands
- Whether to add `configExample` strings to all 10 integrations in this phase or just the ones with non-trivial config (aerospace, niri, tmux, vscode)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Integration system
- `src/lib/integrations/types.ts` — `Integration` interface (add `configExample?: string`), `IntegrationContext`, `resolveEnabled()`, `resolveEnabledGlobally()`
- `src/lib/integrations/index.ts` — Plugin registry, all 10 integrations exported
- `src/lib/integrations/runner.ts` — Centralized runner (context for understanding IntegrationContext construction)

### Command structure (primary modification target)
- `src/commands/integration.ts` — Current integration command registration loop; extend with generic `config` subgroup and `list` subcommand

### Precedent: per-integration commands
- `src/lib/integrations/niri.ts` lines 327-338 — `focus-workspace` command pattern (direct template for aerospace focus)

### Integration implementations (add configExample + commands)
- `src/lib/integrations/aerospace.ts` — AeroSpace integration; add `focus` command and `configExample`
- `src/lib/integrations/vscode.ts` — VSCode integration; add standalone `open` command and `configExample`

### Config I/O
- `src/lib/config.ts` — `readWorkspace()`, `readGlobalConfig()`, Zod schemas
- `src/lib/paths.ts` — Path constants for workspace/config file resolution

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveEnabled()` / `resolveEnabledGlobally()` in `types.ts` — already resolves the global→template→workspace cascade; reuse for `list` and `config show`
- `readWorkspace()` / `readGlobalConfig()` in `config.ts` — existing YAML I/O for building IntegrationContext
- Niri `focus-workspace` command — direct template for aerospace focus implementation
- `integration.ts` registration loop — extend with generic subcommands

### Established Patterns
- Per-integration `commands(parent: Command)` method — aerospace and vscode will add their own action commands here
- `--json` output via `opts.json ? JSON.stringify(...) : formatTable(...)` — consistent across doctor, list, status
- `.padEnd()` manual table formatting — used in workspace list, doctor output

### Integration Points
- `src/commands/integration.ts` — main modification target; currently 13 lines, will grow with generic handlers
- `Integration` interface in `types.ts` — add `configExample?: string` property
- Each integration file that gains `configExample` — string property addition only

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 50-integration-specific-tools*
*Context gathered: 2026-04-01*
