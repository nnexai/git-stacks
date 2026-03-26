# Phase 41: Release Prep - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Bump version to v0.10.0, update CHANGELOG with all new features, and update README with new command documentation and usage examples.

</domain>

<decisions>
## Implementation Decisions

### README documentation
- **D-01:** Full documentation with usage examples for `git-stacks paths` and `git-stacks pull` — including the agent CLI injection pattern for `paths`
- **D-02:** Template composition (`includes:` and multi-`--template`) gets a brief addition to the existing Templates section
- **D-03:** TUI upstream staleness is a dashboard enhancement, not a new command — mention in the dashboard description, no dedicated section

### CHANGELOG format
- **D-04:** One paragraph per feature matching v0.9.0 style: bold title + 2-3 sentence description
- **D-05:** Four features to cover: `paths` command, `pull` command, TUI upstream staleness badges, template composition

### Version bump
- **D-06:** `package.json` version field set to `0.10.0` (REL-01)

### Claude's Discretion
- Exact ordering of features in CHANGELOG
- README section placement for new commands
- Whether to add a "Multi-Agent" or "Agent Tooling" section in README for the agent-facing commands

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files to modify
- `package.json` -- Version field bump to 0.10.0
- `CHANGELOG.md` -- New v0.10.0 section at top, following Keep a Changelog format
- `README.md` -- New command documentation sections

### Prior release format
- `CHANGELOG.md` lines 7-35 -- v0.9.0 and v0.9.1 entries show the established format
- `README.md` lines 1-40 -- Existing structure: concepts, quick start, commands

### Requirements
- `.planning/REQUIREMENTS.md` -- REL-01 through REL-03 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CHANGELOG.md -- established Keep a Changelog format with `## [version] — date` headers
- README.md -- existing command documentation structure to follow

### Established Patterns
- CHANGELOG: `### Changed` / `### Added` / `### Fixed` subsections
- README: Command sections with code block examples
- Version format: semver without `v` prefix in package.json (`0.9.1`), with `v` prefix in docs (`v0.9.1`)

### Integration Points
- No code changes — documentation and version bump only

</code_context>

<specifics>
## Specific Ideas

- Agent CLI injection example in README should show the `--prefix` pattern: `git-stacks paths --prefix "--add-dir"` piped into an agent command

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 41-release-prep*
*Context gathered: 2026-03-26*
