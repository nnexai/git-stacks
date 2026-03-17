# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5.9.3 - Used throughout codebase (CLI, TUI, libraries)
- JSX/TSX - React-like syntax for SolidJS components in TUI dashboard

**Secondary:**
- Bash/Shell - Used in hooks system and git operations via `$` shell

## Runtime

**Environment:**
- Bun (latest) - JavaScript runtime and package manager
- Node.js ES modules - via Bun's native ESM support

**Package Manager:**
- Bun - Provides `bun` CLI and acts as package manager
- Lockfile: `bun.lock` (generated from package.json)

## Frameworks

**Core:**
- Commander.js 12.1.0 - CLI command framework and argument parsing
- Zod 3.25.76 - Type-safe schema validation for config files (YAML)
- yaml 2.8.2 - YAML parsing and serialization for config management

**UI/TUI:**
- SolidJS 1.9.11 - Reactive component framework for interactive TUI dashboard
- @opentui/core 0.1.87 - Core TUI component library (cross-platform terminal UI)
- @opentui/solid 0.1.87 - SolidJS bindings for OpenTUI components
- opentui-spinner 0.0.6 - Animated spinners in CLI output

**CLI Prompts:**
- @clack/prompts 0.9.1 - Beautiful CLI interactive prompts and selections

## Key Dependencies

**Critical:**
- Zod - Runtime schema validation; all YAML config (stacks, workspaces, global config) is validated against Zod schemas on read
- Commander.js - Entire CLI command tree structure; dynamically introspected for shell completion generation
- yaml - Reads/writes YAML config files stored at `~/.config/git-stacks/`
- SolidJS + OpenTUI - Interactive dashboard (`git-stacks manage`) for workspace management

**Infrastructure:**
- @types/bun - Type definitions for Bun APIs (fs, spawn, $)
- Bun's native `$` shell - All git operations and hook execution via shell subprocess
- Bun's `spawn()` API - Hook execution with inherited stdio and environment

## Configuration

**Environment:**
- No .env files used
- Configuration sourced from YAML files in `~/.config/git-stacks/`:
  - `config.yml` - Global configuration (workspace_root, integration settings)
  - `stacks/{name}.yml` - Stack definitions (repos, hooks, integration config)
  - `workspaces/{name}.yml` - Workspace instances (repos, hooks, settings overrides)

**Build:**
- `tsconfig.json`:
  - Target: ESNext (native async/await, modern modules)
  - Module: ESNext (ES modules)
  - Strict mode: enabled
  - JSX: preserve with `jsxImportSource: @opentui/solid`
  - Path alias: `@/*` resolves to `./src/*`
  - skipLibCheck: true (faster builds)
- `bunfig.toml`:
  - Preload: `@opentui/solid/bun-plugin` for JSX/TSX support in dashboard
  - Plugin dynamically registered in code for bunx/global installs

## Platform Requirements

**Development:**
- Bun (latest) - Required for running source directly, testing, and publishing
- TypeScript 5.9.3 - Dev dependency for type checking (`bun run typecheck`)
- Git 2.24+ (for worktree support)

**Production:**
- Bun runtime - Binary distribution via npm (`git-stacks` command)
- Git 2.24+ - For `git worktree` operations
- Supported shells: bash, zsh, fish (completion output)
- IDE/terminal integrations:
  - VSCode (optional) - via `code` or `code-insiders` binary
  - IntelliJ (optional) - via `idea` binary for Java repos
  - tmux (optional) - session management via tmux CLI
  - cmux (optional) - custom terminal multiplexer support

## Entry Points

**CLI:**
- `src/index.ts` - Bun shebang entrypoint; registers all commands with Commander.js
- Published as `git-stacks` bin in package.json

**Dashboard:**
- `src/tui/dashboard/run.tsx` - SolidJS app entry; renders via @opentui/solid
- Invoked by `git-stacks manage` command

---

*Stack analysis: 2026-03-17*
