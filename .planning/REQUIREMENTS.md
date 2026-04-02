# Requirements: git-stacks

**Defined:** 2026-04-02
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment.

## v0.13.0 Requirements

Requirements for CLI Polish & Completions milestone. Each maps to roadmap phases.

### Completions

- [ ] **COMP-01**: Shell completion stops offering values after all positional args are filled
- [ ] **COMP-02**: Completion generator includes option value enums for all enum-style flags
- [ ] **COMP-03**: Parent command flags do not leak into subcommand completions

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

- [ ] **CFG-01**: Tmux integration `configExample` shows pane setup via `post_open` hooks

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
| COMP-01 | — | Pending |
| COMP-02 | — | Pending |
| COMP-03 | — | Pending |
| CMD-01 | — | Pending |
| CMD-02 | — | Pending |
| HOOK-01 | — | Pending |
| HOOK-02 | — | Pending |
| HOOK-03 | — | Pending |
| HOOK-04 | — | Pending |
| DOC-01 | — | Pending |
| CFG-01 | — | Pending |
| REL-01 | — | Pending |
| REL-02 | — | Pending |
| REL-03 | — | Pending |

**Coverage:**
- v0.13.0 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after initial definition*
