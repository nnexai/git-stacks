# Phase 41: Release Prep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 41-Release Prep
**Areas discussed:** README documentation scope, CHANGELOG detail level

---

## README documentation scope

| Option | Description | Selected |
|--------|-------------|----------|
| paths + pull only | Full docs with examples for paths and pull. Template composition brief note. TUI staleness in dashboard description. | ✓ |
| All four features equally | Full docs for all four features | |
| You decide | Claude determines based on REL-03 | |

**User's choice:** paths + pull only
**Notes:** Matches REL-03 which specifically calls out paths and pull with agent CLI injection examples.

---

## CHANGELOG detail level

| Option | Description | Selected |
|--------|-------------|----------|
| One paragraph each | Bold title + 2-3 sentences, matches v0.9.0 style | ✓ |
| Bullet-point summary | One-liner per feature | |
| You decide | Claude matches existing style | |

**User's choice:** One paragraph each
**Notes:** Consistent with established v0.9.0 format.

---

## Claude's Discretion

- Feature ordering in CHANGELOG
- README section placement
- Whether to add agent-focused section in README

## Deferred Ideas

None -- discussion stayed within phase scope
