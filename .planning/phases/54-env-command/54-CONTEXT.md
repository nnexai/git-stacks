# Phase 54: Env Command - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

New `git-stacks env [workspace]` command that shows all merged env vars a workspace would inject at open time. Supports multiple output formats and auto-detection from CWD.

</domain>

<decisions>
## Implementation Decisions

### Output scope
- **D-01:** Show everything merged: GS_* injected vars + user-defined `env:` from workspace YAML + resolved port vars. Full picture of what hooks/processes see at open time.

### Output formatting
- **D-02:** Default output format is **table** (human-readable aligned KEY VALUE columns)
- **D-03:** `--format shell` outputs `export KEY=value` lines (sourceable)
- **D-04:** `--format dotenv` outputs `KEY=value` lines (redirectable to .env file)
- **D-05:** `--format json` outputs a JSON object
- **D-06:** Quote values only when needed (spaces, quotes, special chars) in dotenv/shell formats

### Workspace detection
- **D-07:** Reuse existing `detectWorkspaceFromCwd()` from `workspace-ops.ts` — same logic used by `status`, `cd`, `install`, and integration commands
- **D-08:** `git-stacks env my-workspace` uses explicit workspace name; `git-stacks env` with no arg auto-detects from CWD

### Repo targeting
- **D-09:** Default output shows workspace-level base vars only (GS_WORKSPACE_* + user env + ports)
- **D-10:** `--repo <name>` flag adds that repo's GS_REPO_NAME, GS_REPO_PATH, GS_REPO_CLONE_PATH to the output
- **D-11:** If CWD is inside a specific repo worktree and no `--repo` flag given, auto-detect that repo and include its vars

### Claude's Discretion
- Table column widths and alignment
- Error messages for invalid workspace/repo names
- Whether to show a "source" column in table format indicating where each var comes from

### Folded Todos
- "Add git-stacks env command to show generated env vars" — directly maps to CMD-01/CMD-02

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Env computation logic
- `src/lib/workspace-ops.ts` — `mergeEnv()` (line 108), `buildBaseEnv()` (line 122), `buildRepoEnv()` (line 136), `writeEnvFiles()` (line 148), `detectWorkspaceFromCwd()` (line 1358)

### Command registration pattern
- `src/commands/workspace.ts` — Existing workspace subcommands; follow same patterns for `env` command
- `src/index.ts` — Top-level command registration

### Config reading
- `src/lib/config.ts` — `readWorkspace()` for loading workspace YAML

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mergeEnv(workspace)` — computes user env + resolved ports
- `buildBaseEnv(workspace, tasksDir, triggeredBy)` — adds GS_WORKSPACE_* vars
- `buildRepoEnv(baseEnv, repo)` — adds GS_REPO_* vars per repo
- `detectWorkspaceFromCwd(cwd?)` — returns `CwdDetectionResult` with workspace name and repo info

### Established Patterns
- Commands follow Commander.js pattern: create command in `src/commands/`, register in `src/index.ts`
- Options with constrained values use `.choices()` (being added in Phase 53)
- Workspace resolution: explicit arg → CWD detection → error

### Integration Points
- New command registered in `src/index.ts`
- Reuses workspace-ops.ts functions without modification
- Shell completions for `env` command workspace arg via completion-generator (after Phase 53 fixes)

</code_context>

<specifics>
## Specific Ideas

- The command is primarily a debugging/inspection tool — users want to verify what env their hooks see
- Should feel like a read-only preview of what `git-stacks open` would inject
- Table format should be the go-to for quick inspection; shell/dotenv/json for piping and scripting

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- "Extend install hooks to support Copilot" — Phase 55
- "Fix git-stacks list unsupported --status flag" — out of scope for v0.13.0

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 54-env-command*
*Context gathered: 2026-04-02*
