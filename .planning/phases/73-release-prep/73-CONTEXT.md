# Phase 73: Release Prep - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

v0.16.0 ships the extracted workspace domain modules plus the new `GIT_STACKS_DEBUG=1` observability path. This phase prepares the release artifacts only: package version, changelog entry, and README documentation for the shipped debug surface.

</domain>

<decisions>
## Implementation Decisions

### Version Bump
- **D-01:** Change `package.json` from `0.15.0` to `0.16.0`. `src/lib/version.ts` reads the package version dynamically, so no code-path version constants need updating.

### CHANGELOG Format
- **D-02:** Add a top-of-file `## [0.16.0] — 2026-04-05` section using the existing Keep a Changelog style.
- **D-03:** Split release notes into one user-facing `### Added` entry for `GIT_STACKS_DEBUG=1` and one `### Changed` entry for the core engine extraction/testing work.

### README Documentation
- **D-04:** Add a standalone `## Debug Output` section explaining how to use `GIT_STACKS_DEBUG=1`, the stderr-only contract, JSON safety, and the `manage` TUI suppression behavior.
- **D-05:** Keep README changes narrowly scoped to the new debug behavior; the extraction refactor itself stays changelog-level documentation.

### Scope
- **D-06:** No functional code changes are required for this phase. Only `package.json`, `CHANGELOG.md`, and `README.md` are part of the release-prep surface.

</decisions>

<canonical_refs>
## Canonical References

- `package.json`
- `src/lib/version.ts`
- `CHANGELOG.md`
- `README.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-01-SUMMARY.md`
- `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-03-SUMMARY.md`
- `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-VERIFICATION.md`
- `.planning/phases/71-observability/71-02-SUMMARY.md`
- `.planning/phases/71-observability/71-VERIFICATION.md`
- `.planning/phases/72-extraction-tests/72-02-SUMMARY.md`

</canonical_refs>

<code_context>
## Existing Code Insights

- `src/index.ts` already bootstraps observability from `GIT_STACKS_DEBUG=1` and silences it inside `manage`.
- `tests/commands/debug-output.test.ts` and `tests/commands/status-json.test.ts` already prove the stderr/stdout contract.
- `package.json` already contains the new `@logtape/logtape` dependency and `test:deps` script from the completed milestone work.

</code_context>

---

*Phase: 73-release-prep*
*Context gathered: 2026-04-05*
