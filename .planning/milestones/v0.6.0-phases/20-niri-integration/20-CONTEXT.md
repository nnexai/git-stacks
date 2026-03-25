# Phase 20: niri-integration - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the niri compositor integration as a tier-3 integration plugin. On `git-stacks open`: create/reuse a named niri workspace, switch to it, move prior integration windows onto it, and optionally run user-configured commands. Gated by NIRI_SOCKET presence.

</domain>

<decisions>
## Implementation Decisions

### Integration Architecture
- Integration id: `niri`, order: `30` (tier 3 — runs after all other integrations)
- Follows the standard Integration interface pattern from `src/lib/integrations/types.ts`
- No `generate()` method needed — niri has no file artifacts
- `open()` consumes ArtifactBag from prior integrations (tmux session name, window PIDs)
- Registered in `src/lib/integrations/index.ts` alongside existing integrations

### Workspace Setup Flow
- Create/reuse named niri workspace via `setNiriWorkspaceName()` (NIRI-01)
- Focus/switch to the named workspace so new windows open there naturally
- Move windows from prior integrations using PID matching from artifact bag (NIRI-02, NIRI-07)
- No hardcoded terminal spawn — user configures arbitrary commands via `commands` config array

### Configuration
- Config schema: `{ enabled: boolean, commands?: string[] }`
- `commands` is an optional array of shell commands to run after workspace creation
- Commands receive hook env vars (WS_WORKSPACE, WS_BRANCH, etc.) — same as hook system
- Empty by default — user sets up their own terminal/window spawning
- Example: `["ghostty -e tmux attach -t ${WS_WORKSPACE}"]`

### Idempotency (NIRI-04)
- On re-open: check if named workspace already exists
- Skip workspace creation if exists, but still move any new windows from artifact bag
- User-configured commands still run on re-open (user's responsibility to make them idempotent)

### Cleanup
- No cleanup on remove — niri workspace naming persists
- User manages workspace cleanup manually

### Gating (NIRI-08)
- Return early with null if `!process.env.NIRI_SOCKET` — silent skip, no error, no log
- Standard `isEnabled()` check via resolveEnabled pattern

### Claude's Discretion
- Internal implementation details of window matching/moving
- Error handling strategy for individual window move failures (recommend: log warning, continue)
- Whether to use snapshotWindowIds for command-spawned windows

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/niri.ts` — 8 typed IPC wrappers (isNiriRunning, listNiriWindows, listNiriWorkspaces, setNiriWorkspaceName, moveWindowToWorkspace, niriSpawn, focusNiriWorkspace, snapshotWindowIds) — Phase 19
- `src/lib/integrations/types.ts` — Integration interface, IntegrationContext, ArtifactBag, IntegrationArtifact, WindowArtifact
- `src/lib/integrations/runner.ts` — runIntegrations() builds ArtifactBag, sorts by order
- `src/lib/lifecycle.ts` — runHooks() for executing shell commands with env vars

### Established Patterns
- Integration plugins: see vscode.ts, tmux.ts as reference implementations
- Config parsing: Zod schema + resolveEnabled pattern
- ArtifactBag: `Record<string, IntegrationArtifact | null>`, keyed by integration id
- WindowArtifact: `{ kind: "window", pid: number, app_id: string, title: string }`
- TmuxArtifact: `{ kind: "tmux", sessionName: string }`
- mock.module + _exec injection for niri.ts test mocking

### Integration Points
- Register in src/lib/integrations/index.ts
- workspace-ops.ts openWorkspace() already calls runIntegrations() with skip set
- workspace-ops.ts removeWorkspace() needs niri cleanup hook (but user chose no cleanup)

</code_context>

<specifics>
## Specific Ideas

- User wants workflow: create niri workspace → switch to it → windows opened by subsequent commands naturally land on it
- Commands array replaces the previous "terminal emulator" config — more flexible, user controls what runs

</specifics>

<deferred>
## Deferred Ideas

- Cleanup on remove (user may want this later — add as config toggle)
- Per-workspace niri layout configuration (column widths, floating positions) — v0.7.0+
- Aerospace (macOS) compositor integration using same tier-3 pattern

</deferred>
