# Requirements: git-stacks

**Defined:** 2026-04-03
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.14.0 Requirements

Requirements for milestone v0.14.0: Workflow Completion & Workspace UX. Each maps to roadmap phases.

### Ahead/Behind Tracking

- [x] **AB-01**: User can see per-repo commit distance from base branch via `getCommitsAhead` primitive
- [x] **AB-02**: Workspace list info includes aggregated ahead (sum) and behind (max) across worktree repos
- [ ] **AB-03**: `git-stacks list` displays AHEAD and BEHIND columns
- [x] **AB-04**: `git-stacks status <name>` shows per-repo ahead/behind counts
- [ ] **AB-05**: TUI WorkspaceRow displays `↑N ↓N` indicators after branch name
- [ ] **AB-06**: TUI WorkspaceDetail shows per-repo ahead/behind in repo table
- [x] **AB-07**: Staleness detection via FETCH_HEAD mtime with 15-minute threshold and `aheadBehindStale` flag

### Push

- [ ] **PUSH-01**: `pushBranch` git primitive supports `--force`, `--force-with-lease`, and `--set-upstream` options
- [ ] **PUSH-02**: `pushWorkspace` function executes push in parallel across repos, skips trunk repos, reports via progress callback
- [ ] **PUSH-03**: `git-stacks push [name]` CLI command with `--force-with-lease`, `--force`, `--dry-run`, and `--json` flags
- [ ] **PUSH-04**: TUI ActionMenu includes push action with live per-repo progress display

### Labels

- [ ] **LBL-01**: `labels` field on WorkspaceSchema and TemplateSchema (optional string array with regex validation)
- [ ] **LBL-02**: `git-stacks label add/remove/list/clear <workspace>` subcommand for direct label management
- [ ] **LBL-03**: `--label` filter on `git-stacks list` with AND logic when multiple labels specified
- [ ] **LBL-04**: `--label` flag on `git-stacks new` sets labels at workspace creation time
- [ ] **LBL-05**: TUI WorkspaceRow renders label tags after branch name
- [ ] **LBL-06**: TUI filter (`/`) matches against workspace labels in addition to workspace name
- [ ] **LBL-07**: TUI group-by-label toggle (`g` key) with grouped view and [unlabeled] section
- [ ] **LBL-08**: Template labels unioned onto workspace at creation time (not inherited dynamically)

### Secrets

- [ ] **SEC-01**: `${{ resolver:path }}` reference syntax parsed by `parseSecretRef` function
- [ ] **SEC-02**: `resolveSecrets` function resolves all secret references in an env map
- [ ] **SEC-03**: `keychain` resolver auto-detects platform — macOS `security` CLI / Linux `secret-tool`
- [ ] **SEC-04**: `env` resolver reads values from `process.env` without subprocess
- [ ] **SEC-05**: `cmd` resolver executes via `sh -c` and requires explicit opt-in in global config
- [ ] **SEC-06**: Secret resolution integrated in `openWorkspace` between `mergeEnv()` and `writeEnvFiles()`
- [ ] **SEC-07**: `--skip-secrets` flag on open/new logs warnings and substitutes empty strings
- [ ] **SEC-08**: Resolved secret values are never written back to workspace YAML
- [ ] **SEC-09**: `secrets.resolvers` field in global config controls which resolvers are available
- [ ] **SEC-10**: External CLI resolvers enforce 10-second subprocess timeout

### Stash

- [ ] **STH-01**: `stashPush` git primitive with `--include-untracked`, custom message, and stashRef return
- [ ] **STH-02**: `stashPop` git primitive detects conflicts from exit code and stderr
- [ ] **STH-03**: `--stash` flag on `git-stacks sync` auto-stashes dirty repos before sync, pops in reverse after
- [ ] **STH-04**: Stash pop failure preserves stash, emits recovery command, and sets `ok: false` on SyncResult

## Future Requirements (v0.15+)

### Push Enhancements

- **PUSH-F1**: Post-push PR creation suggestion when forge integration is configured

### Additional Secret Resolvers

- **SEC-F1**: 1Password (`op`) CLI resolver
- **SEC-F2**: Doppler CLI resolver
- **SEC-F3**: `pass` (Unix password store) resolver

### Stash Extensions

- **STH-F1**: `--stash` flag on `git-stacks merge`

### Label Enhancements

- **LBL-F1**: Label autocomplete in shell completions (bash/zsh/fish)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bitwarden CLI resolver | No demand yet; `cmd` resolver covers arbitrary secret tools |
| Saved TUI filter state | Needs persistent UI config layer first |
| `--stash` on merge | Ship sync stash first, extend to merge later |
| Label shell completion | Dynamic label reading at completion time adds complexity; defer |
| Post-push PR suggestion | Nice-to-have; users know the forge commands already |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AB-01 | Phase 58 | Complete |
| AB-02 | Phase 58 | Complete |
| AB-03 | Phase 58 | Pending |
| AB-04 | Phase 58 | Complete |
| AB-05 | Phase 58 | Pending |
| AB-06 | Phase 58 | Pending |
| AB-07 | Phase 58 | Complete |
| PUSH-01 | Phase 59 | Pending |
| PUSH-02 | Phase 59 | Pending |
| PUSH-03 | Phase 59 | Pending |
| PUSH-04 | Phase 59 | Pending |
| LBL-01 | Phase 60 | Pending |
| LBL-02 | Phase 60 | Pending |
| LBL-03 | Phase 60 | Pending |
| LBL-04 | Phase 60 | Pending |
| LBL-05 | Phase 60 | Pending |
| LBL-06 | Phase 60 | Pending |
| LBL-07 | Phase 60 | Pending |
| LBL-08 | Phase 60 | Pending |
| SEC-01 | Phase 61 | Pending |
| SEC-02 | Phase 61 | Pending |
| SEC-03 | Phase 61 | Pending |
| SEC-04 | Phase 61 | Pending |
| SEC-05 | Phase 61 | Pending |
| SEC-06 | Phase 61 | Pending |
| SEC-07 | Phase 61 | Pending |
| SEC-08 | Phase 61 | Pending |
| SEC-09 | Phase 61 | Pending |
| SEC-10 | Phase 61 | Pending |
| STH-01 | Phase 62 | Pending |
| STH-02 | Phase 62 | Pending |
| STH-03 | Phase 62 | Pending |
| STH-04 | Phase 62 | Pending |

**Coverage:**
- v0.14.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation*
