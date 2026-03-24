---
phase: 32-gitlab-branch-slash-investigation
plan: 01
subsystem: integrations
tags: [gitlab, glab, investigation, branch-naming, url-encoding]

# Dependency graph
requires:
  - phase: 28-issue-tracking
    provides: "gitlab.ts integration with glab CLI pass-through"
provides:
  - "Root cause documented: glab CLI bug #948, fixed in MR !1183"
  - "No code changes needed — our gitlab.ts is not at fault"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/32-gitlab-branch-slash-investigation/32-CONTEXT.md
    - .planning/phases/32-gitlab-branch-slash-investigation/32-01-PLAN.md
    - .planning/phases/32-gitlab-branch-slash-investigation/32-01-SUMMARY.md
  modified:
    - .planning/PROJECT.md
    - .planning/ROADMAP.md

key-decisions:
  - "Confirmed: glab CLI bug, not our code. glab issue #948 / MR !1183 (Feb 2023)"
  - "No code changes to git-stacks — glab repo view --web is the only affected command and the fix is in glab itself"
  - "Workaround for users on old glab: update glab to v1.28+ (or any version after Feb 2023)"

requirements-completed: [BUG-02]

# Metrics
duration: 15min
completed: 2026-03-24
---

# Phase 32 Plan 01: GitLab Branch Slash Root Cause Documentation

**Investigation confirms glab CLI bug (#948) — our code does not manipulate branch names and is not at fault**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-03-24
- **Tasks:** 1 (investigation + documentation)
- **Files modified:** 2 (PROJECT.md, ROADMAP.md)
- **Code changes:** 0

## Investigation Findings

### Root Cause

**glab CLI bug [#948](https://gitlab.com/gitlab-org/cli/-/issues/948)**: `glab repo view --web` fails to URL-encode branch names containing special characters (`/`, `#`, etc.) when constructing the browser URL.

**Fix**: [MR !1183](https://gitlab.com/gitlab-org/cli/-/merge_requests/1183) adds `url.PathEscape` on branch names before URL construction. Merged February 2023.

### Our Code Analysis

`src/lib/integrations/gitlab.ts` passes glab commands via `Bun.spawn(["glab", ...args], { cwd })`. No branch name manipulation occurs in our code:

| Command | glab invocation | Branch handling |
|---------|----------------|-----------------|
| `gitlab open --web` | `glab repo view --web` | glab reads current branch from CWD git |
| `gitlab pr create` | `glab mr create --target-branch <base>` | Target branch passed; source auto-detected by glab |
| `gitlab pr open --web` | `glab mr view --web` | glab looks up MR by current branch |
| `gitlab issue view` | `glab issue view <id>` | No branch involved |

**Only `glab repo view --web` is affected** — it constructs a URL like `https://gitlab.com/org/repo/-/tree/<branch>` without URL-encoding the branch name.

### Workaround

Update glab to any version released after February 2023 (v1.28+). The fix is upstream and no change to git-stacks is needed.

## Self-Check: PASSED

- Root cause documented: glab issue #948 / MR !1183
- Our code confirmed clean: no branch name manipulation in gitlab.ts
- Workaround documented: update glab
- PROJECT.md updated: BUG-02 marked resolved
- ROADMAP.md updated: Phase 32 marked complete
