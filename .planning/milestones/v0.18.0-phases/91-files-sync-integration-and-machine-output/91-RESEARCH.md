# Phase 91: Files Sync Integration and Machine Output - Research

## RESEARCH COMPLETE

## Summary

Phase 91 should build on the Phase 89 file materialization helpers and the Phase 90 command/policy plans instead of creating a second sync implementation. The key planning risk is sequencing: lifecycle auto-pull and JSON output both depend on Phase 90's reusable status/pull/push helpers and `git-stacks files status|pull|push` command group. Plan dependencies should therefore reference `90-02` and `90-03` rather than assuming those files already exist in the current checkout.

The safest shape is:

- Add a library-level lifecycle helper that applies a source-to-target pull only for missing sync targets during workspace creation and missing-worktree recreation.
- Keep normal `open` conservative: do not refresh existing sync targets.
- Add JSON formatters at the command boundary using stable, explicit result objects from the library layer.
- Keep verbose path details capped and include truncation metadata.
- Extend completion/help and README examples without treating JSON as a permanent public API in README.

## Architectural Responsibility Map

| Area | Responsibility | Candidate Files |
|------|----------------|-----------------|
| Sync policy core | Source/target comparison, pull/push planning, force/dry-run behavior from Phase 90 | `src/lib/files.ts` |
| Lifecycle integration | Create-time and missing-worktree sync orchestration; no normal-open refresh | `src/lib/workspace-lifecycle.ts`, `src/lib/workspace-ops.ts` |
| CLI machine output | Parse `--json`, emit stable objects, suppress human progress in JSON mode, set exit codes | `src/commands/files.ts` |
| Command registration/completion | Ensure `files status|pull|push` and flags are discoverable | `src/index.ts`, `src/lib/completion-generator.ts`, command definitions |
| Docs | Explain real-file sync use cases, create/open relationship, force/delete warnings | `README.md` |
| Tests | Real temp-dir filesystem and CLI contract coverage | `tests/lib/files.test.ts`, `tests/lib/workspace-lifecycle-create.test.ts`, `tests/lib/workspace-ops.test.ts`, `tests/commands/files.test.ts`, `tests/lib/completion-generator.test.ts` |

## Existing Patterns

- CLI JSON contracts are tested in `tests/commands/workspace-json-contracts.test.ts` and command-specific tests. They parse stdout as JSON and require errors on stderr with nonzero exit codes.
- Workspace lifecycle tests use real temp directories and local git repositories, with focused files such as `tests/lib/workspace-lifecycle-create.test.ts`, `tests/lib/workspace-ops.test.ts`, and `tests/commands/workspace-recreate.test.ts`.
- Existing command layers should stay thin: command modules parse options and format output; core filesystem behavior belongs in `src/lib/files.ts` or lifecycle helpers.
- `openWorkspace()` already recreates missing worktrees before applying file ops. Phase 91 should hook missing-target sync there, but it should not refresh existing sync targets during ordinary open.
- README examples should focus on user workflows and warnings. Do not include full JSON examples until the shape has been exercised.

## Planning Constraints

- Phase 91 depends on Phase 90. Do not duplicate status/pull/push tree logic in lifecycle or docs plans.
- Existing `files.copy` and `files.symlink` skip/error/apply behavior must remain backward-compatible.
- Default sync must remain conservative: `--force` is the destructive mirror/delete path.
- JSON output must be parseable, deterministic, and capped, but not over-documented as a long-term public API.
- Avoid broad TUI/dashboard changes. Future TUI should be able to consume the command JSON later.

## Validation Architecture

Validate Phase 91 at four levels:

1. Lifecycle behavior with real temp-dir workspace fixtures: create auto-materializes sync targets, normal open does not refresh existing targets, and missing-worktree recreation materializes only missing targets.
2. JSON contract behavior through the CLI: `files status --json`, `files pull --json`, and `files push --json` emit parseable machine output with workspace, entries, counts, warnings/errors, operation/dryRun/force fields, capped details, and correct exit codes.
3. Completion/help behavior: generated shell completion and command help expose `files status|pull|push` plus `--json`, `--verbose`, `--dry-run`, and `--force` where applicable.
4. Documentation behavior: README covers dotfiles/specs/agent config examples, sync versus symlink guidance, create/open behavior, and force/delete warnings without full JSON examples.

Focused gate:

```bash
bun test tests/lib/files.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts tests/commands/files.test.ts tests/lib/completion-generator.test.ts
bun run typecheck
bun run verify:gates
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Lifecycle code refreshes user-edited files on normal open | Plan explicit tests proving normal open does not refresh existing sync targets. |
| JSON mode leaks progress or human rows to stdout | Plan command tests that parse stdout as JSON and assert stderr behavior separately. |
| Verbose JSON dumps thousands of paths | Plan capped detail and truncation metadata tests. |
| Docs imply automatic sync-back or stable public API | Keep README focused on explicit pull/push and avoid full JSON examples. |

