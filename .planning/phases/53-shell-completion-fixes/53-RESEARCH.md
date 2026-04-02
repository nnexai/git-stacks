# Phase 53: Shell Completion Fixes - Research

**Researched:** 2026-04-02
**Status:** Complete

## Overview

Phase 53 fixes three completion generator bugs: positional arg repetition (COMP-01), missing option value enums (COMP-02), and parent flag leakage (COMP-03). All fixes target `src/lib/completion-generator.ts` and tests in `tests/lib/completion-generator.test.ts`.

## Bug Analysis

### COMP-01: Positional Arg Repetition

**Problem:** After all positional args for a command are filled, Tab continues to offer workspace/repo/template names instead of switching to flags-only mode.

**Root Cause:** The generators (bash, zsh, fish) don't enforce arity. For example, in bash, `bashCaseBody()` for leaf commands with a single dynamic arg emits a bare `bashDynamicLookup()` without checking `COMP_CWORD` position — so completions repeat at every cursor position. The zsh path for single-arg commands calls `_${id}_workspaces` unconditionally. Fish uses `__fish_seen_subcommand_from` which doesn't track argument count at all.

**Fix Strategy:**

- **Bash:** For single-arg leaf commands, wrap the dynamic lookup in `if [[ ${COMP_CWORD} -eq N ]]; then ... fi` where N is the expected positional arg position. After all args are filled (COMP_CWORD > max), only offer flags.
- **Zsh:** Already uses `_arguments` for commands with options, which handles arity. For commands without options that currently dispatch to `_${id}_workspaces` directly, switch to `_arguments ':: :_${id}_workspaces'` to get arity enforcement.
- **Fish:** For single-arg commands, add `test (count (commandline -opc)) -eq N` condition (already used for multi-arg commands). For commands in the simple `for cmd in ... end` loop, the condition currently is just `__fish_seen_subcommand_from $cmd` — needs a position check.

**Variadic exception:** Commands with variadic args (`[command...]`) should continue completing indefinitely. Currently no variadic args exist in git-stacks, but the code should handle this case.

**Affected functions:**
- `bashCaseBody()` — lines 198-300 (leaf command handling)
- `bashCaseBodyRecursive()` — lines 138-196 (subcommand leaf handling)
- `zshCaseBody()` — lines 395-508 (leaf command handling)
- `generateFish()` — lines 742-911 (workspace for loop, position-aware completions)

### COMP-02: Missing Option Value Enums

**Problem:** Enum-style option values (like `--sort date|name|status`, `--strategy rebase|merge`, `--filter worktree|trunk`) are only offered as completions if manually added to the `OPTION_ENUMS` map. Options that use Commander's `.choices()` method on options are not auto-detected.

**Root Cause:** `buildNode()` extracts `.argChoices` from positional `Argument` objects (line 90) but ignores the same property on `Option` objects. The `OptionInfo` interface (line 44-47) only has `long` and `description` — it lacks an `enumValues` field.

**Current State:**
- `OPTION_ENUMS` map has only 2 entries: `--strategy` and `--sort`
- No command files use `.choices()` on options — they just use description strings like "Sort by: date, name, status"
- Commander's `Option` type has `argChoices?: string[]` (set via `.choices()`), identical to `Argument`

**Fix Strategy:**
1. **Extend `OptionInfo` interface** to include `enumValues?: string[]`
2. **In `buildNode()`**, extract `opt.argChoices` from Commander options (same pattern as positional args)
3. **In generators**, use `enumValues` from `OptionInfo` first, then fall back to `OPTION_ENUMS`
4. **In command files**, add `.choices()` to constrained options so Commander validates inputs AND completions auto-detect:
   - `workspace.ts:262`: `--sort <key>` → `.choices(["date", "name", "status"])`
   - `workspace.ts:759`: `--strategy <strategy>` → `.choices(["rebase", "merge"])`
   - `workspace.ts:871`: `--filter <mode>` → `.choices(["worktree", "trunk"])`
5. **Simplify OPTION_ENUMS** — once auto-detection works, entries that duplicate `.choices()` can be removed, keeping `OPTION_ENUMS` only as a manual override for edge cases

**Affected interfaces/functions:**
- `OptionInfo` interface — add `enumValues?: string[]`
- `buildNode()` — extract `opt.argChoices` from options
- `zshOptionSpec()` — check `opt.enumValues` before `OPTION_ENUMS[flagName]`
- `generateBash()` — the global `case "$prev"` block uses `OPTION_ENUMS` directly; should also check `OptionInfo.enumValues` per command
- `generateFish()` — the OPTION_ENUMS section (lines 833-851) iterates `Object.entries(OPTION_ENUMS)` — should also emit for auto-detected enums

### COMP-03: Parent Flag Leakage

**Problem:** `--sort` and `--status` from `git-stacks list` appear in completions for `git-stacks integration list` because `OPTION_ENUMS` entries are emitted as a global `case "$prev"` check before per-command dispatch.

**Root Cause (Bash):** In `generateBash()` (lines 330-348), `OPTION_ENUMS` and `FLAG_COMPLETIONS` are emitted as a global `case "$prev"` block at the top of the completion function, before the `case "${words[1]}"` per-command dispatch. This means `--sort` triggers enum completion regardless of which command is active.

**Root Cause (Zsh):** `zshOptionSpec()` checks `OPTION_ENUMS[flagName]` regardless of command context. Since zsh uses `_arguments` per-command, the actual leakage is less severe — each command's `_arguments` only lists its own options. However, if a subcommand happens to have a same-named option, the enum values from the map would apply to it too.

**Root Cause (Fish):** The OPTION_ENUMS section (lines 833-851) iterates over all nodes to find which commands use the flag, but it only checks `node.options` at top level and `node.subcommands[].options` one level deep. If a subcommand and a top-level command both have `--sort`, both get the same enum values.

**Fix Strategy:**
1. **Remove the global `case "$prev"` block** from `generateBash()` for `OPTION_ENUMS`
2. **Move enum completions into per-command case bodies** — when `bashCaseBody()` generates the flag handling for a command, include enum-value completion for the command's options that have enum values
3. **In all three generators**, scope option enums to the specific command path they belong to
4. **Once COMP-02 is implemented** (auto-detection from OptionInfo.enumValues), the OPTION_ENUMS global map becomes a secondary fallback and the per-command scoping happens naturally through the node's options

## Implementation Approach

The three bugs are interconnected and should be fixed in a specific order:

1. **COMP-02 first** (option enum auto-detection) — This extends `OptionInfo` and `buildNode()`. Once options carry their own `enumValues`, the generators can emit scoped completions per-command naturally.

2. **COMP-03 second** (parent flag leakage) — With auto-detected enum values on each node's options, refactor generators to emit enum completions inside per-command dispatch instead of globally. Remove the global `case "$prev"` block in bash.

3. **COMP-01 last** (positional arg repetition) — This is independent of the other two but benefits from the cleaner generator structure.

## Command Audit: Options Needing `.choices()`

| Command | Option | Values | File:Line |
|---------|--------|--------|-----------|
| `list` | `--sort <key>` | date, name, status | workspace.ts:262 |
| `sync` | `--strategy <strategy>` | rebase, merge | workspace.ts:759 |
| `list-paths` | `--filter <mode>` | worktree, trunk | workspace.ts:871 |

No other options in `src/commands/` have constrained enum values (verified by grep).

## Testing Strategy

Per D-10/D-11 from CONTEXT.md: unit tests only, extend existing test file with focused mini test programs.

**COMP-01 tests:** Create a mini program with single-arg and multi-arg commands. Verify that bash output includes `COMP_CWORD` position checks, zsh uses `_arguments` for arity, fish uses position-count conditions.

**COMP-02 tests:** Create a mini program with `.choices()` on options. Verify that all three shells emit the choice values for that option, without needing OPTION_ENUMS entries.

**COMP-03 tests:** Create a mini program with two commands that have same-named flags with different enum values. Verify that each command gets its own enum values, not a global merge.

## Validation Architecture

### Unit Test Coverage
- All tests in `tests/lib/completion-generator.test.ts`
- Each bug gets a dedicated `describe()` block with shell-specific sub-tests
- Mini test programs per bug (not reusing `buildTestProgram()`)
- String-match assertions on generated shell script content

### Verification Commands
```bash
bun run test                      # All tests pass
bun test tests/lib/completion-generator.test.ts  # Completion tests pass (isolated)
bun run typecheck                 # No type errors
bun run src/index.ts completion bash | head -50  # Sanity check real output
```

### Manual Smoke Tests
Not required per D-10, but helpful:
- `git-stacks list <TAB><TAB>` — should not repeat workspace names after first arg
- `git-stacks list --sort <TAB>` — should offer date, name, status
- `git-stacks integration list <TAB>` — should NOT show `--sort`

## Risk Assessment

**Low risk:** Changes are isolated to `completion-generator.ts` and command `.choices()` additions. The completion generator only produces shell script text — no runtime behavior changes. Tests verify output string content.

**Potential concern:** Removing the global `case "$prev"` block in bash changes completion behavior for all commands. The per-command approach must handle all options that were previously handled globally.

---

*Phase: 53-shell-completion-fixes*
*Research completed: 2026-04-02*
