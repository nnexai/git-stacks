---
created: 2026-05-15T20:36:03.620Z
title: Add bidirectional files sync
area: tooling
files:
  - src/lib/config.ts
  - src/lib/files.ts
  - src/commands/workspace.ts
---

## Problem

`git-stacks` already supports workspace file materialization through `files.copy` and `files.symlink`. For GSD and agent configuration workflows, neither fully fits:

- `copy` is one-way and effectively one-off.
- `symlink` keeps a live external reference, but agents often refuse to follow symlinks that point outside the workspace for security reasons.

The concrete use case is keeping repo-local planning and agent configuration paths such as `.planning/` and `.codex/` available as real files inside a workspace without committing them to the project repo itself. The user may want to share or preserve the full planning context separately from the project repository, while still letting agents operate against normal in-workspace paths.

## Solution

Explore adding a `files.sync` entry type under the existing `files` concept rather than introducing a separate overlay/sidecar product surface.

Potential YAML shape:

```yaml
files:
  sync:
    - source: ~/gsd/git-stacks/.planning
      target: .planning
      git_exclude: true

    - source: ~/gsd/git-stacks/.codex
      target: .codex
      git_exclude: true
```

Preferred CLI shape:

```bash
git-stacks files status my-feature
git-stacks files sync-in my-feature
git-stacks files sync-back my-feature
```

Design notes for later comparison:

- Prefer the `git-stacks files ...` command family because `status` can apply to more than `files.sync` over time, and because `git-stacks sync` already means branch synchronization.
- Treat `files.sync` as real-file materialization with explicit two-way sync commands, not as symlink behavior.
- Default sync-back should be manual, not lifecycle-triggered.
- `git_exclude: true` should write local excludes through `.git/info/exclude`, not project `.gitignore`.
- Do not store hashes for every file by default. A full manifest would be large and noisy for `.planning/`; investigate lighter conflict detection such as directory mtime snapshots, optional hash mode, source/target dirty markers, rsync-style dry-run output, or explicit overwrite policies.
- Status should make drift visible without requiring exhaustive per-file hash state.
