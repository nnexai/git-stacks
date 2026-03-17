# Feature Research

**Domain:** Multi-repo workspace manager / dev environment CLI (git worktrees + IDE/terminal orchestration)
**Researched:** 2026-03-17
**Confidence:** MEDIUM — tmuxinator and workmux verified via GitHub READMEs (HIGH for those two); mise/devenv/moonrepo via official docs (HIGH); direnv via official README (HIGH); turborepo/nx/cargo-make via GitHub/docs (MEDIUM); training knowledge fills gaps for nx/turbo since WebFetch was blocked on their sites.

---

## Context: What git-stacks Already Has

Before mapping what's missing, these features are already implemented and are NOT the focus of this document:

- Workspace lifecycle: `new`, `open`, `clone`, `merge`, `sync`, `remove`, `clean`, `rename`
- Stack templates (YAML) with per-repo modes (worktree/trunk), hooks, env vars, file ops
- Hook system: `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove`
- Integration plugins: VSCode, IntelliJ, tmux, cmux — with enable/disable overrides per workspace
- Interactive TUI dashboard (`manage`) via SolidJS
- Stack wizards: `stack new`, `stack init`, `stack edit`
- Shell completion (bash/zsh/fish)
- `doctor` health check: orphaned task dirs, missing worktrees, dead stack refs, stale cmux sessions
- `run` command: execute arbitrary commands across workspace repos
- `sync` with rebase/merge strategies and best-effort mode
- `status` command with dirty-worktree detection
- `list` with JSON output and sort options
- `cd` command for shell navigation

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any serious workspace/multi-repo dev tool. Missing these causes churn, bug reports, or abandonment.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Dry-run mode for destructive operations** | `merge`, `remove`, `clean` are irreversible. Every serious CLI tool exposes `--dry-run`. workmux, cargo-make, Nx, moon all provide preview/dry-run. Absence means users fear the tool. | LOW | Print what _would_ happen without executing. Already has conflict pre-check for merge; extend the pattern. |
| **Per-operation confirmation prompts** | Tools that delete things without "are you sure?" are considered broken by power users. tmuxinator's `delete` confirms; workmux pre-merge hook failure aborts. | LOW | `remove` and `clean` need interactive confirm when not `--force`. |
| **Actionable error messages with suggested fix** | Every check in `doctor` already has a `fix:` field — but errors during `open`, `merge`, `sync`, `run` often emit raw git stderr. Users expect "repo X has uncommitted changes — stash or use --force" not a bare exit code. | MEDIUM | Standardize error objects with a `suggestion` field across all lib functions. |
| **List workspaces shows branch + age** | `git-stacks list` exists but power users expect to see: workspace name, branch, repos in scope, when created, dirty status at a glance. tmuxinator `list` and workmux `list` both show rich status. | LOW | Already partially done; may need richer columns (repo count, dirty indicators). |
| **Workspace status shows per-repo state** | `status [name]` shows dirty repos; users also expect: commits ahead/behind upstream, last sync time, which repos have uncommitted work. mise and moon both show per-project health. | MEDIUM | Extend `RepoStatus` type to include ahead/behind counts. |
| **`--force` flags consistently available** | `remove`, `clean`, `merge` have `--force` but inconsistently. Users expect a uniform escape hatch when they know what they're doing. | LOW | Audit all destructive commands; ensure `--force` bypasses safety checks uniformly. |
| **Config schema validation with clear errors** | Zod validation exists on read, but YAML parse errors surface as stack traces. Users need "invalid stack config at line 12: missing required field 'path'" not a JavaScript error. | MEDIUM | Catch Zod errors and format them as human-readable field-level messages. |
| **Programmatic output (`--json`) on all status commands** | `list` has `--json`; `status` and `doctor` do not. Automation scripts and AI agents expect machine-readable output everywhere. mise, moon, Nx all support JSON output. | LOW | Add `--json` to `status`, `doctor`, `sync` result output. |
| **`doctor --fix` auto-repair mode** | `doctor` detects issues and prints suggested `fix:` commands but doesn't run them. Users expect `--fix` to execute safe repairs automatically (re-run `open` for missing worktrees, delete orphaned dirs). | MEDIUM | Already has fix suggestions; add `--fix` flag to execute them. |
| **Workspace templates / quick-start from existing branch** | Cloning an existing remote branch into a workspace is `git-stacks clone`, but the PROJECT.md flags this as needing improvement. Users working off existing PRs/branches expect smooth onboarding. | MEDIUM | `clone` should auto-detect multi-repo stacks, validate branch exists, offer stack selection. |

### Differentiators (Competitive Advantage)

Features where git-stacks can pull ahead of workmux, tmuxinator, and similar tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Agent-aware dashboard with status indicators** | workmux has emoji status indicators (working/waiting/done) per worktree tied to AI agent state. git-stacks `manage` TUI exists but doesn't track agent activity. As AI-agent parallel dev becomes standard, this differentiates. | HIGH | Requires integration hooks for Claude Code / Copilot CLI / similar tools to write status files that the dashboard polls. |
| **Multi-worktree batch generation from template** | workmux supports `--count N`, `--foreach`, `--agent` flags for spinning up N identical worktrees with templated branch names. git-stacks creates one workspace at a time. For agent parallelism, batch creation is a force multiplier. | HIGH | New command or `new --count N --template <branch-pattern>`. Requires template variable system (MiniJinja or similar). |
| **PR checkout as first-class command** | workmux `add --pr <number>` creates a worktree directly from a GitHub PR. git-stacks has no equivalent. For teams doing PR review in isolated environments this removes 4-5 manual steps. | MEDIUM | `git-stacks clone --pr <number>` using `gh` CLI. Check PR branch, create workspace from inferred stack. |
| **Alternative terminal backend support** | workmux supports tmux (primary), WezTerm, kitty, Zellij. git-stacks supports tmux and cmux. WezTerm and Zellij are growing rapidly in 2024-2026 among power users. | MEDIUM | Integration plugin pattern already handles this cleanly; add `wezterm.ts` and `zellij.ts` integrations. |
| **Sandbox / container isolation mode** | workmux supports Docker/Podman and Lima VM backends for agent sandboxing. git-stacks has no isolation boundary — agents can access the whole filesystem. For production-safe agent workflows, container mode is compelling. | HIGH | New integration type; complex. Likely v2+. |
| **Programmatic API / SDK surface** | PROJECT.md calls this out as an active requirement. No other comparable tool exposes a clean TypeScript API. AI agent frameworks (LangChain, Claude Code, etc.) need to call workspace operations programmatically without shelling out. | MEDIUM | Export `openWorkspace`, `mergeWorkspace`, etc. as a typed package. Already partially structured for this. |
| **Per-workspace env file writing with secret injection** | git-stacks already writes `.env` files per repo from `env` + `env_file` in stack/workspace YAML. The differentiator is injecting secrets from a secrets manager (1Password CLI, Vault, `sops`) at workspace open time via hooks or a native integration. | HIGH | Hook-based approach is possible today; native integration would be cleaner. |
| **Stack composition (multi-stack workspaces)** | git-stacks already supports multiple stacks per workspace — this is already a differentiator over tools like tmuxinator/workmux that have no stack concept at all. Highlight and polish this: inter-stack dep ordering, conflict detection. | MEDIUM | The capability exists; polish edge cases and document the mental model clearly. |
| **`run` command with parallel execution and output aggregation** | `git-stacks run <name> [repo]` executes commands per repo sequentially. mise, moon, and cargo-make all run tasks in parallel with aggregated output. Parallel `run --parallel` with a spinner per repo and aggregated results would be a major DX win. | MEDIUM | Bun's `spawn` supports parallel; need output buffering + terminal multiplexing of output streams. |
| **Watch mode for tasks** | mise and cargo-make support `--watch` mode to re-run tasks when files change. For "run tests across all repos when any file changes" workflows this is highly valued. | HIGH | Requires file watcher integration (Bun has `Bun.watch`). Likely v1.x+ feature. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but create more problems than they solve given git-stacks' design goals and constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Remote/cloud workspace sharing** | "Share my workspace with a teammate" | Turns a local CLI into a client-server system; auth, sync, conflict resolution, network reliability all become problems. Out of scope per PROJECT.md. | Document workspace YAML as portable — teammates can `git-stacks clone` from the same branch. |
| **Built-in package manager / tool version management** | mise and devenv handle tool versions; users want one tool | git-stacks is about workspace _orchestration_, not runtime management. Adding `.nvmrc`-style tool pinning duplicates mise/asdf with inferior maintenance. Scope bleed. | Recommend mise or asdf in stack's `post_create` hook. Document the pattern. |
| **GUI application** | Visual workspace management is appealing | Electron/web app is a completely different maintenance surface. The TUI dashboard already provides interactive UI. Out of scope per PROJECT.md. | Invest in TUI dashboard quality instead. |
| **Nix / devenv integration as a first-class feature** | Nix devShells are reproducible and powerful | Adding Nix as a first-class dependency forces all users to have Nix installed. Complexity is enormous. The hook system already handles `direnv allow` or `devenv up` as post-create commands. | Document the hook-based integration pattern clearly. |
| **AI-triggered merge conflict resolution** | Automate merge pain points | Automated conflict resolution requires deep git semantic understanding; false positives destroy work. Developers must retain final control over conflict resolution. | Surface conflicts clearly with per-repo status; let developer use their preferred merge tool. |
| **Monorepo task pipeline (Nx/Turborepo-style caching)** | Run only affected tasks | git-stacks manages _workspaces_ (task branches), not _build pipelines_. Affected-task caching is Nx/turbo's domain. Adding it would require a build graph, input hashing, and cache storage — a full product in itself. | `git-stacks run` can call `nx affected` or `turbo run` inside repos; compose with existing tools. |
| **Real-time everything / live sync** | Keep worktrees in sync automatically | Automatic git operations without user intent break the isolation model. Background rebase can introduce conflicts mid-work silently. | Provide explicit `sync --all` and surface "N commits behind" in status/dashboard. |
| **Per-user permission management** | Multi-user workspace access control | git-stacks is explicitly single-machine, single-user. Building permissions adds auth infrastructure with no clear local benefit. | Standard filesystem permissions handle multi-user scenarios on shared machines. |

---

## Feature Dependencies

```
Dry-run mode
    └──enables──> Doctor --fix auto-repair (safe to auto-fix when dry-run logic is proven)

Actionable error messages
    └──requires──> Standardized error object type across all lib functions
    └──enables──> Doctor --fix (fix suggestions must be machine-parseable, not display strings)

Per-repo ahead/behind status
    └──requires──> Fetch origin (already done in sync flow)
    └──enables──> Agent dashboard (agents need to know upstream drift)

Programmatic API surface
    └──requires──> Stable error types + result types (not just console output)
    └──enables──> Agent-aware features (agents call the API, not the CLI)

PR checkout command
    └──requires──> gh CLI available (external dependency, not bundled)
    └──enables──> Agent batch generation (each agent PR gets its own workspace)

Agent status indicators in dashboard
    └──requires──> Agent status file protocol (convention for agents to write status)
    └──enhances──> Multi-worktree batch generation (dashboard shows N agents)

Parallel `run` execution
    └──requires──> Output buffering / stream multiplexing
    └──enhances──> Multi-worktree batch generation (run commands across all agent workspaces)

Alternative terminal backends (WezTerm, Zellij)
    └──requires──> Integration plugin pattern (already exists)
    └──conflicts with──> cmux-specific features (cmux workspace ID tracking is tmux-coupled)
```

### Dependency Notes

- **Dry-run requires no structural change:** The merge conflict pre-check pattern already exists; extend it to `remove` and `clean`.
- **Doctor --fix depends on actionable errors:** The `fix` field in Issue objects is currently a display string; it needs to be a structured action type to be safely executable.
- **PR checkout has external dependency on `gh` CLI:** Should gate behind a check and emit a clear error if `gh` is not authenticated.
- **Parallel run conflicts with sequential run:** They should be the same command (`run --parallel`), not separate commands.
- **Agent dashboard is high-complexity:** The status indicator protocol needs to be defined before implementation — otherwise agents and dashboard will be built to different contracts.

---

## MVP Definition

git-stacks already has an MVP. This section defines what's needed to graduate from "working PoC" to "polished stable tool" (v1.0) and what comes after.

### Launch With (v1.0 — Stabilization)

Minimum work needed to make the existing tool trustworthy and complete-feeling.

- [ ] **Dry-run for `merge`, `remove`, `clean`** — removes the primary reason users fear destructive operations
- [ ] **Confirmation prompts on `remove` and `clean` (without --force)** — standard CLI safety; absence feels broken
- [ ] **Actionable error messages throughout** — currently raw git stderr leaks; users need guided recovery paths
- [ ] **Config validation errors as human-readable field messages** — Zod errors as stack traces are not acceptable UX
- [ ] **`--json` output on `status`, `doctor`, `sync`** — required for scripting and agent automation
- [ ] **`doctor --fix` for safe auto-repairs** — extends existing doctor checks; low risk since repairs are already listed

### Add After Validation (v1.x — Power User Features)

Features to add once v1.0 is stable and gathering user feedback.

- [ ] **PR checkout (`clone --pr <number>`)** — trigger: users reporting friction with PR review workflows
- [ ] **Parallel `run --parallel`** — trigger: users with 5+ repos in a workspace hit sequential execution pain
- [ ] **Per-repo ahead/behind in `status`** — trigger: users asking "how stale is my workspace?"
- [ ] **WezTerm and Zellij integration plugins** — trigger: users on non-tmux terminals requesting support
- [ ] **Programmatic API package** — trigger: first agent framework integration attempt

### Future Consideration (v2+ — Differentiation)

Defer until v1.x is stable and product-market fit is established.

- [ ] **Agent-aware dashboard with status indicators** — defer: requires agent status protocol definition; high complexity
- [ ] **Multi-worktree batch generation** — defer: requires template variable system; primarily useful for agent-parallel workflows
- [ ] **Secret injection at open time** — defer: secrets management is a deep domain; hooks provide a good enough escape hatch
- [ ] **Container/sandbox isolation** — defer: out of scope per PROJECT.md; revisit when agent-safety requirements are clearer
- [ ] **Watch mode for `run`** — defer: useful but complex; composable with existing `mise watch` via hooks

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Dry-run for destructive ops | HIGH | LOW | P1 |
| Confirmation prompts (`remove`, `clean`) | HIGH | LOW | P1 |
| Actionable error messages | HIGH | MEDIUM | P1 |
| Config validation human errors | HIGH | MEDIUM | P1 |
| `--json` on status/doctor/sync | MEDIUM | LOW | P1 |
| `doctor --fix` | MEDIUM | MEDIUM | P1 |
| PR checkout (`clone --pr`) | HIGH | MEDIUM | P2 |
| Parallel `run --parallel` | HIGH | MEDIUM | P2 |
| Per-repo ahead/behind in status | MEDIUM | MEDIUM | P2 |
| WezTerm / Zellij integrations | MEDIUM | LOW | P2 |
| Programmatic API surface | HIGH | MEDIUM | P2 |
| Agent dashboard status indicators | HIGH | HIGH | P3 |
| Batch worktree generation | MEDIUM | HIGH | P3 |
| Secret injection integration | MEDIUM | HIGH | P3 |
| Container/sandbox isolation | LOW | HIGH | P3 |
| Watch mode for `run` | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.0 stable release
- P2: Should have; add in v1.x iterations
- P3: Nice to have; future consideration

---

## Competitor Feature Analysis

| Feature | tmuxinator | workmux | mise | direnv | moonrepo | git-stacks (current) | git-stacks (target) |
|---------|------------|---------|------|--------|----------|----------------------|---------------------|
| Session/workspace lifecycle (new/open/close/remove) | Yes (project files) | Yes | No (env scoped) | No | No (task scoped) | Yes | Yes |
| Multi-repo support | No (single project) | Single repo + worktrees | No | No | Yes (monorepo) | Yes (multi-repo stacks) | Yes |
| Git worktree isolation | No | Yes (primary feature) | No | No | No | Yes | Yes |
| Declarative YAML/TOML config | Yes | Yes | Yes | No (.envrc script) | Yes | Yes | Yes |
| Lifecycle hooks | Yes (5 events) | Yes (3 events) | Yes (6 events) | No | Yes | Yes (6 events) | Extend |
| Environment variable injection | Limited (ERB) | Yes | Yes (primary feature) | Yes (primary feature) | Per-task | Yes | Yes |
| IDE integration | No | No | No | No | No | Yes (VSCode, IntelliJ) | Extend (WezTerm, Zellij) |
| Terminal multiplexer integration | Yes (tmux only) | Yes (tmux + 3 alt backends) | No | No | No | Yes (tmux, cmux) | Add WezTerm/Zellij |
| Interactive TUI dashboard | No | Yes (agent dashboard) | No | No | No | Yes | Improve |
| Dry-run mode | No | No | No | No | Yes (`--dryRun`) | No (gap) | P1 |
| Confirmation prompts | Yes (delete) | No | No | No | No | Partial | P1 |
| `--json` machine output | No | No | No | No | Yes | Partial | P1 |
| PR checkout | No | Yes (`--pr`) | No | No | No | No (gap) | P2 |
| Parallel task execution | No | No | Yes (parallel deps) | No | Yes | Sequential only | P2 |
| Affected-repo detection | No | No | No | No | Yes | No | Anti-feature |
| Build caching | No | No | No | No | Yes | No | Anti-feature |
| Tool version management | No | No | Yes (primary) | No | Yes (toolchain) | No | Anti-feature |
| Batch workspace generation | No | Yes (`--count`, `--foreach`) | No | No | No | No (gap) | P3 |
| Agent status indicators | No | Yes | No | No | No | No (gap) | P3 |
| Programmatic API | No | No | No | No | No | No (gap) | P2 |
| Shell completion | No | Yes | Yes | No | No | Yes | Done |
| Health check / doctor | Yes | No | No | No | No | Yes | Extend with --fix |

---

## Sources

- **tmuxinator**: https://github.com/tmuxinator/tmuxinator — README (HIGH confidence)
- **workmux**: https://github.com/raine/workmux — README (HIGH confidence, verified March 2026)
- **mise**: https://mise.jdx.dev — official docs, configuration.md, tasks/index.md (HIGH confidence)
- **direnv**: https://github.com/direnv/direnv — README (HIGH confidence)
- **moonrepo/moon**: https://github.com/moonrepo/moon — README + docs (MEDIUM confidence)
- **devenv**: https://github.com/cachix/devenv — README (HIGH confidence)
- **cargo-make**: https://github.com/sagiegurari/cargo-make — README (MEDIUM confidence)
- **just**: https://github.com/casey/just — README (HIGH confidence)
- **nx/turborepo**: Training knowledge + partial doc access (MEDIUM confidence, WebFetch blocked for official sites)
- **git-stacks codebase**: Direct code analysis of `src/commands/`, `src/lib/`, `src/lib/config.ts` (HIGH confidence)
- **PROJECT.md + ARCHITECTURE.md**: First-party project documentation (HIGH confidence)

---
*Feature research for: multi-repo workspace manager CLI (git-stacks)*
*Researched: 2026-03-17*
