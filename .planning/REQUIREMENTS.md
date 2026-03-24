# Requirements: git-stacks

**Defined:** 2026-03-24
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.8.0 Requirements

Requirements for v0.8.0 Integration Polish & Workspace UX. Each maps to roadmap phases.

### Bug Fixes

- [ ] **BUG-01**: Dashboard displays per-workspace linked issues instead of falling back to global Jira config
- [ ] **BUG-02**: Branch names containing '/' are handled correctly for GitLab `open` and `pr` commands

### Workspace UX

- [ ] **WUX-01**: Worktree creation checks for existing upstream branch and sets up tracking automatically
- [ ] **WUX-02**: Jira integration auto-detects current workspace from working directory path
- [ ] **WUX-03**: Auto-detection extends to all tracker integrations (GitHub, GitLab, Gitea issue commands)

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Programmatic API

- **API-01**: Export `workspace-ops.ts` as typed package with `Result<T>` return type
- **API-02**: Version gate for v1.0 stability declaration

### Power User Features

- **PWR-01**: `clone --pr <N>` to create workspace from existing PR
- **PWR-02**: WezTerm/Zellij terminal integrations
- **PWR-03**: Per-repo ahead/behind counts in status output

### Agent-Aware

- **AGT-01**: Batch workspace generation (`new --count N`)
- **AGT-02**: Agent status file protocol
- **AGT-03**: Windows IPC fallback

### TUI Completeness

- **TUI-01**: Add repo from TUI (R-02)
- **TUI-02**: Scan repos from TUI (R-03)
- **TUI-03**: Cursor movement tests (T-03)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New issue tracker integrations (Linear, Asana, etc.) | Current 4 trackers cover primary use cases |
| `--issue` flag on `git-stacks new` | Retroactive linking via `issue link` is sufficient for now |
| Dashboard issue editing/creation | Out of domain — delegate to native tracker CLIs |
| CWD detection for non-issue commands | Separate feature; may revisit for `open`/`status` in future |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 30 | Pending |
| BUG-02 | Phase 32 | Pending |
| WUX-01 | Phase 29 | Pending |
| WUX-02 | Phase 31 | Pending |
| WUX-03 | Phase 31 | Pending |

**Coverage:**
- v0.8.0 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 — traceability updated after roadmap creation*
