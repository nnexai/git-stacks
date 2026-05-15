# Phase 86: Workspace Command Workflow Edge Coverage - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** Auto-generated autonomous context

<domain>
## Phase Boundary

Stable user-facing workspace command workflows need CLI-level behavior coverage where command wiring matters. This phase covers automation-safe `open --recreate`, `clean --gone`, destructive command safety, and focused wrappers for `run`, `paths`, `env`, `status`, `sync`, `push`, and `pull`.

This phase should not chase every prompt branch, spinner line, or incidental formatting detail. It should not reopen editor-launching flows, TUI rendering, external desktop/plugin environments, CI, or milestone finalization.

</domain>

<decisions>
## Implementation Decisions

### Command Coverage Strategy
- Use real CLI subprocess tests where command wiring, cwd detection, JSON output, force/dry-run semantics, and safety errors are the behavior under test.
- Reuse template-backed fixtures, local git repositories, local bare remotes, and isolated config homes from prior phases and helpers.
- Prefer stable machine-readable output and safety-critical messages over brittle assertions on progress spinners or prompt wording.
- Do not duplicate lower-level core behavior already proven in Phase 85 unless CLI wiring materially changes the behavior.

### Scope Slices
- `open --recreate` coverage should focus on template-backed no-change, added/removed repos, hook/env/file/integration changes, missing template, workspace-without-template, and automation-safe force/cancel behavior.
- `clean --gone` coverage should focus on gone-branch detection through local bare remotes, dirty-worktree refusal, dry-run/force behavior, multi-workspace handling, and removal failure reporting.
- Destructive command smoke should cover `clean`, `remove`, `merge`, and `rename` dry-run/force/error behavior that is not already proven by core libraries.
- Wrapper coverage should target meaningful option interactions and contracts for `run`, `paths`, `env`, `status`, `sync`, `push`, and `pull`, including cwd detection and no-op/error branches.

### Existing Boundaries
- Wizard-driven commands and manual prompt-driving stay out of scope.
- `git-stacks edit` and `git-stacks template edit` editor-launching flows remain out of scope unless the already-shipped `edit --yaml` fake-editor contract is needed as a fixture reference.
- Keep broad integration contract coverage for Phase 87 and readiness gates/docs for Phase 88.

### the agent's Discretion
Exact fixture grouping, test file names, helper extraction, and the balance between one broad command file and smaller focused files are at the agent's discretion as long as each success criterion is traceable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` Phase 86 — success criteria for workspace command workflow edge coverage.
- `.planning/REQUIREMENTS.md` CMD-01 through CMD-04 and out-of-scope exclusions.
- `.planning/STATE.md` Phase 85-88 decisions — avoid brittle prompt/spinner assertions, TUI rendering, and real desktop/plugin environments.

### Prior phase decisions
- `.planning/phases/85-core-real-fixture-functional-hardening/85-CONTEXT.md` — core-vs-CLI split and helper reuse boundaries.
- `.planning/phases/81.1.1-minimal-non-interactive-workspace-create-and-clone-variants/81.1.1-CONTEXT.md` — non-interactive create/clone paths available for fixtures.
- `.planning/phases/82-template-repo-label-and-message-e2e-coverage/82-CONTEXT.md` — deterministic success-path command coverage patterns.
- `.planning/phases/82.1-support-commands-and-error-path-e2e-coverage/82.1-CONTEXT.md` — representative failure and fake-editor harness precedent.

### Codebase maps
- `.planning/codebase/TESTING.md` — subprocess test runner, helper patterns, and command test organization.
- `.planning/codebase/STRUCTURE.md` — `src/commands/workspace.ts`, `src/lib/workspace-ops.ts`, `src/lib/git.ts`, and test layout.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers.ts` provides shared temporary directory, isolated config, git, workspace, template, repo, and command helper patterns.
- `tests/commands/**` already houses CLI subprocess and command-level tests that Phase 86 should extend.
- `src/commands/workspace.ts` is the main command wiring surface for the workspace subcommands in this phase.
- `src/lib/workspace-ops.ts` and `src/lib/git.ts` are lower-level behavior sources that Phase 86 should exercise through CLI wiring when relevant.

### Established Patterns
- The repo uses Bun subprocess tests for command behavior and keeps prompt-heavy flows out of deterministic E2E coverage.
- Config isolation uses `GIT_STACKS_CONFIG_DIR`; git-sensitive tests should also isolate `HOME` and local git config where needed.
- Prior phases separate success-path coverage from representative error-path matrices; Phase 86 should keep that same disciplined shape.

### Integration Points
- Plan 86-01 should anchor in `open --recreate` and template/workspace update workflows.
- Plan 86-02 should anchor in `clean --gone` plus destructive command safety.
- Plan 86-03 should anchor in wrapper commands with stable JSON/cwd/no-op/error contracts.

</code_context>

<specifics>
## Specific Ideas

- Use local bare remotes for gone-branch and push/pull/sync behavior rather than live remotes.
- Treat dry-run/force behavior as safety-critical and worth explicit CLI coverage.
- Keep assertions tight around stable contracts; avoid snapshotting broad command prose unless that prose is the contract.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
