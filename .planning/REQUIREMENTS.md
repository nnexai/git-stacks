# Requirements: git-stacks v0.10.0

**Defined:** 2026-03-26
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment

## v0.10.0 Requirements

Requirements for Multi-Agent Workspace Tooling milestone. Each maps to roadmap phases.

### Agent Path Discovery

- [ ] **PATH-01**: User can run `git-stacks paths [workspace]` to list all repo paths in a workspace (one per line)
- [ ] **PATH-02**: User can pass `--prefix <str>` to prepend each path with a flag string (e.g., `--prefix "--add-dir"` produces `--add-dir /path/a`)
- [ ] **PATH-03**: Command autodetects workspace from cwd when no workspace argument is given
- [ ] **PATH-04**: Trunk repos emit `main_path`, worktree repos emit `task_path`; missing task_paths are skipped with a stderr warning

### Multi-Repo Pull

- [x] **PULL-01**: User can run `git-stacks pull [workspace]` to pull latest for all repos in a workspace
- [x] **PULL-02**: Worktree repos pull their workspace branch; trunk repos pull their default branch
- [x] **PULL-03**: Dirty repos are skipped with a warning; command exits non-zero if any repo was skipped
- [x] **PULL-04**: Fetch is deduplicated per unique `main_path` (shared across worktrees of the same repo)
- [x] **PULL-05**: Pull uses `--ff-only`; diverged branches fail fast with a clear message
- [x] **PULL-06**: Command autodetects workspace from cwd when no workspace argument is given

### TUI Upstream Staleness

- [x] **STALE-01**: Workspace detail pane shows "N behind" badge per repo when upstream has newer commits
- [x] **STALE-02**: Fetch is triggered on workspace focus (entering detail pane) with results cached per `main_path` with a TTL (e.g., 5 minutes)
- [x] **STALE-03**: User can manually refresh staleness via a keybinding (e.g., `r`) that bypasses TTL cache
- [x] **STALE-04**: Repos without upstream tracking show a dash or no badge (no error)
- [x] **STALE-05**: Network failures show a `?` badge and do not crash the TUI

### Template Composition

- [ ] **COMP-01**: Templates support an `includes: string[]` field that references other template names as building blocks
- [ ] **COMP-02**: `git-stacks new` accepts multiple `--template` flags for ad-hoc composition (e.g., `--template api --template frontend`)
- [ ] **COMP-03**: Repos are merged as a union; if the same repo appears in multiple templates, worktree mode wins over trunk
- [ ] **COMP-04**: Hooks concatenate in include order; the top-level template's hooks run last
- [ ] **COMP-05**: Env vars merge with last-wins per key; top-level template env wins over included templates
- [ ] **COMP-06**: Circular `includes:` chains are detected and produce a clear error message
- [ ] **COMP-07**: Existing templates without `includes:` continue to work (backward-compatible schema change)

### Release Prep

- [ ] **REL-01**: Version bumped to v0.10.0 in package.json
- [ ] **REL-02**: CHANGELOG updated with all v0.10.0 features
- [ ] **REL-03**: README updated with new command documentation and usage examples

## v0.11.0+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Agent Env Inspection

- **ENV-01**: `git-stacks env [workspace]` dumps merged workspace env vars
- **ENV-02**: `--format shell|dotenv|json` output formats
- **ENV-03**: Merge chain: global config → template env → workspace env → GS_* injected vars

## Out of Scope

| Feature | Reason |
|---------|--------|
| `env` command | Deferred to v0.11.0+ per user decision |
| `pull --rebase` | Rebase mid-work destroys in-progress state; `--ff-only` is the safe default |
| `pull` on dirty repos | Silently overwriting uncommitted work is unsafe; skip with warning instead |
| `env_file` contents in env dump | May contain secrets; env_file is a write-target, not an input |
| Deep `includes:` nesting (includes-of-includes) | Limit to 1 level for v0.10.0; revisit if demanded |
| TUI global staleness poll | Network fetch per render causes jank; fetch-on-focus + TTL is the pattern |
| `paths` across all workspaces | Breaks workspace isolation; scoped to one workspace |
| TUI multi-template wizard | Wizard stays single-select; composition via CLI flags or saved meta-templates |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PATH-01 | Phase 37 | Pending |
| PATH-02 | Phase 37 | Pending |
| PATH-03 | Phase 37 | Pending |
| PATH-04 | Phase 37 | Pending |
| PULL-01 | Phase 38 | Verified |
| PULL-02 | Phase 38 | Verified |
| PULL-03 | Phase 38 | Verified |
| PULL-04 | Phase 38 | Verified |
| PULL-05 | Phase 38 | Verified |
| PULL-06 | Phase 38 | Verified |
| STALE-01 | Phase 39 | Verified |
| STALE-02 | Phase 39 | Verified |
| STALE-03 | Phase 39 | Verified |
| STALE-04 | Phase 39 | Verified |
| STALE-05 | Phase 39 | Verified |
| COMP-01 | Phase 40 | Pending |
| COMP-02 | Phase 40 | Pending |
| COMP-03 | Phase 40 | Pending |
| COMP-04 | Phase 40 | Pending |
| COMP-05 | Phase 40 | Pending |
| COMP-06 | Phase 40 | Pending |
| COMP-07 | Phase 40 | Pending |
| REL-01 | Phase 41 | Pending |
| REL-02 | Phase 41 | Pending |
| REL-03 | Phase 41 | Pending |

**Coverage:**
- v0.10.0 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 — traceability complete after roadmap creation*
