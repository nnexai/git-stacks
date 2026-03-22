# Requirements: git-stacks v0.6.0

**Defined:** 2026-03-21
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v1 Requirements

Requirements for v0.6.0 Integration Orchestration & Niri. Each maps to roadmap phases.

### Orchestration

- [x] **ORCH-01**: Integration `open()` returns typed artifacts (session names, window info) instead of void
- [x] **ORCH-02**: Artifacts accumulate into a shared bag passed to each subsequent integration's `open()` call
- [x] **ORCH-03**: Integration execution uses three-tier ordering: independent setup (tier 1), partial side-effects (tier 2), window management (tier 3)
- [x] **ORCH-04**: Tier assignment is per-integration with extensible numeric priority (not hardcoded to niri)
- [x] **ORCH-05**: Four duplicated integration loops consolidated into a single runner module
- [x] **ORCH-06**: Runner supports both generate-only mode (TUI callers) and generate+open mode (workspace-ops, CLI)
- [x] **ORCH-07**: Existing `--no-ide`/`--no-cmux` skip flags preserved through runner consolidation

### Artifacts

- [x] **ART-01**: tmux integration returns session name artifact
- [x] **ART-02**: cmux integration returns workspace ref artifact
- [x] **ART-03**: VSCode integration returns generic window artifact (pid, app_id, window_title) via best-effort identification
- [x] **ART-04**: IntelliJ integration returns generic window artifact (pid, app_id, window_title) via best-effort identification
- [x] **ART-05**: Window artifact type is shared across all integrations: `{ pid: number; app_id: string; title: string }`
- [x] **ART-06**: Integrations that cannot identify their window return null artifact (graceful degradation)

### Niri

- [ ] **NIRI-01**: Niri integration creates/reuses a named niri workspace per git-stacks workspace via `set-workspace-name`
- [ ] **NIRI-02**: Niri integration moves windows from prior integrations to the named workspace using artifact bag window info
- [ ] **NIRI-03**: Niri integration spawns a terminal on the niri workspace attached to tmux session (reads tmux session name from artifact bag)
- [ ] **NIRI-04**: Niri integration is idempotent on re-open: checks if named workspace exists with expected windows before recreating
- [ ] **NIRI-05**: Niri integration cleans up (unnames workspace) when git-stacks workspace is removed
- [x] **NIRI-06**: Window identification uses snapshot-diff of `niri msg -j windows` (before/after spawn) for spawned windows
- [x] **NIRI-07**: Window identification uses PID matching from artifact bag for windows spawned by other integrations
- [ ] **NIRI-08**: Niri integration is gated by `NIRI_SOCKET` env var presence (skips gracefully when niri is not running)
- [ ] **NIRI-09**: Terminal emulator is configurable (e.g., `terminal: "ghostty"`) with sensible default
- [x] **NIRI-10**: Niri shell wrappers isolated in `src/lib/niri.ts` with clean mock boundary for automated tests

### Testing

- [x] **TEST-01**: Niri shell wrappers (`src/lib/niri.ts`) have a mockable interface — automated tests never call real `niri msg`
- [x] **TEST-02**: Integration runner has unit tests for artifact accumulation, tier ordering, and skip-flag behavior
- [x] **TEST-03**: Existing integration tests continue to pass after `open()` return type change
- [ ] **TEST-04**: Niri integration has unit tests with mocked niri shell wrappers covering workspace create, window move, tmux attach, cleanup

## Future Requirements

Deferred to v0.7.0+.

### Window Management

- **WM-01**: Aerospace (macOS) compositor integration using same tier-3 pattern as niri
- **WM-02**: Native macOS Spaces integration
- **WM-03**: Per-workspace niri layout configuration (column widths, floating positions)

### Integration Enhancements

- **INT-01**: cmux consumes tmux session artifact to spawn attached terminal (tier 2 behavior)
- **INT-02**: Per-template/workspace integration order overrides
- **INT-03**: Integration dependency declarations (formal provides/consumes)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Wayland protocol library (libwayland bindings) | `niri msg` CLI is sufficient; no performance-critical path |
| niri event-stream subprocess | Polling via snapshot-diff is simpler and sufficient for workspace setup |
| Dynamic reordering based on dependency graph | Three-tier numeric priority is extensible enough for v0.6.0 |
| Persisting niri workspace IDs in YAML | niri workspace IDs are session-scoped and ephemeral |
| Named workspace collision handling | git-stacks workspace names are unique (registry-enforced) |
| Live niri calls in automated tests | All niri interactions mocked; live verification during dev only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORCH-01 | Phase 16 | Complete |
| ORCH-02 | Phase 16 | Complete |
| ART-05 | Phase 16 | Complete |
| ART-06 | Phase 16 | Complete |
| TEST-03 | Phase 16 | Complete |
| ORCH-03 | Phase 17 | Complete |
| ORCH-04 | Phase 17 | Complete |
| ORCH-05 | Phase 17 | Complete |
| ORCH-06 | Phase 17 | Complete |
| ORCH-07 | Phase 17 | Complete |
| TEST-02 | Phase 17 | Complete |
| ART-01 | Phase 18 | Complete |
| ART-02 | Phase 18 | Complete |
| ART-03 | Phase 18 | Complete |
| ART-04 | Phase 18 | Complete |
| NIRI-06 | Phase 19 | Complete |
| NIRI-07 | Phase 19 | Complete |
| NIRI-10 | Phase 19 | Complete |
| TEST-01 | Phase 19 | Complete |
| NIRI-01 | Phase 20 | Pending |
| NIRI-02 | Phase 20 | Pending |
| NIRI-03 | Phase 20 | Pending |
| NIRI-04 | Phase 20 | Pending |
| NIRI-05 | Phase 20 | Pending |
| NIRI-08 | Phase 20 | Pending |
| NIRI-09 | Phase 20 | Pending |
| TEST-04 | Phase 20 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation — all 27 requirements mapped to phases 16-20*
