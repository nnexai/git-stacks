---
created: 2026-05-15T20:59:35.735Z
title: Create workspace from forge source
area: tooling
files:
  - src/commands/workspace.ts
  - src/lib/integrations/gitlab.ts
  - src/lib/integrations/gitea.ts
  - src/lib/integrations/github.ts
  - src/lib/integrations/forge-utils.ts
---

## Problem

`git-stacks` can create workspaces from templates and has forge integrations, but it does not yet have a standardized way to create a normal workspace from an external forge change such as a GitLab merge request, Gitea pull request, or GitHub pull request.

The user wants to quickly set up a full local environment for reviewing or validating someone else's merge request using a template, without inventing a separate "review workspace" type.

GitLab is the most important forge for this idea, followed by Gitea, then GitHub.

## Solution

Explore adding a standardized `--source` option to workspace creation that accepts a forge URL/ref and resolves it through enabled forge integrations.

Potential CLI shape:

```bash
git-stacks new review-auth --template full-stack --source https://gitlab.example.com/org/app/-/merge_requests/123
git-stacks new review-auth --template full-stack --source https://gitea.example.com/org/app/pulls/123
git-stacks new review-auth --template full-stack --source https://github.com/org/app/pull/123
```

Design direction:

- Treat this as normal workspace creation: `--source` influences branch/source metadata, while the template still controls repos, modes, files, hooks, integrations, labels, and env.
- Resolve source URLs through enabled forge integrations rather than adding forge-specific top-level flags such as `--from-pr` or `--from-mr`.
- For forge change sources, extract the branch/ref from the merge request or pull request and apply it to the matching worktree repo from the template.
- Match the forge source target repo against registry/template repos using existing forge/upstream autodetection where possible.
- If the source repo is not part of the template, fail clearly.
- If matching is ambiguous, require `--repo`.
- If the matched repo is `trunk` or `dir` in the template, fail clearly or require an explicit override because a review/change source needs a branchable worktree repo.
- Other worktree repos in the template should use normal workspace branch creation unless a later multi-repo-source design is added.
- Ticket/issue-based workspace creation is related but should be separate/later; focus this idea on forge change sources first.

Potential workspace metadata:

```yaml
source:
  type: forge-change
  forge: gitlab
  url: https://gitlab.example.com/org/app/-/merge_requests/123
  repo: app
  change_number: "123"
  title: Fix auth refresh
```

Useful synergies:

- Auto-label workspaces with values such as `review`, `gitlab`, and `mr:123`.
- Later stale cleanup can use merged/closed source state as a cleanup signal.
- Workspace notes can hold review observations.
- The TUI can show source metadata and change status in the workspace detail pane.
