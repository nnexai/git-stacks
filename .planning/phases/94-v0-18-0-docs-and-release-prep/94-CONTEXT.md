# Phase 94: v0.18.0 Docs and Release Prep - Context

**Gathered:** 2026-05-16T11:55:16+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 94 documents and packages the v0.18.0 milestone for release. It updates user-facing docs for `files.sync`, `git-stacks files status|pull|push`, and forge-source workspace creation, then prepares a `0.18.0-rc.1` release-candidate package state that can be published directly with `bun publish`.

</domain>

<decisions>
## Implementation Decisions

### Release Notes
- **D-01:** `CHANGELOG.md` should be usage-focused and user-facing. It should describe what users can now do, not the internal phase mechanics.
- **D-02:** The v0.18.0 entry should lead with the two user workflows: syncing private/project files into workspaces and creating workspaces from forge changes.
- **D-03:** Release notes should include safety boundaries in plain user terms, especially explicit sync-back, conservative overwrite/delete behavior, and forge early-support limitations.

### Forge Source Documentation
- **D-04:** Document `git-stacks new --source` in the README Workspaces section near `git-stacks new`, so it reads as a workspace creation workflow rather than a separate integration feature.
- **D-05:** README source docs should use a short practical example, not a full walkthrough.
- **D-06:** The example notes must mention that `--template` is required, `--repo <name>` resolves ambiguous repo matches, and source support accepts full forge URLs.
- **D-07:** Use softer "early support" wording for forge source behavior. Avoid a harsh warning label, but clearly note that provider auth, self-hosted instances, and fork refs may need manual verification.
- **D-08:** Docs and release notes must not overstate live forge validation. GitLab/GitHub coverage is docs-driven and local/injected; Gitea can use local `tea` validation where available.

### File Sync Documentation
- **D-09:** Keep `files.sync` docs grounded in real user examples: dotfiles, specs, and agent configuration such as skills, hooks, `.planning`, and `.codex` files.
- **D-10:** Continue to frame sync as real-file materialization for tools/agents that reject external symlinks.
- **D-11:** Preserve the manual sync-back model: normal open should not overwrite local edits, and `files push` is explicit.

### Release Candidate Packaging
- **D-12:** Phase 94 should prepare a release candidate first, not final `0.18.0`.
- **D-13:** Set package versioning to `0.18.0-rc.1`.
- **D-14:** Tag alignment should use `v0.18.0-rc.1`, so the repo state is ready for the user to run `bun publish` directly.
- **D-15:** Final `0.18.0` release tagging remains later scope after the release candidate is validated.

### Release Gate
- **D-16:** Phase 94 should require docs review plus focused smoke testing before release-candidate handoff.
- **D-17:** Focused smoke should cover file sync behavior and `git-stacks new --source --dry-run` where the implemented CLI supports it.
- **D-18:** The release gate should verify README/changelog text matches actual CLI help and shipped behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 94 goal and v0.18.0 milestone scope.
- `.planning/REQUIREMENTS.md` — DOCS-01, DOCS-02, and REL-01 release requirements plus validation boundaries.
- `.planning/PROJECT.md` — current project state and prior release-note style.

### Upstream Phase Context
- `.planning/phases/89-files-sync-schema-and-materialization/89-CONTEXT.md` — locked file sync schema/materialization decisions.
- `.planning/phases/90-files-command-surface-and-conflict-policy/90-CONTEXT.md` — locked files command and conservative conflict policy decisions.
- `.planning/phases/91-files-sync-integration-and-machine-output/91-CONTEXT.md` — lifecycle integration and machine-output decisions.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-CONTEXT.md` — forge resolver, self-hosted, and validation boundary decisions.
- `.planning/phases/93-forge-source-workspace-creation/93-CONTEXT.md` — source workspace creation decisions, source metadata, no auto-labels, and early validation limits.
- `.planning/phases/93.1-parallel-integration-test-runner-and-coherent-coverage-mergi/93.1-CONTEXT.md` — release-gate runner and coverage expectations.

### User-Facing Docs and Package Files
- `README.md` — primary user documentation for workspace creation, file sync, and command examples.
- `CHANGELOG.md` — user-facing release notes.
- `package.json` — package version and publish metadata.

### Existing Code and CLI Surfaces
- `src/commands/workspace.ts` — `git-stacks new` help/options and source-workspace CLI behavior.
- `src/commands/files.ts` — `git-stacks files status|pull|push` help and behavior.
- `src/lib/files.ts` — file sync semantics for docs and smoke tests.
- `src/lib/config.ts` — schema fields documented in README examples.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `README.md`: Already contains a Workspaces section and a Real File Sync subsection. Phase 94 should extend this instead of creating a separate doc tree.
- `CHANGELOG.md`: Current release entries are user-facing, grouped by Added/Changed/Fixed where useful, and avoid deep implementation detail.
- `package.json`: Single source for npm package version used by release-candidate packaging.

### Established Patterns
- Release notes should describe shipped behavior in terms users recognize.
- Documentation should avoid claiming live forge coverage that was not validated locally.
- Local verification and focused smoke tests are the release gate; no CI requirement should be introduced.

### Integration Points
- Add concise `new --source` docs near the workspace creation command list and supporting Workspaces content.
- Update `CHANGELOG.md` with a `0.18.0-rc.1` or v0.18.0 release-candidate entry that is useful to tool users.
- Align `package.json` and git tagging with `0.18.0-rc.1`.
- Run focused docs/CLI smoke checks against the implemented `files` and `new --source --dry-run` surfaces.

</code_context>

<specifics>
## Specific Ideas

- Preferred README source example shape:

```bash
git-stacks new review-123 --template full-stack --source https://gitlab.example.com/org/repo/-/merge_requests/123
```

- Mention `--repo <name>` only as an ambiguity override, not as required baseline usage.
- Use "early support" wording for forge source behavior, while naming the practical cases that may need manual verification: provider auth, self-hosted instances, and fork refs.
- Prepare `0.18.0-rc.1` and `v0.18.0-rc.1`, not final `0.18.0`.

</specifics>

<deferred>
## Deferred Ideas

- Final `0.18.0` release publish/tag is deferred until after the release candidate is validated.
- Provider shorthand such as `gitlab:123` remains deferred.
- Auto-labels for forge-source workspaces remain deferred.
- Broad TUI dashboard changes remain deferred.

### Reviewed Todos (not folded)
- Improve TUI dashboard experience — deferred; unrelated broad UI scope.
- Add manual workspace commands — deferred; separate command recipe capability.
- Add workspace notes — deferred; separate workspace metadata capability.
- Add workspace stale view — deferred; separate advisory workspace aging command.
- Create workspace from forge source — not folded into Phase 94; implementation belongs to Phase 93 and Phase 94 only documents the shipped behavior.
- Improve template composition understanding — deferred; unrelated template UX capability.

</deferred>

---

*Phase: 94-v0-18-0-docs-and-release-prep*
*Context gathered: 2026-05-16T11:55:16+02:00*
