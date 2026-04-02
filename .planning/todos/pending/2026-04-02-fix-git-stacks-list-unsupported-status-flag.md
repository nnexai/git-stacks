---
created: 2026-04-02T02:56:05.621Z
title: Fix git-stacks list unsupported --status flag
area: cli
files:
  - src/commands/workspace.ts
  - src/lib/completion-generator.ts
---

## Problem

`git-stacks list` exposes `--status` as a flag (visible in shell completions) but the command handler does not implement or support it. This creates a confusing UX where the flag appears valid but does nothing.

Either the flag should be implemented (showing workspace git status info in the listing) or removed from the command definition and completions.

## Solution

1. Check `src/commands/workspace.ts` for how `list` is defined — determine if `--status` is declared as an option
2. Check `src/lib/completion-generator.ts` to see if it's being auto-generated from the commander tree or hardcoded
3. Either implement the `--status` behavior (likely: show dirty/clean/ahead/behind per repo) or remove the option declaration so completions no longer advertise it
