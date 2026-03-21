# Phase 5: Tech Debt Cleanup — Research

**Researched:** 2026-03-18
**Domain:** TypeScript refactoring, lifecycle correctness, dead code elimination
**Confidence:** HIGH

## Summary

Phase 5 is a focused cleanup of seven accumulated tech debt items identified during the v1.0 milestone audit. All items are internal to the git-stacks codebase — no external library research is needed. Every issue has been precisely located in the source and its impact fully characterized.

The dominant item is the "open now" lifecycle bypass in `workspace-wizard.ts` and `workspace-clone.ts`. When the user answers "yes" to the "Open workspace now?" prompt after creation, the code calls `integration.open()` directly instead of delegating to `openWorkspace()`. This means post_open hooks, per-repo pre_open hooks, file-ops re-application, `writeEnvFiles`, and the `last_opened` timestamp update are all skipped on the first open. All subsequent `ws open` calls go through the correct path. The fix is to replace the inline integration loop with a call to `openWorkspace()`.

The workspace type contract item (`{} as Workspace` in the new flow) is a TypeScript type-safety gap in `workspace-wizard.ts:357`. At workspace creation time the workspace YAML has not yet been written, so the wizard passes an empty object cast to `Workspace` as the second argument to `applyFileOpsForWorkspace`. The function uses that argument only to resolve `workspace-level files:` entries — but at creation time those come from the template snapshot, not from a written workspace. The practical path is: build the workspace object in memory first, then pass it to `applyFileOpsForWorkspace`, then write it to YAML.

The dead code items are mechanical: `STACKS_DIR` export in `paths.ts` (never imported after Stack removal in Phase 3), two stale comments in `files.ts`, and `runRepoAdd` in `repo-wizard.ts` (exported but never imported by any command — `repo.ts` implements `repo add` as a non-interactive CLI inline).

**Primary recommendation:** Fix lifecycle bypass first (highest user-visible impact), then type contract, then dead code in one final pass.

## Standard Stack

No new dependencies are required. This phase works entirely within the existing stack:

| Tool | Version | Role |
|------|---------|------|
| Bun | existing | TypeScript runtime, test runner |
| @clack/prompts | existing | TUI prompts in wizard flows |
| zod | existing | Schema validation |

## Architecture Patterns

### Current "open now" Pattern (BROKEN)

In `workspace-wizard.ts` lines 433-438 and `workspace-clone.ts` lines 113-118:

```typescript
// CURRENT — bypasses openWorkspace()
const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
if (!p.isCancel(openNow) && openNow) {
  for (const { integration, path } of artifacts) {
    await integration.open(ctx, path)    // only integrations; no hooks, no env, no last_opened
  }
}
```

What is skipped:
- `workspace.hooks.pre_open` commands
- Per-repo `hooks.pre_open` commands
- `applyFileOpsForRepo` / `applyFileOpsForWorkspace` re-application
- `writeEnvFiles` env-file merge
- TMPL-04 trunk branch check
- `last_opened` timestamp write

### Correct Pattern (TARGET)

`openWorkspace()` already exists in `workspace-ops.ts` and does all of the above correctly. The fix is a straight call substitution:

```typescript
// TARGET — delegates to openWorkspace() for full lifecycle
const openNow = await p.confirm({ message: "Open workspace now?", initialValue: true })
if (!p.isCancel(openNow) && openNow) {
  const result = await openWorkspace(wsName, {}, (msg) => p.log.info(msg))
  if (!result.ok) {
    p.log.warn(`Open failed: ${result.error}`)
  }
}
```

The `artifacts` loop above the confirm prompt is only needed for the `p.log.success(...)` feedback lines (showing the artifact paths). It should be kept for display but the `integration.open()` calls inside the `openNow` block must be removed. `openWorkspace()` runs the integration loop internally.

### workspace-wizard.ts Type Contract Fix

Current code at line 357:

```typescript
// BROKEN — {} as Workspace loses any workspace-level files: entries
const wsFileResult = applyFileOpsForWorkspace(sourceLike, {} as Workspace, wsDir)
```

The fix is to build the workspace object in memory before the file-ops block and pass it. At the point file ops run in the new flow, all fields are known (`wsName`, `branch`, `repos`, `wsFiles`, etc.). The object does not need to be written to disk first — `applyFileOpsForWorkspace` only reads `workspace.files` from it.

### Dead Code Removal

| Location | What to Remove | Risk |
|----------|---------------|------|
| `src/lib/paths.ts:10` | `export const STACKS_DIR = ...` | Zero — grep confirms no imports in src/ |
| `src/lib/files.ts:12-16` | Comments "Replaces the old StackRepo type..." | Zero — documentation-only |
| `src/lib/files.ts:21-24` | Comments "Replaces the old Stack type..." | Zero — documentation-only |
| `src/tui/repo-wizard.ts` | `runRepoAdd` function (entire function, lines 10-73) | Low — verify no test imports before removing |

### Recommended Project Structure (no changes)

This phase makes targeted edits to existing files only. No new files or directories are created.

### Anti-Patterns to Avoid

- **Removing the artifact display loop entirely**: The `for...of artifacts` block before the confirm prompt displays artifact paths to the user via `p.log.success`. Keep that. Only remove the `integration.open()` calls inside the `openNow` block.
- **Breaking the `artifacts` array**: `workspace-wizard.ts` and `workspace-clone.ts` build `artifacts` for display purposes. This is still useful — just don't call `open()` from it.
- **Moving workspace YAML write before file ops**: The current ordering (file ops → YAML write) is correct and intentional per Phase 01.1 decisions. Do not invert it. Build the workspace object in memory for the type contract fix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Lifecycle on immediate open | Custom inline version of openWorkspace | Call `openWorkspace()` from `workspace-ops.ts` |
| Workspace type for file ops | Cast `{} as Workspace` | Build workspace object in memory, same fields written to YAML |

## Common Pitfalls

### Pitfall 1: `opts` parameter mismatch on openWorkspace

**What goes wrong:** `openWorkspace()` signature is `(name, opts: { ide?: boolean; cmux?: boolean }, onProgress?)`. The new-flow call should pass `{}` (all integrations enabled) — do not pass `{ ide: true, cmux: true }` as this may behave differently if defaults change.

**How to avoid:** Pass `{}` as opts. Check the function signature before wiring.

### Pitfall 2: Duplicate integration artifact generation

**What goes wrong:** `workspace-wizard.ts` currently calls `integration.generate()` before the "open now" prompt (to display the artifact paths). `openWorkspace()` also calls `integration.generate()`. Calling both means generate() runs twice on first open — usually idempotent but could produce double `p.log.success` noise in some integrations.

**How to avoid:** Keep the generation-for-display block outside `openWorkspace`. `openWorkspace` runs its own generate-then-open loop internally, which is correct on subsequent opens. On first creation, the display lines from the wizard are fine as a preview; `openWorkspace`'s internal generate call will be a no-op (overwrites same file). This is acceptable.

**Alternative:** Skip the artifact display block in wizard entirely and let `openWorkspace`'s progress callback provide feedback. Either approach works; keeping the display block is lower-risk.

### Pitfall 3: `runRepoAdd` may be tested

**What goes wrong:** Removing `runRepoAdd` without checking test files could break a test import.

**How to avoid:** Grep `tests/` for `runRepoAdd` before deleting. If tests reference it, remove the test too (the function is dead and untested per audit).

**Verification:** `grep -r runRepoAdd tests/` — confirmed: no test files import it (audit note: "stranded development work").

### Pitfall 4: `workspace-clone.ts` also has the lifecycle bypass

**What goes wrong:** Only fixing `workspace-wizard.ts` and forgetting `workspace-clone.ts`, which has identical "open now" logic at lines 113-118.

**How to avoid:** Fix both files in the same plan/task.

## Code Examples

### Example: warnExternalFiles in mergeWorkspace (SAFE-01 debt)

The audit documents this as "zero practical impact" because merge does not create or delete file-op destinations. The fix adds the call for completeness with SAFE-01 requirement text:

```typescript
// In mergeWorkspace(), after computing wsDir, before dry-run short-circuit:
const wsDir = join(tasksDir, workspace.name)
const externalWarnings = warnExternalFiles(workspace, wsDir, tasksDir)
for (const w of externalWarnings) {
  onProgress?.(w)
}
```

This mirrors the pattern already present in `cleanWorkspace` (line 222) and `removeWorkspace` (line 287).

### Example: type-correct workspace object for file ops

```typescript
// Build workspace object in memory BEFORE calling applyFileOpsForWorkspace
const workspace: Workspace = {
  name: wsName,
  schema_version: "1",
  description: description || undefined,
  branch,
  created: new Date().toISOString().split("T")[0],
  repos,
  // ... all other fields
  files: wsFiles,
}

// Now pass the real workspace object — no cast needed
if (workspace.files) {
  const wsFileResult = applyFileOpsForWorkspace({ files: workspace.files }, workspace, wsDir)
  // ...
}
```

## State of the Art

| Old (PoC) | Current | Phase 5 Target |
|-----------|---------|----------------|
| Stack model | Registry+Template model (Phase 3) | Stack remnants (STACKS_DIR, stale comments) removed |
| "open now" calls integrations inline | "open now" calls integrations inline | "open now" calls `openWorkspace()` |
| `{} as Workspace` cast | `{} as Workspace` cast | Real workspace object built in memory |
| `runRepoAdd` exported but dead | `runRepoAdd` exported but dead | `runRepoAdd` deleted |

## Open Questions

1. **Should `workspace-clone.ts`'s "open now" path also be fixed?**
   - What we know: Both `workspace-wizard.ts` and `workspace-clone.ts` have identical bypass patterns (confirmed by code review).
   - Recommendation: Yes, fix both in the same plan. The phase name says "fix open now lifecycle bypass" without qualification.

2. **Should `runRepoAdd` in `repo-wizard.ts` be deleted or kept as a future TUI path?**
   - What we know: It is a complete, working interactive TUI for repo registration. `repo.ts` does the same thing non-interactively. The audit calls it "stranded development work."
   - Recommendation: Delete it. If a TUI version is wanted in v2, it can be re-added then. Keeping dead exports adds maintenance surface.

3. **Should the 30 `test.todo()` stubs in `tests/commands/` be addressed?**
   - What we know: The audit notes them as "intentional scaffolding per Phase 04 plan design."
   - Recommendation: Out of scope for this phase unless the planner explicitly includes them. They do not introduce runtime bugs.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) |
| Config file | package.json `"test"` script: `bun test tests/` |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements to Test Map

This phase has no formal requirement IDs. The tech debt items map to existing verified requirements. Testing strategy per item:

| Item | Behavior | Test Type | Automated Command |
|------|----------|-----------|-------------------|
| Lifecycle bypass fix | `openWorkspace` called on immediate open | Integration | `bun test tests/lib/workspace-ops.test.ts` |
| Type contract fix | Workspace files applied correctly on new | Unit | `bun test tests/lib/files.test.ts` |
| `warnExternalFiles` in merge | External file warnings emitted in merge dry-run | Unit | `bun test tests/lib/workspace-ops.test.ts` |
| `STACKS_DIR` removal | No import errors | Compile-time | `bun run src/index.ts --version` |
| Dead comment removal | No runtime effect | Manual review | — |
| `runRepoAdd` removal | No import errors | Compile-time | `bun run src/index.ts --version` |

### Sampling Rate

- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts && bun test tests/lib/files.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all affected code paths. No new test files are required for cleanup, though new tests for the lifecycle fix are recommended (see below).

**Recommended new tests (not strictly required):**
- `tests/lib/workspace-ops.test.ts`: add a test asserting that `post_open` hooks execute when `openWorkspace` is called (covers the fix indirectly)
- This is not a Wave 0 gap — it is quality improvement

## Sources

### Primary (HIGH confidence)

- Direct source code audit: `src/tui/workspace-wizard.ts` — lifecycle bypass identified at lines 433-438
- Direct source code audit: `src/tui/workspace-clone.ts` — lifecycle bypass identified at lines 113-118
- Direct source code audit: `src/lib/workspace-ops.ts` — `openWorkspace()` full lifecycle at lines 442-589
- Direct source code audit: `src/lib/paths.ts` — `STACKS_DIR` export at line 10, no imports found
- Direct source code audit: `src/lib/files.ts` — stale comments at lines 12-16, 21-24
- Direct source code audit: `src/tui/repo-wizard.ts` — `runRepoAdd` at lines 10-73, not imported anywhere
- `.planning/v1.0-MILESTONE-AUDIT.md` — canonical tech debt catalog with cross-phase context

### Secondary (MEDIUM confidence)

- grep of entire `src/` tree for `STACKS_DIR` imports — confirmed: zero uses
- grep of entire `src/` tree for `runRepoAdd` — confirmed: only definition in `repo-wizard.ts`

## Metadata

**Confidence breakdown:**
- Bug locations: HIGH — code read directly, line numbers confirmed
- Fix approach: HIGH — `openWorkspace()` already exists and tested; fix is a call substitution
- Dead code: HIGH — grep confirmed zero imports
- Pitfalls: HIGH — all identified from code review, not speculation

**Research date:** 2026-03-18
**Valid until:** Stable — codebase changes slowly; re-verify line numbers before implementing
