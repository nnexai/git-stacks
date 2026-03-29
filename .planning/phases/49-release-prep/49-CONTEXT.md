# Phase 49: Release Prep - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Bump version to v0.12.0, update CHANGELOG with breaking-change migration example (old flat `workspace:` vs new `workspaces: [...]` array), and update README AeroSpace section with multi-workspace config examples. No code changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All release prep decisions deferred to Claude — user confirmed this is a well-established pattern. Follow Phase 46 (v0.11.0) release prep patterns with the breaking-change addition.

Key areas for Claude to decide:
- Breaking change migration example format (side-by-side YAML before/after recommended by success criteria)
- CHANGELOG structure — feature paragraphs matching v0.10.0/v0.11.0 style
- README AeroSpace section scope — update existing section with multi-workspace examples
- Warning/callout style for breaking change in CHANGELOG
- Whether to mention deferred features (legacy detection, multi-monitor)
- `package.json` version field set to `0.12.0`
- User will test on real macOS device before final publish (established pattern from Phase 46)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files to modify
- `package.json` — Version field bump to 0.12.0
- `CHANGELOG.md` — New v0.12.0 section at top with breaking-change migration example
- `README.md` — AeroSpace integration section updated with multi-workspace config

### Prior release format
- `CHANGELOG.md` — v0.11.0 and v0.10.0 entries show established format
- `README.md` — Existing AeroSpace integration section (added in v0.11.0)

### Phase contexts (feature summaries for CHANGELOG)
- `.planning/phases/47-multi-workspace-schema/47-CONTEXT.md` — Schema decisions (workspaces array, validation)
- `.planning/phases/48-multi-workspace-loop-tests/48-CONTEXT.md` — Loop implementation, routing, focus behavior

### Prior release prep pattern
- `.planning/phases/46-release-prep/46-CONTEXT.md` — v0.11.0 release prep (established format)

### Requirements
- `.planning/REQUIREMENTS.md` — REL-01 defines acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CHANGELOG.md — established Keep a Changelog format
- README.md — existing AeroSpace integration documentation (added in Phase 46)

### Established Patterns
- CHANGELOG: `## [version] -- date` headers with feature paragraphs
- README: Integration sections with YAML config examples
- Version format: semver without `v` prefix in package.json, with `v` prefix in docs

### Integration Points
- No code changes — documentation and version bump only

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow v0.11.0 release prep patterns with breaking-change migration addition.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 49-release-prep*
*Context gathered: 2026-03-29*
