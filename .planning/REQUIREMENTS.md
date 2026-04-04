# Requirements: git-stacks v0.15.0

**Defined:** 2026-04-04
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.15.0 Requirements

Requirements for the Dir Mode & Polish milestone.

### Schema

- [ ] **SCHM-01**: User can set repo type to "dir" in registry and template YAML
- [ ] **SCHM-02**: Workspace YAML stores dir repos with mode "dir" and resolves main_path only (no task_path, no branch)

### Registry

- [ ] **REG-01**: User can add a non-git directory to the repo registry via `repo add`
- [ ] **REG-02**: `repo scan` detects and offers to register plain directories alongside git repos

### Workspace Lifecycle

- [ ] **LIFE-01**: `git-stacks new` includes dir repos from template — references main_path directly, creates no worktree or branch
- [ ] **LIFE-02**: `git-stacks open` includes dir repos in env/hook context but skips git operations
- [ ] **LIFE-03**: `git-stacks close`/`clean`/`remove` skip worktree deletion for dir repos (nothing to delete)

### Git Operations

- [ ] **GIT-01**: `git-stacks push` skips dir repos entirely
- [ ] **GIT-02**: `git-stacks pull` skips dir repos entirely
- [ ] **GIT-03**: `git-stacks sync` skips dir repos entirely
- [ ] **GIT-04**: `git-stacks merge` skips dir repos (no branch to merge)
- [ ] **GIT-05**: Ahead/behind tracking skips dir repos (no git state)
- [ ] **GIT-06**: Dirty file detection skips dir repos

### Status & Display

- [ ] **DISP-01**: `git-stacks status` shows dir repos with a "dir" label and no git metrics
- [ ] **DISP-02**: `git-stacks list` includes workspaces with dir repos without git aggregation errors
- [ ] **DISP-03**: TUI dashboard shows dir repos in workspace detail with "dir" indicator, no git badges

### Health

- [ ] **HLTH-01**: `git-stacks doctor` skips git health checks for dir repos
- [ ] **HLTH-02**: `git-stacks doctor` validates that dir repo paths exist and are accessible directories

## Future Requirements

Deferred to later in v0.15.0 or beyond — will be added after initial dir mode usage.

- Additional polish and fixes TBD

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dir repos participating in git operations | Contradicts the purpose — dirs are non-git by definition |
| Dir repos creating worktrees | No .git to worktree from |
| Automatic dir content syncing | Not a git-stacks concern; use rsync/hooks if needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 64 | Pending |
| SCHM-02 | Phase 64 | Pending |
| REG-01 | Phase 64 | Pending |
| REG-02 | Phase 64 | Pending |
| LIFE-01 | Phase 65 | Pending |
| LIFE-02 | Phase 65 | Pending |
| LIFE-03 | Phase 65 | Pending |
| GIT-01 | Phase 66 | Pending |
| GIT-02 | Phase 66 | Pending |
| GIT-03 | Phase 66 | Pending |
| GIT-04 | Phase 66 | Pending |
| GIT-05 | Phase 66 | Pending |
| GIT-06 | Phase 66 | Pending |
| DISP-01 | Phase 67 | Pending |
| DISP-02 | Phase 67 | Pending |
| DISP-03 | Phase 67 | Pending |
| HLTH-01 | Phase 67 | Pending |
| HLTH-02 | Phase 67 | Pending |

**Coverage:**
- v0.15.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 — phase assignments added*
