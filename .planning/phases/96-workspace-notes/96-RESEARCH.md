# Phase 96: Workspace Notes - Research

**Date:** 2026-05-17
**Mode:** Internal pattern research
**Discovery level:** Level 0 / Level 1 hybrid

## Conclusion

Phase 96 does not need new dependencies or external research. The existing codebase already has the right storage, CLI, prompt, and test patterns:

- `src/lib/messages.ts` proves the one-file-per-workspace JSONL pattern.
- `src/lib/paths.ts` is the single source of truth for config-root storage paths.
- `src/commands/message.ts` and `src/index.ts` show the expected Commander wiring.
- `src/tui/utils.ts` provides the mutable `prompts.confirm` / `prompts.isCancel` surface used by destructive CLI confirmations.
- `tests/helpers.ts`, `tests/lib/paths.test.ts`, and `tests/commands/*.test.ts` already define the config-isolation and subprocess-contract patterns this phase should reuse.

## Reusable Patterns

### Storage

- Keep note files under `GIT_STACKS_CONFIG_DIR`, not inside workspace repos and not inside `.planning`.
- Use one JSONL file per workspace under a dedicated notes directory.
- Keep the on-disk order append-only oldest-to-newest, then reverse for display and summary helpers.

### CLI

- Add a top-level `notes` command family in `src/commands/notes.ts`.
- Register the new command in `src/index.ts` before completion generation.
- Reuse `formatError()` for missing-workspace and malformed-store failures.

### Workspace Resolution

Phase 96 has a new required resolution order from CONTEXT.md:

1. Explicit workspace argument
2. `detectWorkspaceFromCwd()`
3. `GS_WORKSPACE_NAME`

No existing helper combines those three in that order, so the phase should implement the notes-specific resolver directly in `src/commands/notes.ts` instead of widening older message or integration helpers.

### Confirmation

- Follow the `template remove`, `repo remove`, and `doctor --fix` confirmation style:
  - prompt with `prompts.confirm`
  - treat cancel/false as non-destructive exit
  - bypass prompt with `--force`
- Keep prompt coverage local to the notes command tests instead of changing shared CLI helpers just for one command.

### Testing

- Library tests should use `useIsolatedConfig()` and dynamically import modules after the path mock is installed.
- Subprocess CLI tests should use `runCli()` for non-interactive cases.
- Prompt coverage can use a local `Bun.spawnSync(..., { stdin })` helper in the notes command test file, following the existing stdin-driven confirmation pattern.

## Constraints From Context

- `git-stacks notes add|list|clear` only. No `notes show`.
- Plain-text note body only. No tags, authors, search, filters, or JSON output.
- No dashboard socket push or message IPC reuse.
- Malformed JSONL must fail clearly and must not mutate on `add`, `list`, or `clear`.
- Later TUI work needs one reusable summary helper with `count` plus the latest note's `created` and `text`.

## Recommended File Surface

- `src/lib/paths.ts` — add `NOTES_DIR`
- `src/lib/notes.ts` — add note storage and summary helpers
- `src/commands/notes.ts` — add the CLI command family
- `src/index.ts` — register `notesCommand`
- `tests/lib/notes.test.ts` — storage and summary contract
- `tests/commands/notes.test.ts` — CLI subprocess contract
- `tests/helpers.ts` and `tests/lib/paths.test.ts` — extend config-isolation support for `NOTES_DIR`

## Risks To Encode In Plans

- Path containment: workspace note paths must stay inside `NOTES_DIR`.
- Corruption handling: append must validate the existing file before mutating so bad JSONL never gets silently extended.
- Rename/orphan behavior: commands should require a currently resolvable workspace and leave orphaned old-name note files untouched instead of guessing at migrations.
