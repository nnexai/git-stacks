# Phase 89: Files Sync Schema and Materialization - Research

## RESEARCH COMPLETE

**Phase:** 89 - Files Sync Schema and Materialization  
**Date:** 2026-05-16  
**Requirement IDs:** FSYNC-01, FSYNC-02, FSYNC-03

## Executive Summary

Phase 89 can be implemented by extending the existing `files` model rather than adding a separate overlay system. The repo already has the main seams needed:

- `src/lib/config.ts` owns `FilesSchema`, `TemplateSchema`, `WorkspaceSchema`, and `WorkspaceRepoSchema`.
- `src/lib/composition.ts` additively merges `files.copy` and `files.symlink`.
- `src/lib/files.ts` owns source resolution, glob expansion, destination existence checks, and workspace/repo file materialization.
- `src/lib/workspace-lifecycle.ts` and `src/lib/workspace-ops.ts` already call `applyFileOpsForRepo()` and `applyFileOpsForWorkspace()` during create/open flows.

The lowest-risk implementation path is to add a typed `sync` entry shape, keep copy/symlink behavior unchanged, and add strict sync-specific target validation before any copy occurs. Sync is not idempotent in Phase 89: if the destination exists, it refuses. Phase 90 can add `pull`, `push`, replace/merge/skip policies, drift, and machine output.

## Existing Patterns

### Schema and Composition

`FilesSchema` is optional and currently contains optional string arrays:

- `copy?: string[]`
- `symlink?: string[]`

Templates and workspaces both reference the same `FilesSchema`, including per-repo workspace entries. Composition currently concatenates copy and symlink arrays in include order. `files.sync` should be added to the same schema and merge function as an array of objects:

- `source: string`
- `target: string`
- `git_exclude?: boolean`

This preserves the local model: a single `files` object with operation-specific arrays.

### File Materialization

`src/lib/files.ts` already provides:

- `dstExists()` using `lstatSync`, which treats files, directories, symlinks, and dangling symlinks as existing.
- `resolveSourcePath()` with relative, home-relative, and absolute support.
- `expandGlob()` with `dot: true`.
- `processFileList()` for copy/symlink sources.
- `applyFileOpsForRepo()` and `applyFileOpsForWorkspace()` as the integration points.

Sync needs a new processing path because it has explicit `target` values and stricter destination behavior than copy/symlink. Reusing `applyEntry("copy", ...)` would be wrong because `applyEntry()` silently skips existing destinations. Phase 89 requires sync to refuse existing targets.

### Git Excludes

The existing `src/lib/git.ts` pattern uses Bun `$` with `.quiet().nothrow()` and returns typed results for expected failures. For local excludes, the key git commands are:

- `git -C <repo> rev-parse --git-common-dir`
- `git -C <repo> ls-files --error-unmatch -- <path>`
- `git -C <repo> check-ignore -- <path>` for tests

The context probe found that linked worktree excludes must be written to `$(git rev-parse --git-common-dir)/info/exclude`, not the per-worktree gitdir.

## Implementation Strategy

### Plan 1: Schema and Composition

Add a `FileSyncEntrySchema` and include `sync: z.array(FileSyncEntrySchema).optional()` in `FilesSchema`. Update inferred types through Zod and update composition merge behavior to concatenate sync entries. Keep object-only sync entries; do not support bare string shorthand.

Primary tests:

- `TemplateSchema`, `WorkspaceSchema`, and `WorkspaceRepoSchema` accept `files.sync`.
- `files.sync` rejects string entries and invalid shapes.
- Existing `files.copy` and `files.symlink` parsing remains unchanged.
- `composeTemplates()` concatenates sync entries in include order.

### Plan 2: Sync Materialization and Safety

Add sync-specific helpers in `src/lib/files.ts`:

- A target resolver that rejects empty targets, absolute targets, `..` traversal, and resolved paths outside the destination root.
- A sync materializer that resolves `source` from the current source base, expands globs if retained, and copies to explicit `target`.
- A strict exists check before copying: any existing file, directory, symlink, or dangling symlink at the target is an error.
- Explicit tracked target collision detection for repo-level sync entries.

Keep Phase 89 materialization source-to-target only. Do not write markers, manifests, drift state, or sync-back logic.

Primary tests:

- File sync copies a file as a real file, not a symlink.
- Directory sync copies nested content as real directories/files.
- Absolute and home-relative sources work.
- Missing literal sources fail loudly.
- Empty, absolute, traversal, and outside-root targets fail.
- Existing file, directory, symlink, and dangling symlink targets fail.
- Tracked target collisions are refused in real git fixtures.

### Plan 3: Repo Git Excludes and Lifecycle Integration

Extend repo-level sync so `git_exclude: true` writes local exclude entries only after successful materialization. Workspace-level sync materializes but does not write excludes. Exclude writing should:

- Resolve the repo common git directory with `git rev-parse --git-common-dir`.
- Create `<common-git-dir>/info/exclude` and parent directories as needed.
- Append rooted target entries while preserving existing lines.
- Dedupe entries.
- Fail clearly if no usable git repo/common dir exists.

Directory sync should exclude the directory path and everything under it; file sync should exclude the file path as-is. The exact patterns can be:

- File: `/target-file`
- Directory: `/target-dir/` and `/target-dir/**`

Primary tests:

- Repo-level sync with `git_exclude: true` writes to common `info/exclude`.
- `git check-ignore` ignores synced targets in a linked worktree.
- Existing exclude lines remain unchanged and duplicate sync lines are not appended.
- Workspace-level sync with `git_exclude: true` does not write excludes.
- Materialization failure prevents exclude writes.

## Validation Architecture

| Behavior | Test Type | Recommended Command |
|----------|-----------|---------------------|
| Schema accepts/rejects sync entries | Unit | `bun test tests/lib/config.test.ts` |
| Template sync composition | Unit | `bun test tests/lib/composition.test.ts` |
| Sync source/target materialization safety | Unit + real filesystem | `bun test tests/lib/files.test.ts` |
| Git exclude behavior in linked worktrees | Real git fixture | `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` |
| Lifecycle/open integration remains wired | Unit/integration | `bun test tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts` |
| Type safety | Typecheck | `bun run typecheck` |

Run focused tests after each plan and `bun run verify:gates` at the end if focused checks pass.

## Risks and Constraints

- Reusing copy/symlink `applyEntry()` would violate D-11 because it skips existing destinations.
- `target` validation must be based on resolved paths, not only string checks, to catch outside-root paths.
- `git_exclude` must be repo-level only. Workspace roots are not reliably Git repos.
- Linked worktree excludes must use `--git-common-dir`; writing to the per-worktree gitdir can appear successful but fail `git check-ignore`.
- Phase 90 command work must not leak into Phase 89. Avoid `git-stacks files ...`, drift output, push-back, replacement policies, or manifests here.

