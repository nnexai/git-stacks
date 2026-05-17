# Phase 90: Files Command Surface and Conflict Policy - Context

**Gathered:** 2026-05-16T10:34:24+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 90 adds the user-facing `git-stacks files status|pull|push` behavior for `files.sync`. It defines drift visibility through current source/target comparison, explicit sync-back through `push`, conservative default conflict/delete handling, and destructive `--force` plus `--dry-run` command contracts. It does not add lifecycle integration or stable machine-readable output; those remain Phase 91 scope.

</domain>

<decisions>
## Implementation Decisions

### Command Verbs and Defaults
- **D-01:** Keep the command names `git-stacks files status|pull|push`.
- **D-02:** Workspace selection matches existing workspace commands: `[workspace]` is optional, with CWD auto-detection when omitted.
- **D-03:** `files pull` refreshes existing sync targets with conservative refusal by default.
- **D-04:** Phase 90 includes `files pull --force` as the explicit destructive source-to-target refresh. It overwrites files and replaces target trees from source while still enforcing configured target boundaries and path containment.
- **D-05:** `files push` is explicit sync-back. It copies workspace target changes back to `source` but refuses conflicts, deletes, and overwrites by default unless explicit flags allow them.

### Drift Detection and Status Output
- **D-06:** Do not add a baseline or per-file manifest in Phase 90. Large sync trees can contain thousands of files, and the milestone explicitly avoids mandatory noisy manifests.
- **D-07:** `files status` uses current tree comparison only for sync entries.
- **D-08:** Status labels must be honest current-difference labels, not historical claims. Use concepts such as `source-only`, `target-only`, and `differing`, rather than "source changed since last sync."
- **D-09:** Normal text status shows per-entry rows with workspace/repo scope, target, state, counts, and short hints.
- **D-10:** Counts are shown by default. File path listings require `--verbose` and should be capped to avoid dumping thousands of paths.
- **D-11:** `files status` includes all file entry types. `copy` and `symlink` get simple materialized/missing/error state; `sync` gets source/target comparison counts.

### Conflict and Overwrite Policy
- **D-12:** `files pull` without `--force` refuses if the target has target-only or differing paths. Only source-only additions into missing target paths are safe by default.
- **D-13:** `files push` without `--force` refuses if the source has source-only or differing paths. Only target-only additions into missing source paths are safe by default.
- **D-14:** Phase 90 includes `--force` for both pull and push.
- **D-15:** Forced operation uses mirror/replace semantics: for pull, target becomes source; for push, source becomes target. Path containment and configured source/target boundaries still apply.
- **D-16:** Phase 90 includes `--dry-run` for pull and push to show planned writes, deletes, and refusals before changing files.

### Delete Behavior
- **D-17:** Deletes never propagate without `--force`.
- **D-18:** With `--force`, destination-only files are deleted so the destination exactly matches the source for that direction.
- **D-19:** Do not add safer middle flags such as `--merge` or `--add-only` in Phase 90. Keep default safe mode plus explicit `--force`; named policies can be added later if real usage needs them.

### Folded Todos
- **Add bidirectional files sync:** Folded into Phase 90 for the command and policy slice: `git-stacks files status|pull|push`, manual sync-back, lightweight current comparison, and conservative conflict/delete behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 90 goal, success criteria, and relationship to Phase 89 and Phase 91.
- `.planning/REQUIREMENTS.md` — FSYNC-04 through FSYNC-08 and the no-mandatory-full-manifest constraint.
- `.planning/PROJECT.md` — milestone context for `git-stacks files status|pull|push` and manual push-back model.
- `.planning/todos/pending/2026-05-15-add-bidirectional-files-sync.md` — folded todo with original command-surface and sync-back motivation.

### Upstream Phase Context
- `.planning/phases/89-files-sync-schema-and-materialization/89-CONTEXT.md` — locked schema, materialization, safety, and repo exclude decisions that Phase 90 builds on.
- `.planning/phases/89-files-sync-schema-and-materialization/89-01-PLAN.md` — Phase 89 schema/composition plan, for implementation sequencing awareness.
- `.planning/phases/89-files-sync-schema-and-materialization/89-02-PLAN.md` — Phase 89 materialization/safety plan, for shared helper contracts.
- `.planning/phases/89-files-sync-schema-and-materialization/89-03-PLAN.md` — Phase 89 lifecycle/exclude tests and wiring, for follow-on command behavior.

### Existing Code Maps
- `.planning/codebase/ARCHITECTURE.md` — command layer, workspace ops layer, file ops layer, and result conventions.
- `.planning/codebase/STRUCTURE.md` — where command, library, and tests should be added.
- `.planning/codebase/CONVENTIONS.md` — local CLI output, TypeScript, and test conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/commands/workspace.ts`: Existing workspace commands demonstrate optional workspace arguments and CWD auto-detection patterns.
- `src/lib/files.ts`: Phase 89 is expected to extend this with sync materialization and comparison helpers; Phase 90 should build command behavior on those helpers rather than duplicating tree logic in the command layer.
- `src/lib/config.ts`: `FilesSchema` and workspace/template readers provide the source of configured file entries.
- `src/lib/env.ts` / workspace detection helpers: Existing CWD-based workspace detection should be reused for omitted `[workspace]`.

### Established Patterns
- CLI commands are thin wrappers over `src/lib/` behavior and format user-facing output in commands.
- Fallible business logic should return discriminated result unions with explicit reasons.
- Text output should be compact and table-like where useful; verbose output is the right place for large detail.
- Tests for filesystem/Git behavior should use real temp directories and local repos rather than low-level command wrapper assertions.

### Integration Points
- Add a `files` command group under `src/commands/` and register it in `src/index.ts`, unless planning finds a stronger existing command placement.
- Add reusable library functions for status comparison, safe pull, safe push, force replacement, and dry-run planning.
- Extend tests around command behavior, large-tree status summarization, force/delete semantics, and CWD workspace detection.

</code_context>

<specifics>
## Specific Ideas

- Normal status should avoid implying history without a baseline. A clear table shape is:

```text
Workspace: feature-auth

Scope      Target      State      Source-only  Target-only  Differing  Hint
api        .planning   diverged   4            2            3          review
web        .codex      pullable   6            0            0          files pull
workspace  notes       ok         0            0            0          -
```

- `--verbose` may show representative paths, but should cap output to prevent thousands of file rows.
- `--dry-run` should show planned writes/deletes/refusals for both pull and push.

</specifics>

<deferred>
## Deferred Ideas

- Lifecycle integration and stable machine-readable output stay in Phase 91.
- Full per-file baselines/manifests are not part of Phase 90. They can be reconsidered only if current comparison proves too ambiguous in real use.
- Middle policies such as `--merge`, `--add-only`, replace/merge/skip named policies, or richer policy fields are deferred.

### Reviewed Todos (not folded)
- Improve TUI dashboard experience — deferred; noisy match and not Phase 90 command/policy scope.
- Add manual workspace commands — deferred; separate future command recipe capability.
- Add workspace notes — deferred; separate operator note capability.
- Add workspace stale view — deferred; separate advisory workspace aging command.
- Create workspace from forge source — deferred to Phase 92/93.
- Improve template composition understanding — deferred; weak match and unrelated to file command policy.

</deferred>

---

*Phase: 90-files-command-surface-and-conflict-policy*
*Context gathered: 2026-05-16T10:34:24+02:00*
