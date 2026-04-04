---
created: 2026-04-02T03:14:14.119Z
title: Add git-stacks env command to show generated env vars
area: cli
files:
  - src/lib/workspace-ops.ts
  - src/lib/lifecycle.ts
  - src/commands/workspace.ts
---

## Problem

There's no way for users to inspect what environment variables git-stacks generates and injects for a workspace. When debugging hooks or understanding what's available (`GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, etc.), users have to read source code or add `env | grep GS_` to a hook.

## Solution

Add a `git-stacks env [workspace]` command that:
- Resolves the workspace (or uses current if omitted)
- Computes the merged env (`mergeEnv()` output + injected GS_* vars)
- Prints all generated environment variables in a readable format
- Optionally support `--format shell` for `export KEY=VALUE` output that can be sourced
