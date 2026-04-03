# Phase 46: Release Prep - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Bump version to v0.11.0, update CHANGELOG with all AeroSpace features, and update README with AeroSpace integration documentation and config examples. User will test on a real macOS device before final publish.

</domain>

<decisions>
## Implementation Decisions

### README documentation
- **D-01:** Add AeroSpace integration section to README following existing integration documentation pattern (tmux, niri sections)
- **D-02:** Include YAML config examples showing workspace targeting, layout control, normalization, and commands array
- **D-03:** Note macOS-only requirement and AeroSpace binary dependency

### CHANGELOG format
- **D-04:** One paragraph per feature matching v0.10.0 style: bold title + 2-3 sentence description
- **D-05:** Four features to cover: AeroSpace shell wrappers, core integration plugin, layout control & normalization, app launching with snapshot-delta detection

### Version bump
- **D-06:** `package.json` version field set to `0.11.0`

### Pre-release testing
- **D-07:** User will do a test version on a real macOS device before final publish. Release prep should produce a complete but unpublished state — version bumped, docs updated, ready to publish after manual testing.

### Claude's Discretion
- Exact ordering of features in CHANGELOG
- README section placement for AeroSpace integration
- Level of detail in config examples
- Whether to mention deferred features (multi-monitor, TOML auto-detection)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files to modify
- `package.json` -- Version field bump to 0.11.0
- `CHANGELOG.md` -- New v0.11.0 section at top
- `README.md` -- AeroSpace integration documentation

### Prior release format
- `CHANGELOG.md` -- v0.10.0 and v0.9.0 entries show established format
- `README.md` -- Existing integration documentation sections

### Phase contexts (feature summaries)
- `.planning/phases/43-aerospace-shell-wrappers-doctor/43-CONTEXT.md` -- Shell wrappers feature
- `.planning/phases/44-core-integration-plugin/44-CONTEXT.md` -- Core integration feature
- `.planning/phases/45-layout-control-app-launching/45-CONTEXT.md` -- Layout control and app launching features

### Prior release prep
- `.planning/milestones/v0.10.0-phases/41-release-prep/41-CONTEXT.md` -- v0.10.0 release prep pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CHANGELOG.md -- established Keep a Changelog format
- README.md -- existing integration documentation structure

### Established Patterns
- CHANGELOG: `## [version] -- date` headers with feature paragraphs
- README: Integration sections with YAML config examples
- Version format: semver without `v` prefix in package.json, with `v` prefix in docs

### Integration Points
- No code changes -- documentation and version bump only

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- follow v0.10.0 release prep patterns.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 46-release-prep*
*Context gathered: 2026-03-28*
