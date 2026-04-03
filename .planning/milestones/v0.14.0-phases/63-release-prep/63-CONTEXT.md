# Phase 63: Release Prep - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Version bump, CHANGELOG, and README updates for v0.14.0 release. Standard release-prep phase following established pattern from prior milestones.

</domain>

<decisions>
## Implementation Decisions

### Version bump
- **D-01:** Bump `package.json` version to `0.14.0` (from current `0.13.0-rc.1`).

### CHANGELOG
- **D-02:** Add v0.14.0 entry covering all 5 feature areas: Ahead/Behind Tracking, Push, Labels, Secrets, Stash on Sync.
- **D-03:** Follow existing CHANGELOG format from prior releases.

### README
- **D-04:** Document new commands: `git-stacks push`, `git-stacks label` (add/remove/list/clear).
- **D-05:** Document new flags: `--skip-secrets` on open/new, `--stash` on sync, `--label` on list/new, `--fetch` on status.
- **D-06:** Document secret reference syntax (`${{ resolver:path }}`).

### Claude's Discretion
- CHANGELOG entry wording and structure
- README section placement and ordering
- Whether to update FEATURES.md (mark shipped features)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/ROADMAP.md` §"Phase 63: Release Prep" — Success criteria

### Prior release prep phases (pattern reference)
- `.planning/phases/57-release-prep/` — v0.13.0 release prep (most recent)

### Files to update
- `package.json` — version field
- `CHANGELOG.md` — new version entry
- `README.md` — command and flag documentation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Prior release prep phases establish the pattern
- `src/lib/version.ts` — version display function (reads from package.json)

### Established Patterns
- Version bump in package.json only (bun.lock updates automatically)
- CHANGELOG follows Keep a Changelog format
- README command documentation follows existing section structure

### Integration Points
- `package.json` version field
- CHANGELOG.md
- README.md

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow established release-prep pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 63-release-prep*
*Context gathered: 2026-04-03*
