---
created: 2026-04-02T02:58:37.345Z
title: Extend install hooks to support Copilot
area: cli
files:
  - src/commands/workspace.ts
---

## Problem

`git-stacks install --hooks` currently only installs Claude Code hooks. GitHub Copilot coding agent now supports a hooks system as well (pre/post tool execution hooks via `.github/hooks/` convention). Users who use Copilot instead of or alongside Claude should be able to install hooks for their agent of choice.

Reference docs:
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks
- https://docs.github.com/en/copilot/reference/hooks-configuration

## Solution

1. Add `--claude` and `--copilot` flags to `git-stacks install --hooks`
2. When neither flag is passed, use an interactive multi-select prompt to let the user choose which hook sets to install
3. Implement Copilot hook generation following the `.github/hooks/` directory convention and YAML-based configuration format from the Copilot docs
4. Both can be selected simultaneously for users who use both agents
