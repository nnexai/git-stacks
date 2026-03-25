# Project Research Summary

**Project:** git-stacks v0.10.0 — Multi-Agent Workspace Tooling
**Domain:** CLI workspace manager — agent bootstrap primitives, multi-repo sync, template composition
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

git-stacks v0.10.0 adds five targeted features to an already-working v0.9.1 codebase. The milestone is motivated by a specific use case: AI agents that need to bootstrap into a workspace (discover repo paths, inspect active env vars, pull latest code) without human intervention. The three CLI commands (`paths`, `env`, `pull`) are the direct agent primitives; the TUI staleness indicator and template composition complete the developer workflow around them. Research confirms that all five features are additive — no breaking changes, no schema migrations, no new runtime dependencies.

The recommended build order is CLI commands first (paths → env → pull), then TUI staleness, then template composition. The first three features reuse only existing functions in `git.ts` and `workspace-ops.ts` and have the smallest blast radius (changes confined to `workspace.ts` and thin additions to lib). Template composition is deliberately last because it has the widest blast radius (schema, config, multiple wizard files) and carries the most pitfall surface area. This order ensures agents get working primitives early while the riskier composition feature is developed with full context.

The primary risks are: shell injection in `env --format shell` output (single-quote all values, no exceptions), silent pull failures when worktree branches lack upstream tracking (check and set tracking before every pull), and TUI blocking on network fetches for the staleness indicator (fetch must be background-only with TTL cache). All three risks have known prevention patterns already established in the codebase.

## Key Findings

### Recommended Stack

No new dependencies are required for v0.10.0. All five features are covered by the existing Bun runtime, Commander.js 12.1.0, Zod 3.25.76, SolidJS 1.9.11 + @opentui/core 0.1.87, and Bun's native `$` shell. The `git-stacks env` JSON output uses `JSON.stringify` (built-in), shell quoting uses string replacement (no `dotenv` package needed), and the TUI polling pattern (`setInterval` + `onCleanup`) already exists in `useMessages.ts`. Resisting dependency additions is a deliberate choice: each alternative considered (`simple-git`, `@solid-primitives/timer`, `deepmerge`, `p-limit`) would add a production dependency for functionality the existing stack already provides.

**Core technologies:**
- Bun `$` shell — all git operations; add `pullBranch()` alongside existing `fetchOrigin()`, `rebaseBranch()` patterns
- Commander.js 12.1.0 — new command registrations (`paths`, `pull`, `env`) and variadic `--template <name...>` option
- Zod 3.25.76 — backward-compatible schema extension with `includes: z.array(z.string()).optional()` on `TemplateSchema`
- SolidJS `setInterval` + `onCleanup` — periodic staleness polling; same pattern as existing `useMessages.ts`

### Expected Features

All five features are in scope for v0.10.0. The prioritization matrix distinguishes between agent-facing primitives (P1, must ship) and developer workflow enhancers (P2, complete the story).

**Must have (table stakes):**
- `git-stacks paths [workspace] [--prefix <flag>]` — workspace paths for agent CLI injection; pure read over existing `WorkspaceRepo` data
- `git-stacks env [workspace] [--format shell|dotenv|json]` — merged env var dump; `mise env` is the canonical format reference
- `git-stacks pull [workspace]` — parallel multi-repo pull with dirty-repo guard; `--ff-only` default prevents merge commits

**Should have (competitive differentiators):**
- TUI upstream staleness indicator — "N behind" badge per repo in `WorkspaceDetail`; fetch-on-focus with TTL cache
- Template composition (`includes:` field + `--template a --template b` on `git-stacks new`) — composable workspace recipes; `mergeTemplates()` implemented once and shared by both paths

**Anti-features confirmed out of scope:**
- `pull` with auto-rebase (destroys in-progress state; agents use `git-stacks sync` for intentional rebase)
- `env` dump including `env_file` contents (may contain secrets; `env_file` is a write-target, not a read-input)
- Global staleness poll across all workspaces (N×M concurrent fetches every 2 minutes; TUI unusable on slow connections)
- Template composition deep-merge of nested keys (unpredictable; flat last-wins matches `mise`/`Hatch` conventions)

### Architecture Approach

All five features are additive to existing files — no new top-level modules, no YAML schema migrations, no breaking changes to existing function signatures. The established three-layer split (thin command → workspace-ops business logic → git.ts primitives) is maintained throughout. The only structural judgment call is whether to extend `useWorkspaces.ts` for TUI staleness or extract a separate `useStaleness.ts` hook; extracting is cleaner for separation of concerns.

**Major components and what changes:**
1. `src/commands/workspace.ts` — three new command blocks (`paths`, `pull`, `env`); variadic `--template` option on `new`
2. `src/lib/workspace-ops.ts` — two new functions: `pullWorkspace()` (returns `PullResult`), `getWorkspaceEnv()` (returns `Record<string, string>`)
3. `src/lib/git.ts` — one new function: `pullBranch(path, opts?)` returning `{ ok, error? }`
4. `src/lib/config.ts` — `includes` field on `TemplateSchema`; new pure functions `composeTemplates()` and `resolveIncludes()`
5. `src/tui/dashboard/` — `RepoStatus.behind` type extension; staleness hook; badge rendering in `WorkspaceRow` and `WorkspaceDetail`
6. `src/tui/template-wizard.ts` and `workspace-wizard.ts` — multi-select for `includes:` and multi-template composition

### Critical Pitfalls

1. **Schema field without `.optional()` breaks all existing user template YAML** — add `includes` only as `.optional()`, guard all access with `?.`; test by parsing an old-format fixture through the new schema before writing resolver logic

2. **Shell env format injection via unquoted values** — use `export KEY='${value.replace(/'/g, "'\\''")}'` unconditionally; never use template-string output without quoting; test with a value containing `$`, space, `;`, and backtick

3. **`git pull` fails silently when worktree branch has no upstream tracking** — call `hasUpstreamTracking()` before every pull; use explicit `git pull origin <branch>` when tracking is absent; never use bare `git pull`

4. **TUI blocking on network fetch for staleness** — `fetchOrigin()` is a 30-second worst-case network call; fire it in a background async path only, update via `setBehinds(prev => ...)` after it resolves, enforce a 5-minute TTL to prevent fetch storms on cursor movement

5. **Template composition worktree-wins requires explicit priority check** — naive last-wins spread can silently install trunk mode over worktree; implement `mergeRepoDeclarations()` with explicit mode comparison; test with a trunk/worktree conflict case before shipping

6. **Hook concatenation from composition must be persisted to workspace YAML** — current workspace creation copies hooks from one template only; with composition, merged hook arrays from all included templates must be written to `workspace.hooks` at creation time

## Implications for Roadmap

Based on research, the five features map cleanly to a 6-phase structure. Phases 1-3 are independent of each other and can be built in any order within the grouping, but all should complete before the TUI and composition phases to establish the agent primitive baseline.

### Phase 1: Agent Path Discovery (`git-stacks paths`)

**Rationale:** Zero new lib functions, zero risk. Reads existing `WorkspaceRepo.task_path` / `main_path` and formats output. Unblocks agent CLI injection (`claude $(git-stacks paths myws --prefix --add-dir)`) immediately. Establishes the command pattern that `env` and `pull` will follow.

**Delivers:** `git-stacks paths [workspace] [--prefix <str>] [--format json]` — pipeline-composable path output per repo

**Addresses:** Table-stakes paths feature; `--prefix --add-dir` differentiator for Claude Code integration

**Avoids:** No pitfalls in this phase — pure read-only with no side effects

**Research flag:** No research phase needed — entirely additive over existing data structures.

### Phase 2: Agent Env Inspection (`git-stacks env`)

**Rationale:** The `mergeEnv()` and `buildBaseEnv()` functions already exist; this feature assembles their output into a user-facing command. One gap to fix: extend the merge chain to include `template.env` (currently only `workspace.env` is read). Shell injection quoting must be correct from the first commit.

**Delivers:** `git-stacks env [workspace] [--format shell|dotenv|json]` — safe, eval-able env dump including GS_* workspace vars

**Addresses:** Table-stakes env dump; GS_* vars inclusion differentiator for agent context bootstrap

**Avoids:** Pitfall 2 (shell injection) — single-quote all values before this ships

**Research flag:** No research phase needed — format specifications fully documented against `mise env` reference.

### Phase 3: Multi-Repo Pull (`git-stacks pull`)

**Rationale:** Network I/O and per-repo state management add complexity. Must implement dirty-repo guard, upstream tracking check, and worktree-vs-trunk branch selection correctly. `--ff-only` default prevents merge commits in multi-repo automation. Parallel execution with per-repo result collection matches the existing `syncWorkspace()` philosophy.

**Delivers:** `git-stacks pull [workspace]` — parallel pull across all repos; skips dirty repos with warning; exits non-zero if any repo was skipped

**Addresses:** Table-stakes multi-repo sync feature; P1 agent primitive

**Avoids:** Pitfall 3 (missing upstream tracking) and Pitfall 4 (rebase-based pull leaving REBASE_HEAD state)

**Research flag:** No research phase needed — `--ff-only` is standard; patterns mirror existing `rebaseBranch()` and `syncWorkspace()`.

### Phase 4: TUI Upstream Staleness Indicator

**Rationale:** Self-contained TUI change; independent of CLI commands and template composition. Extending `RepoStatus` with `behind: number | null` is additive. The critical constraint is non-blocking fetch — fire fetch in background, update via signal, never block render.

**Delivers:** "N↓" badge per repo in `WorkspaceDetail`; aggregate badge in `WorkspaceRow`; manual `r` refresh; TTL-gated background fetch per focused workspace

**Addresses:** P2 TUI staleness indicator feature

**Avoids:** Pitfall 5 (blocking TUI render on fetch) — TTL cache and background-only fetch are architectural requirements, not optimizations

**Research flag:** No research phase needed — `getCommitsBehind()` and `fetchOrigin()` already exist; SolidJS polling pattern already used in codebase.

### Phase 5: Template Composition

**Rationale:** Widest blast radius of all five features: schema change, new config functions, wizard updates, multi-template `new` command. Saved for last so it cannot destabilize the agent primitives already shipped in phases 1-3. Schema change must be validated against existing user template YAML before any resolver logic is written. `composeTemplates()` must be pure (no I/O) to be fully unit-testable.

**Delivers:** `includes: [name, ...]` field on `TemplateSchema`; `composeTemplates()` with worktree-wins repo union, hook concatenation, and last-wins env; `resolveIncludes()` with cycle detection; variadic `--template a --template b` on `git-stacks new`; multi-select in TUI template wizard

**Addresses:** P2 template composition `includes:` and ad-hoc multi-template features

**Avoids:** Pitfall 1 (schema breaks existing YAML), Pitfall 6 (wrong repo union mode), Pitfall 7 (hooks not persisted from composition)

**Research flag:** No research phase needed — Zod patterns, Commander.js variadic options, and merge rules all fully specified.

### Phase 6: Release Prep (v0.10.0)

**Rationale:** Every milestone ends with release prep per project conventions.

**Delivers:** v0.10.0 tagged release; docs covering `paths`, `env`, `pull`, staleness badge, and template composition with examples for the agent CLI injection pattern

**Research flag:** No research needed — follows established release-prep pattern.

### Phase Ordering Rationale

- **Phases 1-3 before 4-5:** CLI commands are the stated reason for v0.10.0. Shipping them first delivers the milestone's core value without waiting for TUI or composition work.
- **Phases 1, 2, 3 are fully independent** — they can be developed in parallel if multiple agents are assigned, or sequentially in any order within that group.
- **Phase 4 before 5:** TUI staleness is self-contained; shipping it before template composition avoids blast-radius interference.
- **Phase 5 last:** Template composition touches the most files and carries the most pitfall risk. Building it after phases 1-4 are stable means any composition bugs do not destabilize the agent primitives.

### Research Flags

No phase requires a `research-phase` step during planning. All research is complete and actionable.

Phases with standard patterns (research confirms skip):
- **Phase 1 (paths):** Pure read-and-format over existing data structures; zero risk
- **Phase 2 (env):** Format specs verified against `mise env`; merge chain already exists
- **Phase 3 (pull):** `git pull --ff-only` is standard; patterns mirror `rebaseBranch()` and `syncWorkspace()`
- **Phase 4 (TUI staleness):** All git ops already exist; SolidJS polling pattern already in codebase
- **Phase 5 (template composition):** Zod, Commander.js variadic, and merge rules fully specified

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings verified against live codebase and official docs; zero new dependencies required |
| Features | HIGH | Official docs for `--add-dir` and `mise env` verified; codebase inspection confirms all primitives exist |
| Architecture | HIGH | Primary source is live codebase analysis of all affected files; all integration points confirmed |
| Pitfalls | HIGH | All pitfalls grounded in direct reads of `config.ts`, `git.ts`, `workspace-ops.ts`, and `useWorkspaces.ts` |

**Overall confidence:** HIGH

### Gaps to Address

- **`env` merge chain gap:** `mergeEnv()` currently reads only `workspace.env`, not `template.env`. The `env` command must implement the full merge chain. Decide at implementation time whether to add a new `mergeFullEnv()` function or extend the existing one — check all call sites of `mergeEnv()` before touching it to avoid breaking existing callers.

- **TUI staleness indicator placement:** Research recommends optionally extracting a `useStaleness.ts` hook separate from `useWorkspaces.ts`. This is a design judgment call during implementation — both approaches work; extraction is cleaner for separation of concerns.

- **Template composition `includes:` nesting depth:** Research recommends limiting to 1 level of nesting for v0.10.0 (no includes-of-includes). `resolveIncludes()` supports arbitrary depth if the limit is lifted; document the v0.10.0 constraint and revisit in v1.0 if demanded.

- **`git-stacks paths --prefix` space handling:** Paths with spaces require quoting in shell output. The exact quoting approach is unspecified — handle in implementation with a test case for a path containing a space.

## Sources

### Primary (HIGH confidence)

- Live codebase: `src/lib/git.ts` — `getCommitsBehind()`, `fetchOrigin()`, `hasUpstreamTracking()`, `ensureUpstreamTracking()`, `rebaseBranch()`
- Live codebase: `src/lib/workspace-ops.ts` — `mergeEnv()`, `buildBaseEnv()`, `writeEnvFiles()`, `syncWorkspace()`, `resolveWorkspaceArg()`
- Live codebase: `src/lib/config.ts` — `TemplateSchema`, `WorkspaceRepoSchema`, `WorkspaceSchema`, YAML I/O patterns
- Live codebase: `src/tui/dashboard/hooks/useMessages.ts` — `setInterval` + `onCleanup` polling pattern confirmed in use
- Live codebase: `src/tui/dashboard/types.ts` — `RepoStatus` structure; `behind?: number` extension is additive
- Live codebase: `src/tui/workspace-wizard.ts` — single-template hook copy at creation time; must be updated for composition
- [Commander.js 12 README](https://github.com/tj/commander.js) — variadic `<name...>` option syntax; `collect` function pattern
- [git-scm.com/docs/git-pull](https://git-scm.com/docs/git-pull) — `--ff-only` and `--rebase` flags
- [git-scm.com/docs/git-rev-list](https://git-scm.com/docs/git-rev-list) — `--count HEAD..origin/<branch>` for behind count
- [git-scm.com/docs/git-worktree](https://git-scm.com/docs/git-worktree) — shared fetch behavior across linked worktrees
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) — `--add-dir` flag; space-separated and repeated-flag syntax confirmed
- [mise env command docs](https://mise.jdx.dev/cli/env.html) — canonical reference for env dump format flags (`-D`, `-J`, `--shell`)

### Secondary (MEDIUM confidence)

- [Hatch environment composition issue #2029](https://github.com/pypa/hatch/issues/2029) — merge rules for template inheritance (last-wins for env, concatenate for hooks)
- [SolidJS docs](https://docs.solidjs.com) — `createEffect`/`onCleanup` interval pattern; `@solid-primitives/timer` noted but not needed given existing codebase pattern
- [mywiki.wooledge.org/Quotes](https://mywiki.wooledge.org/Quotes) — shell quoting for eval-safe output

### Tertiary (LOW confidence)

- [Dotenv format quoting edge cases](https://github.com/symfony/symfony/issues/23306) — dotenv double-quote quoting behavior; verify against actual dotenv parsers during implementation

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
