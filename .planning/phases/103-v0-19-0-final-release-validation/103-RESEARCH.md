---
phase: 103-v0-19-0-final-release-validation
status: complete
created: 2026-05-25
requirements: [REL-01, REL-02]
---

# Phase 103: v0.19.0 Final Release Validation - Research

## RESEARCH COMPLETE

Phase 103 is release-validation work, not product expansion. The implementation should prepare `0.19.0-rc.2` as the next publishable release candidate, document the Phase 100-102 follow-up fixes as normal RC fixes, and prove that the final gate covers the RC follow-up areas plus the existing release workflow.

## Scope Findings

| Source | Finding | Planning Impact |
|--------|---------|-----------------|
| `103-CONTEXT.md` | Package metadata must move to `0.19.0-rc.2`; tag target is `v0.19.0-rc.2`, not final `v0.19.0`. | Plan must update `package.json`, `CHANGELOG.md`, and release handoff text around RC.2. |
| `ROADMAP.md` | Single planned artifact: `103-01-PLAN.md` covering final docs, package metadata, release gate, and tag handoff. | Keep one plan in one wave. |
| `REQUIREMENTS.md` | `REL-01` covers release notes/package metadata; `REL-02` covers focused verification and release gate. | Both IDs must appear in the plan frontmatter and task criteria. |
| Phase 100 summaries | Automated manager/TUI output containment proof exists in `tests/tui/dashboard/integ-action-menu.test.tsx`, lifecycle/workspace-command tests, and the full test gate. | RC smoke should assert the release-facing test inventory and/or focused command-output tests cover this fix. |
| Phase 101 summaries | Completion coverage is now audited against `buildCliProgram()` and enforced through `scripts/verify-gates.ts`; public completion smoke is in `tests/commands/support-readonly.test.ts`. | RC smoke should include completion drift gate evidence and keep `bun run verify:gates` in the release path. |
| Phase 102 summaries | Workspace-root detection has subprocess proof in `tests/commands/workspace-wrapper-edges.test.ts` and `tests/commands/notes.test.ts`; final full `bun run verify` passed. | RC smoke should assert the workspace-root proof remains part of the release smoke story. |
| `scripts/release-rc-check.ts` | The script derives the RC tag from `package.json`, checks a matching changelog entry, runs `tests/commands/release-rc.test.ts`, runs `runVerifyWorkflow`, dry-runs publish, and creates/checks the tag unless `--skip-tag` is passed. | The script can already support rc.2 if package/changelog agree; tests should cover the v0.19.0 RC follow-up expectations before relying on it. |
| `tests/commands/release-rc.test.ts` | Current smoke is still named for v0.18.0 and validates `0.18.0-rc.1` file sync/forge-source workflows. | Update this smoke to include the v0.19.0 RC.2 release notes, package version, and focused RC follow-up coverage references. |

## Recommended Approach

Use the existing release candidate workflow instead of adding a second release script. `scripts/release-rc-check.ts` is already generic over `package.json` version and tag name. The plan should update smoke coverage and release-facing artifacts so this existing script becomes the RC.2 handoff:

1. Update `package.json` version to `0.19.0-rc.2`.
2. Add a `CHANGELOG.md` entry for `0.19.0-rc.2` that describes manager command-output containment, completion completeness repair, workspace-root auto-detection, and the unchanged dashboard rollback progress boundary.
3. Update `tests/commands/release-rc.test.ts` so the release smoke checks current v0.19.0 RC.2 docs/package state and validates that the smoke path points at Phase 100-102 regression surfaces.
4. Keep `README.md` updates minimal and user-facing. Phase 102 already updated workspace-root guidance; Phase 103 should only add or adjust text if RC.2 release behavior is currently missing or inaccurate.
5. Run focused checks for the Phase 100-102 surfaces, then run the existing `bun run scripts/release-rc-check.ts --skip-tag` before creating a real tag.

## Focused Verification Candidates

| Area | Candidate Command | Why |
|------|-------------------|-----|
| Manager output containment | `bun test tests/tui/dashboard/integ-action-menu.test.tsx tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts tests/tui/dashboard/issue-actions.test.ts tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` | Covers bounded output, stderr/stdout tagging, manual command callback wiring, issue output, and progress rendering. |
| Completion completeness | `bun test tests/lib/completion-generator.test.ts tests/commands/support-readonly.test.ts tests/lib/verify-gates.test.ts` and `bun run verify:gates` | Covers generated bash/zsh/fish behavior and release-gate drift reporting against the live CLI tree. |
| Workspace-root detection | `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts tests/commands/notes.test.ts tests/lib/integrations/issue-utils.test.ts` | Covers root/subdirectory detection, optional resolver order, notes env fallback, and issue-utils fixture compatibility. |
| Release workflow | `bun run scripts/release-rc-check.ts --skip-tag` | Runs RC smoke, canonical verify workflow, and publish dry-run without mutating git tags. |

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Bun test plus repo-local verification scripts |
| Config file | `package.json` scripts and repo-local `scripts/*.ts` |
| Quick run command | `bun test tests/commands/release-rc.test.ts` |
| Full suite command | `bun run scripts/release-rc-check.ts --skip-tag` |
| Estimated runtime | Repo gate runtime; focused checks should run first to localize failures |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Accidentally preparing final `0.19.0` instead of RC.2 | Put `0.19.0-rc.2` and `v0.19.0-rc.2` in task acceptance criteria and release handoff text. |
| Release notes overstate follow-up fixes as new broad behavior | Use general "fixed during RC follow-up" wording and preserve the deferred rollback-progress boundary. |
| `bun publish --dry-run` or the full verify gate fails late | Run focused checks first; final script remains the release gate and blocks RC handoff unless failures are unrelated with exact evidence and decision. |
| Tag creation mutates state before the user is ready | Use `--skip-tag` during execution verification; include the exact final tag command only in handoff. |

## Planning Notes

- Do not add new command behavior, new dashboard features, or stale-workspace advisory work.
- Do not use raw `bun test -- <file>` with the custom runner; focused checks should use `bun test <files>`.
- If `scripts/release-rc-check.ts` needs changes, keep them generic for any `x.y.z-rc.n` version.
- The final executor summary should include exact commands run and whether the real tag was created or intentionally left for the user.
