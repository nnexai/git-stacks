# Phase 37: Agent Path Discovery - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

New `git-stacks paths [workspace]` command that outputs workspace repo paths (one per line) for direct injection into agent CLI invocations. Supports `--prefix` for flag prepending and CWD-based workspace autodetection.

</domain>

<decisions>
## Implementation Decisions

### Output format
- **D-01:** One path per line on stdout, no quoting — raw paths, caller handles quoting
- **D-02:** `--prefix` is space-separated from path (e.g., `--add-dir /home/user/repo`)
- **D-03:** No `--json` flag — keep command minimal; agents needing structured data use `git-stacks list --json`

### Filtering
- **D-04:** Add `--filter worktree|trunk` flag to narrow output by repo mode
- **D-05:** No `--repo <name>` flag — agents can grep output if they need a single repo

### Path selection (from requirements)
- **D-06:** Worktree repos emit `task_path`, trunk repos emit `main_path`
- **D-07:** Missing `task_path` repos skipped with stderr warning (non-fatal)

### CWD autodetection (from requirements)
- **D-08:** `git-stacks paths` without arguments autodetects workspace from cwd using existing `resolveWorkspaceArg()` pattern

### Claude's Discretion
- Exit code strategy (0 for success, non-zero for errors/all-skipped)
- Stderr warning format for skipped repos
- Whether `--filter` applies before or after path resolution (logically equivalent, implementation detail)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Command patterns
- `src/commands/workspace.ts` -- Existing workspace command registration pattern; follow for `paths` subcommand
- `src/lib/workspace-ops.ts` -- `resolveWorkspaceArg()` for CWD autodetection; workspace repo iteration

### Config and schemas
- `src/lib/config.ts` lines 104-105 -- `WorkspaceRepoSchema` defines `main_path` and `task_path` fields
- `src/lib/paths.ts` -- Path constants and helpers (single source of truth)

### Requirements
- `.planning/REQUIREMENTS.md` -- PATH-01 through PATH-04 acceptance criteria

### Shell completion
- `src/lib/completion-generator.ts` -- Auto-generates completions from Commander tree; new command auto-picked up

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveWorkspaceArg()` in `src/lib/workspace-ops.ts` -- shared helper for CWD-based workspace detection; already used by issue trackers
- `readWorkspace()` in `src/lib/config.ts` -- reads workspace YAML with Zod validation; provides `repos[]` with `main_path` and `task_path`
- `listWorkspaces()` in `src/lib/config.ts` -- lists all workspace names

### Established Patterns
- Commander.js command registration in `src/commands/workspace.ts` with `registerWorkspaceCommands(program)`
- Options use `.option()` with short and long flags
- Shell completion auto-generated from Commander tree (no manual work)
- `console.log()` for stdout output, `console.error()` for warnings

### Integration Points
- Register `paths` as a subcommand under the workspace command group in `src/commands/workspace.ts`
- Use existing `readWorkspace()` to get repo list with paths
- CWD detection via `resolveWorkspaceArg()` — same pattern as issue tracker commands

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 37-agent-path-discovery*
*Context gathered: 2026-03-26*
