# Requirements: git-stacks

**Defined:** 2026-05-15
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.18.0 Requirements

Requirements for v0.18.0 Workspace File Sync and Forge Sources. Each maps to roadmap phases.

### Files Sync

- [x] **FSYNC-01**: User can define `files.sync` entries in templates and workspaces with `source`, `target`, and optional `git_exclude` fields.
- [x] **FSYNC-02**: User can pull a sync source into a workspace target as real files without using symlinks.
- [x] **FSYNC-03**: User can configure synced targets to be excluded through the worktree-local `.git/info/exclude` file, not through project `.gitignore`.
- [x] **FSYNC-04**: User can run `git-stacks files status [workspace]` to see copy/symlink/sync file materialization state, with sync drift visible at a useful summary level.
- [x] **FSYNC-05**: User can run `git-stacks files pull [workspace]` to refresh sync targets from their sources.
- [x] **FSYNC-06**: User can run `git-stacks files push [workspace]` to explicitly sync workspace target changes back to their sources.
- [x] **FSYNC-07**: Sync push detects obvious conflicts and refuses unsafe writes by default without requiring a full per-file hash manifest for large trees.
- [x] **FSYNC-08**: Sync delete/overwrite behavior is conservative by default and requires explicit flags or documented policy before removing source-side files.
- [x] **FSYNC-09**: Sync commands support machine-readable output suitable for future TUI and automation use.

### Forge Sources

- [x] **FSRC-01**: User can create a normal template-backed workspace with `git-stacks new <name> --template <template> --source <forge-url>`.
- [x] **FSRC-02**: GitLab merge request URLs are researched and resolved first through the enabled GitLab integration, with documented `glab` limitations and validation constraints.
- [x] **FSRC-03**: Forge source resolution matches the source target repository to a repo in the selected template using existing registry/forge/upstream metadata where possible.
- [x] **FSRC-04**: If source-to-template repo matching is missing, ambiguous, or points at a `trunk`/`dir` repo, the user receives a clear failure with an explicit override path where appropriate.
- [x] **FSRC-05**: For the matched worktree repo, workspace creation checks out or fetches the merge-request/pull-request branch/ref while other worktree repos use normal workspace branch creation.
- [x] **FSRC-06**: Workspaces created from forge sources record source metadata in workspace YAML, including forge type, URL, matched repo, change number, and title when available.
- [x] **FSRC-07**: Forge source work auto-labels created workspaces with useful review/source labels such as `review`, forge id, and change number.
- [x] **FSRC-08**: Gitea and GitHub source support are designed after GitLab, with at least URL parsing and resolver contract tests even if full live validation is deferred.

### Documentation and Release

- [x] **DOCS-01**: README documents `files.sync`, `git-stacks files status|pull|push`, local exclude behavior, and the manual push-back model.
- [ ] **DOCS-02**: README documents forge `--source` workspace creation with GitLab-first examples and clear notes about live forge validation requirements.
- [ ] **REL-01**: v0.18.0 release artifacts describe user-facing file sync and forge-source workspace creation behavior without overstating unverified live forge coverage.

## Future Requirements

### Workspace Operations

- **NOTE-01**: User can add, list, show, and clear lightweight workspace notes stored outside project repos.
- **STAL-01**: User can run `git-stacks stale` to classify accumulated workspaces as active, idle, ready-to-clean, needs-attention, or orphaned.
- **WCMD-01**: User can define named manual workspace commands for repeatable operator shortcuts.

### TUI

- **TUI-01**: TUI dashboard surfaces file sync status, forge source metadata, notes, and stale classifications once the underlying CLI behavior is stable.

### Template Ergonomics

- **TMPL-01**: User can preview or explain resolved template composition with source attribution for included templates.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automatic sync-back on close/clean/remove/open | Sync-back should remain explicit until conflict behavior has proven safe. |
| Full per-file hash manifest for every sync tree | Large `.planning` trees would make exhaustive manifests noisy and expensive; v0.18.0 should use lighter drift/conflict signals. |
| Symlink-based solution for planning/agent config | Agents may refuse external symlink targets; `files.sync` should materialize real files. |
| Ticket/issue-based workspace creation | Related to forge sources but different semantics; v0.18.0 focuses on MR/PR-style forge changes. |
| Live GitLab/Gitea/GitHub matrix as a release gate | The user cannot fully test live `glab`; local contracts and documented validation boundaries are acceptable for initial forge-source work. |
| Broad TUI redesign | Captured separately; only docs/JSON hooks needed for future TUI are in this milestone. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FSYNC-01 | Phase 89 | Complete |
| FSYNC-02 | Phase 89 | Complete |
| FSYNC-03 | Phase 89 | Complete |
| FSYNC-04 | Phase 90 | Complete |
| FSYNC-05 | Phase 90 | Complete |
| FSYNC-06 | Phase 90 | Complete |
| FSYNC-07 | Phase 90 | Complete |
| FSYNC-08 | Phase 90 | Complete |
| FSYNC-09 | Phase 91 | Complete |
| FSRC-01 | Phase 93 | Complete |
| FSRC-02 | Phase 92 | Complete |
| FSRC-03 | Phase 92 | Complete |
| FSRC-04 | Phase 93 | Complete |
| FSRC-05 | Phase 93 | Complete |
| FSRC-06 | Phase 93 | Complete |
| FSRC-07 | Phase 93 | Complete |
| FSRC-08 | Phase 92 | Complete |
| DOCS-01 | Phase 94 | Complete |
| DOCS-02 | Phase 94 | Pending |
| REL-01 | Phase 94 | Pending |

**Coverage:**
- v0.18.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-05-15*
*Last updated: 2026-05-15 during v0.18.0 milestone initialization*
