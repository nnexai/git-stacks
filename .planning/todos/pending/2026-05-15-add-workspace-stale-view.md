---
created: 2026-05-15T20:39:05.857Z
title: Add workspace stale view
area: tooling
files:
  - src/commands/workspace.ts
  - src/lib/workspace-status.ts
  - src/lib/workspace-git.ts
---

## Problem

As workspaces accumulate, it becomes hard to tell which ones are still active, which need attention, and which are safe candidates for cleanup. Age alone is not enough: an old workspace might contain dirty work, unpushed commits, missing paths, notes explaining why it should stay, or a merged/deleted branch that makes it a good cleanup candidate.

The user likes the term `stale` for this surface.

## Solution

Explore a `git-stacks stale` command that classifies workspaces for cleanup/advisory purposes without cleaning automatically.

Potential CLI shape:

```bash
git-stacks stale
git-stacks stale --older-than 14d
git-stacks stale --label agent
git-stacks stale --json
```

Candidate classifications:

- `active`: recently created/opened or clearly in use.
- `idle`: old but not obviously safe to remove.
- `ready-to-clean`: clean worktree, branch merged/deleted, no unsynced files-sidecar state, no blocking notes.
- `needs-attention`: dirty, ahead/unpushed, unsynced files, or notes/tags indicating a blocker.
- `orphaned`: workspace config/path drift or missing task paths.

Design notes for later comparison:

- The command should advise first; do not clean automatically in the initial slice.
- Surface workspace notes inline, especially note count/latest note, because notes explain why old workspaces should stay or need attention.
- Include git/path signals such as dirty state, ahead/unpushed commits, branch gone or merged, missing paths, and last opened/created age.
- A later follow-up could add interactive cleanup, dashboard grouping, or integration with `files.sync` drift status.
