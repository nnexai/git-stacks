# Phase 79: Release Prep - Discussion Log

**Gathered:** 2026-04-06
**Status:** Complete

## Area: Changelog scope

### Q1
**Question:** What should the overall v0.17.0 changelog voice be?

**Options presented:**
- User-facing first (Recommended)
- Balanced: user-facing plus brief internal notes
- Exhaustive engineering audit trail

**Selected:** User-facing first

### Q2
**Question:** How should the template-label work appear in the v0.17.0 entry?

**Options presented:**
- One cohesive feature bullet covering template label commands, filtering, and propagation (Recommended)
- Two bullets: CLI commands and propagation/filtering separately
- High-level mention only: templates now support labels

**Selected:** One cohesive feature bullet covering template label commands, filtering, and propagation

### Q3
**Question:** How should the reliability/internal milestone work be grouped in the changelog?

**Options presented:**
- Roll it up into a small number of outcome-focused bullets (Recommended)
- List each phase separately as distinct bullets
- Keep internal work out of the changelog unless it changed user behavior

**Selected:** Roll it up into a small number of outcome-focused bullets

### Q4
**Question:** Which section structure do you want for the v0.17.0 entry?

**Options presented:**
- Added / Changed / Internal (Recommended)
- Added / Changed only
- Single unsectioned release note

**Selected:** Added / Changed / Internal

## Summary

- Capture v0.17.0 as a release note, not an internal audit trail.
- Keep template labels as one cohesive release-note item.
- Group engine hardening into a few outcome-oriented bullets.
- Use `Added / Changed / Internal` sectioning.

## Prior constraints carried into discussion

- Phase 78.1 context locks a release-note rule: do not mention the reverted capabilities-column surface as a user-facing v0.17.0 change.

---

*Phase: 79-release-prep*
*Discussion captured: 2026-04-06*
