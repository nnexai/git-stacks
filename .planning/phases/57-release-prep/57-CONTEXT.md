# Phase 57: Release Prep - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Finalize v0.13.0 release: bump version in package.json, ensure CHANGELOG.md has complete v0.13.0 section, update README with new user-facing features, verify `git-stacks --version` outputs correct version.

</domain>

<decisions>
## Implementation Decisions

### Version bump (REL-03)
- **D-01:** Bump `package.json` version to `0.13.0`
- **D-02:** Verify `git-stacks --version` outputs `0.13.0` after bump

### CHANGELOG (REL-01)
- **D-03:** CHANGELOG.md must have a `## v0.13.0` section (no "unreleased" marker)
- **D-04:** List all features delivered in Phases 53-56: shell completion fixes, env command, Copilot hook support, doctor forge CLI checks, tmux config example
- **D-05:** Follow existing CHANGELOG format from v0.12.0

### README (REL-02)
- **D-06:** Update README with new user-facing commands: `git-stacks env [workspace]` with format options
- **D-07:** Update README with `install --hooks --copilot` / `--claude` flags
- **D-08:** Add usage examples for new commands where appropriate

### Claude's Discretion
- Exact CHANGELOG entry wording
- README section placement and formatting
- Whether to group changelog by category (Features, Fixes, Improvements) or by phase

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Release artifacts
- `CHANGELOG.md` — Existing changelog; follow v0.12.0 section format
- `README.md` — Current README; identify sections needing updates
- `package.json` — Version field to bump

### Prior release prep
- `.planning/phases/46-release-prep/` — v0.12.0 release prep phase (reference for patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- v0.12.0 release prep pattern — same workflow applies

### Established Patterns
- CHANGELOG groups features by category
- README has sections for each command group
- Version is only in package.json (no other files to update)

### Integration Points
- `src/index.ts` reads version from package.json for `--version` flag (Commander handles this)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow v0.12.0 release pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 57-release-prep*
*Context gathered: 2026-04-02*
