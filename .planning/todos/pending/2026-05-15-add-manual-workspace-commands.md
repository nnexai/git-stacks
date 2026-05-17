---
created: 2026-05-15T20:19:17.125Z
title: Add manual workspace commands
area: tooling
resolves_phase: 95
files:
  - src/lib/config.ts
  - src/lib/lifecycle.ts
  - src/commands/workspace.ts
---

## Problem

`git-stacks` has lifecycle hooks for automatic actions tied to create/open/close/clean/merge/remove, and it has ad hoc `git-stacks run` for one-off shell execution. It does not yet have named, discoverable commands that live with a template or workspace and can be triggered manually when the user chooses.

This would cover reusable workspace actions such as `test`, `start`, `logs`, `seed`, `reset-db`, `verify`, or agent-facing actions that should be explicit rather than bound to a lifecycle event.

## Solution

Consider adding template/workspace-defined manual commands that reuse the existing hook execution, cwd, environment, ports, and secrets machinery, but are invoked by a user command instead of lifecycle state.

Potential shape:

```yaml
commands:
  test:
    description: Run the project test suite
    command: bun test
    cwd: workspace

  api-logs:
    description: Tail API logs
    command: docker compose logs -f api
    repo: api

  verify-all:
    description: Run checks in every worktree repo
    command: bun run verify
    scope: worktree-repos
```

Potential CLI surface:

```bash
git-stacks command list my-feature
git-stacks command show my-feature test
git-stacks command run my-feature test
git-stacks command run test
```

Design notes for later comparison:

- Prefer template-first definition with snapshot into workspaces, similar to hooks and labels.
- Keep the first slice narrow: schema, list/show/run, template inheritance, env/cwd correctness, and focused tests.
- Include `show` or `--dry-run` because these commands execute shell from YAML and should be inspectable before running.
- Decide naming later: `command`, `script`, `task`, or another term. `command` is clear in YAML but may feel awkward as a CLI subcommand.
- Dashboard integration and batch/all-workspace command execution can be follow-up scope.
