# Phase 103: v0.19.0 Final Release Validation - Patterns

## File Map

| Target File | Role | Closest Analog | Apply Pattern |
|-------------|------|----------------|---------------|
| `package.json` | package metadata | Phase 94 release prep | Bump only the version field to the selected prerelease target. |
| `CHANGELOG.md` | user-facing release notes | Existing `0.19.0-rc.1` and `0.18.0-rc.1` entries | Add a concise RC entry with Added/Fixed/Safety Notes/Release Candidate shape; avoid maintainer-only verification detail. |
| `README.md` | user-facing docs | Phase 102 docs update and current command sections | Update only stale or missing user-facing guidance for shipped behavior. |
| `tests/commands/release-rc.test.ts` | RC smoke tests | Existing v0.18.0 smoke | Keep fixture-style smoke tests, add release artifact assertions for package/changelog/README and Phase 100-102 coverage references. |
| `scripts/release-rc-check.ts` | RC gate orchestration | Current generic RC script | Reuse version-derived tag behavior; only change if tests reveal hard-coded assumptions. |
| `.planning/phases/103-v0-19-0-final-release-validation/103-01-SUMMARY.md` | execution evidence | Recent phase summaries | Record exact focused checks, full release gate result, tag handoff, and any accepted unrelated failures. |

## Existing Release Gate Pattern

`scripts/release-rc-check.ts` already implements the preferred sequence:

1. Read `package.json` version.
2. Require `x.y.z-rc.n` shape.
3. Require matching `CHANGELOG.md` heading.
4. Run `bun test tests/commands/release-rc.test.ts`.
5. Run the canonical `runVerifyWorkflow`.
6. Run `bun publish --dry-run`.
7. Create/check `v${packageVersion}` unless `--skip-tag` is passed.

Phase 103 should make the smoke test and release artifacts match `0.19.0-rc.2`, then rely on this script instead of inventing a second release flow.

## Prior Phase Evidence to Reuse

| Phase | Evidence Surface | Planning Use |
|-------|------------------|--------------|
| 100 | `tests/tui/dashboard/integ-action-menu.test.tsx`, `tests/lib/lifecycle.test.ts`, `tests/lib/workspace-command.test.ts`, `tests/tui/dashboard/issue-actions.test.ts`, `tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` | Manager output containment focused checks. |
| 101 | `src/lib/completion-audit.ts`, `scripts/verify-gates.ts`, `tests/lib/verify-gates.test.ts`, `tests/commands/support-readonly.test.ts`, `tests/lib/completion-generator.test.ts` | Completion completeness and release-gate drift checks. |
| 102 | `src/lib/workspace-resolution.ts`, `tests/lib/detect-workspace-cwd.test.ts`, `tests/commands/workspace-wrapper-edges.test.ts`, `tests/commands/notes.test.ts`, `README.md` | Workspace-root detection proof and user-facing docs. |

## Constraints

- Keep package/tag target at `0.19.0-rc.2` / `v0.19.0-rc.2`.
- Keep final `0.19.0` publish/tag guidance separate.
- Keep rollback progress visibility deferred if mentioned.
- Do not add unrelated pending todos or new product behavior.
