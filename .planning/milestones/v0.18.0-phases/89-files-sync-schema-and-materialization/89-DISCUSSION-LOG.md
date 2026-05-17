# Phase 89: Files Sync Schema and Materialization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T10:22:06+02:00
**Phase:** 89-files-sync-schema-and-materialization
**Areas discussed:** todo folding, sync entry shape, path resolution, materialization safety, local exclude behavior

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold `Add bidirectional files sync` | Include the strong Phase 89 todo match in context. | ✓ |
| Do not fold it | Leave the todo pending for later. | |

**User's choice:** Fold the todo.
**Notes:** Other keyword matches were reviewed as weak and deferred.

---

## Sync Entry Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal entries | Use `{ source, target, git_exclude? }`; leave policy fields to later phases. | ✓ |
| Named entries | Add `name` now for future CLI/status references. | |
| Mode fields now | Add direction/delete/conflict fields before Phase 90. | |

**User's choice:** Minimal entries.
**Notes:** User repeatedly chose the recommended narrow options: append composition, allow sync wherever current file ops are allowed, and object-only entries.

---

## Path Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Match existing file ops | Workspace-level sources resolve from workspace root; per-repo sources resolve from repo `main_path`. | ✓ |
| Workspace root always | Resolve every relative source from the workspace root. | |
| Config file location | Resolve relative sources from the YAML file location. | |

**User's choice:** Match existing file ops.
**Notes:** User also selected relative targets under destination root, allowed absolute/home-relative sources, and matched current missing-source behavior after asking how copy/symlink handle it.

---

## Materialization Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse by default | Do not overwrite or merge existing targets in Phase 89. | ✓ |
| Skip like copy/symlink | Existing destination reports ok and is left alone. | |
| Merge directories | Merge directories but refuse files. | |

**User's choice:** Refuse by default.
**Notes:** User clarified that specialized policies like replace, merge, and skip/if-missing should be added later. User then selected any filesystem entry as an existing target, explicit tracked-target refusal, strict path containment, and no marker metadata.

---

## Local Exclude Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| After successful materialization | Avoid excluding failed sync targets. | ✓ |
| Before materialization | Reserve the path before copying. | |
| Always | Write excludes even if materialization refuses. | |

**User's choice:** After successful materialization.
**Notes:** User narrowed `git_exclude` to repo-level sync only. For repo-level excludes, user selected repo-rooted target entries and clarified that file sync excludes the file as-is while directory sync excludes the directory and everything in it. A local Git worktree probe showed Git honors the common repo exclude path from `git rev-parse --git-common-dir`, not the linked worktree gitdir exclude. User selected clear failure when no usable common Git exclude can be resolved.

---

## the agent's Discretion

- Downstream planning may choose exact helper/function names and test structure consistent with existing code.
- If glob support for sync is awkward, planning should decide whether to keep parity with current file ops or explicitly document a narrower literal-source implementation, while preserving the locked missing-literal-source behavior.

## Deferred Ideas

- Future sync policies: replace, merge, skip/if-missing naming.
- Phase 90 command behavior: `git-stacks files status|pull|push`, drift detection, push force behavior, delete/overwrite policy.
- Weak todo matches: manual workspace commands, workspace notes, stale view, forge source, TUI dashboard polish, template composition understanding.
