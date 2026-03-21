# Phase 2: Safety - Research

**Researched:** 2026-03-18
**Domain:** TypeScript CLI safety patterns — dry-run, confirmation prompts, --force flags
**Confidence:** HIGH

## Summary

Phase 2 adds safety guarantees to four destructive commands: `remove`, `clean`, `merge`, and `rename`. The work is pure augmentation — no new commands, no new data structures, only new option flags and branching logic added to existing code paths. The entire implementation lives in two files: `src/commands/workspace.ts` (command definitions, prompt gating) and `src/lib/workspace-ops.ts` (ops functions extended with `dryRun?: boolean`). A third file, `src/lib/files.ts`, receives a new export `warnExternalFiles()`.

The codebase already has the full pattern established: `opts: { force?: boolean }` is passed through workspace.ts into workspace-ops.ts functions, and `onProgress` callbacks carry output back up. Adding `dryRun?: boolean` to each opts object and threading it through is a mechanical, low-risk extension. The key design insight from CONTEXT.md is that confirmation prompts live in the command layer (workspace.ts), not the ops layer — dry-run likewise belongs to the command layer for skipping prompts, but the ops layer needs `dryRun` to short-circuit execution after planning its actions.

The only meaningfully complex piece is `warnExternalFiles()` in files.ts, which must determine which resolved file destinations fall outside the workspace root. This is a pure read operation: it inspects the workspace's `files` and per-repo `files` entries, resolves their destinations against known base directories, and checks whether each resolved destination is under the workspace root or task directory. It produces warnings but does not modify anything — making it safe to call in both dry-run and real runs.

**Primary recommendation:** Extend each ops function signature with `dryRun?: boolean`, short-circuit with `[dry-run]`-prefixed `onProgress` messages before execution, and gate `p.confirm` in workspace.ts with `if (!opts.force && !opts.dryRun)`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dry-run output format**
- All four commands (remove, clean, merge, rename) support `--dry-run`
- Output format: same lines as live execution, each prefixed with `[dry-run]`
- Trailing summary line: `"Dry run complete. No changes made."` always printed at the end
- Confirmation prompt (`p.confirm`) is skipped entirely in dry-run mode

**--force semantics (SAFE-03)**
- `--force` suppresses the confirmation prompt on ALL destructive commands identically
- Applies to: remove, clean, merge, rename
- `--force` also skips dirty-worktree check (existing behavior, unchanged)
- Current inconsistency: all three commands always show `p.confirm` even with `--force` — this is fixed

**rename command**
- Add a confirmation prompt: `"Rename 'foo' → 'bar'?"`
- Add `--force` flag: skips the confirmation prompt
- Add `--dry-run` flag: same annotated `[dry-run]` output format, shows would-re-register-worktrees and would-rename-config lines

**External file warnings (FILES-16, FILES-17)**
- `warnExternalFiles()` warns about file/symlink destinations that were placed outside the workspace root or task directory by Phase 01.1 file ops
- Warning format: path only — one line per external destination using the target-level path (folder path for folder targets, file path for file targets — do NOT expand folders to individual files)
- Example: `Warning: external destination /home/user/.secrets was not removed`
- Called by `removeWorkspace()` and `cleanWorkspace()` before teardown
- Warnings appear in BOTH dry-run and real runs

**merge --dry-run depth**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAFE-01 | `remove`, `clean`, and `merge` support `--dry-run` flag that shows what would be done without making changes — output includes any external file destinations that would be left behind with a warning | Ops-layer `dryRun` flag pattern + `warnExternalFiles()` design below |
| SAFE-02 | `remove` and `clean` without `--force` prompt for confirmation before executing destructive operations | `p.confirm` gating pattern already exists; fix is to move it before the ops call and condition on `!opts.force` |
| SAFE-03 | `--force` flag behavior is consistent across all destructive commands (`remove`, `clean`, `merge`, `rename`) | Commander `.option("--force", ...)` added to `rename`; prompt gating unified |
| FILES-16 | `files.ts` exposes `warnExternalFiles()` that inspects resolved file destinations and emits warnings for any outside workspace root/task dir | New export in files.ts, pure read operation |
| FILES-17 | `warnExternalFiles()` is called by `removeWorkspace()` and `cleanWorkspace()` before teardown | Integration point in workspace-ops.ts |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@clack/prompts` | already installed | `p.confirm()` for interactive confirmations | Already used in workspace.ts; `p.isCancel()` pattern established |
| `commander` | already installed | `.option("--dry-run")`, `.option("--force")` flag registration | Already the CLI framework for all commands |
| `bun:test` | built-in | Unit tests for new logic | Project standard; all existing tests use it |

No new dependencies required. This phase is pure augmentation of existing code.

**Version verification:** No new packages — all libraries already installed.

## Architecture Patterns

### Layer Separation (Established Pattern)

The codebase enforces a strict two-layer separation:

```
commands/workspace.ts     <- prompt gating, flag parsing, user I/O
lib/workspace-ops.ts      <- pure operations, no prompts, uses onProgress callback
```

This separation MUST be maintained. Dry-run flag follows the same pattern as `force`.

### Opts Object Extension Pattern

All four ops functions currently accept `opts: { force?: boolean }`. Extend consistently:

```typescript
// Source: src/lib/workspace-ops.ts (existing pattern)
export async function cleanWorkspace(
  name: string,
  opts: { force?: boolean; dryRun?: boolean },  // ADD dryRun here
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }>
```

The same extension applies to `removeWorkspace`, `mergeWorkspace`, and `renameWorkspace`.

### Dry-Run Short-Circuit Pattern

Insert after dirty-worktree check and `warnExternalFiles()`, before any mutation:

```typescript
// Dry-run short-circuit — after read-only checks, before any mutation
if (opts.dryRun) {
  // Emit [dry-run] prefixed lines for every action that would execute
  for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
    if (!existsSync(repo.task_path)) continue
    onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
  }
  onProgress?.(`[dry-run] would delete config: workspaces/${name}.yml`)
  onProgress?.("Dry run complete. No changes made.")
  return { ok: true }
}
```

### Prompt Gating Pattern (Command Layer)

Current code in workspace.ts always shows `p.confirm` even with `--force`. Fix:

```typescript
// BEFORE (broken):
const ok = await p.confirm({ message: `...` })
if (p.isCancel(ok) || !ok) { console.log("Cancelled."); return }
const result = await removeWorkspace(name, opts, ...)

// AFTER (correct):
if (!opts.force && !opts.dryRun) {
  const ok = await p.confirm({ message: `Permanently remove workspace '${name}' (worktrees + config)?`, initialValue: false })
  if (p.isCancel(ok) || !ok) { console.log("Cancelled."); return }
}
const result = await removeWorkspace(name, opts, ...)
```

The same fix applies to `clean` and `merge` command handlers. The `rename` command currently has NO prompt and NO `--force` — both are added.

### Commander Flag Registration Pattern

```typescript
// Add to remove command:
program
  .command("remove <name>")
  .option("--force", "Skip dirty worktree check and confirmation")
  .option("--dry-run", "Show what would be done without making changes")
  .action(async (name: string, opts: { force?: boolean; dryRun?: boolean }) => { ... })

// Add to rename command (currently has NEITHER --force NOR --dry-run):
program
  .command("rename <old> <new>")
  .option("--force", "Skip confirmation prompt")
  .option("--dry-run", "Show what would be done without making changes")
  .action(async (oldName: string, newName: string, opts: { force?: boolean; dryRun?: boolean }) => { ... })
```

Note: Commander camelCases `--dry-run` to `dryRun` automatically.

### warnExternalFiles() Design

New export in `src/lib/files.ts`. The function must determine which resolved file destinations fall outside the workspace boundaries.

**What counts as "internal":** destination is under the `tasksDir/<wsName>/` directory (for workspace-level files) or under `repo.task_path` (for per-repo files).

**What counts as "external":** destination resolves to an absolute path outside those boundaries — e.g., `~/.secrets`, `/etc/something`, `/home/user/.gitconfig`.

```typescript
// Proposed signature — pure read operation, returns warnings array
export function warnExternalFiles(
  workspace: Workspace,
  stacks: Map<string, Stack>,
  wsInstanceRoot: string,
  tasksDir: string
): string[]
```

The function reconstructs what `applyFileOpsForWorkspace` and `applyFileOpsForRepo` would have resolved as destinations, filters those outside the workspace root, and returns a warning string per external destination.

**Determination logic:** For absolute paths and `~/` paths in `files.symlink` and `files.copy`, the resolved destination will be `join(destDir, basename(expandHome(entry)))`. If this destination is NOT prefixed by `wsInstanceRoot` or `repo.task_path`, it is external. For glob entries, use `expandGlob` to find matches and check each.

**Target-level paths only:** if `~/.secrets` is a directory, warn `Warning: external destination /home/user/.secrets was not removed` — do NOT expand to individual files inside it.

### renameWorkspace Dry-Run Actions

Rename is non-destructive relative to git history, but does re-register worktrees and mutates config:

```
[dry-run] would re-register worktree: /old/path -> /new/path (repo-name)
[dry-run] would rename config: oldName.yml -> newName.yml
Dry run complete. No changes made.
```

### Hook Behavior in Dry-Run (Claude's Discretion)

**Recommendation:** Skip hooks entirely in dry-run mode. Hooks are shell commands that may have side effects; listing them as "would run" could be misleading if they're complex scripts. The simpler, safer choice is to skip them silently in dry-run. The planner may add a `[dry-run] would run hook: <cmd>` informational line if desired, but this is optional.

**Rationale:** The user's goal with `--dry-run` is to verify file/git state changes, not hook execution. Hooks are already visible in the workspace YAML.

### clean --gone --dry-run (Claude's Discretion)

**Recommendation:** Defer `clean --gone --dry-run` to a follow-up. The `--gone` path in workspace.ts is a separate code branch with its own loop over all workspaces, remote branch checking, and batch removal. Adding dry-run support there is parallel work that doesn't affect SAFE-01 (which specifically lists `remove`, `clean <name>`, and `merge`). The named `clean <name>` path is in scope; the `--gone` variant is deferred.

### Anti-Patterns to Avoid

- **Prompts in the ops layer:** `p.confirm` must remain in workspace.ts only. The ops layer must stay prompt-free.
- **Duplicate dry-run paths:** Do not create separate dry-run functions. Extend the existing functions with the `dryRun` flag — same function, early-return path.
- **Running hooks in dry-run:** Hook execution in dry-run defeats the purpose. Skip hooks when `opts.dryRun` is true.
- **warnExternalFiles expanding folders:** Only emit one warning per target path. Do not recursively list files inside an external directory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation prompts | Custom readline/stdin prompt | `p.confirm` from `@clack/prompts` | Already in use, handles cancel signal, consistent UX |
| Flag parsing | Manual argv inspection | Commander `.option("--dry-run")` | Already the CLI framework; auto-camelCases options |
| Path existence checks for symlinks | `existsSync` | `lstatSync` from existing `dstExists()` in files.ts | `existsSync` returns false for dangling symlinks; `lstatSync` correctly detects them |

## Common Pitfalls

### Pitfall 1: --force Does Not Skip p.confirm Today

**What goes wrong:** The current code calls `p.confirm` before `removeWorkspace(name, opts, ...)` unconditionally. `--force` is passed to the ops layer but the prompt is shown regardless. The bug is in workspace.ts, not workspace-ops.ts.

**Why it happens:** The `force` flag was designed to skip dirty-worktree checks in the ops layer, but the command layer was not updated to skip the prompt.

**How to avoid:** Gate the `p.confirm` block with `if (!opts.force && !opts.dryRun)` in workspace.ts for all four commands.

**Warning signs:** Test with `ws remove <name> --force` — if it still prompts, the fix is missing.

### Pitfall 2: rename Has No opts Parameter Today

**What goes wrong:** `renameWorkspace` in workspace-ops.ts currently accepts `(oldName, newName, onProgress?)` with no `opts` parameter. Adding `--force` and `--dry-run` to the command requires adding `opts: { force?: boolean; dryRun?: boolean }` to the function signature.

**Why it happens:** When rename was implemented, it had no force/dryRun concept — SAFE-03 adds them.

**How to avoid:** Update both the function signature in workspace-ops.ts AND the call site in workspace.ts. Also update the `renameWorkspace` export import in workspace.ts if the signature changes.

### Pitfall 3: clean --gone Path Is a Separate Branch

**What goes wrong:** The `clean` command handler has two completely separate code paths — `if (opts.gone)` at the top, then the `clean <name>` path below. Safety fixes to the named path do NOT automatically cover the `--gone` path.

**Why it happens:** The two paths share no code.

**How to avoid:** Apply `--force` prompt gating to BOTH paths in `clean`. Treat `--gone --dry-run` as out of scope per discretion decision.

### Pitfall 4: warnExternalFiles Must Not Block on Missing Paths

**What goes wrong:** `applyFileOpsForWorkspace` and `applyFileOpsForRepo` skip operations when the destination exists. `warnExternalFiles` cannot rely on the destination existing to determine if it was external — it must reason from the path calculation alone.

**Why it happens:** The file might have been manually deleted between workspace creation and removal.

**How to avoid:** `warnExternalFiles` warns about paths that *would have been* external based on path math, not on whether the path currently exists. The warning is informational: "this path was outside the workspace and was not automatically cleaned."

### Pitfall 5: Commander camelCases --dry-run

**What goes wrong:** Accessing `opts.dry-run` (with hyphen) throws a syntax error. The flag `--dry-run` becomes `opts.dryRun` in TypeScript.

**Why it happens:** Commander automatically camelCases multi-word flags.

**How to avoid:** Always use `opts.dryRun` (camelCase) in action handlers and type declarations.

## Code Examples

### Existing onProgress pattern (reference for dry-run output)

```typescript
// Source: src/lib/workspace-ops.ts — removeWorkspace
onProgress?.(`removed  ${repo.name}`)
// ...
onProgress?.(`Workspace '${name}' removed.`)
```

Dry-run versions use the same callback with `[dry-run]` prefix.

### Existing p.confirm usage (reference for gating fix)

```typescript
// Source: src/commands/workspace.ts — remove handler (CURRENT, buggy)
const ok = await p.confirm({
  message: `Permanently remove workspace '${name}' (worktrees + config)?`,
  initialValue: false,
})
if (p.isCancel(ok) || !ok) {
  console.log("Cancelled.")
  return
}
// MISSING: above runs even when opts.force is true
```

### Existing force check in ops layer (reference)

```typescript
// Source: src/lib/workspace-ops.ts — cleanWorkspace
if (!opts.force) {
  const dirty = await getDirtyWorktrees(workspace)
  if (dirty.length > 0) {
    return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
  }
}
```

### Existing dstExists for symlink-safe path checking

```typescript
// Source: src/lib/files.ts
export function dstExists(dst: string): boolean {
  try {
    lstatSync(dst)
    return true
  } catch {
    return false
  }
}
```

### merge dry-run hook point

```typescript
// Source: src/lib/workspace-ops.ts — mergeWorkspace
// Conflict pre-check runs first (read-only — runs even in dry-run):
const conflicts = await getMergeConflicts(repo.main_path, baseBranch, workspace.branch)
if (conflicts.length > 0) { ... }

// DRY-RUN INSERTION POINT — after pre-check, before hooks and destructive ops:
if (opts.dryRun) {
  for (const { repo, baseBranch } of repoBases) {
    onProgress?.(`[dry-run] would merge ${workspace.branch} into ${baseBranch} (${repo.name})`)
  }
  for (const repo of worktreeRepos) {
    onProgress?.(`[dry-run] would remove worktree: ${repo.task_path}`)
    onProgress?.(`[dry-run] would delete branch: ${workspace.branch} (${repo.name})`)
  }
  onProgress?.(`[dry-run] would delete config: workspaces/${name}.yml`)
  onProgress?.("Dry run complete. No changes made.")
  return { ok: true }
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Always show `p.confirm` (ignore `--force`) | Gate with `if (!opts.force && !opts.dryRun)` | Fixes inconsistent UX |
| `rename` has no `--force` or `--dry-run` | Add both flags to rename | Consistent with remove/clean/merge |
| No dry-run support on any command | `--dry-run` on all four destructive commands | Users can safely inspect before executing |
| No external file warnings on remove/clean | `warnExternalFiles()` called before teardown | Prevents silent data loss for files placed outside workspace |

## Open Questions

1. **Hook listing in dry-run**
   - What we know: hooks can have side effects; listing them is informational only
   - What's unclear: whether users want to see `[dry-run] would run hook: <cmd>` output
   - Recommendation: Skip hooks silently in dry-run (planner may add informational listing as optional)

2. **clean --gone --dry-run**
   - What we know: the `--gone` path is a separate code branch in workspace.ts
   - What's unclear: whether SAFE-01 coverage was intended to include `--gone`
   - Recommendation: Defer; SAFE-01 text specifies `remove`, `clean`, `merge` — the named `clean <name>` form is in scope, `--gone` deferred

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — bun test discovers `tests/**/*.test.ts` automatically |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts tests/lib/files.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01 | `remove --dry-run` prints `[dry-run]` lines and does not delete worktrees or YAML | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| SAFE-01 | `clean --dry-run` prints `[dry-run]` lines and does not remove worktrees | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| SAFE-01 | `merge --dry-run` runs conflict pre-check, prints `[dry-run]` lines, does not merge | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| SAFE-01 | External file warnings appear in dry-run output | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| SAFE-02 | `remove` without `--force` is gated by confirmation prompt | manual-only | N/A | N/A |
| SAFE-02 | `clean` without `--force` is gated by confirmation prompt | manual-only | N/A | N/A |
| SAFE-03 | `remove --force` skips prompt and dirty-worktree check | unit (ops layer) | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| SAFE-03 | `rename --force` skips prompt | manual-only | N/A | N/A |
| FILES-16 | `warnExternalFiles()` returns warnings for destinations outside workspace root | unit | `bun test tests/lib/files.test.ts` | Yes (extend) |
| FILES-17 | `removeWorkspace()` calls `warnExternalFiles()` and emits warnings via `onProgress` | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |
| FILES-17 | `cleanWorkspace()` calls `warnExternalFiles()` and emits warnings via `onProgress` | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes (extend) |

Note: SAFE-02/SAFE-03 prompt behavior is tested at the command layer which uses `@clack/prompts` — this is inherently interactive and manual-only. The ops layer `force` behavior (dirty-worktree skip) is fully testable.

### Sampling Rate
- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts tests/lib/files.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. `workspace-ops.test.ts` and `files.test.ts` both exist and follow the established `makeTmpDir`/`makeGitRepo` pattern. New tests are additions to existing files, not new files.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/commands/workspace.ts` — current command handler implementations, flag definitions, p.confirm usage
- Direct code inspection: `src/lib/workspace-ops.ts` — cleanWorkspace, removeWorkspace, mergeWorkspace, renameWorkspace full implementations
- Direct code inspection: `src/lib/files.ts` — ApplyResult type, applyEntry, processFileList, resolveSourcePath patterns
- Direct code inspection: `src/lib/config.ts` — Workspace, Stack, WorkspaceRepo type definitions
- Direct code inspection: `src/lib/paths.ts` — getTasksDir, getMainDir, expandHome
- `.planning/phases/02-safety/02-CONTEXT.md` — user decisions, locked constraints

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — full requirement text for SAFE-01, SAFE-02, SAFE-03, FILES-16, FILES-17
- `tests/lib/workspace-ops.test.ts` and `tests/lib/files.test.ts` — established test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already in use
- Architecture patterns: HIGH — based on direct code inspection, patterns are fully established
- Pitfalls: HIGH — identified from direct reading of existing inconsistencies in the code
- warnExternalFiles design: MEDIUM — implementation approach inferred from files.ts patterns; exact path logic needs validation during implementation

**Research date:** 2026-03-18
**Valid until:** 2026-04-17 (stable codebase, no external dependencies changing)
