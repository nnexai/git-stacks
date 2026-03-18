# Phase 4: UX and Execution - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the tool communicate clearly and work well with scripts and agents: contextual error messages with recovery hints, `--json` output for `status`/`doctor`/`sync`, a `doctor --fix` flag to auto-execute repairs, richer `list` columns by default, and `run --parallel` for concurrent command execution across repos. No new workspace or registry capabilities — this phase is purely observability, UX polish, and execution mechanics.

</domain>

<decisions>
## Implementation Decisions

### Error message format (UX-01)

- Style: `error:` prefix line, followed by `  → <recovery hint>` on the next line — same visual style doctor already uses for fix suggestions
- Only include a recovery hint when there is a **specific, actionable fix** available — do not invent generic hints
- Git operation failures: translate to a human-readable message, include the raw git error in parentheses for debugging
  e.g., `error: Could not create worktree for 'api' (branch 'feature/auth' already exists)\n  → delete with: git branch -d feature/auth`
- A shared `formatError(message: string, hint?: string): string` helper lives in `src/lib/` — all commands use it instead of ad-hoc `console.error` strings
- `console.error(formatError(...))` + `process.exit(1)` remains the execution pattern — no changes to error flow, just the message content

### --json output shape (UX-02)

**`git-stacks status --json`** — Array of workspace objects with full per-repo detail:
```json
[
  {
    "name": "feat-auth",
    "branch": "feature/auth",
    "template": "my-app",
    "repos": [
      {
        "name": "api",
        "mode": "worktree",
        "branch": "feature/auth",
        "exists": true,
        "dirty": false,
        "task_path": "~/workspaces/tasks/feat-auth/api"
      }
    ]
  }
]
```

**`git-stacks doctor --json`** — Mirrors the existing `Issue` interface exactly:
```json
{
  "healthy": false,
  "issues": [
    {
      "icon": "fail",
      "entity": "feat-auth",
      "message": "task_path missing: ~/workspaces/tasks/feat-auth/api",
      "fix": "git-stacks open feat-auth"
    }
  ]
}
```
`healthy: true` when `issues` array is empty.

**`git-stacks sync --json`** — Per-repo sync results:
```json
{
  "workspace": "feat-auth",
  "repos": [
    {
      "name": "api",
      "strategy": "rebase",
      "result": "rebased",
      "commits_behind_before": 3,
      "error": null
    }
  ]
}
```
`result` values: `"up-to-date" | "rebased" | "merged" | "failed"`

### doctor --fix behavior (UX-03)

- Prints all issues first (same format as normal doctor output), then asks: `N fixes available. Execute all? [y/N]`
- Single confirmation for all — no per-issue prompting
- `--fix --force` skips the confirmation (consistent with Phase 2 `--force` pattern)
- On partial failure: **continue past failures**, report all results at the end — `"N fixed, M failed"` summary
- Issues **without** a `fix` command (warn-only, e.g., stale cmux refs): shown with `(no auto-fix — manual action needed)` annotation, not silently hidden

### list richer columns by default (UX-04)

Default columns: **name**, **branch**, **repo count**, **last-opened time**, **dirty indicator** — no extra flags required.

`getWorkspaceListInfo` already returns `worktreeCount` + `trunkCount` — "repo count" is their sum. "Last-opened time" vs current "created" age: workspace YAML currently only has `created` timestamp; a `last_opened` field may need to be added to the schema and updated on `open`. `--status` flag retained for backward compatibility. Implementation approach for dirty check performance and `last_opened` tracking is Claude's discretion.

### run --parallel output (RUN-01)

- Current `run` command: `git-stacks run <name> [repo] -- <cmd>` with `--all-repos` for sequential execution across all repos. `--parallel` is a new flag that adds concurrent execution (replaces `--all-repos` semantics but runs simultaneously instead of sequentially)
- Each repo gets a spinner line while running; spinner resolves to `✓ (exit 0)` or `✗ (exit N)` on completion
- Output for **failed repos only** is flushed after all spinners resolve, grouped by repo with a `——— <repo> ———` header
- Passing repos: output is discarded (the exit code + spinner tells you it passed)
- Aggregated exit code: **exit 1 if any repo failed**, exit 0 if all pass — simple binary, works correctly in CI/scripts
- `run --parallel --json` emits per-repo result array: `[{ "repo": "api", "exit_code": 0, "stdout": "...", "stderr": "" }]`
- `--json` mode: suppress spinners, emit JSON to stdout at the end

### Claude's Discretion

- Exact dirty-check strategy for `list` default columns (always sync, deferred/cached, or "?" placeholder with background check)
- `formatError()` function signature details and location in `src/lib/`
- Spinner library/approach for `run --parallel` (Bun's spawn + @clack/prompts spinner, or direct terminal control)
- Whether `--fix --force` is a flag combination or `doctor` gets a standalone `--force` option

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §UX-01 — Error message requirements (context + recovery action)
- `.planning/REQUIREMENTS.md` §UX-02 — `--json` output for status, doctor, sync
- `.planning/REQUIREMENTS.md` §UX-03 — `doctor --fix` flag requirements
- `.planning/REQUIREMENTS.md` §UX-04 — `list` richer default columns
- `.planning/REQUIREMENTS.md` §RUN-01 — `run --parallel` requirements

### Prior phase patterns to follow
- `.planning/phases/02-safety/02-CONTEXT.md` — `--force` + `--dry-run` + `p.confirm` pattern (Phase 2); `doctor --fix --force` must follow this
- `.planning/phases/03-design-and-conditional-implementation/03-CONTEXT.md` — Registry + Template model; `git-stacks status --json` repos use `repo` field (registry name), not stack name

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `doctor.ts` `Issue` interface: already has `{ icon, entity, message, fix? }` — `--json` mirrors this directly; `--fix` just executes the `fix` strings
- `list` command in `workspace.ts`: already has `--json` and `--status` flags, `getWorkspaceListInfo()` helper — extend rather than rewrite
- `@clack/prompts` `p.confirm`: already used in Phase 2 destructive ops — use same pattern for `doctor --fix` confirmation

### Established Patterns
- Error pattern: `console.error(...)` + `process.exit(1)` in commands — keep this flow, upgrade message content via `formatError()`
- `opts: { force?: boolean }` shape on ops functions (Phase 2) — `doctor --fix --force` follows same shape
- `onProgress` callback pattern on workspace-ops — use for `run --parallel` progress reporting if needed

### Integration Points
- `src/commands/workspace.ts` — add `--json` to `status` and `sync` commands; update `list` default columns
- `src/commands/doctor.ts` — add `--fix` and `--json` flags; `--fix` executes `issue.fix` commands via `Bun.spawn` or `$`
- `src/commands/workspace.ts` `run` command — add `--parallel` and `--json` flags; implement concurrent execution
- `src/lib/` — add `formatError(message, hint?)` helper used by all commands
- All command files — replace raw `console.error("...")` strings with `console.error(formatError(...))`

</code_context>

<specifics>
## Specific Ideas

- The `run --parallel` spinner output style mirrors the preview accepted: spinners per repo, then failed-repo output flushed at the bottom with `——— <repo> ———` separator
- `doctor --fix` confirmation prompt style matches the accepted preview: list issues + fix commands first, then `N fixes available. Execute all? [y/N]`
- `git-stacks status --json` per-repo objects should include `task_path` (full path) so agents can reference the worktree directory directly

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-ux-and-execution*
*Context gathered: 2026-03-18*
