# Phase 68: Release Prep - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

v0.15.0 ships with updated version, changelog, and README documentation for dir mode. This is the final phase of the v0.15.0 milestone — no code changes, only release artifacts.

</domain>

<decisions>
## Implementation Decisions

### Version Bump
- **D-01:** Change `package.json` version from `"0.14.0-rc.0"` to `"0.15.0"`. `src/lib/version.ts` reads version dynamically at runtime via `Bun.file()` — no other files need version updates.

### CHANGELOG Format
- **D-02:** Single `## [0.15.0] — {date}` entry using Keep a Changelog format with `### Added` subsection documenting dir mode as a cohesive feature area covering Phases 64-67 (schema/registry, lifecycle, git guards, display/health).
- **D-03:** Group related behaviors into logical feature descriptions (not one entry per phase). Follow v0.14.0 pattern of bold feature title + description paragraph.

### README Documentation
- **D-04:** Add a brief standalone `## Dir Repos` section explaining the concept and expected behavior in one place — similar to existing `## Labels` or `## Multi-Repo Pull` sections.
- **D-05:** Also update existing Concepts section to mention the third mode alongside worktree and trunk.

### Scope
- **D-06:** Zero code changes — only `package.json` (version field), `CHANGELOG.md`, and `README.md` need modification.

### Claude's Discretion
- Exact wording and paragraph structure of CHANGELOG entries
- Level of detail in README dir mode section
- Whether to mention dir mode in any other existing README sections beyond Concepts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Release files
- `package.json` — Version field (line 3), currently `"0.14.0-rc.0"`
- `CHANGELOG.md` — Keep a Changelog format, prior entries as style guide
- `README.md` — Concepts section (~line 25), Repo Registry section (~lines 48-56), standalone feature sections

### Version mechanism
- `src/lib/version.ts` — Reads version dynamically from package.json at runtime

### Prior release prep
- `.planning/milestones/v0.14.0-phases/63-release-prep/63-01-PLAN.md` — Prior release prep plan (same 3-file pattern)

### Dir mode implementation (for CHANGELOG/README content)
- `.planning/phases/64-schema-registry/64-CONTEXT.md` — Schema decisions (type: dir, mode: dir, optional task_path)
- `.planning/phases/65-workspace-lifecycle/65-CONTEXT.md` — Lifecycle guards (open/close/clean/remove)
- `.planning/phases/66-git-operation-guards/66-CONTEXT.md` — Git operation guards (push/pull/sync/merge/ahead-behind/dirty)
- `.planning/phases/67-status-display-health/67-CONTEXT.md` — Display and health (status, list, TUI, doctor)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Prior release prep plan (Phase 63) as template for task structure
- CHANGELOG.md existing entries as style guide for formatting
- README.md existing standalone sections as template for Dir Repos section

### Established Patterns
- Version bump is a single `package.json` edit — `version.ts` reads dynamically
- CHANGELOG uses Keep a Changelog format: `## [version] — date` + `### Added/Fixed/Changed`
- README feature sections use `## Feature Name` with brief description and usage examples

### Integration Points
- `package.json` version field → `src/lib/version.ts` → `git-stacks --version` output
- CHANGELOG entry → user-facing release notes
- README sections → user onboarding documentation

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching prior release prep patterns.

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope

</deferred>

---

*Phase: 68-release-prep*
*Context gathered: 2026-04-05*
