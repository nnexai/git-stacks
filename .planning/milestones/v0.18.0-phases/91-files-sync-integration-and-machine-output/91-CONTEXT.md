# Phase 91: Files Sync Integration and Machine Output - Context

**Gathered:** 2026-05-16T10:45:06+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 91 connects the completed `files.sync` schema/materialization and `git-stacks files status|pull|push` behavior to workspace lifecycle entrypoints where appropriate, adds machine-readable command output for future automation, and documents the user workflow. This phase does not reopen Phase 89 schema/materialization decisions, Phase 90 force/delete/conflict semantics, mandatory baselines/manifests, or broad dashboard UI.

</domain>

<decisions>
## Implementation Decisions

### Lifecycle Integration
- **D-01:** Workspace creation automatically pulls/materializes `files.sync` once so a newly created workspace starts with real files.
- **D-02:** Existing workspace `open` does not auto-pull by default. Users should run `git-stacks files status` and `git-stacks files pull` explicitly.
- **D-03:** Recreate/missing-worktree flows only pull for newly created or missing sync targets. They do not refresh existing targets.
- **D-04:** Create-time sync conflicts or unsafe targets fail creation clearly because configured sync materialization is part of create success.

### Machine Output
- **D-05:** `files status --json` returns a coherent per-entry machine-readable structure with workspace, scope, repo, type, target, state, counts, warnings/errors, and capped detail when requested.
- **D-06:** `files pull|push --json` reports planned/applied operation information: mode, dryRun, force, per-entry result, writes/deletes/refusals counts, warnings/errors.
- **D-07:** JSON should exist for future automation and TUI consumption, but Phase 91 should not over-document the exact shape as a long-term public API before real testing proves it. Keep the internal contract coherent and testable, but do not put a full JSON example in README.
- **D-08:** Verbose JSON can include capped path details plus truncation metadata. Do not emit unbounded path arrays by default.

### TUI and Automation Boundary
- **D-09:** Do not build dashboard UI in Phase 91.
- **D-10:** Expose stable command behavior and JSON enough that future TUI/dashboard work can consume it.
- **D-11:** Add shell completion and help coverage for `git-stacks files status|pull|push` and common flags.
- **D-12:** Automation contract includes JSON plus meaningful exit codes: nonzero on errors/refusals, zero when status or dry-run succeeds even if drift exists.

### README Examples
- **D-13:** The primary README use case is private files that need to appear as real workspace files: dotfiles, specs, and agent configuration such as skills and hooks.
- **D-14:** Concrete examples may include `.planning` and `.codex` because they are project-local forms of specs and agent configuration.
- **D-15:** Explain symlink versus sync with security/practicality framing: use sync when tools or agents need real files and may refuse external symlinks; use symlink when a live external reference is acceptable.
- **D-16:** README should warn explicitly that default pull/push behavior is conservative and that `--force` mirrors and can delete destination-only files.
- **D-17:** Do not include JSON examples in README now. Keep JSON discoverable through command help/tests until the shape has been exercised.

### Folded Todos
- **Add bidirectional files sync:** Folded into Phase 91 for lifecycle integration, machine output, completion/help, and README documentation slices.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 91 goal, success criteria, and boundaries.
- `.planning/REQUIREMENTS.md` — FSYNC-09 and documentation requirements related to files sync.
- `.planning/PROJECT.md` — v0.18.0 context for files sync and manual push-back model.
- `.planning/todos/pending/2026-05-15-add-bidirectional-files-sync.md` — folded todo with original dotfiles/specs/agent-config use case.

### Upstream Phase Context
- `.planning/phases/89-files-sync-schema-and-materialization/89-CONTEXT.md` — schema/materialization/exclude decisions.
- `.planning/phases/89-files-sync-schema-and-materialization/89-01-PLAN.md` — schema/composition plan.
- `.planning/phases/89-files-sync-schema-and-materialization/89-02-PLAN.md` — materialization and safety plan.
- `.planning/phases/89-files-sync-schema-and-materialization/89-03-PLAN.md` — lifecycle/exclude wiring plan.
- `.planning/phases/90-files-command-surface-and-conflict-policy/90-CONTEXT.md` — command, drift, conflict, force, dry-run, and delete decisions.
- `.planning/phases/90-files-command-surface-and-conflict-policy/90-01-PLAN.md` — files command surface plan.
- `.planning/phases/90-files-command-surface-and-conflict-policy/90-02-PLAN.md` — pull/push policy plan.
- `.planning/phases/90-files-command-surface-and-conflict-policy/90-03-PLAN.md` — status/output tests and command integration plan.

### Existing Code Maps
- `.planning/codebase/ARCHITECTURE.md` — workspace create/open flow, command layer, completion layer, README/docs placement.
- `.planning/codebase/STRUCTURE.md` — command, lifecycle, completion, README, and test locations.
- `.planning/codebase/CONVENTIONS.md` — CLI output, test, and TypeScript conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/workspace-lifecycle.ts` and `src/lib/workspace-ops.ts`: Existing create/open/recreate paths are the integration points for automatic initial sync behavior.
- `src/commands/workspace.ts` and the Phase 90 files command work: Existing command patterns should guide JSON output, exit codes, and help text.
- `src/lib/completion-generator.ts`: Shell completion should pick up or explicitly include `files status|pull|push` and their common flags.
- `README.md`: User-facing docs should include real-file sync examples and safety warnings without over-locking JSON output.

### Established Patterns
- Lifecycle work should preserve existing copy/symlink behavior.
- CLI automation should use explicit exit codes and JSON output, but README should stay focused on user workflows.
- Large file trees require capped detail and truncation metadata, not unbounded output.
- Tests should cover create/open/recreate lifecycle behavior and command exit-code/JSON contracts without requiring broad dashboard UI.

### Integration Points
- Wire create-time initial sync into workspace creation after Phase 89 materialization helpers exist.
- Keep `open` conservative; do not trigger implicit refresh during normal open.
- Add or extend command tests for `--json`, `--dry-run`, refusal exit codes, and drift-exists success status.
- Add README examples for dotfiles/specs/agent config and force/delete warnings.

</code_context>

<specifics>
## Specific Ideas

- README examples should include private dotfiles, specs, and agent configuration such as skills/hooks. `.planning` and `.codex` are acceptable concrete examples.
- README should explain that sync is for tools/agents that need real files, while symlinks remain useful when a live external reference is acceptable.
- JSON should be coherent and tested, but not presented as a permanent public API in README until the user has exercised it.

</specifics>

<deferred>
## Deferred Ideas

- Broad dashboard UI for files sync is deferred. Phase 91 only prepares command/JSON behavior future TUI can consume.
- Long-term public JSON contract and full README JSON examples are deferred until testing validates the shape.
- Full per-file baselines/manifests remain deferred.

### Reviewed Todos (not folded)
- Improve TUI dashboard experience — deferred; Phase 91 exposes future-consumable command output but does not build dashboard UI.
- Add manual workspace commands — deferred; separate future command recipe capability.
- Add workspace notes — deferred; separate operator note capability.
- Add workspace stale view — deferred; separate advisory workspace aging command.
- Create workspace from forge source — deferred to Phase 92/93.
- Improve template composition understanding — deferred; unrelated to lifecycle integration and machine output.

</deferred>

---

*Phase: 91-files-sync-integration-and-machine-output*
*Context gathered: 2026-05-16T10:45:06+02:00*
