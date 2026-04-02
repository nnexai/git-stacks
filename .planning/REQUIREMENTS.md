# Requirements: git-stacks

**Defined:** 2026-04-02
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment.

## v0.13.0 Requirements

Requirements for CLI Polish & Completions milestone. Each maps to roadmap phases.

### Completions

- [ ] **COMP-01**: Shell completion stops offering values after all positional args are filled
- [ ] **COMP-02**: Completion generator includes option value enums for all enum-style flags
- [x] **COMP-03**: Parent command flags do not leak into subcommand completions

### CLI Commands

- [ ] **CMD-01**: User can run `git-stacks env [workspace]` to see all merged env vars
- [ ] **CMD-02**: `git-stacks env` supports `--format shell|dotenv|json` output modes

### Agent Hooks

- [ ] **HOOK-01**: `git-stacks install --hooks` supports `--copilot` flag to generate Copilot hooks
- [ ] **HOOK-02**: `git-stacks install --hooks` supports `--claude` flag (existing behavior, now explicit)
- [ ] **HOOK-03**: When neither flag is passed, interactive prompt lets user choose which hook sets
- [ ] **HOOK-04**: Both Claude and Copilot hooks can be installed simultaneously

### Doctor

- [ ] **DOC-01**: `git-stacks doctor` checks for forge CLI binaries when respective integrations are configured

### Config Examples

- [ ] **CFG-01**: Tmux integration `configExample` shows native pane layout configuration (`panes` array with direction, surfaces, commands)

### Release

- [ ] **REL-01**: CHANGELOG has v0.13.0 section maintained incrementally as features land
- [ ] **REL-02**: README updated incrementally as user-facing features land
- [ ] **REL-03**: Final release audit verifies CHANGELOG/README completeness, removes "unreleased", bumps version

## Future Requirements

(none deferred from this milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Copilot hooks per-tool matcher | Copilot has no per-tool filter; scripts inspect `toolName` from stdin JSON |
| Cloud coding agent branch detection | Unknown if agent reads hooks from worktree or default branch; document limitation |
| New integration plugins | This is a polish milestone, not a feature milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 53 | Pending |
| COMP-02 | Phase 53 | Pending |
| COMP-03 | Phase 53 | Complete |
| CMD-01 | Phase 54 | Pending |
| CMD-02 | Phase 54 | Pending |
| HOOK-01 | Phase 55 | Pending |
| HOOK-02 | Phase 55 | Pending |
| HOOK-03 | Phase 55 | Pending |
| HOOK-04 | Phase 55 | Pending |
| DOC-01 | Phase 56 | Pending |
| CFG-01 | Phase 56 | Pending |
| REL-01 | Phase 57 | Pending |
| REL-02 | Phase 57 | Pending |
| REL-03 | Phase 57 | Pending |

**Coverage:**
- v0.13.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 — traceability mapped to Phases 53-57*
