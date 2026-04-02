---
created: 2026-04-02T03:17:02.772Z
title: Fix shell completion repeating workspace after optional positional arg
area: cli
files:
  - src/lib/completion-generator.ts
---

## Problem

Shell completions (at least in fish) allow repeating workspace names indefinitely after an optional positional argument has been completed. For example:

```
git-stacks integration tmux config show <workspace>  # correct — completes workspace
git-stacks integration tmux config show myws <TAB>    # wrong — offers another workspace
git-stacks integration tmux config show myws myws2 <TAB>  # wrong — keeps offering workspaces
```

The completion generator doesn't enforce argument arity — once a positional arg allows workspace completion, pressing tab after it's already filled offers the same completions again instead of stopping.

This likely affects all commands with optional workspace/template positional args, not just `integration tmux config show`.

## Solution

1. Investigate how `completion-generator.ts` emits positional argument completions for each shell
2. For fish: use `__fish_complete_arg` position tracking or condition on argument count so completions stop after the expected number of positional args
3. For bash/zsh: similarly guard completions based on `$COMP_CWORD` / argument position
4. Test with commands like `open`, `status`, `remove` that take optional workspace args
