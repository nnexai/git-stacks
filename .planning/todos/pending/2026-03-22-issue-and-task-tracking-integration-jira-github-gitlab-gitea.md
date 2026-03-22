---
created: "2026-03-22T14:22:52.174Z"
title: Issue and task tracking integration (Jira, GitHub, GitLab, Gitea)
area: integrations
files:
  - src/lib/integrations/types.ts
  - src/lib/config.ts
---

## Problem

Phase 27 (Git Forge Integrations) was scoped to PR/MR commands only. Issue/task linking — associating workspaces with issues from GitHub Issues, GitLab Issues, Gitea Issues, and Jira — was explicitly deferred during discussion. This is a broader feature than just passing an issue number to a PR command; the user wants a unified model that covers multiple issue trackers including Jira (which is not a git forge).

Key questions for future design:
- How workspaces associate with issues (at creation time via `new --issue #123`, retroactively, or both)
- Where the issue reference is stored in workspace YAML
- What "linking" means in practice (metadata only, browser open, fetch title/status, auto-close on merge)
- Jira integration model (API-based vs CLI-based, auth handling)

## Solution

Create a dedicated phase after phase 27 to design and implement issue/task tracking as a cross-forge feature. Should consider:
- New fields on WorkspaceSchema for issue references
- Per-forge issue commands (`git-stacks integration github issue ...`)
- Jira as a non-forge integration with its own CLI/API approach
- Potential workspace creation flag (`--issue`, `--task`)
