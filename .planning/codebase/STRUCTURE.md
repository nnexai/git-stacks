# Codebase Structure

**Analysis Date:** 2026-04-04

## Directory Layout

```
git-stacks/
├── src/                    # All source code (TypeScript/TSX)
│   ├── index.ts            # CLI entry point (Bun shebang)
│   ├── commands/           # Commander.js command handlers
│   ├── lib/                # Reusable business logic and utilities
│   │   ├── agent-hooks/    # Agent framework hook plugins (Claude, Copilot)
│   │   └── integrations/   # IDE/terminal/forge/issue integration plugins
│   └── tui/                # Interactive terminal UI
│       └── dashboard/      # SolidJS TUI dashboard
│           └── hooks/      # SolidJS reactive data hooks
├── tests/                  # All tests (bun:test)
│   ├── helpers.ts          # Shared test utilities
│   ├── lib/                # Unit tests for src/lib/
│   │   └── integrations/   # Integration plugin tests
│   ├── commands/           # Command-level tests
│   └── tui/                # TUI tests
│       └── dashboard/      # Dashboard integration tests
│           └── snapshots/  # TUI snapshot tests
├── scripts/                # Build/test scripts
│   └── test-runner.ts      # Isolated test runner (avoids mock pollution)
├── _references/            # Reference documentation
├── .planning/              # GSD workflow planning artifacts
│   └── codebase/           # Codebase analysis documents (this file)
├── .claude/                # Claude Code configuration
├── .github/                # GitHub configuration
├── package.json            # Package manifest
├── tsconfig.json           # TypeScript config (strict, @/* alias)
├── bunfig.toml             # Bun config (SolidJS preload)
├── CLAUDE.md               # Claude Code instructions
├── CHANGELOG.md            # Version changelog
├── FEATURES.md             # Feature documentation
├── README.md               # Project readme
└── LICENSE                 # MIT license
```

No build output directory -- Bun runs TypeScript source directly via shebang.

## Directory Purposes

**`src/commands/`:**
- Purpose: Thin Commander.js command definitions that parse CLI args and dispatch to business logic
- Contains: One file per command group, each exports a Command instance or registration function
- Key files:
  - `workspace.ts` (44KB) -- all workspace subcommands (new, open, list, status, sync, push, pull, merge, clean, close, remove, rename, cd, paths, run, env, edit)
  - `template.ts` -- template CRUD subcommands
  - `repo.ts` -- repo registry management
  - `doctor.ts` -- health check with --fix and --json modes
  - `config.ts` -- interactive global config wizard
  - `message.ts` -- notification send/list/clear
  - `install.ts` -- agent hook installation
  - `integration.ts` -- integration introspection and per-integration subcommands
  - `label.ts` -- workspace label CRUD
  - `completion.ts` -- shell completion output

**`src/lib/`:**
- Purpose: All reusable business logic, isolated from CLI and TUI concerns
- Contains: Domain logic, git operations, config I/O, utilities
- Key files:
  - `workspace-ops.ts` (1699 lines) -- core orchestration for all workspace lifecycle operations
  - `git.ts` (400 lines) -- all git CLI wrappers (worktree, branch, merge, push, pull, stash, fetch)
  - `config.ts` -- Zod schemas + YAML read/write for all entities
  - `paths.ts` -- path constants and helpers (single source of truth)
  - `lifecycle.ts` -- hook execution engine (inherit stdio and captured modes)
  - `secrets.ts` -- pluggable secret resolution system
  - `ports.ts` -- port allocation with file-based locking
  - `files.ts` -- file copy/symlink with glob support
  - `composition.ts` -- template composition via `includes` directive
  - `completion-generator.ts` (41KB) -- auto-generates bash/zsh/fish completions from Commander tree
  - `messages.ts` -- notification message store and IPC socket push
  - `labels.ts` -- label matching helper
  - `env.ts` -- env var formatting and CWD-based repo detection
  - `errors.ts` -- error formatting helper
  - `concurrency.ts` -- async concurrency limiter
  - `detect.ts` -- repo type detection by marker files
  - `version.ts` -- version string from package.json + git hash
  - `vscode.ts` -- VS Code .code-workspace generator (legacy, pre-integration)
  - `intellij.ts` -- IntelliJ .idea/ generator (legacy, pre-integration)
  - `cmux.ts` -- Cmux session generator (legacy, pre-integration)
  - `tmux.ts` -- Tmux session generator (legacy, pre-integration)
  - `niri.ts` -- Niri window manager helpers (legacy, pre-integration)
  - `aerospace.ts` -- AeroSpace window manager helpers (legacy, pre-integration)

**`src/lib/agent-hooks/`:**
- Purpose: Generate and install CI-agent-style hooks into repo directories
- Contains: Plugin interface, Claude Code and Copilot implementations
- Key files:
  - `types.ts` -- `AgentHookPlugin` interface, `HookEntry`, `HooksConfig` types
  - `claude-code.ts` -- writes `.claude/settings.json` hooks
  - `copilot.ts` -- writes `.github/copilot-hooks.yml`
  - `index.ts` -- exports all plugins as `agentHookPlugins` array

**`src/lib/integrations/`:**
- Purpose: Pluggable integration plugins for IDE/terminal/forge/issue tools
- Contains: Interface definition, runner, 10 plugin implementations, shared utilities
- Key files:
  - `types.ts` -- `Integration` interface, `IntegrationContext`, `IntegrationArtifact` union, `WindowDetector`, `resolveEnabled()`
  - `index.ts` -- registry: exports all integration instances as `integrations` array
  - `runner.ts` -- `runIntegrations()`, `runIntegrationGenerate()`, `runIntegrationCleanup()`
  - `vscode.ts` -- VS Code integration (generate .code-workspace, launch `code` CLI)
  - `intellij.ts` -- IntelliJ integration (applies only when Java repos present)
  - `tmux.ts` -- Tmux session creation and management
  - `cmux.ts` -- Cmux workspace creation
  - `niri.ts` -- Niri window manager column layout and workspace naming
  - `aerospace.ts` -- AeroSpace window manager workspace management
  - `github.ts` -- GitHub PR/issue linking
  - `gitlab.ts` -- GitLab MR/issue linking
  - `gitea.ts` -- Gitea PR/issue linking
  - `jira.ts` -- Jira issue linking
  - `forge-utils.ts` -- shared forge API helpers (remote URL parsing, API calls)
  - `issue-utils.ts` -- shared issue linking helpers
  - `wizard-helpers.ts` -- shared config prompt helpers

**`src/tui/`:**
- Purpose: Interactive terminal UI components (prompts and dashboard)
- Contains: Clack-based wizards and SolidJS dashboard
- Key files:
  - `utils.ts` -- `safeText()` wrapper for @clack/prompts, mutable `prompts` object
  - `workspace-wizard.ts` (23KB) -- `git-stacks new` and `git-stacks edit` interactive flows
  - `workspace-clone.ts` -- `git-stacks clone` interactive flow
  - `template-wizard.ts` -- `git-stacks template new|edit` interactive flows
  - `repo-wizard.ts` -- `git-stacks repo scan` interactive flow

**`src/tui/dashboard/`:**
- Purpose: Full interactive TUI application for workspace/template/repo management
- Contains: SolidJS components (.tsx), reactive hooks, utility modules
- Key files:
  - `run.tsx` -- entry point; SolidJS render, IPC socket server
  - `App.tsx` (58KB) -- root component; all keyboard handling, state management, action dispatch
  - `types.ts` -- `Tab`, `Action`, `UIView` discriminated union, `WorkspaceEntry`, `RepoStatus`
  - `WorkspaceList.tsx` -- workspace list with filtering, sorting, batch selection
  - `WorkspaceRow.tsx` -- single workspace row with dirty/ahead/behind indicators
  - `WorkspaceDetail.tsx` -- expanded workspace detail panel
  - `TemplateList.tsx` / `TemplateDetail.tsx` -- template management views
  - `RepoList.tsx` / `RepoDetail.tsx` -- repo registry views
  - `ActionMenu.tsx` / `RepoActionMenu.tsx` / `TemplateActionMenu.tsx` -- context menus
  - `SyncProgressView.tsx` / `PushProgressView.tsx` / `CreateProgressView.tsx` / `ProgressView.tsx` -- operation progress displays
  - `ConfirmDialog.tsx` / `CenteredDialog.tsx` -- modal dialogs
  - `InlineInput.tsx` -- inline text input component
  - `FilterIndicator.tsx` -- filter status display
  - `HelpOverlay.tsx` -- keyboard shortcut help
  - `MessageOverlay.tsx` -- notification message display
  - `BatchBar.tsx` -- batch operation bar
  - `WizardView.tsx` -- in-dashboard workspace creation wizard
  - `RemoveBlockedView.tsx` -- blocked removal explanation
  - `StatusIndicator.tsx` -- dirty/clean status icon
  - `configUtils.ts` -- configuration utility helpers
  - `messageUtils.ts` -- message display formatting

**`src/tui/dashboard/hooks/`:**
- Purpose: SolidJS reactive data hooks for dashboard state
- Contains:
  - `useWorkspaces.ts` -- workspace list loading, status polling, staleness refresh
  - `useTemplates.ts` -- template list loading
  - `useRepos.ts` -- repo registry loading
  - `useMessages.ts` -- message store with IPC subscription

**`tests/`:**
- Purpose: All unit and integration tests
- Contains: Test files mirroring src/ structure, shared helpers
- Key files:
  - `helpers.ts` (16KB) -- `makeTmpDir()`, `cleanup()`, `touch()`, `write()`, `makeGitMock()`, test workspace/template/registry factories

**`scripts/`:**
- Purpose: Build and test infrastructure scripts
- Contains:
  - `test-runner.ts` -- isolated test runner that runs mock-heavy files in separate Bun processes to avoid mock.module pollution

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI entry point (Bun shebang `#!/usr/bin/env bun`)
- `src/tui/dashboard/run.tsx`: TUI dashboard entry point

**Configuration:**
- `tsconfig.json`: TypeScript strict mode, `@/*` path alias (test-only), JSX preserve with @opentui/solid
- `bunfig.toml`: Preloads `@opentui/solid/preload` for SolidJS JSX transform
- `package.json`: Dependencies, bin entry, npm scripts

**Core Logic:**
- `src/lib/workspace-ops.ts`: All workspace lifecycle operations (1699 lines)
- `src/lib/git.ts`: All git CLI wrappers (400 lines)
- `src/lib/config.ts`: All Zod schemas and YAML I/O
- `src/lib/secrets.ts`: Secret resolution system
- `src/lib/ports.ts`: Port allocation system
- `src/lib/integrations/runner.ts`: Integration orchestration

**Testing:**
- `tests/helpers.ts`: All shared test utilities
- `scripts/test-runner.ts`: Custom test isolation runner

## Naming Conventions

**Files:**
- Kebab-case for all files: `workspace-ops.ts`, `template-wizard.ts`, `forge-utils.ts`
- Test files: `{name}.test.ts` in corresponding test directory
- Dashboard components: PascalCase `.tsx`: `WorkspaceList.tsx`, `ActionMenu.tsx`
- Dashboard hooks: camelCase `.ts`: `useWorkspaces.ts`, `useMessages.ts`

**Directories:**
- Lowercase kebab-case: `agent-hooks/`, `integrations/`
- Feature grouping: `dashboard/hooks/` for SolidJS hooks

## Where to Add New Code

**New CLI Command:**
1. Create command file: `src/commands/{name}.ts`
2. Export a `Command` instance
3. Register in `src/index.ts` via `program.addCommand()`
4. Add tests: `tests/commands/{name}.test.ts`

**New Integration Plugin:**
1. Create plugin file: `src/lib/integrations/{name}.ts`
2. Implement the `Integration` interface from `src/lib/integrations/types.ts`
3. Register in `src/lib/integrations/index.ts` (add to `integrations` array)
4. No other files need changes -- runner auto-discovers from registry
5. Add tests: `tests/lib/integrations/{name}.test.ts`

**New Secret Resolver:**
1. Implement `SecretResolver` interface in `src/lib/secrets.ts`
2. Add to `RESOLVER_REGISTRY` in `src/lib/secrets.ts`
3. Users enable via `config.secrets.resolvers` list in `config.yml`
4. Add tests: `tests/lib/secrets.test.ts`

**New Agent Hook Plugin:**
1. Create plugin file: `src/lib/agent-hooks/{name}.ts`
2. Implement `AgentHookPlugin` interface from `src/lib/agent-hooks/types.ts`
3. Register in `src/lib/agent-hooks/index.ts`
4. Add tests: `tests/lib/agent-hooks.test.ts`

**New Workspace Lifecycle Hook Event:**
1. Add to `WorkspaceHooksSchema` and `TemplateSchema` hooks object in `src/lib/config.ts`
2. Add to `HOOK_KEYS` in `src/lib/composition.ts` for template composition support
3. Wire execution in `src/lib/workspace-ops.ts` at the appropriate lifecycle point

**New Business Logic Function:**
- Core workspace operations: `src/lib/workspace-ops.ts`
- Git operations: `src/lib/git.ts`
- Config schema changes: `src/lib/config.ts`
- Shared utilities: `src/lib/` (create new file if distinct concern)

**New Dashboard Component:**
1. Create component: `src/tui/dashboard/{Name}.tsx`
2. Import and render in `src/tui/dashboard/App.tsx`
3. Add to `UIView` union in `src/tui/dashboard/types.ts` if it represents a new view state

**New Dashboard Hook:**
1. Create hook: `src/tui/dashboard/hooks/use{Name}.ts`
2. Import in `App.tsx` or consuming component

**New TUI Wizard:**
1. Create wizard: `src/tui/{name}-wizard.ts`
2. Wire into command handler in `src/commands/`
3. Use `safeText()` from `src/tui/utils.ts` (never raw `p.text`)

**Test for New Code:**
- Unit tests for `src/lib/`: `tests/lib/{name}.test.ts`
- Integration tests for `src/lib/integrations/`: `tests/lib/integrations/{name}.test.ts`
- Command tests: `tests/commands/{name}.test.ts`
- TUI tests: `tests/tui/{name}.test.ts`
- Dashboard tests: `tests/tui/dashboard/{name}.test.ts`

## Runtime Data Layout (User's Machine)

```
~/.config/git-stacks/                   # Config directory (override: GIT_STACKS_CONFIG_DIR)
├── config.yml                          # Global config (workspace_root, integrations, ports, secrets)
├── registry.yml                        # Repo registry (name, path, type, forge, default_branch)
├── templates/
│   └── {template-name}.yml            # Template definitions
├── workspaces/
│   └── {workspace-name}.yml           # Workspace instances
├── messages/
│   └── {workspace-name}.jsonl         # Notification messages (JSONL format)
└── .ports.lock                         # Port allocation lock file (ephemeral)

{workspace_root}/                       # Configured in config.yml; defaults to ~/workspaces
├── main/                               # Convention: main clones live here (not enforced)
│   └── {repo-name}/                   # Full git clone
└── tasks/                             # Git worktrees (one directory per workspace)
    └── {workspace-name}/
        └── {repo-name}/               # Worktree at workspace branch

/tmp/git-stacks.sock                    # IPC socket (dashboard <-> message send)
```

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow planning artifacts, milestones, codebase analysis
- Generated: By GSD commands
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code configuration, hooks, skills, agents
- Generated: Manually and by Claude Code
- Committed: Yes (except settings.local.json)

**`_references/`:**
- Purpose: Reference documentation for development
- Generated: No
- Committed: Yes

**`node_modules/`:**
- Purpose: Bun-managed dependencies
- Generated: By `bun install`
- Committed: No

**`.playwright/` and `.playwright-cli/`:**
- Purpose: Playwright test infrastructure (if used)
- Generated: By Playwright
- Committed: No (in .gitignore)

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Package manifest, bin entry (`git-stacks` -> `src/index.ts`), npm scripts, dependencies |
| `tsconfig.json` | TypeScript strict mode, `@/*` alias for tests, JSX preserve with @opentui/solid |
| `bunfig.toml` | Preloads @opentui/solid/preload for SolidJS JSX transform |
| `CLAUDE.md` | Claude Code project instructions (commands, architecture, patterns) |
| `.gitignore` | Ignores node_modules, .playwright*, .env |

---

*Structure analysis: 2026-04-04*
