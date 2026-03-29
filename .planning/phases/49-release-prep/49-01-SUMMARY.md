---
phase: 49-release-prep
plan: 01
status: complete
started: 2026-03-29T14:00:00.000Z
completed: 2026-03-29T14:05:00.000Z
---

## Summary

Release preparation for v0.12.0: bumped package.json version to 0.12.0, added CHANGELOG entry documenting the breaking schema change from flat AeroSpace config to multi-workspace array format with a side-by-side migration example, and updated README AeroSpace section with a two-entry multi-workspace config example showing different layout and focus settings.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Bump version in package.json to 0.12.0 | Done |
| 2 | Add v0.12.0 CHANGELOG entry with breaking change | Done |
| 3 | Update README AeroSpace section with multi-workspace config | Done |

## Key Files

### Modified
- `package.json` — version bumped from 0.11.1 to 0.12.0
- `CHANGELOG.md` — new v0.12.0 section with breaking change, migration example, and 3 feature entries
- `README.md` — AeroSpace section updated with multi-workspace bullet points and 2-entry YAML example

## Self-Check: PASSED

All acceptance criteria verified:
- package.json contains "version": "0.12.0"
- CHANGELOG.md has ## [0.12.0] section above ## [0.11.1]
- CHANGELOG.md documents BREAKING change with migration example
- CHANGELOG.md covers multi-workspace support, focus/duplicate validation, cross-entry snapshot isolation
- README.md AeroSpace section shows workspaces array with two entries (workspace "2" h_tiles focus:true, workspace "3" v_accordion)
- README.md integration table row unchanged
- Niri and forge sections unchanged
- Typecheck passes

## Deviations

None.
