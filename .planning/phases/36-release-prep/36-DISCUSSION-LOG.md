# Phase 36: Release Prep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 36-Release Prep
**Areas discussed:** Breaking changes

---

## Todo Cross-Reference

| Todo | Score | Decision |
|------|-------|----------|
| Hide globally disabled integrations in TUI dashboard | 0.9 | Folded — user noted "should be a simple thing, so include it" |

---

## Breaking Changes

| Option | Description | Selected |
|--------|-------------|----------|
| Not breaking | Existing configs still work — name field defaults to filename stem. Document as behavioral change under 'Changed'. | ✓ |
| Soft breaking | Document under 'Breaking Changes' with migration note: run `git-stacks doctor` to detect drift. | |
| You decide | Claude assesses based on codebase evidence | |

**User's choice:** Not breaking
**Notes:** Name-based identity is a behavioral improvement, not a breaking change. No migration notes needed.

---

## Claude's Discretion

- Changelog detail level and section organization
- Whether to mention Phase 34.1 (test infrastructure) in changelog
- README sections to update
- TUI dashboard fix documentation

## Deferred Ideas

None
