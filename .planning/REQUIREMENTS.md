# Requirements: git-stacks v0.12.0

**Defined:** 2026-03-29
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment

## v0.12.0 Requirements

Requirements for Multi-Workspace AeroSpace milestone. Each maps to roadmap phases.

### Schema & Config

- [x] **SCHEMA-01**: User configures multiple AeroSpace workspaces via a `workspaces` array in integration config
- [x] **SCHEMA-02**: Each workspace entry independently specifies workspace name, layout, normalization, flatten_before_open, focus, and commands
- [x] **SCHEMA-03**: At most one workspace entry may have `focus: true` — validation error otherwise
- [x] **SCHEMA-04**: Duplicate workspace names in the array produce a validation error

### Multi-Workspace Processing

- [x] **PROC-01**: `open()` iterates the workspaces array sequentially, executing flatten → bag-move → commands → layout per entry
- [x] **PROC-02**: Tier-1 bag windows (vscode, intellij) route to `workspaces[0]` only — subsequent entries receive only their own command-launched windows
- [x] **PROC-03**: All target workspace names are validated via a single upfront `listWorkspaces()` call before the loop
- [x] **PROC-04**: Cross-entry snapshot isolation via shared `beforeSet` prevents a slow app from entry A appearing as entry B's window

### Release

- [x] **REL-01**: Version bump to 0.12.0, CHANGELOG with breaking change migration example, README updated with multi-workspace config

## Future Requirements

### Deferred

- **LEGACY-01**: Legacy flat-config detection — detect old `workspace:` field and emit actionable migration warning (deferred from v0.12.0)
- **MULTI-01**: Multi-monitor window routing via `move-node-to-monitor` — deferred until multi-monitor patterns are established
- **TOML-01**: Auto-detect normalization from `aerospace.toml` instead of user-declared config field — deferred; user config field is simpler

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backward compatibility with flat config | Breaking change — array-only schema is cleaner |
| Per-repo window routing | Below current abstraction floor; no demand signal |
| Parallel workspace processing (`Promise.all`) | Breaks snapshot-delta model; sequential is required |
| Auto-creating AeroSpace workspaces | AeroSpace workspaces defined in `aerospace.toml`; CLI cannot create at runtime |
| `setLayout` focus contamination fix | Research recommends `setLayout(layout, windowId)` — implementation detail, not a requirement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 47 | Complete |
| SCHEMA-02 | Phase 47 | Complete |
| SCHEMA-03 | Phase 47 | Complete |
| SCHEMA-04 | Phase 47 | Complete |
| PROC-01 | Phase 48 | Complete |
| PROC-02 | Phase 48 | Complete |
| PROC-03 | Phase 48 | Complete |
| PROC-04 | Phase 48 | Complete |
| REL-01 | Phase 49 | Complete |

**Coverage:**
- v0.12.0 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after Phase 49 completion*
