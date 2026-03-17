# Phase 2: Safety - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Destructive operations (remove, clean, merge, rename) gain dry-run, confirmation prompts, and consistent --force behavior. Users can safely inspect what will happen before it does. No new commands — only safety guarantees added to existing ones.

</domain>

<decisions>
## Implementation Decisions

### Dry-run output format
- All four commands (remove, clean, merge, rename) support `--dry-run`
- Output format: same lines as live execution, each prefixed with `[dry-run]`
- Trailing summary line: `"Dry run complete. No changes made."` always printed at the end
- Confirmation prompt (`p.confirm`) is skipped entirely in dry-run mode — no need to confirm something that won't execute

### --force semantics (SAFE-03)
- `--force` suppresses the confirmation prompt on ALL destructive commands identically
- Applies to: remove, clean, merge, rename
- `--force` also skips dirty-worktree check (existing behavior, unchanged)
- Current inconsistency: all three commands always show `p.confirm` even with `--force` — this is fixed

### rename command
- Add a confirmation prompt: `"Rename 'foo' → 'bar'?"` (consistent with remove/clean/merge)
- Add `--force` flag: skips the confirmation prompt
- Add `--dry-run` flag: same annotated `[dry-run]` output format, shows would-re-register-worktrees and would-rename-config lines

### External file warnings (FILES-16, FILES-17)
- `warnExternalFiles()` warns about file/symlink destinations that were placed outside the workspace root by Phase 01.1 file ops
- Warning format: path only — one line per external destination using the target-level path (folder path for folder targets, file path for file targets — do NOT expand folders to individual files)
- Example: `Warning: external destination /home/user/.secrets was not removed`
- Called by `removeWorkspace()` and `cleanWorkspace()` before teardown
- Warnings appear in BOTH dry-run and real runs (SAFE-01 explicitly requires external file warnings in dry-run output)

### merge --dry-run depth
- Run the read-only conflict pre-check (`getMergeConflicts`) — it's already read-only, running it in dry-run adds real value
- If conflicts detected: report them as conflicts (same as live run), still print summary
- If no conflicts: list ALL planned actions with `[dry-run]` prefix:
  - `[dry-run] would merge <branch> into <base> (repo-name)`
  - `[dry-run] would remove worktree: /path/to/worktree`
  - `[dry-run] would delete branch: <branch> (repo-name)`
  - `[dry-run] would delete config: workspaces/<name>.yml`

### Claude's Discretion
- Exact hook behavior in dry-run (skip hooks entirely, or list them as "would run: <cmd>"?)
- Whether `clean --gone --dry-run` is in scope or deferred

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Safety requirements
- `.planning/REQUIREMENTS.md` §SAFE-01, SAFE-02, SAFE-03 — Full requirement text for all three safety requirements
- `.planning/REQUIREMENTS.md` §FILES-16, FILES-17 — External file warning function spec and integration point

### Existing implementation
- `src/commands/workspace.ts` — Current remove, clean, merge, rename command definitions with existing --force and p.confirm usage
- `src/lib/workspace-ops.ts` — cleanWorkspace, removeWorkspace, mergeWorkspace, renameWorkspace implementations
- `src/lib/files.ts` — Existing file ops engine (applyEntry, applyFileOpsForRepo, applyFileOpsForWorkspace) — warnExternalFiles() goes here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `p.confirm` from `@clack/prompts`: already used in workspace.ts for confirmation — pattern is established
- `onProgress` callback: all workspace-ops functions accept this for progress reporting — dry-run output can use the same callback mechanism with `[dry-run]` prefix
- `getDirtyWorktrees()`: already called in cleanWorkspace/removeWorkspace/mergeWorkspace before --force check

### Established Patterns
- `opts: { force?: boolean }` on workspace-ops functions: the parameter shape is consistent — adding `dryRun?: boolean` follows the same pattern
- Stage-then-commit pattern in removeWorkspace/cleanWorkspace (BUG-02 fix): dry-run sits before the "stage" phase — collect what would be staged and return early
- `ApplyResult` type in files.ts: `{ ok: true; warnings?: string[] } | { ok: false; error: string }` — warnExternalFiles should return a similar warnings array

### Integration Points
- Confirmation prompts live in `commands/workspace.ts`, NOT in `workspace-ops.ts` — the ops layer is prompt-free and takes `opts.force`. Dry-run flag should follow the same separation.
- `workspace-ops.ts` functions are called from workspace.ts command handlers — dry-run can be implemented in the ops layer (returning early, printing actions) with the command layer passing `opts.dryRun`
- `mergeWorkspace` already runs conflict pre-check before any destructive action — dry-run hooks naturally into the gap between pre-check and the actual merge

</code_context>

<specifics>
## Specific Ideas

- External file warnings: target-level paths only (folder → warn folder, not each file inside). No expanded file lists.
- rename: user explicitly wants --dry-run added even though SAFE-01 doesn't list it — add for completeness, same [dry-run] format
- dry-run and confirmation interaction: --dry-run skips p.confirm entirely (it's implied you're just inspecting)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-safety*
*Context gathered: 2026-03-18*
