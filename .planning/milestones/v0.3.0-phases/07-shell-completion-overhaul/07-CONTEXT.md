# Phase 7: Shell Completion Overhaul - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing completion generator to cover every command, subcommand, fixed-choice flag value, and dynamic entity name in the CLI surface — including the new `message` subcommand family added in Phase 6. The generator already handles positional arg completion for workspace/repo/template names across bash/zsh/fish. This phase fills three specific gaps: (1) static enum values for fixed-choice flags, (2) `message send|list|clear` subcommand tree, and (3) `--workspace` flag-value completion on message subcommands.

</domain>

<decisions>
## Implementation Decisions

### OPTION_ENUMS — fixed-choice flag values (CMPL-01)
- Two flags get static enum completions, keyed globally by flag name:
  - `--strategy` → `["rebase", "merge"]`
  - `--sort` → `["date", "name", "status"]`
- Table is `OPTION_ENUMS: Record<string, string[]>` in `completion-generator.ts`
- Do NOT use Commander `.choices()` — avoids unintended runtime validation behavior change (decided in Phase 7 planning, captured in STATE.md)
- When `prev == "--strategy"` or `prev == "--sort"`, only enum values are offered — filename fallback suppressed in all 3 shells

### FLAG_COMPLETIONS — dynamic flag-value completion (CMPL-06)
- New `FLAG_COMPLETIONS: Record<string, DynamicCompletion>` table (separate from OPTION_ENUMS)
- Global scope: `--workspace → "workspace"` — whenever `--workspace` is typed anywhere, workspace names are completed
- Implementation: detect `prev == "--workspace"` and invoke the same workspace lookup as positional completion
- This is a new mechanism (prev-word detection) across all 3 generators; currently only positional args are handled

### `--from` sender completion
- `--from` flag name appears as a suggestion when completing flags (e.g., `message send --<TAB>`)
- `--from` value gets NO completion — sender names are arbitrary strings not stored in any registry file
- No JSONL parsing at completion time (too slow, too fragile)

### `message` subcommand tree (CMPL-05)
- `message send|list|clear` must appear as subcommand completions when user types `git-stacks message <TAB>`
- All three subcommands need `--workspace` flag-value completion via FLAG_COMPLETIONS
- `message send` also has `--from` (flag suggests, no value completion)
- `message send` has a positional text argument — no completion for positional (free-form text); focus is on flag completion
- `message.*` entries added to DYNAMIC_COMPLETIONS only if needed for the subcommand dispatch; the `--workspace` completion is driven by FLAG_COMPLETIONS, not DYNAMIC_COMPLETIONS positional type

### Claude's Discretion
- Exact mechanism for prev-word detection in each shell (bash `$prev`, zsh `$words[-1]`, fish `__fish_seen_argument`)
- Order of precedence when both OPTION_ENUMS and FLAG_COMPLETIONS match
- Whether to add a `"message"` type to `DynamicCompletion` union or reuse existing types
- Test program updates and new test case structure

</decisions>

<specifics>
## Specific Ideas

- OPTION_ENUMS check must happen BEFORE the generic flag listing — so `git-stacks list --sort <TAB>` shows `date name status`, not the flag list
- FLAG_COMPLETIONS check must also happen BEFORE generic positional arg completion
- The `completion` command itself already has `dynamic: "shells"` — that mechanism stays as-is

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Completion generator (primary file)
- `src/lib/completion-generator.ts` — Current generator: DYNAMIC_COMPLETIONS map, CommandNode type, bash/zsh/fish generators. All changes go here.

### New command to cover (Phase 6 output)
- `src/commands/message.ts` — message send|list|clear command definitions, options including --workspace and --from flags

### Existing command flags to cover
- `src/commands/workspace.ts` — sync --strategy and list --sort flags (line ~615 and ~156)

### Test file
- `tests/lib/completion-generator.test.ts` — Existing test structure: buildTestProgram() helper + describe blocks per shell. New tests follow same pattern.

### Requirements
- `.planning/REQUIREMENTS.md` §Completions — CMPL-01 through CMPL-06

### Roadmap phase spec
- `.planning/ROADMAP.md` §Phase 7 — Success criteria, dependency on Phase 6

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DYNAMIC_COMPLETIONS: Record<string, DynamicCompletion>` — maps command path → entity type for positional arg completion. Extend pattern (not replace) for message subcommands.
- `bashDynamicLookup()`, `_${id}_workspaces()` (zsh), `__${id}_workspaces` (fish) — existing workspace lookup helpers. FLAG_COMPLETIONS reuses these same lookups when `prev == "--workspace"`.
- `buildNode()` / `buildTree()` — Commander.js tree walker. No changes needed; new commands auto-appear once registered.

### Established Patterns
- The `CommandNode` interface has `dynamic: DynamicCompletion | null` for positional completions. The new `FLAG_COMPLETIONS` table is separate — it lives at the module level alongside DYNAMIC_COMPLETIONS, not on CommandNode.
- Tests use a `buildTestProgram()` helper that constructs a minimal Commander program. New tests should add a `sync` command with `--strategy` and a `message` command with `--workspace` and `--from` to this helper.

### Integration Points
- `src/commands/message.ts` was added in Phase 6 and registered in `src/index.ts`. Completions just need `message.*` in DYNAMIC_COMPLETIONS (for subcommand dispatch) and FLAG_COMPLETIONS to handle `--workspace`.
- No changes to `src/commands/completion.ts` or `src/index.ts` expected — the generators are self-contained.

</code_context>

<deferred>
## Deferred Ideas

- Branch completions for `new --from <branch>` and `clone` — flagged HIGH complexity in REQUIREMENTS.md (CMPL-F01); explicitly deferred to v0.3.x
- Sender name completions for `--from` via JSONL parsing — too slow at completion time; deferred indefinitely

</deferred>

---

*Phase: 07-shell-completion-overhaul*
*Context gathered: 2026-03-19*
