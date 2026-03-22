---
phase: quick
plan: 01
subsystem: forge-integrations
tags: [forge, github, gitlab, gitea, open-web, cli]
dependency_graph:
  requires: []
  provides: [open-repo-in-browser, forge-repo-any-mode-resolution]
  affects: [src/lib/integrations/forge-utils.ts, src/lib/integrations/github.ts, src/lib/integrations/gitlab.ts, src/lib/integrations/gitea.ts]
tech_stack:
  added: []
  patterns: [integration-plugin, any-mode-resolver, forge-cli-delegation]
key_files:
  created: []
  modified:
    - src/lib/integrations/forge-utils.ts
    - src/lib/integrations/github.ts
    - src/lib/integrations/gitlab.ts
    - src/lib/integrations/gitea.ts
decisions:
  - "resolveForgeRepoAnyMode uses main_path as repoPath — always a real git clone regardless of mode"
  - "Auto-selects repo when exactly one has the correct forge configured (multi-repo workspace)"
  - "Gitea open uses tea repos ls --output json --limit 1 to extract html_url (tea has no direct open command)"
  - "GitLab without --web uses glab repo view --output json (consistent with existing pr/issue JSON pattern)"
metrics:
  duration: 78s
  completed_date: "2026-03-22T21:39:05Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick Plan 01: Implement Integration-level Open Web Command Summary

**One-liner:** `open` subcommand added to all three forge integrations using `resolveForgeRepoAnyMode` that works with both trunk and worktree mode repos.

## What Was Built

Users can now open any forge repo's homepage in their browser (or print the URL to stdout) via:

```
git-stacks integration github open <workspace> [repo] [--web]
git-stacks integration gitlab open <workspace> [repo] [--web]
git-stacks integration gitea  open <workspace> [repo] [--web]
```

Each command:
- With `--web`: opens the forge repo homepage in the default browser
- Without `--web`: prints the URL to stdout

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `resolveForgeRepoAnyMode` to forge-utils.ts | f7b0b58 |
| 2 | Add `open` command to github.ts, gitlab.ts, gitea.ts | 0d85c44 |

## Implementation Details

### resolveForgeRepoAnyMode (forge-utils.ts)

New function placed after `resolveForgeRepo`. Key differences:
- Accepts repos in any mode (`trunk` or `worktree`)
- Sets `repoPath` to `repo.main_path` (always a real git clone)
- When no `repoArg` given and workspace has multiple repos: auto-selects if exactly one matches the forge; otherwise returns `repo_required` with all repo names
- No `not_worktree_mode` error — any mode is valid

### GitHub (github.ts)

- `--web`: `gh browse` (opens repo homepage in browser)
- Without `--web`: `gh browse --no-browser` (prints URL to stdout)

### GitLab (gitlab.ts)

- `--web`: `glab repo view --web` (opens in browser)
- Without `--web`: `glab repo view --output json` (prints JSON including web_url)

### Gitea (gitea.ts)

- Fetches `tea repos ls --output json --limit 1` to get `html_url`
- Without `--web`: prints URL to stdout
- With `--web`: prints URL AND calls `_exec.openUrl(url)` (xdg-open / open)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/integrations/forge-utils.ts` — FOUND and exports `resolveForgeRepoAnyMode`
- `src/lib/integrations/github.ts` — FOUND with `open` command using `resolveForgeRepoAnyMode`
- `src/lib/integrations/gitlab.ts` — FOUND with `open` command using `resolveForgeRepoAnyMode`
- `src/lib/integrations/gitea.ts` — FOUND with `open` command using `resolveForgeRepoAnyMode`
- Commit f7b0b58 — FOUND
- Commit 0d85c44 — FOUND
- `bun run typecheck` — PASSES
- `git-stacks integration github --help` shows `open` — VERIFIED
- `git-stacks integration gitlab --help` shows `open` — VERIFIED
- `git-stacks integration gitea --help` shows `open` — VERIFIED
