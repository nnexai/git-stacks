# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev                         # run the CLI from TypeScript source
bun run test                        # run all tests with process isolation
bun test tests/lib/detect.test.ts   # run one focused test file
bun run typecheck                   # type-check the CLI, service, and TUI
bun run web:typecheck               # type-check the browser client
bun run web:build                   # build browser assets into dist/web
bun run test:deps                   # check source dependency cycles
bun run verify:gates                # verify command, test, and coverage inventories
bun run scripts/release-rc-check.ts --skip-tag  # verify an RC without creating its tag
```

**Important:** Do not use `bun test tests/` directly — it runs all test files in a shared Bun process where `mock.module()` calls from one file pollute others, producing false failures. The project's `bun run test` script (`scripts/test-runner.ts`) isolates mock-heavy files into separate processes.

The CLI, service, and TUI run directly from TypeScript. The browser client has a build step and its assets must be present in `dist/web`; `prepublishOnly` builds them and runs both typechecks plus the full test suite. The `@/*` path alias resolves to `./src/*` but is **test-only** — production code in `src/` must use relative imports because the alias is not available in the published npm package.

Release-candidate verification requires a `-rc.N` package version and matching changelog heading. Its publish dry run uses npm's `next` dist-tag so a prerelease cannot accidentally validate as `latest`.

## Architecture

`git-stacks` is a local workspace platform for managing git worktrees across multiple repos. It has three durable concepts:

**Repo Registry** — a flat list of local git repos with their names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|remove`.

**Templates** — named sets of repos (by registry name) with modes and branch patterns, used to stamp out workspaces. Stored as YAML at `~/.config/git-stacks/templates/{name}.yml`. Managed via `git-stacks template new|list|edit|remove`.

**Workspaces** — task/ticket-scoped instances created from templates. Each workspace has a branch name; repos can be in `worktree` mode (a git worktree is created at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (the main clone path is referenced directly). Stored at `~/.config/git-stacks/workspaces/{name}.yml`.

The global config is at `~/.config/git-stacks/config.yml`. The default `workspace_root` is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

Interactive clients use one machine-side core. The authenticated loopback service owns complete workspace projection, mutations, operation state, events, signals, monitoring, and browser PTYs. The TUI consumes the trusted typed `/v1/core` contract. The browser consumes a narrower `/web/api` projection that excludes trusted paths, resolved commands, environment values, and credentials. One-shot CLI commands remain script-friendly adapters over the same domain modules.

### Source layout

```
src/
  index.ts                  — Commander entrypoint and version bootstrap
  commands/
    workspace.ts            — workspace lifecycle, status, Git, shell, env, and path commands
    command.ts              — list and run explicit manual workspace commands
    files.ts / notes.ts     — explicit file synchronization and operator notes
    hooks.ts                — opt-in user-level coding-agent signal hooks
    service.ts / web.ts     — local service control, signal publication, and browser client
    template.ts / repo.ts   — template and registry management
    integration.ts          — integration inspection and helper commands
    config.ts / doctor.ts   — configuration and drift checks
  lib/
    cli-program.ts          — complete Commander tree shared by runtime and completion audits
    config.ts / paths.ts    — Zod-validated YAML and path constants
    workspace-creation.ts   — prompt-free, race-safe creation engine
    workspace-lifecycle.ts  — open, close, clean, remove, merge, and rename
    workspace-git.ts        — sync, push, pull, and Git status operations
    workspace-env.ts        — workspace/repository environment construction
    workspace-resolution.ts — indexed workspace/template resolution
    workspace-*.ts          — focused YAML, status, recreate, source, priority, and command modules
    operation-runner.ts     — structured operation execution and progress
    lifecycle.ts            — declarative workspace hook execution
    composition.ts          — recursive template composition
    files.ts / secrets.ts   — file materialization and secret reference resolution
    integrations/           — IDE, terminal, window-manager, forge, and issue plugins
    agent-hooks/            — owned user-level hook lifecycle and terminal-local wrappers
    service/
      contract.ts           — strict public service, operation, event, and signal schemas
      core-contract.ts      — complete trusted local-client read/mutation model
      core-state.ts         — complete service-owned projection builder
      client.ts             — shared authenticated client used by the TUI
      snapshot.ts           — revisioned browser-safe workspace snapshot engine
      operations.ts         — durable idempotent operation registry
      event-journal.ts      — ordered durable event and signal replay
      signal-state.ts       — current lifecycle lanes, attention, and dismissal reduction
  service/
    main.ts                 — discovery, startup locking, lifecycle, and subsystem composition
    server.ts               — authenticated `/v1` HTTP and SSE transport
    snapshot-adapter.ts     — domain-to-service projection adapter
    web/                    — pairing, browser projection/routes, security, and PTY manager
  web-client/               — thin browser UI and xterm presentation
  tui/
    *-wizard.ts             — interactive creation and editing prompts
    dashboard/              — thin SolidJS/OpenTUI service client and renderer
tests/
  commands/ / lib/ / service/ / tui/ — focused unit and integration coverage
scripts/
  build-web.ts              — browser asset build
  test-runner.ts            — process-isolated test orchestration
  verify*.ts                — local release and coverage gates
```

### Key patterns

- YAML entities are Zod-validated, indexed by their in-file `name`, and atomically written with tmp+fsync+rename semantics. Preserve compatibility with existing schema version 1 files.
- The service is authoritative for interactive state. Add machine-side reads or mutations to the service/core contract and shared client instead of reintroducing direct TUI filesystem access.
- The browser contract must remain narrower than `CoreState`: do not expose machine paths, credentials, raw environment values, or unapproved launch details through `/web/api`.
- Interactive clients load one complete snapshot and refresh from service invalidation events. Navigation, selection, and viewport changes must remain local and must not trigger filesystem or Git scans.
- Browser PTYs are service-owned. Inactive views suspend output streaming; ordinary shell exit deletes the terminal, while configured command sessions may retain ended output.
- I/O tests redirect `process.env.HOME` before dynamically importing config to isolate the config directory.
- `src/tui/utils.ts:safeText` must be used instead of `p.text` directly because `@clack/prompts` returns `undefined` (not `""`) on empty input.
- **Repo registry is the source of truth for repo paths**: Templates reference repos by `name` (registry key), not by path. `WorkspaceRepo.repo` stores the registry name; `main_path` and `task_path` are resolved at workspace creation time.
- **Integration plugin system**: `src/lib/integrations/runner.ts` sorts by `order`, checks `applies()` and `isEnabled()`, then calls `generate()` then `open()`. Passes `ArtifactBag` between integrations for cross-integration communication. To add a new integration: create the plugin implementing `Integration`, register it in `index.ts`.
- Each integration stores its config under `globalConfig.integrations[id]` (a `Record<string, unknown>`) and parses it internally with its own Zod schema.
- Per-workspace overrides: add `settings.integrations.<id>.enabled: false` to the workspace YAML.
- **Subprocess testing**: Modules that spawn subprocesses export a mutable `_exec` object. Tests replace `_exec.spawn` with a mock to verify call shapes without executing real processes. Object property is mutable even in ESM (unlike named exports).
- **Workspace lifecycle cascading**: `remove` calls `clean` which calls `close` internally. `merge` also cascades through `clean` then `close`.
- **Secret resolution**: `${{ resolver_id:path }}` syntax in env var values. Three built-in resolvers: keychain (macOS/Linux), env, cmd. Resolvers registered in `RESOLVER_REGISTRY`; enabled list in `config.secrets.resolvers`.
- **Error handling**: Git ops use `.quiet().nothrow()` + exit code checks, returning discriminated unions `{ ok: true } | { ok: false; error: string }`. Never throw for expected failures. `runHooks()` throws on non-zero exit when `abortOnFailure=true`.

### Dashboard TUI input rules

- **Use OpenTUI built-in `<input>` for ALL text fields** in the dashboard — never hand-roll `useKeyboard` character accumulation. The built-in input provides cursor movement, selection, undo/redo, and blinking cursor for free.
- **Keyboard isolation**: `useKeyboard` is a global broadcast — ALL handlers see ALL keys. When a focused `<input>` is active, place the input-mode guard (`if (filtering()) return` / `if (v.view === "inline-input") return`) **above** all navigation handlers (tab switching, cursor movement, action triggers) in the main `useKeyboard` callback.
- **Deferred focus**: When a keypress activates a new `<input>` (e.g., `/` opens filter), mount with `focused={false}` and `setTimeout(() => setFocused(true), 0)` — otherwise the triggering keypress leaks into the input as the first character.
- **`runHooksCaptured()`** must be used instead of `runHooks()` when executing hooks from within the TUI — `runHooks` uses `stdio: "inherit"` which corrupts the OpenTUI screen.

### Hooks system

Templates and workspaces define hook arrays (shell commands executed in order by `runHooks()` in `lifecycle.ts`):

- Template hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `pre_remove`, `post_merge`
- Workspace hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `post_merge`, `pre_remove`
- Per-repo hooks (within workspace YAML): `pre_open`

Hooks receive injected environment variables: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path; `workspace-env.ts` owns merged environment construction and file output.

Coding-agent signal integrations are separate from workspace lifecycle hooks. They are user-level, ownership-marked, and strictly opt-in through `git-stacks hooks install|update|uninstall|status`. Starting the service, TUI, web client, or terminal must never install or modify provider configuration implicitly.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**git-stacks**

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

**Core Value:** One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

### Constraints

- **Runtime**: Bun — no Node.js compatibility required; use Bun APIs freely (`$`, `spawn`, `Bun.file`)
- **Language**: TypeScript strict mode throughout
- **Config format**: YAML with Zod validation — preserve schema compatibility with existing user configs
- **No breaking changes**: Existing workspace YAML files must continue to work across improvements
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

- **Runtime**: Bun (latest) — executes the CLI, service, and TUI TypeScript directly
- **CLI**: Commander.js ^14.0.3 — command tree + shell completion introspection
- **Validation**: Zod ^4.3.6 — all YAML config validated on read
- **YAML**: yaml ^2.8.3 — all config I/O
- **TUI**: SolidJS ^1.9.12 + @opentui/core ^0.1.96 + @opentui/solid ^0.1.96
- **Prompts**: @clack/prompts ^1.2.0 (use `safeText()` wrapper)
- **TypeScript**: ^6.0.2 (type-check only via `tsc --noEmit`)
- **Test**: bun:test + custom runner (`scripts/test-runner.ts`) for mock isolation
- **Browser terminal**: xterm.js + fit/WebGL addons; bundled into `dist/web`
- **Shell tools**: git >=2.24, plus optional: code, idea, tmux, cmux, niri, aerospace, gh, glab, tea, jira, secret-tool/security
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- Kebab-case files, camelCase functions (verb-prefixed), PascalCase types, UPPER_SNAKE_CASE path constants
- Schema types use `Schema` suffix; infer types via `z.infer<typeof Schema>`
- `type` for data structures, `interface` for contracts (e.g., `Integration`, `WindowDetector`, `SecretResolver`)
- Named exports only (no wildcards); `@/*` alias is test-only, production uses relative imports
- Discriminated unions `{ ok: true } | { ok: false; error: string }` for fallible ops; `null` only for "not found"
- Paired `read*`/`write*` functions for each entity; atomic writes (tmp+fsync+rename)
- Modules with subprocesses export mutable `_exec` object for test injection
- `@clack/prompts` wrapped in mutable `prompts` object in `src/tui/utils.ts` for testability
- No barrel files except `src/lib/integrations/index.ts`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

The focused modules under `lib/workspace-*.ts` and `lib/integrations/` own domain behavior. One-shot commands call those modules through thin Commander adapters. Interactive clients go through the authenticated local service: the TUI uses the complete trusted `lib/service/core-contract.ts` model, while the browser uses the narrower projection under `service/web/`. Both clients follow revisioned snapshots and durable SSE events instead of implementing their own workspace engines.

Key subsystems beyond core workspace lifecycle:
- **Integrations** (`lib/integrations/`): 10 plugins (vscode, intellij, cmux, tmux, niri, aerospace, github, gitlab, gitea, jira) orchestrated by `runner.ts`
- **Composition** (`lib/composition.ts`): Template `includes` with recursive merge, circular dependency detection
- **Secrets** (`lib/secrets.ts`): `${{ resolver:path }}` env var resolution via pluggable resolvers (keychain, env, cmd)
- **Ports** (`lib/ports.ts`): File-locked contiguous port allocation across workspaces
- **Service core** (`lib/service/`, `service/`): authenticated discovery, complete trusted state, browser-safe projection, typed mutations, durable operations/events, and signals
- **Browser terminals** (`service/web/terminal-manager.ts`): service-owned Linux PTYs with bounded replay and visible-view streaming
- **Agent hooks** (`lib/agent-hooks/`): opt-in owned user-level integrations for Codex, Claude Code, Copilot, and OpenCode, plus service-local terminal wrappers
- **Labels** (`lib/labels.ts`): Workspace categorization and filtering

Durable user configuration remains human-editable YAML under `~/.config/git-stacks/`. Service descriptors, credentials, operation/event journals, and runtime PTYs live under the service-owned config area; PTYs are intentionally process-lifetime state rather than durable workspace definition.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
