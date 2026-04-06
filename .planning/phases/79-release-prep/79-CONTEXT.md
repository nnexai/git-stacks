# Phase 79: Release Prep - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Prepare `git-stacks` v0.17.0 for release by bumping the package version to `0.17.0`, updating `CHANGELOG.md` to cover the milestone accurately, and updating `README.md` so template-label commands and `GS_DEBUG` module-filter usage are documented. This phase is release polish and packaging only; it does not add new product capability.

Out of scope: shipping new features, revisiting completed milestone implementation work, or reintroducing the reverted Phase 78.1 capability-list surface.

</domain>

<decisions>
## Implementation Decisions

### Changelog scope
- **D-01:** The v0.17.0 changelog should be **user-facing first**, not an exhaustive engineering audit trail.
- **D-02:** Template-label work should appear as **one cohesive feature bullet** covering template label commands, template filtering, and propagation to created workspaces.
- **D-03:** Reliability and engine-hardening work should be grouped into a **small number of outcome-focused bullets**, not split phase-by-phase.
- **D-04:** The v0.17.0 entry should use **Added / Changed / Internal** sections.

### Claude's Discretion
- Exact wording and bullet count inside each changelog section, as long as D-01 through D-04 hold.
- Exact README placement and example depth for template-label and debug documentation, as long as the Phase 79 success criteria are met.
- Exact release-heading date formatting and surrounding copy, as long as the release is presented as ship-ready `0.17.0`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone scope
- `.planning/ROADMAP.md` §Phase 79 — release-prep goal and success criteria (`0.17.0` version bump, changelog entry, README updates).
- `.planning/STATE.md` — current milestone state and accumulated decisions from Phases 74-78.1 that determine what v0.17.0 shipped.
- `.planning/REQUIREMENTS.md` — milestone requirements list to ensure the changelog covers the actual v0.17.0 feature set.
- `.planning/PROJECT.md` §Current Milestone: v0.17.0 Engine Hardening & Template Labels — milestone narrative and shipped-feature summary.

### Locked prior decision affecting release notes
- `.planning/phases/78.1-turn-capability-enums-into-actual-typescript-interface-inste/78.1-CONTEXT.md` §Documentation & requirements cleanup, D-16 — Phase 78.1 capability-list add/remove churn must not appear as a user-facing v0.17.0 changelog item.

### Versioning surface
- `package.json` — canonical package version field, currently `0.16.0`, to be bumped to `0.17.0`.
- `src/lib/version.ts` — CLI version string is derived from `package.json` and optional git metadata.
- `src/index.ts` — Commander `.version(versionString)` wiring that exposes the bumped version via `git-stacks --version`.

### Documentation surfaces to update
- `CHANGELOG.md` — existing release-note format and insertion point for the new `0.17.0` entry.
- `README.md` §Debug Output and §Labels — current docs anchor points; debug section still centers `GIT_STACKS_DEBUG=1`, and labels section documents workspace labels but not template-label commands.
- `src/commands/template.ts` — source of truth for `git-stacks template label add|remove|list|clear` and `template list --label`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/version.ts`: reads `package.json` directly, so a package version bump automatically feeds the CLI version string.
- `src/index.ts`: already registers the computed version with Commander; no extra release wiring is needed beyond the existing version helper.
- `src/commands/template.ts`: defines the full template-label CLI surface that README should document.
- `README.md` already has dedicated `## Debug Output` and `## Labels` sections that can be extended instead of adding new top-level structure.

### Established Patterns
- `CHANGELOG.md` uses released-version headings with dated entries and grouped subsections such as `Added`, `Changed`, and `Internal`.
- `README.md` is command-centric: short explanatory text followed by fenced command examples and one clarifying paragraph.
- Release-visible behavior is usually described as outcomes, while lower-level refactors are better grouped under concise internal/reliability notes.

### Integration Points
- `package.json` version bump feeds `src/lib/version.ts`, which feeds `src/index.ts --version`.
- `CHANGELOG.md` must reflect the actual shipped milestone work from Phases 74, 75, 77, and 78 while honoring the Phase 78.1 no-mention rule.
- `README.md` should extend existing label/debug sections to cover template-label commands and `GS_DEBUG` module filters without inventing a new documentation structure.

</code_context>

<specifics>
## Specific Ideas

- The changelog should read like a release note, not a commit log.
- Template labels should be described as one coherent capability: commands + filtering + propagation to workspaces.
- Internal hardening should be summarized by user-relevant outcomes rather than by roadmap phase numbers.
- The final v0.17.0 entry should use `Added / Changed / Internal`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 79-release-prep*
*Context gathered: 2026-04-06*
