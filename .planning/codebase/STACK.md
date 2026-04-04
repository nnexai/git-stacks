# Technology Stack

**Analysis Date:** 2026-04-04

## Languages

**Primary:**
- TypeScript 6.0.2 - Used throughout codebase (CLI, TUI, libraries, tests)
- JSX/TSX - SolidJS component syntax for TUI dashboard (`src/tui/dashboard/`)

**Secondary:**
- Bash/Shell - Hook execution via `sh -c`, git operations via Bun `$` shell

## Runtime

**Environment:**
- Bun (latest) - JavaScript/TypeScript runtime; executes `.ts` source directly with no build step
- ES modules - `"type": "module"` in `package.json`; all imports use ESM syntax

**Package Manager:**
- Bun - `bun install`, `bun run`, `bun test`
- Lockfile: `bun.lock` present

**Key constraint:** The `@/*` path alias (resolves to `./src/*` via `tsconfig.json`) is **test-only**. Production code in `src/` must use relative imports because the alias is unavailable in the published npm package.

## Frameworks

**CLI:**
- Commander.js ^14.0.3 - CLI command framework; entire command tree structure; dynamically introspected for shell completion generation (`src/lib/completion-generator.ts`)

**Validation:**
- Zod ^4.3.6 - Runtime schema validation; all YAML configs validated on read via `schema.parse()` in `src/lib/config.ts`

**Serialization:**
- yaml ^2.8.3 - YAML parsing (`parse`) and serialization (`stringify`) for all config files

**TUI/UI:**
- SolidJS ^1.9.12 - Reactive component framework for interactive dashboard (`git-stacks manage`)
- @opentui/core ^0.1.96 - Terminal UI component library (box, text, input, scrollable, etc.)
- @opentui/solid ^0.1.96 - SolidJS bindings for OpenTUI; provides `render()` and JSX factory
- opentui-spinner 0.0.6 - Animated terminal spinners for progress indication
- @clack/prompts ^1.2.0 - Interactive CLI prompts (text, select, confirm, multiselect, spinner)

**Testing:**
- bun:test - Built-in Bun test runner (Jest-compatible API)
- Custom test runner: `scripts/test-runner.ts` isolates mock-heavy files into separate processes

**Build/Dev:**
- TypeScript ^6.0.2 - Dev dependency; type-checking only (`bun run typecheck` / `tsc --noEmit`)
- @types/bun latest - Type definitions for Bun APIs (Bun.file, Bun.spawn, $, etc.)
- No build step required - Bun executes TypeScript directly

## Key Dependencies

**Critical (app breaks without them):**
- `zod` - All YAML config I/O depends on Zod schemas (`src/lib/config.ts`). Schemas are single source of truth for data shapes.
- `commander` - Entire CLI command tree; also introspected for shell completion auto-generation.
- `yaml` - Every config read/write (global config, templates, workspaces, registry) goes through yaml parse/stringify.
- `solid-js` + `@opentui/solid` + `@opentui/core` - The `git-stacks manage` interactive dashboard is a SolidJS app rendered via OpenTUI. Without these, the dashboard does not render.
- `@clack/prompts` - All interactive wizard prompts (template creation, workspace creation, config wizard). Must use `safeText()` wrapper from `src/tui/utils.ts` because `@clack/prompts` returns `undefined` on empty input.

**Infrastructure (Bun-native, no npm package):**
- Bun `$` shell - All git CLI operations (`src/lib/git.ts`) and hook execution (`src/lib/lifecycle.ts`)
- `Bun.spawn()` - IDE/terminal process launching, secret resolver command execution (`src/lib/secrets.ts`)
- `Bun.file()` - File reading (e.g., `src/lib/version.ts` reads `package.json`)
- `Bun.Glob` - Test file discovery in custom test runner

## Configuration

**Global config:** `~/.config/git-stacks/config.yml`
- Schema: `GlobalConfigSchema` in `src/lib/config.ts`
- Fields: `workspace_root`, `integrations` (per-integration config), `ports` (range_start, range_end), `secrets` (resolvers array)
- Config dir override: `GIT_STACKS_CONFIG_DIR` env var (used for test isolation)

**Registry:** `~/.config/git-stacks/registry.yml`
- Schema: `RepoRegistrySchema` - flat array of `{ name, local_path, default_branch, type, forge }`

**Templates:** `~/.config/git-stacks/templates/{name}.yml`
- Schema: `TemplateSchema` - repos, hooks, env, env_file, files, integrations, includes, ports, labels

**Workspaces:** `~/.config/git-stacks/workspaces/{name}.yml`
- Schema: `WorkspaceSchema` - branch, repos, hooks, settings (integration overrides), env, env_file, ports, labels

**Messages:** `~/.config/git-stacks/messages/{workspace}.jsonl`
- JSONL append-only log for workspace notification system

**Build config:**
- `tsconfig.json` - Target: ESNext, Module: ESNext, moduleResolution: bundler, strict: true, noUnusedLocals: true, noUnusedParameters: true, jsx: preserve, jsxImportSource: @opentui/solid
- `bunfig.toml` - Preload: `@opentui/solid/preload` (for JSX transform); same preload for test runner. Plugin also registered dynamically in `src/index.ts` for bunx/global installs.

**No .env files.** All configuration is YAML-based. Secret values in env use resolver syntax `${{ resolver:path }}` and are resolved at runtime by `src/lib/secrets.ts`.

## Platform Requirements

**Development:**
- Bun (latest) - Required for running, testing, and publishing
- TypeScript ^6.0.2 - For type checking (`bun run typecheck`)
- Git >= 2.24 - Checked at startup in `src/index.ts`; required for `git worktree` support

**Production / Runtime:**
- Bun runtime - Installed via npm (`npm i -g git-stacks`), executed via Bun shebang
- Git >= 2.24 - Required for worktree operations
- Supported shells for completions: bash, zsh, fish

**Optional CLI tools (checked at runtime, skipped if absent):**
- `code` / `code-insiders` - VSCode integration
- `idea` - IntelliJ integration
- `tmux` - tmux session management
- `cmux` - cmux workspace management (custom multiplexer)
- `niri msg` - niri Wayland compositor (Linux)
- `aerospace` - AeroSpace tiling window manager (macOS)
- `gh` - GitHub CLI (forge integration)
- `glab` - GitLab CLI (forge integration)
- `tea` - Gitea CLI (forge integration)
- `jira` - Jira CLI (issue tracking integration)
- `secret-tool` - Linux keychain resolver (libsecret)
- `security` - macOS Keychain Access

**OS-specific:**
- macOS: Keychain secret resolution via `security find-generic-password`; AeroSpace window management
- Linux: Secret resolution via `secret-tool lookup`; niri window management

## Entry Points

**CLI entrypoint:**
- `src/index.ts` - Bun shebang (`#!/usr/bin/env bun`); registers all Commander.js commands, checks git version, defaults to `manage` when no subcommand given. Published as `git-stacks` bin in `package.json`.

**Dashboard entrypoint:**
- `src/tui/dashboard/run.tsx` - SolidJS app entry; dynamically imported by `git-stacks manage` command. Registers Bun solid plugin programmatically before rendering.

**Test entrypoint:**
- `scripts/test-runner.ts` - Custom test runner that classifies tests as unit vs. integration, runs unit tests in a shared Bun process and integration tests in isolated per-file processes.

**npm scripts:**
```bash
bun run dev                    # Run CLI directly (bun run src/index.ts)
bun run test                   # Run all tests via custom test runner
bun run test:unit              # Run unit tests only
bun run test:integ             # Run integration tests only
bun run typecheck              # Type-check without emitting (tsc --noEmit)
```

---

*Stack analysis: 2026-04-04*
