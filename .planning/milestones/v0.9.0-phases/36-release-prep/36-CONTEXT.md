# Phase 36: Release Prep - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship v0.9.0 — bump version in package.json, document all changes in CHANGELOG.md, and update README.md for any new or changed commands introduced in this milestone. Also includes a small TUI fix (hide globally disabled integrations in dashboard).

</domain>

<decisions>
## Implementation Decisions

### Breaking Changes
- **D-01:** v0.9.0 has NO breaking changes. Name-based identity (Phase 33) is a behavioral improvement, not a breaking change — existing configs still work because the `name` field defaults to the filename stem. Document under "Changed", not "Breaking Changes".

### Claude's Discretion
- Changelog detail level per feature — follow established format (Added/Changed/Fixed sections with brief descriptions)
- Which Phase 34.1 (test infrastructure) changes to mention — internal improvements can be noted briefly or omitted
- README sections that need updating — `template rename` is new, name-based identity changes lookup behavior, dynamic completion is new
- How to document the TUI dashboard fix (hide globally disabled integrations)

### Folded Todos
- **Hide globally disabled integrations in TUI dashboard** — integrations disabled in global config should not appear in the TUI dashboard. Small UI fix folded into release prep scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Version & changelog
- `package.json` — current version (0.8.0), bump target (0.9.0)
- `CHANGELOG.md` — existing format and prior release notes to match style
- `README.md` — current documentation to update for new commands/behaviors

### Milestone context
- `.planning/ROADMAP.md` — Phase 33-36 descriptions and success criteria for what shipped
- `.planning/REQUIREMENTS.md` — IDEN-01 through IDEN-04, COMP-01 through COMP-05 requirement status
- `.planning/PROJECT.md` — "What shipped in v0.8.0" section as style reference for the project state update

### Prior phase context (what changed)
- `.planning/phases/33-name-based-identity/33-CONTEXT.md` — name-based lookup, rename, doctor drift detection
- `.planning/phases/34-completion-audit-forge-issue-coverage/34-CONTEXT.md` — completion audit, dynamic completions for integrations
- `.planning/phases/35-dynamic-name-completion/35-CONTEXT.md` — YAML name-field based shell completion

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CHANGELOG.md` — established format with Added/Fixed/Breaking Changes/Known Issues sections per version
- `README.md` — structured with Concepts, Quick Start, Commands, Integrations sections
- `.planning/PROJECT.md` — "What shipped" sections serve as detailed change summaries

### Established Patterns
- Changelog entries are brief (1-2 sentence descriptions) with sub-bullets for details
- Version numbers follow semver: `[major.minor.patch] — YYYY-MM-DD`
- README command docs follow pattern: command signature, description, example

### Integration Points
- `package.json` version field — single source of version truth
- `src/index.ts` may reference version via `.version()` on the commander program

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None — the single matched todo was folded into scope.

</deferred>

---

*Phase: 36-release-prep*
*Context gathered: 2026-03-25*
