# Directory Structure

**Analysis Date:** 2026-03-17

## Top-Level Layout

```
git-stacks/
├── src/                    # All source code (TypeScript)
├── tests/                  # Unit and integration tests
├── node_modules/           # Dependencies (Bun-managed)
├── package.json            # Package manifest and scripts
├── tsconfig.json           # TypeScript config (strict mode, @/* alias)
├── bunfig.toml             # Bun configuration
└── .gitignore
```

No build output directory — Bun runs TypeScript source directly.

## Source Tree

```
src/
├── index.ts                          # CLI entry point; registers all commands
├── commands/                         # Thin Commander.js command handlers
│   ├── workspace.ts                  # new|clone|open|list|status|clean|remove|cd|merge|run|rename|sync
│   ├── stack.ts                      # stack * subcommands (thin wrappers over tui/)
│   ├── doctor.ts                     # health check and drift detection
│   ├── completion.ts                 # shell completion output (bash|zsh|fish)
│   └── config.ts                     # interactive config wizard
├── lib/                              # Reusable business logic
│   ├── paths.ts                      # All path constants and helpers (SINGLE SOURCE OF TRUTH)
│   ├── config.ts                     # Zod schemas + YAML read/write for all entities
│   ├── git.ts                        # Git worktree operations via Bun $ shell
│   ├── workspace-ops.ts              # Core orchestration: open, clean, remove, merge, sync
│   ├── lifecycle.ts                  # runHooks() — executes hook arrays via Bun.spawn
│   ├── files.ts                      # File copy/symlink operations from stack templates
│   ├── detect.ts                     # Repo type detection and directory scanning
│   ├── completion-generator.ts       # Auto-generates bash/zsh/fish completions from Commander tree
│   ├── vscode.ts                     # VS Code .code-workspace artifact generator
│   ├── intellij.ts                   # IntelliJ .idea/ project artifact generator
│   ├── cmux.ts                       # Cmux session artifact generator
│   ├── tmux.ts                       # Tmux session artifact generator
│   └── integrations/
│       ├── types.ts                  # Integration interface, IntegrationContext, resolveEnabled()
│       ├── index.ts                  # Registry: `export const integrations = [...]`
│       ├── vscode.ts                 # VS Code integration plugin
│       ├── intellij.ts               # IntelliJ integration plugin
│       ├── cmux.ts                   # Cmux integration plugin
│       └── tmux.ts                   # Tmux integration plugin
└── tui/                              # Interactive terminal UI
    ├── utils.ts                      # safeText() — wraps @clack/prompts to handle undefined
    ├── stack-wizard.ts               # Interactive prompts for `stack new` and `stack init`
    ├── stack-edit.ts                 # Interactive editor for `stack edit`
    ├── workspace-wizard.ts           # Interactive prompts for `git-stacks new`
    ├── workspace-clone.ts            # Interactive prompts for `git-stacks clone`
    └── dashboard/                    # Interactive TUI for `git-stacks manage`
        ├── run.tsx                   # Entry point — renders SolidJS app in terminal
        ├── App.tsx                   # Root component, keyboard/event handling
        ├── WorkspaceList.tsx         # Workspace list view
        ├── WorkspaceRow.tsx          # Single workspace row
        ├── ActionMenu.tsx            # Context menu for workspace actions
        ├── BatchBar.tsx              # Batch operation bar
        ├── ConfirmDialog.tsx         # Confirmation dialog
        ├── DetailStatus.tsx          # Repo-level detail status panel
        ├── ProgressView.tsx          # Operation progress display
        ├── StatusIndicator.tsx       # Dirty/clean status icon
        ├── types.ts                  # Dashboard-specific types
        └── hooks/
            └── useWorkspaces.ts      # Reactive workspace data hook
```

## Tests Tree

```
tests/
├── helpers.ts                        # Shared: makeTmpDir, cleanup, mkdir, touch, write
└── lib/                              # Unit tests mirroring src/lib/ structure
    ├── detect.test.ts                # detectRepoType, scanForRepos
    ├── config.test.ts                # Schema parsing + I/O round-trip
    ├── vscode.test.ts                # generateCodeWorkspace
    ├── intellij.test.ts              # generateIntellijProject
    └── completion-generator.test.ts  # Shell completion generation (bash, zsh, fish)
```

## Runtime Data Layout (User's Machine)

```
~/.config/git-stacks/
├── config.yml                        # Global config (workspace_root, integrations)
├── stacks/
│   └── {stack-name}.yml             # Stack definitions (repos, hooks, env)
└── workspaces/
    └── {workspace-name}.yml         # Workspace instances (repos, branch, settings)

{workspace_root}/                     # Configured in config.yml; defaults to ~/workspaces
├── main/                             # Main clones (one per repo, path is user-defined in stack)
│   └── {repo-name}/                 # Full git clone — actual path set in stack YAML
└── tasks/                           # Git worktrees (one per workspace per repo)
    └── {workspace-name}/
        └── {repo-name}/             # Detached worktree at workspace branch
```

**Important:** `workspace_root` is user-configurable. Stack YAML defines the actual paths for each repo — these can be anywhere on the filesystem, not necessarily under `workspace_root/main/`. The `main/` layout is the default convention but is not enforced.

## Key Locations by Concern

| Concern | Location |
|---------|----------|
| CLI entry point | `src/index.ts` |
| Path constants | `src/lib/paths.ts` |
| All YAML schemas | `src/lib/config.ts` |
| Git operations | `src/lib/git.ts` |
| Core business logic | `src/lib/workspace-ops.ts` |
| Hook execution | `src/lib/lifecycle.ts` |
| Integration registry | `src/lib/integrations/index.ts` |
| Integration contract | `src/lib/integrations/types.ts` |
| Test helpers | `tests/helpers.ts` |

## Naming Conventions

**Files:** Kebab-case throughout (`workspace-ops.ts`, `stack-wizard.ts`)

**Modules:**
- `lib/` — reusable pure logic, no CLI or TUI concerns
- `commands/` — thin CLI wrappers over lib + tui
- `tui/` — interactive prompts and terminal rendering
- `tui/dashboard/` — SolidJS-based interactive TUI (`.tsx` extension)

**Test files:** Match source file with `.test.ts` suffix in `tests/lib/`

**Config data files:** YAML with snake_case field names (matching Zod schema definitions)
