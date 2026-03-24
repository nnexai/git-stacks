# Requirements: git-stacks

**Defined:** 2026-03-24
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.9.0 Requirements

Requirements for v0.9.0 Identity & Completion Integrity milestone.

### Identity

- [x] **IDEN-01**: User can look up, open, remove, and list workspaces by the `name` field in YAML (not by filename)
- [x] **IDEN-02**: User can look up, edit, remove, and list templates by the `name` field in YAML (not by filename)
- [x] **IDEN-03**: User can rename a workspace or template and have both the YAML `name` field and the filename updated atomically; no drift possible
- [ ] **IDEN-04**: Shell autocompletion for workspace/template arguments reads candidate names from YAML `name` fields, not from filename glob

### Completion

- [ ] **COMP-01**: All CLI commands are audited for missing shell completion coverage (bash/zsh/fish); gaps are documented and fixed
- [ ] **COMP-02**: User can tab-complete `pr create`, `pr open`, and `pr status` subcommands for GitHub, GitLab, and Gitea integrations
- [ ] **COMP-03**: User can tab-complete `issue link`, `issue unlink`, and `issue open` subcommands across all four integrations (GitHub, GitLab, Gitea, Jira)
- [ ] **COMP-04**: User can tab-complete workspace names dynamically in all command arguments that accept `<workspace>` or `[workspace]`
- [ ] **COMP-05**: User can tab-complete template names dynamically in all command arguments that accept `<template>` or `[template]`

## Future Requirements

### Identity

- **IDEN-05**: TUI workspace and template action menus use name field for all reverse-lookups (rename dialog, action menu dispatch) — deferred; TUI is lower risk than CLI

### Completion

- **COMP-06**: User can tab-complete repo names dynamically in forge command arguments — deferred; adds complexity to completion generator
- **COMP-07**: Shell completion for `config` wizard subcommands — lower priority; wizard is interactive

## Out of Scope

| Feature | Reason |
|---------|--------|
| Issue ID tab completion | Requires live API calls at completion time — too slow for shell completion |
| Remote/cloud workspace completion | No server component planned |
| Jira `open_cmd` validation at completion time | Complexity not justified for v0.9 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDEN-01 | Phase 33 | Complete |
| IDEN-02 | Phase 33 | Complete |
| IDEN-03 | Phase 33 | Complete |
| IDEN-04 | Phase 35 | Pending |
| COMP-01 | Phase 34 | Pending |
| COMP-02 | Phase 34 | Pending |
| COMP-03 | Phase 34 | Pending |
| COMP-04 | Phase 35 | Pending |
| COMP-05 | Phase 35 | Pending |

**Coverage:**
- v0.9.0 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation — all 9 requirements mapped to phases 33-35*
