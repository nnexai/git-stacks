# Phase 53: Shell Completion Fixes - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three shell completion generator bugs: (1) completions repeat after all positional args are filled, (2) enum-style option values are not offered as completions, (3) flags from one command leak into completions for same-named subcommands. Fixes apply to all three shells (bash, zsh, fish).

</domain>

<decisions>
## Implementation Decisions

### Arity enforcement (COMP-01)
- **D-01:** After all positional args are filled, Tab offers remaining unused flags only — not more positional completions
- **D-02:** Variadic args (`[command...]`) are exempt — they continue completing indefinitely
- **D-03:** Arity enforcement must be implemented in all three shells (bash, zsh, fish), not just the shell where the bug was reported

### Enum auto-detection (COMP-02)
- **D-04:** Auto-detect option enum values from Commander's `.choices()` at tree-walk time, same way `.argChoices` is already extracted for positional args
- **D-05:** `OPTION_ENUMS` map remains as a manual override/supplement — auto-detected values take priority, manual map fills gaps where Commander doesn't have `.choices()` set
- **D-06:** Update all command definitions in `src/commands/` to use `.choices()` where option values are constrained — benefits both completions and Commander's built-in validation

### Parent flag leakage (COMP-03)
- **D-07:** The bug is command name collision, not parent-child inheritance. `--sort` and `--status` from `git-stacks list` appear in completions for `git-stacks integration list` because `OPTION_ENUMS` entries are emitted as a global `case "$prev"` check before per-command dispatch
- **D-08:** Fix by scoping `OPTION_ENUMS` / option enum completions to the command path they belong to — move from global prev-word check into per-command case bodies
- **D-09:** Inherited parent flags are fine to show in subcommand completions (Commander accepts them at any position)

### Testing strategy
- **D-10:** Unit tests only — extend `tests/lib/completion-generator.test.ts` with string matching/regex assertions on generated shell script content
- **D-11:** Create separate focused mini test programs per bug (one for arity, one for enums, one for flag leakage) rather than extending the single `buildTestProgram()`

### Folded Todos
- "Fix shell completion repeating workspace after optional positional arg" — directly maps to COMP-01 arity enforcement
- "Shell completion generator missing option value enums" — directly maps to COMP-02 enum auto-detection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Completion generator
- `src/lib/completion-generator.ts` — All completion generation logic; `buildNode()`, `buildTree()`, `generateBash()`, `generateZsh()`, `generateFish()`
- `src/commands/completion.ts` — CLI command that invokes the generators

### Command definitions (for .choices() audit)
- `src/commands/workspace.ts` — Workspace commands with `--sort`, `--strategy`, `--format` options
- `src/commands/repo.ts` — Repo commands with `--type` option
- `src/commands/template.ts` — Template commands
- `src/commands/doctor.ts` — Doctor command
- `src/commands/config.ts` — Config command
- `src/index.ts` — Top-level command registration

### Existing tests
- `tests/lib/completion-generator.test.ts` — Current test suite with mock Commander tree

### Pending todos (background)
- `.planning/todos/pending/2026-04-02-fix-shell-completion-repeating-workspace-after-optional-positional-arg.md` — COMP-01 details
- `.planning/todos/pending/2026-04-02-completion-generator-missing-option-enums.md` — COMP-02 details

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildNode()` already extracts `.argChoices` from Commander positional arguments — same pattern can extract `.choices()` from options
- `OPTION_ENUMS` and `COMMAND_FLAG_COMPLETIONS` maps provide the override mechanism
- `resolveFlagCompletion()` already scopes flag completions by command path — extend this pattern to option enums

### Established Patterns
- Each shell generator follows the same structure: walk tree → emit per-command case body → dynamic lookup for values
- Bash uses `COMP_CWORD` for position tracking, zsh uses `CURRENT`, fish uses `__fish_seen_subcommand_from`
- Commander's `cmd.options` returns the option objects which have `.argChoices` property when `.choices()` is used

### Integration Points
- `buildNode()` in `completion-generator.ts` — extend OptionInfo to include enum values
- `OPTION_ENUMS` global map — becomes fallback, auto-detected values take precedence
- All three generator functions (`generateBash`, `generateZsh`, `generateFish`) need scoped enum handling
- Command files in `src/commands/` — add `.choices()` calls to constrained options

</code_context>

<specifics>
## Specific Ideas

- The flag leakage manifests as `--sort` and `--status` completing in `git-stacks integration list` — those flags only belong to `git-stacks list`
- The arity bug was originally noticed in fish, but all three shells need the fix
- Adding `.choices()` to Commander options is a win beyond completions — it also gives Commander's built-in validation for free

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- "Add git-stacks env command to show generated env vars" — belongs in Phase 54 (CMD-01)
- "Extend install hooks to support Copilot" — belongs in Phase 55 (HOOK-01)
- "Tmux integration example should show pane setup" — belongs in Phase 56 (CFG-01)
- "Fix git-stacks list unsupported --status flag" — out of scope for v0.13.0

</deferred>

---

*Phase: 53-shell-completion-fixes*
*Context gathered: 2026-04-02*
