# Requirements: git-stacks v0.11.0

**Defined:** 2026-03-28
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment

## v0.11.0 Requirements

Requirements for AeroSpace Window Management milestone. Each maps to roadmap phases.

### Shell Wrappers & Infrastructure

- [x] **WRAP-01**: User can use AeroSpace integration on macOS when `aerospace` binary is available (typed async CLI wrappers in `src/lib/aerospace.ts` with injectable `_exec`)
- [x] **WRAP-02**: Integration silently skips when AeroSpace is not running (`isAerospaceRunning()` with `process.platform === "darwin"` + binary probe)
- [x] **WRAP-03**: `git-stacks doctor` reports AeroSpace binary availability as warn-level check (macOS-gated)

### Window Detection & Movement

- [ ] **DETECT-01**: Integration detects newly created windows via snapshot-delta (`list-windows --all --format` before/after with exponential backoff, 10s timeout)
- [ ] **DETECT-02**: Integration moves detected windows to the configured AeroSpace workspace (`move-node-to-workspace --window-id`)
- [ ] **DETECT-03**: User can configure target AeroSpace workspace per workspace/template YAML (`settings.integrations.aerospace.workspace`)
- [ ] **DETECT-04**: Integration validates target workspace exists before moving windows (via `list-workspaces --format`)
- [ ] **DETECT-05**: Integration cleanup is a no-op (AeroSpace workspaces are user-managed, not created by integration)

### Layout Control

- [x] **LAYOUT-01**: User can configure root layout for target workspace (`layout` field: `h_tiles`/`v_tiles`/`h_accordion`/`v_accordion`)
- [x] **LAYOUT-02**: User can declare normalization state (`normalization` config field, default `true`) to control layout command selection
- [x] **LAYOUT-03**: User can enable `flatten_before_open` to reset nested containers before window placement
- [x] **LAYOUT-04**: Integration focuses the target AeroSpace workspace after setup when `focus: true` is configured

### App Launching

- [x] **LAUNCH-01**: User can configure a `commands` array to launch arbitrary apps on the target AeroSpace workspace
- [x] **LAUNCH-02**: Windows created by launched commands are detected via snapshot-delta and moved to the target workspace

## Future Requirements

### Deferred

- **MULTI-01**: Multi-monitor window routing via `move-node-to-monitor` — deferred until multi-monitor patterns are established
- **TOML-01**: Auto-detect normalization from `aerospace.toml` instead of user-declared config field — deferred; user config field is simpler

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-creating AeroSpace workspaces | AeroSpace workspaces are defined in `aerospace.toml`; CLI cannot create new workspaces at runtime |
| `split` as layout command | No-op when normalization enabled (common default); use `join-with`/`flatten-workspace-tree` instead |
| `reload-config` after placement | Disrupts all workspace state; too high-impact for unattended automation |
| Window title/decoration setting | AeroSpace does not expose window title mutation |
| `aerospace config --get` introspection | Does not reliably expose all TOML keys; unreliable for automation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WRAP-01 | Phase 43 | Complete |
| WRAP-02 | Phase 43 | Complete |
| WRAP-03 | Phase 43 | Complete |
| DETECT-01 | Phase 44 | Pending |
| DETECT-02 | Phase 44 | Pending |
| DETECT-03 | Phase 44 | Pending |
| DETECT-04 | Phase 44 | Pending |
| DETECT-05 | Phase 44 | Pending |
| LAYOUT-01 | Phase 45 | Complete |
| LAYOUT-02 | Phase 45 | Complete |
| LAYOUT-03 | Phase 45 | Complete |
| LAYOUT-04 | Phase 45 | Complete |
| LAUNCH-01 | Phase 45 | Complete |
| LAUNCH-02 | Phase 45 | Complete |

**Coverage:**
- v0.11.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
