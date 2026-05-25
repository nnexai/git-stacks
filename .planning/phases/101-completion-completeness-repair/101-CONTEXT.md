# Phase 101: Completion Completeness Repair - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 101 audits and repairs generated bash, zsh, and fish shell completions so they cover the full current `git-stacks` Commander command tree, including nested subcommands and recent v0.18/v0.19 command families. Missing command, subcommand, option, or dynamic positional coverage is a defect to close in this phase.

This phase does not add new command behavior, change command semantics, or promote deferred command-family ideas. It verifies the shipped CLI surface and adds regression protection so completion coverage cannot silently drift again.

</domain>

<decisions>
## Implementation Decisions

### Command Coverage Boundary
- **D-01:** Audit the full current Commander command tree, not only a hand-picked list of recently reported gaps.
- **D-02:** Close any bash, zsh, or fish completion gaps found for top-level commands, nested subcommands, options, enum values, and supported dynamic positional arguments.
- **D-03:** Pay explicit attention to recent and adjacent command families called out by the roadmap: `files`, `command`, `notes`, forge/source-adjacent commands, manager/support surfaces, and existing workspace/template/repo/integration surfaces.
- **D-04:** Keep Phase 101 narrowly focused on completion coverage. Do not broaden this phase into new command behavior, new workspace actions, or todo implementation.

### Dynamic Value Behavior
- **D-05:** Preserve prior completion fixes while repairing coverage: no repeated already-satisfied positional args, no parent flag leakage, fixed enum choices stay scoped correctly, and optional positional args stay position-aware.
- **D-06:** Workspace, template, repo, manual command, integration, fixed enum, and optional positional completions should remain position-aware where the current command signature allows it.
- **D-07:** The implementation may keep convention-based inference plus targeted overrides or replace it with a broader inventory, but the result must be checked against the live command tree rather than maintained only by memory.

### Regression Gate
- **D-08:** A machine-readable inventory from the live Commander tree, or an equivalent live command inventory, is required as the primary regression gate.
- **D-09:** Tests must compare generated completion coverage against that live inventory so future command additions cannot silently ship without bash/zsh/fish completion entries.
- **D-10:** Focused assertions should still cover dynamic completion behavior and shell-specific edge cases, but they are secondary to the live inventory gate.

### the agent's Discretion
- The planner may choose the exact inventory shape, helper extraction, and test-file split.
- The planner may decide whether to parse generated completion output directly or expose an internal structured completion model, as long as the live command tree remains the source of truth.
- The exact depth of shell-specific simulation is left to planning judgment after the live inventory gate is designed; generator-output assertions are acceptable where real-shell simulation would be brittle or environment-dependent.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Requirements
- `.planning/ROADMAP.md` — Phase 101 goal, dependency on Phase 100, success criteria, and planned two-plan split.
- `.planning/REQUIREMENTS.md` — `COMP-01` through `COMP-03`, the locked completion completeness requirements.
- `.planning/PROJECT.md` — v0.19.0 RC follow-up context and final-release boundary.
- `.planning/STATE.md` — Current project state showing Phase 101 as the active focus.

### Prior Context
- `.planning/phases/100-manager-tui-command-output-containment/100-CONTEXT.md` — Confirms manual commands were folded only for output containment in Phase 100; Phase 101 should account for shipped manual command surfaces without broadening their behavior.

### Completion Implementation and Tests
- `src/lib/completion-generator.ts` — Bash/zsh/fish completion generator, dynamic inference, explicit overrides, option enum handling, and shell-specific emitters.
- `src/commands/completion.ts` — CLI command that exposes generated bash/zsh/fish completion scripts.
- `src/index.ts` — Live Commander program construction and command registration order; completion command is registered after the command tree is populated.
- `tests/lib/completion-generator.test.ts` — Existing focused generator tests, real-program completion audits, dynamic completion tests, and prior regression tests for parent flag leakage and optional positional handling.
- `tests/commands/support-readonly.test.ts` — Existing CLI-level smoke coverage for generated completion scripts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/completion-generator.ts` already builds a `CommandNode` tree from Commander and emits bash, zsh, and fish output from that tree.
- `NAME_TO_COMPLETION_TYPE`, `DYNAMIC_COMPLETIONS`, `FLAG_COMPLETIONS`, `COMMAND_FLAG_COMPLETIONS`, and Commander `.choices()` extraction already provide the current dynamic-completion model.
- Existing tests in `tests/lib/completion-generator.test.ts` provide a place to add live inventory comparisons and retain focused dynamic behavior assertions.
- `runCli()` helpers in `tests/helpers.ts` and the support command tests can continue to exercise the public `git-stacks completion <shell>` interface.

### Established Patterns
- Tests should run through the repo's custom Bun test runner when running broad suites; do not use `bun test tests/` for all tests because mock-heavy files can pollute each other.
- The project already prefers generated shell completion invariants over brittle full golden snapshots.
- Source command definitions live in `src/commands/*` plus top-level registrations in `src/index.ts`; the live Commander tree should be treated as the canonical command surface.
- Completion generation must continue to skip the git availability check for `git-stacks completion`, preserving shell startup usability.

### Integration Points
- `src/index.ts` is the live command-tree assembly point. Any inventory helper needs a way to inspect the same tree without accidentally triggering normal CLI execution side effects.
- `src/lib/completion-generator.ts` currently keeps `buildTree()` internal. The planner may expose a structured inventory helper or add a test-only path if that is the cleanest way to compare live command coverage.
- Recent command families to verify include `src/commands/files.ts`, `src/commands/command.ts`, `src/commands/notes.ts`, `src/commands/integration.ts`, workspace source-related options in `src/commands/workspace.ts`, and support commands covered by `tests/commands/support-readonly.test.ts`.

</code_context>

<specifics>
## Specific Ideas

- User intent: "verify the coverage of commands and ensure any gaps are closed."
- User selected the strict regression gate: live Commander inventory required.
- Known completion behaviors from earlier releases are part of the repair contract, not optional nice-to-haves.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Reviewed by matcher but not folded; dashboard behavior is out of scope for completion repair.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Not folded; Phase 101 should verify completions for the shipped `command` surface only.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Not folded; Phase 101 should verify completions for the shipped `notes` surface only.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Not folded; stale-workspace advisory behavior is out of scope.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Not folded; Phase 101 should verify completions for shipped forge/source-adjacent command surfaces only.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Not folded; template composition ergonomics are out of scope.

</deferred>

---

*Phase: 101-Completion Completeness Repair*
*Context gathered: 2026-05-25*
