# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**Terminal Multiplexers:**
- tmux - Optional multiplexer for session management
  - Integration: `src/lib/integrations/tmux.ts`
  - Config key: `integrations.tmux`
  - Enabled by default: false
  - Functions: Opens/focuses tmux sessions, creates panes with repo-specific layouts

- cmux - Custom multiplexer support (no external binary required)
  - Integration: `src/lib/integrations/cmux.ts`
  - Config key: `integrations.cmux`
  - Enabled by default: true
  - Functions: Creates/focuses cmux workspaces, manages surfaces/panes

**IDEs:**
- VSCode (code/code-insiders) - Optional IDE integration
  - Integration: `src/lib/integrations/vscode.ts`
  - Config key: `integrations.vscode`
  - Enabled by default: true
  - Config options:
    - `cmd`: VSCode binary command (default: `code-insiders`, alternatives: `code`)
    - Can accept custom VSCode binary paths
  - Functions: Generates `.code-workspace` file, launches VSCode with workspace

- IntelliJ IDEA (idea) - Optional IDE for Java repos only
  - Integration: `src/lib/integrations/intellij.ts`
  - Config key: `integrations.intellij`
  - Enabled by default: true (but only applies to workspaces containing Java repos)
  - Functions: Generates `.idea/` project config, launches IntelliJ

## Data Storage

**Databases:**
- Not applicable - git-stacks is a CLI tool with no database backend

**File Storage:**
- Local filesystem only (YAML-based):
  - Global config: `~/.config/git-stacks/config.yml`
  - Stack definitions: `~/.config/git-stacks/stacks/{name}.yml`
  - Workspace instances: `~/.config/git-stacks/workspaces/{name}.yml`
  - Main clones: `~/workspaces/main/{repo_name}/`
  - Worktrees: `~/workspaces/tasks/{workspace_name}/{repo_name}/`

**Caching:**
- Not used - Git itself provides caching via local clones/worktrees

## Authentication & Identity

**Auth Provider:**
- Git SSH/HTTPS credentials - Managed by system git config
- No centralized auth required
- SSH keys used for git operations (inherited from user's shell environment)

## Monitoring & Observability

**Error Tracking:**
- Not used - Errors logged to stderr with user-friendly messages

**Logs:**
- Console output - All operations log to stdout/stderr via Bun's inherited stdio
- CLI spinners and progress messages via `@clack/prompts` and `opentui-spinner`
- Integration-specific warnings logged via `p.log.warn()` if tool unavailable

## CI/CD & Deployment

**Hosting:**
- npm package registry - Published as `git-stacks` npm package
- GitHub releases (inferred from version history)

**CI Pipeline:**
- Bun test runner - `bun test tests/`
- TypeScript type checking - `bun run typecheck`
- Pre-publish hook: Runs typecheck + tests before npm publish
- No external CI service integration

## Environment Configuration

**Required env vars:**
- None globally required (git-stacks is config-file-based)
- Optional per-workspace/stack:
  - `env: Record<string, string>` - Custom environment variables for hooks
  - `env_file: string` - Path to .env file for hooks
  - `WS_WORKSPACE` - Injected to hooks (workspace name)
  - `WS_BRANCH` - Injected to hooks (branch name)
  - `WS_TASKS_DIR` - Injected to hooks (workspace tasks directory)
  - `WS_REPO_NAME` - Injected to hooks (repo name, per-repo hooks only)

**Secrets location:**
- Git credentials: `~/.ssh/`, `~/.git-credentials`, or local git config
- No secrets managed by git-stacks itself
- User-provided env vars in stack/workspace `env:` or `env_file:` passed to hooks

## Webhooks & Callbacks

**Incoming:**
- None - git-stacks is a local CLI tool

**Outgoing:**
- None - git-stacks does not call external webhooks
- Hooks system allows users to define custom shell commands on lifecycle events:
  - Stack hooks: `pre_create`, `post_create`, `pre_remove`
  - Workspace hooks: `pre_open`, `post_open`, `post_merge`
  - Per-repo hooks: `pre_open`

## Git Integration

**Operations:**
- git worktree operations via Bun's `$` shell (native git commands):
  - `git worktree add` / `git worktree remove` - Manage worktrees
  - `git rev-parse` - Branch existence checks
  - `git status --porcelain` - Dirty repo detection
  - `git fetch origin` - Sync with remote
  - `git merge`/`git rebase` - Merge/rebase strategies
  - `git ls-remote` - Check remote branch status
  - `git log` - Commit history

- No git API client used; all operations via CLI

## Integration Plugin System

**Architecture:**
- Location: `src/lib/integrations/`
- Registry: `src/lib/integrations/index.ts` exports `integrations` array
- Config storage: Each integration's config stored under `globalConfig.integrations[id]` (Record<string, unknown>)
- Workspace overrides: `workspace.settings.integrations[id]` overrides global config

**Extension Points:**
All integrations implement `Integration` interface (`src/lib/integrations/types.ts`):
- `id` - Unique identifier for config/registry
- `label` - Display name
- `hint` - UI hint/description
- `enabledByDefault` - Default state if not configured
- `applies(workspace)` - Optional; return false to skip this integration
- `isEnabled(ctx)` - Resolve enabled state (workspace override → global config → default)
- `configurePrompt(current)` - Interactive Zod-validated config prompts
- `generate(ctx)` - Optional; write artifact files (returns artifact path)
- `open(ctx, artifactPath)` - Execute integration (open IDE, create session, etc.)

**To add a new integration:**
1. Create `src/lib/integrations/my-tool.ts` implementing `Integration`
2. Import and add to `integrations` array in `src/lib/integrations/index.ts`
3. No other files require changes; registration is automatic

---

*Integration audit: 2026-03-17*
