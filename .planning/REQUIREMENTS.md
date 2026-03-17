# Requirements: git-stacks

**Defined:** 2026-03-17
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v1 Requirements

### Foundation — Tests

- [ ] **TEST-01**: Developer can add git integration tests using a `makeGitRepo(tmpDir)` helper that creates a real local git repo in a temp directory
- [ ] **TEST-02**: Core git operations (createWorktree, removeWorktree, mergeNoFF, rebaseBranch, getCommitsBehind) have integration test coverage with real git repos
- [ ] **TEST-03**: Workspace lifecycle critical paths (open, clean, remove, merge) have integration tests that catch the known partial-failure bugs

### Foundation — Config Robustness

- [ ] **CONF-01**: A corrupt or outdated YAML file in `workspaces/` or `stacks/` does not crash `list` or any other command — it logs a warning to stderr and skips that entry
- [ ] **CONF-02**: All new schema fields use `.optional()` or `.default()` — no new required fields can break existing user config files on upgrade
- [ ] **CONF-03**: A `schema_version` field is added to Stack and Workspace YAML schemas, with a documented migration strategy for future breaking changes
- [ ] **CONF-04**: Zod validation errors surface as human-readable field-level messages (e.g., "repos[0].path: expected string, got undefined") not raw stack traces

### Foundation — Prerequisites

- [ ] **PREREQ-01**: On startup, git is verified to be installed and meets the minimum required version (2.24+ for worktree support); a clear error is shown if not met, with install instructions
- [ ] **PREREQ-02**: Each integration checks for its required binary at `applies()` time before generating artifacts or launching — missing binary causes that integration to be skipped with a debug-level note (not an error)
- [ ] **PREREQ-03**: `doctor` reports missing runtime dependencies (git version, integration binaries: `code`, `code-insiders`, `idea`, `tmux`, `cmux`) with suggested install commands

### Foundation — Bug Fixes

- [ ] **BUG-01**: `mergeWorkspace` is atomic — the workspace YAML is not deleted until all repo merges succeed; a mid-way failure leaves the workspace record intact with a recoverable error
- [ ] **BUG-02**: `removeWorkspace` and `cleanWorkspace` use a stage-then-commit pattern — state is not permanently mutated until all operations succeed
- [ ] **BUG-03**: `renameWorkspace` re-registers git worktrees at their new paths via `git worktree remove` + `git worktree add` instead of a bare filesystem rename
- [ ] **BUG-04**: A failed `mergeNoFF` does not leave the main clone stranded on the base branch — on merge failure, the clone is restored to its original branch (via rollback or a temporary-worktree approach that avoids touching the main clone HEAD)

### Destructive Operation Safety

- [ ] **SAFE-01**: `remove`, `clean`, and `merge` support a `--dry-run` flag that shows what would be done without making changes
- [ ] **SAFE-02**: `remove` and `clean` without `--force` prompt for confirmation before executing destructive operations
- [ ] **SAFE-03**: `--force` flag behavior is consistent across all destructive commands (`remove`, `clean`, `merge`, `rename`)

### Design Evaluation

- [ ] **DESIGN-01**: The current Stack/Workspace model is evaluated against a Repo-Registry/Template/Workspace model across at least 3 representative user workflows — the winning model (or a hybrid) is documented with rationale
- [ ] **DESIGN-02**: A decision is made and documented on whether "Stacks" are replaced, renamed, or supplemented by a Template abstraction — and what backward-compatibility (if any) is offered

### Repo Registry

- [ ] **REPO-01**: User can register a git repository by providing a remote URL — git-stacks clones it to the configured workspace root and stores the repo metadata
- [ ] **REPO-02**: User can register repos by pointing git-stacks at a local folder — it scans for git repos within it (non-recursive, one level) and offers to register found repos
- [ ] **REPO-03**: User can list, view, and remove registered repos
- [ ] **REPO-04**: Registered repos have a default branch that is used as the base for worktree creation when no override is specified

### Template Abstraction

- [ ] **TMPL-01**: User can create a named Template that references a set of registered repos with per-repo configuration (mode: worktree vs trunk, base branch override)
- [ ] **TMPL-02**: Templates support branch naming placeholders — e.g., `feature/<workspace-name>` or `fix/<workspace-name>-<description-slug>` — expanded at workspace creation time
- [ ] **TMPL-03**: Templates define hook arrays (pre_create, post_create, pre_open, post_open) and plugin/integration configurations at the template level
- [ ] **TMPL-04**: For "trunk/dependency" repos in a template, workspace instantiation ensures the correct base branch is accessible — either the repo is already on that branch, or a worktree at that branch is created automatically
- [ ] **TMPL-05**: User can create a workspace directly from an existing workspace (clone pattern) without needing a template — the existing workspace's repo/branch configuration is used as the source

### UX and Observability

- [ ] **UX-01**: Error messages across all commands include context and a suggested recovery action (e.g., "Repo 'api' has uncommitted changes — stash with `git stash` or use `--force` to skip")
- [ ] **UX-02**: `status`, `doctor`, and `sync` support `--json` output for scripting and agent automation (`list` already has this)
- [ ] **UX-03**: `doctor` supports a `--fix` flag that auto-executes the suggested repair actions it already identifies
- [ ] **UX-04**: `list` shows richer columns by default: branch name, repo count, last-opened time, dirty indicator

### Execution

- [ ] **RUN-01**: `run <workspace> <cmd>` supports `--parallel` to execute the command across all repos simultaneously, with per-repo spinner and aggregated exit code

## v2 Requirements

### Power User Features

- **PWR-01**: PR/MR checkout — `clone --pr <number>` via `gh` or `glab` CLI (blocked on GitHub/GitLab integration)
- **PWR-02**: WezTerm integration plugin
- **PWR-03**: Zellij integration plugin
- **PWR-04**: `@clack/prompts` upgrade to 1.1.0 — enables `p.tasks()` progress display and autocomplete prompts
- **PWR-05**: Per-repo ahead/behind counts in `status`

### Programmatic API

- **API-01**: `workspace-ops.ts` is exported as a typed package entry point (`import { openWorkspace } from 'git-stacks'`) for use in scripts and agent integrations
- **API-02**: All workspace-ops functions return a structured `Result<T>` type with `ok`, `error`, and `suggestion` fields

### Agent-Aware Features (v2+)

- **AGENT-01**: Agent status file protocol definition — a spec for how an AI agent running in a worktree signals its current status (phase, progress, blocker)
- **AGENT-02**: `manage` dashboard shows per-workspace agent status indicators when a status file is present
- **AGENT-03**: Multi-worktree batch generation (`new --count N --template <name>`) for spinning up N parallel agent workspaces from one command

## Out of Scope

| Feature | Reason |
|---------|--------|
| Remote/cloud workspace sharing | Local-machine focus; no server component planned |
| GUI application | TUI and CLI only |
| Built-in package/tool version management | Delegate to mise/asdf via hooks |
| AI-triggered conflict resolution | Secondary priority; requires stable API first |
| Nix/devenv as first-class dependency | Out of domain; composable via hooks |
| Container/sandbox isolation | Out of scope for v1; revisit when agent-safety requirements clarify |
| Monorepo build caching | Nx/Turborepo's domain |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PREREQ-01 | — | Pending |
| PREREQ-02 | — | Pending |
| PREREQ-03 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| CONF-03 | — | Pending |
| CONF-04 | — | Pending |
| BUG-01 | — | Pending |
| BUG-02 | — | Pending |
| BUG-03 | — | Pending |
| BUG-04 | — | Pending |
| SAFE-01 | — | Pending |
| SAFE-02 | — | Pending |
| SAFE-03 | — | Pending |
| DESIGN-01 | — | Pending |
| DESIGN-02 | — | Pending |
| REPO-01 | — | Pending |
| REPO-02 | — | Pending |
| REPO-03 | — | Pending |
| REPO-04 | — | Pending |
| TMPL-01 | — | Pending |
| TMPL-02 | — | Pending |
| TMPL-03 | — | Pending |
| TMPL-04 | — | Pending |
| TMPL-05 | — | Pending |
| UX-01 | — | Pending |
| UX-02 | — | Pending |
| UX-03 | — | Pending |
| UX-04 | — | Pending |
| RUN-01 | — | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 0
- Unmapped: 30 ⚠️ (roadmap not yet created)

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*
