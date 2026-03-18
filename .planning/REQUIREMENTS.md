# Requirements: git-stacks

**Defined:** 2026-03-17
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v1 Requirements

### Foundation — Tests

- [x] **TEST-01**: Developer can add git integration tests using a `makeGitRepo(tmpDir)` helper that creates a real local git repo in a temp directory
- [x] **TEST-02**: Core git operations (createWorktree, removeWorktree, mergeNoFF, rebaseBranch, getCommitsBehind) have integration test coverage with real git repos
- [x] **TEST-03**: Workspace lifecycle critical paths (open, clean, remove, merge) have integration tests that catch the known partial-failure bugs

### Foundation — Config Robustness

- [x] **CONF-01**: A corrupt or outdated YAML file in `workspaces/` or `stacks/` does not crash `list` or any other command — it logs a warning to stderr and skips that entry
- [x] **CONF-02**: All new schema fields use `.optional()` or `.default()` — no new required fields can break existing user config files on upgrade
- [x] **CONF-03**: A `schema_version` field is added to Stack and Workspace YAML schemas, with a documented migration strategy for future breaking changes
- [x] **CONF-04**: Zod validation errors surface as human-readable field-level messages (e.g., "repos[0].path: expected string, got undefined") not raw stack traces

### Foundation — Prerequisites

- [x] **PREREQ-01**: On startup, git is verified to be installed and meets the minimum required version (2.24+ for worktree support); a clear error is shown if not met, with install instructions
- [x] **PREREQ-02**: Each integration checks for its required binary at `applies()` time before generating artifacts or launching — missing binary causes that integration to be skipped with a debug-level note (not an error)
- [x] **PREREQ-03**: `doctor` reports missing runtime dependencies (git version, integration binaries: `code`, `code-insiders`, `idea`, `tmux`, `cmux`) with suggested install commands

### Foundation — Bug Fixes

- [x] **BUG-01**: `mergeWorkspace` is atomic — the workspace YAML is not deleted until all repo merges succeed; a mid-way failure leaves the workspace record intact with a recoverable error
- [x] **BUG-02**: `removeWorkspace` and `cleanWorkspace` use a stage-then-commit pattern — state is not permanently mutated until all operations succeed
- [x] **BUG-03**: `renameWorkspace` re-registers git worktrees at their new paths via `git worktree remove` + `git worktree add` instead of a bare filesystem rename
- [x] **BUG-04**: A failed `mergeNoFF` does not leave the main clone stranded on the base branch — on merge failure, the clone is restored to its original branch (via rollback or a temporary-worktree approach that avoids touching the main clone HEAD)

### Version Information

- [x] **VER-01**: `git-stacks -V` / `--version` shows the version from `package.json` plus the git commit hash (with `-dirty` suffix when working tree has uncommitted changes) when running from source; shows version only (no hash) when installed globally via npm

### File Operations — Copy/Symlink Support (Phase 01.1)

- [x] **FILES-01**: `copy` operation copies a single file from source to destination
- [x] **FILES-02**: `copy` operation copies a folder tree recursively using `cpSync` with `recursive: true`
- [x] **FILES-03**: `symlink` operation creates a file symlink from destination pointing to source
- [x] **FILES-04**: `symlink` operation creates a directory symlink from destination pointing to source
- [x] **FILES-05**: Glob pattern `.env.*` expands to matching dotfiles (requires `dot: true` in `Bun.Glob`)
- [x] **FILES-06**: Glob pattern `secrets/**` expands to all files under the matched directory
- [x] **FILES-07**: A glob pattern matching zero files produces a warning (not an error)
- [x] **FILES-08**: When destination already exists, the operation is skipped silently (source is not checked)
- [x] **FILES-09**: When destination is missing and source is missing, a loud error is returned
- [x] **FILES-10**: When destination is missing and source exists, the operation is applied
- [x] **FILES-11**: Source paths starting with `~/` are expanded via `expandHome()` from `paths.ts`
- [x] **FILES-12**: Absolute source paths are used as-is (no resolution against base directory)
- [x] **FILES-13**: Workspace-instance level `files:` applies to the workspace root directory, not individual repo directories
- [x] **FILES-14**: Per-repo level `files:` resolves relative source paths against the repo's `main_path` and applies to `task_path`
- [x] **FILES-15**: Stack `files:` and workspace `files:` merge additively (arrays concatenated, not replaced)

### File Operations — Schema Compatibility (Phase 01.1)

- [x] **SCHEMA-01**: `StackSchema` parses successfully when `files:` field is absent (backward compatibility)
- [x] **SCHEMA-02**: `WorkspaceSchema` parses successfully when `files:` field is absent (backward compatibility)
- [x] **SCHEMA-03**: `WorkspaceRepoSchema` parses successfully when `files:` field is absent (backward compatibility)
- [x] **SCHEMA-04**: All three schemas parse successfully when `files:` field is present with `copy` and `symlink` arrays

### File Operations — Idempotency (Phase 01.1)

- [x] **IDEMPOTENT-01**: Re-applying `copy` on already-copied files does not produce an error (destination exists, skip)
- [x] **IDEMPOTENT-02**: Re-applying `symlink` on already-created symlinks does not produce an error (destination exists, skip)

### File Operations — Cleanup (Phase 2 wiring)

- [x] **FILES-16**: `files.ts` exposes a `warnExternalFiles()` function that inspects resolved file destinations and emits a visible warning for any that fall outside the workspace root or task directory — these are not deleted (they were placed outside the managed area and the user must handle them manually)
- [x] **FILES-17**: `warnExternalFiles()` is called by `removeWorkspace()` and `cleanWorkspace()` before teardown proceeds — files inside the workspace are cleaned up naturally when the workspace directory is removed; only external destinations need explicit user attention

### Destructive Operation Safety

- [x] **SAFE-01**: `remove`, `clean`, and `merge` support a `--dry-run` flag that shows what would be done without making changes — output includes any external file destinations that would be left behind with a warning
- [x] **SAFE-02**: `remove` and `clean` without `--force` prompt for confirmation before executing destructive operations
- [x] **SAFE-03**: `--force` flag behavior is consistent across all destructive commands (`remove`, `clean`, `merge`, `rename`)

### Design Evaluation

- [x] **DESIGN-01**: The current Stack/Workspace model is evaluated against a Repo-Registry/Template/Workspace model across at least 3 representative user workflows — the winning model (or a hybrid) is documented with rationale
- [x] **DESIGN-02**: A decision is made and documented on whether "Stacks" are replaced, renamed, or supplemented by a Template abstraction — and what backward-compatibility (if any) is offered

### Repo Registry

- [x] **REPO-01**: User can register a git repository by providing a remote URL — git-stacks clones it to the configured workspace root and stores the repo metadata
- [x] **REPO-02**: User can register repos by pointing git-stacks at a local folder — it scans for git repos within it (non-recursive, one level) and offers to register found repos
- [x] **REPO-03**: User can list, view, and remove registered repos
- [x] **REPO-04**: Registered repos have a default branch that is used as the base for worktree creation when no override is specified

### Template Abstraction

- [x] **TMPL-01**: User can create a named Template that references a set of registered repos with per-repo configuration (mode: worktree vs trunk, base branch override)
- [x] **TMPL-02**: Templates support branch naming placeholders — e.g., `feature/<workspace-name>` or `fix/<workspace-name>-<description-slug>` — expanded at workspace creation time
- [x] **TMPL-03**: Templates define hook arrays (pre_create, post_create, pre_open, post_open) and plugin/integration configurations at the template level
- [x] **TMPL-04**: For "trunk/dependency" repos in a template, workspace instantiation ensures the correct base branch is accessible — either the repo is already on that branch, or a worktree at that branch is created automatically
- [x] **TMPL-05**: User can create a workspace directly from an existing workspace (clone pattern) without needing a template — the existing workspace's repo/branch configuration is used as the source

### UX and Observability

- [x] **UX-01**: Error messages across all commands include context and a suggested recovery action (e.g., "Repo 'api' has uncommitted changes — stash with `git stash` or use `--force` to skip")
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

| Requirement | Phase | Status |
|-------------|-------|--------|
| PREREQ-01 | Phase 1 | Complete |
| PREREQ-02 | Phase 1 | Complete |
| PREREQ-03 | Phase 1 | Complete |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 1 | Complete |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| CONF-04 | Phase 1 | Complete |
| BUG-01 | Phase 1 | Complete |
| BUG-02 | Phase 1 | Complete |
| BUG-03 | Phase 1 | Complete |
| BUG-04 | Phase 1 | Complete |
| VER-01 | Phase 01.2 | Complete |
| FILES-01 | Phase 01.1 | Complete |
| FILES-02 | Phase 01.1 | Complete |
| FILES-03 | Phase 01.1 | Complete |
| FILES-04 | Phase 01.1 | Complete |
| FILES-05 | Phase 01.1 | Complete |
| FILES-06 | Phase 01.1 | Complete |
| FILES-07 | Phase 01.1 | Complete |
| FILES-08 | Phase 01.1 | Complete |
| FILES-09 | Phase 01.1 | Complete |
| FILES-10 | Phase 01.1 | Complete |
| FILES-11 | Phase 01.1 | Complete |
| FILES-12 | Phase 01.1 | Complete |
| FILES-13 | Phase 01.1 | Complete |
| FILES-14 | Phase 01.1 | Complete |
| FILES-15 | Phase 01.1 | Complete |
| SCHEMA-01 | Phase 01.1 | Complete |
| SCHEMA-02 | Phase 01.1 | Complete |
| SCHEMA-03 | Phase 01.1 | Complete |
| SCHEMA-04 | Phase 01.1 | Complete |
| IDEMPOTENT-01 | Phase 01.1 | Complete |
| IDEMPOTENT-02 | Phase 01.1 | Complete |
| FILES-16 | Phase 01.1 (engine) / Phase 2 (wiring) | Complete |
| FILES-17 | Phase 2 | Complete |
| SAFE-01 | Phase 2 | Complete |
| SAFE-02 | Phase 2 | Complete |
| SAFE-03 | Phase 2 | Complete |
| DESIGN-01 | Phase 3 | Complete |
| DESIGN-02 | Phase 3 | Complete |
| REPO-01 | Phase 3 (conditional) | Complete |
| REPO-02 | Phase 3 (conditional) | Complete |
| REPO-03 | Phase 3 (conditional) | Complete |
| REPO-04 | Phase 3 (conditional) | Complete |
| TMPL-01 | Phase 3 (conditional) | Complete |
| TMPL-02 | Phase 3 (conditional) | Complete |
| TMPL-03 | Phase 3 (conditional) | Complete |
| TMPL-04 | Phase 3 (conditional) | Complete |
| TMPL-05 | Phase 3 (conditional) | Complete |
| UX-01 | Phase 4 | Complete |
| UX-02 | Phase 4 | Pending |
| UX-03 | Phase 4 | Pending |
| UX-04 | Phase 4 | Pending |
| RUN-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 57 total
- Mapped to phases: 57
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 — added FILES-16, FILES-17 for file cleanup on workspace remove/clean*
