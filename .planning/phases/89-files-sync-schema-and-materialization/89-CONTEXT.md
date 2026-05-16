# Phase 89: Files Sync Schema and Materialization - Context

**Gathered:** 2026-05-16T10:22:06+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 89 adds `files.sync` beside the existing `files.copy` and `files.symlink` model, validates its schema, composes it through templates/workspaces, and materializes configured sources into workspace or repo targets as real files. This phase also handles safe target validation and repo-level local Git excludes. The later `git-stacks files status|pull|push` command surface, sync-back semantics, drift detection, and explicit replace/merge/skip policies remain Phase 90 scope.

</domain>

<decisions>
## Implementation Decisions

### Sync Entry Shape
- **D-01:** `files.sync` uses object-only entries: `{ source, target, git_exclude? }`.
- **D-02:** Phase 89 does not add `name`, `direction`, delete, replace, merge, skip, or conflict-policy fields. Those are later policy/command concerns.
- **D-03:** Template composition appends sync entries in include order, matching current `files.copy` and `files.symlink` concatenation.
- **D-04:** `files.sync` is allowed anywhere current file ops are allowed: `Template.files`, `Workspace.files`, and per-repo `files`.
- **D-05:** Duplicate target policy is not a schema concern for Phase 89. Materialization safety decides whether a concrete target can be written.

### Path Resolution
- **D-06:** Relative `source` resolution matches current file ops: workspace-level sync resolves from the workspace root, and per-repo sync resolves from repo `main_path`.
- **D-07:** `source` may be relative, home-relative, or absolute so private external planning/config roots can be materialized as real files.
- **D-08:** `target` is always relative to the destination root. Workspace-level targets resolve under the workspace root; per-repo targets resolve under the repo destination path.
- **D-09:** Absolute targets are rejected.
- **D-10:** Missing source behavior matches current file ops: missing literal sources fail loudly; zero-match globs may warn if sync retains glob support.

### Materialization Safety
- **D-11:** Phase 89 refuses existing targets by default. Future named policies such as replace, merge, and skip/if-missing stay out of this phase.
- **D-12:** "Target exists" means any filesystem entry at the target path: file, directory, symlink, or dangling symlink.
- **D-13:** Git-tracked target collisions should be detected explicitly and refused with a clear error.
- **D-14:** Target safety is strict: reject absolute paths, `..` traversal, empty targets, and resolved paths outside the destination root.
- **D-15:** Phase 89 does not write sync marker or drift metadata. Lightweight drift state, if needed, belongs to Phase 90.

### Local Git Excludes
- **D-16:** `git_exclude` is a repo-level sync feature only. Workspace-level sync entries may materialize files, but they do not write excludes because the workspace root usually is not a Git repository.
- **D-17:** Excludes are written only after successful repo-level materialization.
- **D-18:** In linked worktrees, use `git rev-parse --git-common-dir` and write `<common-git-dir>/info/exclude`; direct per-worktree gitdir `info/exclude` did not affect `git check-ignore` in the local probe.
- **D-19:** Create the exclude file and parent directory as needed.
- **D-20:** Exclude entries are rooted to the repo target. File sync excludes the file path as-is; directory sync excludes the folder and everything inside it.
- **D-21:** Dedupe new exclude entries while preserving existing user-written lines.
- **D-22:** `git_exclude: true` requires a Git repo with a usable common exclude file. If that cannot be resolved, fail clearly rather than silently materializing unexcluded files.

### Folded Todos
- **Add bidirectional files sync:** Folded into Phase 89 for the schema and real-file materialization slice. The todo's command surface and bidirectional push-back behavior are still split across later v0.18.0 phases, especially Phase 90.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 89 goal, requirements mapping, and phase boundaries.
- `.planning/REQUIREMENTS.md` — FSYNC-01 through FSYNC-03 and milestone-level excluded approaches.
- `.planning/PROJECT.md` — v0.18.0 context for `files.sync`, `git-stacks files status|pull|push`, and manual push-back model.
- `.planning/todos/pending/2026-05-15-add-bidirectional-files-sync.md` — folded todo with the original private planning/agent config use case.

### Existing Code Maps
- `.planning/codebase/ARCHITECTURE.md` — existing file-ops placement in workspace create/open flows and config/schema architecture.
- `.planning/codebase/STRUCTURE.md` — where to add schema, file operation, command, and test code.
- `.planning/codebase/CONVENTIONS.md` — local TypeScript, result-union, naming, and test conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts`: `FilesSchema`, `TemplateSchema`, `WorkspaceSchema`, and `WorkspaceRepoSchema` are the schema source of truth.
- `src/lib/files.ts`: Existing copy/symlink helpers provide path expansion, glob handling, additive file config merging, destination-exists checks, and workspace/repo application entrypoints.
- `src/lib/composition.ts`: Existing template composition concatenates `files.copy` and `files.symlink`; sync should follow that additive pattern.
- `src/lib/workspace-lifecycle.ts` and `src/lib/workspace-ops.ts`: File ops are already applied during workspace creation/open flows.

### Established Patterns
- Config is YAML validated at read time through Zod schemas.
- Expected failures should return discriminated result unions with clear error strings rather than throwing where existing file ops already return `ApplyResult`.
- Relative production imports are required in `src/`; `@/*` is test-only.
- Tests should use real temp directories/local Git repos where behavior depends on filesystem or Git semantics.

### Integration Points
- Extend `FilesSchema` and the inferred `Files` type first.
- Extend file merge/materialization logic in `src/lib/files.ts` without changing existing copy/symlink behavior.
- Add tests beside existing file/config/composition coverage: `tests/lib/config.test.ts`, `tests/lib/files.test.ts`, `tests/lib/composition.test.ts`, and real-fixture coverage where Git exclude behavior needs a linked worktree.

</code_context>

<specifics>
## Specific Ideas

- The concrete use case is keeping private planning and agent config directories such as `.planning/` and `.codex/` available inside a workspace as real files because agents may refuse external symlink targets.
- Future sync policies should likely include names like replace, merge, and a skip/if-missing style policy, but Phase 89 intentionally does not lock their exact names.
- Local probe result: writing to the linked worktree's own gitdir `info/exclude` did not affect `git check-ignore`; writing to `$(git rev-parse --git-common-dir)/info/exclude` did.

</specifics>

<deferred>
## Deferred Ideas

- `git-stacks files status|pull|push`, drift visibility, sync-back behavior, push force behavior, and delete/overwrite policy are Phase 90 scope.
- Lightweight sync metadata or manifests are Phase 90 scope if the command surface needs them.
- Workspace-level local exclude handling is deferred because workspace roots are usually not Git repos; Phase 89 locks `git_exclude` as repo-level only.

### Reviewed Todos (not folded)
- Add manual workspace commands — deferred; separate future command recipe capability.
- Add workspace notes — deferred; separate operator note storage/surfacing capability.
- Add workspace stale view — deferred; separate advisory workspace aging command.
- Create workspace from forge source — deferred to forge-source phases, especially Phase 92 and Phase 93.
- Improve TUI dashboard experience — deferred; future dashboard polish after file/manual/stale surfaces are clearer.
- Improve template composition understanding — deferred; weak match and not part of Phase 89 materialization.

</deferred>

---

*Phase: 89-files-sync-schema-and-materialization*
*Context gathered: 2026-05-16T10:22:06+02:00*
