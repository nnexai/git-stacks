# Feature Research — v0.10.0 Multi-Agent Workspace Tooling

**Domain:** CLI workspace manager — agent bootstrap primitives, repo sync, template composition
**Researched:** 2026-03-25
**Confidence:** HIGH (official docs + codebase inspection + verified tooling patterns)

---

## Context

This is a subsequent milestone on an existing codebase (v0.9.1 shipped 2026-03-25). This research
covers ONLY the five new features; existing functionality is assumed stable. Each feature's
dependencies on existing primitives are identified explicitly with file/function references.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users will assume work correctly from day one of the milestone.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `git-stacks paths` — emit repo paths | Any workspace-aware CLI must be queryable; agents cannot discover paths themselves | LOW | Paths already in `WorkspaceRepo.task_path` / `main_path`; pure read + format |
| `paths --prefix` flag | Claude Code `--add-dir` and all similar agent tools require `--add-dir path1 --add-dir path2`; a prefix flag is the standard way to produce this in command substitution | LOW | Official Claude docs confirm: `claude --add-dir ../apps ../lib` (space-sep) or `--add-dir A --add-dir B` (repeated); `--prefix --add-dir` handles both |
| `git-stacks pull` — sync all repos | Multi-repo workspace convention: one command to bring everything current; no reason to visit each repo individually | MEDIUM | Worktrees and trunk repos behave differently; worktrees pull the feature branch, trunk repos pull default branch |
| `git-stacks env` — dump merged env vars | Agent bootstrapping requires knowing what env vars are active; `mise env`, `direnv export` set the convention; workspace env must be inspectable | LOW | `mergeEnv()` already exists in `workspace-ops.ts`; needs GS_* injected vars added plus output formatting |
| `env --format dotenv\|json\|shell` | `mise env` established this as the standard: `-D --dotenv`, `-J --json`, `--shell <shell>`; agents and scripts expect multiple output formats | LOW | dotenv = `KEY=VALUE` per line; json = flat object; shell = `export KEY=VALUE`; matches mise env API shape |
| TUI upstream staleness — "N behind" per repo | Multi-worktree workflows need glanceable staleness; git clients (Tower, VS Code) all show this; absence means TUI is not a useful workspace dashboard | MEDIUM | `getCommitsBehind()` already in `git.ts`; caching required to avoid network call per TUI render |

### Differentiators (Competitive Advantage)

Features specific to the multi-agent use case that generic workspace tools do not provide.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `paths --prefix` for agent CLI injection | Zero-friction path from workspace definition to agent invocation: `claude $(git-stacks paths myws --prefix --add-dir)`; no other workspace manager produces this output shape | LOW | Pure output formatting; high agent UX value for minimal implementation cost |
| Template composition (`includes:`) | Composable workspace recipes are rare in CLI tools; "java-base + api-team + my-extras" meta-template is a genuine power feature for managing many agent workspaces | HIGH | Merge rules are the complexity: repos union (worktree wins on conflict), hooks concatenate, env last-wins |
| Ad-hoc `--template a --template b` on `new` | One-shot composition without defining a named meta-template; useful for agents creating transient workspaces | MEDIUM | Commander.js variadic option; same merge logic as `includes:` so no second implementation needed |
| GS_* vars in `env` dump | Other env dump tools show only user-defined vars; including `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH` makes the output a complete agent context bootstrap document | LOW | `buildBaseEnv()` already constructs these in `workspace-ops.ts`; just include them in the dump |
| TUI staleness with fetch-on-focus + TTL | Fetch when user focuses a workspace, cache for 5 min, manual refresh via `r`; avoids the VS Code "periodically run git fetch?" prompt anti-pattern | MEDIUM | In-memory TTL cache per main_path; re-fetch on workspace focus or manual refresh; show "fetched 3m ago" in footer |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| `pull` with auto-rebase | Users want "pull and rebase" in one step | Rebase on a feature branch mid-work destroys in-progress state; conflicts need human resolution; not safe for headless agent use | `pull --ff-only` (abort on divergence); agent calls `git-stacks sync` for intentional rebase |
| `pull` force-pulling dirty repos | Seems convenient — just overwrite local changes | Destroys uncommitted work silently; agents may have active in-progress edits | Report dirty repos, skip them, exit non-zero; let the agent decide |
| `env` dump including `env_file` contents | Users want one command to see all env vars | `env_file` contents may contain secrets not suitable for stdout piping in CI/CD or log capture | Dump only in-memory `workspace.env` + injected GS_* vars; document this scope boundary explicitly |
| Template composition deep-merge (nested keys) | Seems like natural extension of env merging | Nested YAML merging is unpredictable: which level wins? What if types differ? | Flat `env` merge (last-wins on top-level keys); document clearly; matches what mise/Hatch do |
| TUI auto-fetch on every list render | Users want staleness always current | Network fetch in a render loop causes jank, timeouts, error noise; TUI becomes unusable on slow connections | TTL-cached fetch on focus + manual `r` refresh; show stale-data age in footer |
| `paths` deduplication across workspaces | See all paths from all workspaces | Breaks workspace isolation; agents would access wrong feature branches | `paths` strictly scoped to one named workspace; cross-workspace queries are caller's responsibility |

---

## Feature Dependencies

```
[git-stacks paths]
    └──reads──> WorkspaceRepo.task_path / main_path (already exists in WorkspaceSchema)
    └──reuses──> resolveWorkspaceArg() (CWD auto-detection, already in workspace-ops.ts)
    └──enhances──> claude --add-dir (agent CLI injection)

[git-stacks env]
    └──reuses──> mergeEnv() (workspace-ops.ts — reads workspace.env)
    └──reuses──> buildBaseEnv() (workspace-ops.ts — produces GS_* vars)
    └──extends──> mergeEnv() to also include template.env (current gap: only workspace.env is read)
    └──reuses──> resolveWorkspaceArg() (CWD auto-detection)

[git-stacks pull]
    └──reuses──> fetchOrigin() (git.ts — fetches per main_path)
    └──reuses──> isRepoDirty() (git.ts — dirty guard)
    └──reuses──> getCurrentBranch() (git.ts — confirm worktree is on expected branch)
    └──reads──> WorkspaceRepo.mode (worktree vs trunk branch selection)
    └──reads──> WorkspaceRepo.main_path (fetch target per repo clone)
    └──reuses──> resolveWorkspaceArg() (CWD auto-detection)

[TUI staleness indicator]
    └──reuses──> getCommitsBehind() (git.ts — rev-list --count)
    └──reuses──> fetchOrigin() (git.ts — update remote refs before count)
    └──extends──> WorkspaceListInfo or detail pane per-repo data model
    └──requires──> in-memory TTL cache (new, Map<mainPath, {fetchedAt, repoResults}>)
    └──wires into──> TUI dashboard WorkspaceDetail per-repo rows

[Template composition `includes:`]
    └──extends──> TemplateSchema (new `includes: string[]` optional field — backward-compatible)
    └──requires──> mergeTemplates(templates: Template[]) => Template (new function)
    └──enhances──> git-stacks new --template variadic (Commander.js option change)
    └──enhances──> workspace creation wizard (TUI multi-select for templates)

[git-stacks new --template a --template b (ad-hoc)]
    └──requires──> mergeTemplates() (same as includes: — single implementation)
    └──modifies──> git-stacks new command (variadic --template option)
```

### Dependency Notes

- **`paths` is fully independent** — no new primitives needed; pure read + format over existing WorkspaceRepo data.
- **`env` has one gap to fix**: `mergeEnv()` currently reads only `workspace.env`, not `template.env`. The `env` command should implement the full merge chain (global config vars → template.env → workspace.env → GS_*).
- **`pull` needs dirty-check guard before touching any repo** — `isRepoDirty()` already exists; the gate is mandatory or agents lose in-progress work.
- **Template composition shares merge logic with `--template a --template b`** — implement once as `mergeTemplates(templates: Template[]): Template`; both `includes:` and ad-hoc call it.
- **TUI staleness needs a per-main_path fetch cache** — without TTL, the TUI issues a `git fetch` on every detail pane focus; this causes visible lag and potential rate-limiting on hosted git.
- **`paths`, `env`, `pull` are the fastest wins** — all three reuse existing primitives with minimal new logic; template composition is the highest-effort feature.

---

## MVP Definition

All five features are in scope for v0.10.0. Build order should follow dependency complexity:

### Build First (no new dependencies, foundational)

- [ ] `git-stacks paths [workspace] [--prefix <str>]` — reads WorkspaceRepo data, emits formatted output; unblocks agent CLI injection immediately; estimated LOW effort
- [ ] `git-stacks env [workspace] [--format shell|dotenv|json]` — reads `mergeEnv()` + `buildBaseEnv()`, adds template.env to merge chain, formats output; estimated LOW effort

### Build Second (network I/O, dirty-check protocol)

- [ ] `git-stacks pull [workspace]` — fetch per main_path, `git pull --ff-only` per repo; skip dirty repos with warning; parallel execution; estimated MEDIUM effort
- [ ] TUI staleness indicator — `getCommitsBehind()` per repo on focus, TTL cache per main_path, `N↓` badge in detail pane; estimated MEDIUM effort

### Build Third (schema change, highest surface area)

- [ ] Template composition — `includes:` field on TemplateSchema + `mergeTemplates()` + `--template` variadic on `git-stacks new` + TUI multi-template wizard; estimated HIGH effort

### Release Prep

- [ ] Version bump v0.10.0, CHANGELOG, README — documents all five new features with usage examples

---

## Feature Prioritization Matrix

| Feature | Agent Value | Implementation Cost | Priority |
|---------|-------------|---------------------|----------|
| `paths` + `--prefix` flag | HIGH | LOW | P1 |
| `env` + format flags | HIGH | LOW | P1 |
| `pull` command | HIGH | MEDIUM | P1 |
| TUI staleness badge | MEDIUM | MEDIUM | P2 |
| Template composition `includes:` | MEDIUM | HIGH | P2 |
| `--template a --template b` ad-hoc | MEDIUM | LOW (once merge logic exists) | P2 |

**Priority key:**
- P1: Must have — these are the direct agent bootstrap primitives; v0.10.0 loses its core value without them
- P2: Should have — composition and staleness complete the agent workflow story
- P3: Nice to have, future consideration (nothing deferred — all in scope for this milestone)

---

## Competitor Feature Analysis

| Feature | mise | direnv | GitKraken Workspaces | git-stacks approach |
|---------|------|--------|----------------------|---------------------|
| Env dump formats | `--dotenv`, `--json`, `--json-extended`, `--shell <shell>` | `direnv export bash/zsh` | N/A | `--format shell\|dotenv\|json` (shell = `export KEY=VALUE`) |
| Path output | N/A | N/A | "Open all in IDE" (GUI button) | `--prefix` flag for CLI-injectable arg string |
| Multi-repo pull | N/A | N/A | "Pull all" button (GUI) | `git-stacks pull` per workspace; parallel; dirty-skip |
| Staleness indicator | N/A | N/A | "N commits behind" (GUI) | TUI `N↓` badge per repo; fetch-on-focus + TTL cache |
| Template composition | `[env]` inheritance via `extends` | N/A | N/A | `includes:` field + ad-hoc `--template` variadic |

### Key observations

**`mise env` is the canonical reference for env dump format** (HIGH confidence — official docs verified). Its flag set (`-D`, `-J`, `-s <shell>`) is the established pattern. `git-stacks env --format` is a simpler single-flag variant appropriate for a narrower use case.

**Claude Code `--add-dir` takes space-separated paths OR repeated flags** (HIGH confidence — official docs verified at code.claude.com). Example from docs: `claude --add-dir ../apps ../lib`. The `--prefix --add-dir` approach on `git-stacks paths` lets users do: `claude $(git-stacks paths myws --prefix --add-dir)` → produces `--add-dir /path/a --add-dir /path/b` which matches the repeated-flag form.

**Git worktrees share a single git object store and fetch** (HIGH confidence — official git docs). Fetching in any linked worktree updates remote-tracking refs for all linked worktrees of the same repo. `git-stacks pull` should fetch once per `main_path`, then `git pull --ff-only` in each worktree individually.

**Template composition merge rules** are consistent across tools (Hatch, mise) (MEDIUM confidence — Hatch issue #2029): dependencies/hooks = concatenate (order matters); env/settings = last-wins per key. The `includes:` declaration order determines precedence.

---

## Edge Cases and Implementation Notes

### `git-stacks paths`

- **Trunk repos**: emit `main_path` (the main clone directory; trunk repos have `task_path === main_path` but use `main_path` as the canonical field)
- **Missing task_path** (worktree not yet materialized): skip with a warning to stderr; default behavior should not hard-fail
- **No workspace arg**: use `resolveWorkspaceArg()` (CWD auto-detection — already implemented, shared with other commands)
- **Output without `--prefix`**: one path per line; suitable for scripts that iterate paths
- **Output with `--prefix <str>`**: `<str> <path>` per line; with `--prefix --add-dir`, output is `--add-dir /path/a\n--add-dir /path/b` which shell expands correctly in `$(...)` substitution
- **`--json` flag (future)**: emit `[{ name, path, mode }]`; not required for v0.10.0 but leave room in design

### `git-stacks pull`

- **Dirty repo guard**: `isRepoDirty()` before any pull; if dirty, print warning to stderr, skip that repo, continue others; exit non-zero if any repo was skipped (signals to agents that pull was incomplete)
- **Worktree repos**: `git -C task_path pull --ff-only` — pulls the workspace feature branch
- **Trunk repos**: `git -C main_path pull --ff-only` on `default_branch` (from registry entry)
- **No upstream tracking**: if no tracking branch configured, skip with warning "no upstream configured for <repo>"
- **Fetch before pull**: `fetchOrigin()` once per unique `main_path` (shared across all worktrees of same repo); avoids redundant network calls when a workspace has multiple worktrees of the same repo
- **Parallel execution**: pull across repos in parallel using existing `--parallel` pattern from `workspace-ops.ts`; report per-repo status as each completes
- **`--ff-only` rationale**: never rebase automatically; fail fast on divergence so agent can decide next step explicitly
- **Exit codes**: 0 = all repos updated; 1 = one or more repos skipped (dirty or no upstream); messages on stderr

### `git-stacks env`

- **Merge chain** (left-to-right, later wins): global config env → template env (if `workspace.template` is set, read the template YAML and merge its `env`) → workspace `env` field → GS_* injected vars
- **Current gap in `mergeEnv()`**: it only reads `workspace.env`, not template.env; the `env` command needs to implement the full chain; consider whether to update `mergeEnv()` itself or add a new function `mergeFullEnv()` to avoid breaking existing callers
- **GS_* vars to include**: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH` (from `buildBaseEnv()`); do NOT include per-repo vars (`GS_REPO_NAME`, `GS_REPO_PATH`) in the workspace-level dump since they are per-repo
- **`env_file` exclusion**: do NOT read `env_file` file contents; `env_file` is a write-target at `open` time, not an input for `env dump`; document this scope boundary
- **Shell format**: `export KEY=VALUE` with values single-quoted and internal single-quotes escaped; suitable for `eval "$(git-stacks env myws --format shell)"`
- **Dotenv format**: `KEY=VALUE` per line; values quoted only if they contain spaces or special chars; follows standard dotenv conventions
- **JSON format**: `{ "KEY": "VALUE" }` flat object; no nesting; suitable for `jq` piping

### TUI Staleness Indicator

- **Fetch cadence**: trigger `fetchOrigin()` the first time user focuses a workspace in the list or detail pane; cache result in-memory with a 5-minute TTL per `main_path`
- **Cache structure**: `Map<mainPath, { fetchedAt: number; repoBehind: Map<repoName, number> }>` — keyed by main_path (one fetch serves all worktrees of same repo)
- **Where to store cache**: in dashboard reactive state (a SolidJS signal or store); not persisted to disk; resets on TUI restart
- **Display location**: per-repo rows in the workspace detail pane; show `N↓` badge (down arrow = behind upstream); if 0 or fetch not yet run, show nothing; if fetch failed, show `?`
- **Worktree repos**: compare `task_path` HEAD to `origin/<workspace-branch>`; upstream tracking must be set (use `hasUpstreamTracking()` guard)
- **Trunk repos**: compare `main_path` HEAD to `origin/<default_branch>`
- **No upstream tracking**: show `—` (dash) or omit; do not fetch or count; log "no upstream" in the tooltip or footer
- **Network failure**: mark all repos for that main_path as `fetchFailed = true`; show `?` badge; do not crash TUI; show error in footer
- **Manual refresh**: `r` key in detail pane triggers immediate re-fetch (bypasses TTL); consistent with existing workspace sync keyboard shortcut
- **Footer annotation**: "fetched 3m ago" in detail pane footer alongside repo-level badges; gives users confidence in data freshness

### Template Composition

- **Schema change**: add `includes: z.array(z.string()).optional()` to `TemplateSchema`; backward-compatible (existing templates without `includes` parse correctly)
- **Merge rules** (verified against Hatch and mise patterns):
  - `repos`: union by `repo` name; if both define the same `repo` name, `worktree` mode wins over `trunk`; other fields from last-seen definition win
  - `hooks`: concatenate in declaration order (base template hooks first, then included templates left-to-right, then meta-template's own hooks)
  - `env`: last-wins per key; later template in `includes:` list wins; meta-template's own `env` wins over all
  - `integrations`: same override cascade pattern as workspace/template integration overrides (already established in codebase)
  - `files`: union; file ops are idempotent so duplicates are harmless
- **Cycle detection**: detect circular `includes:` chains before resolution; fail with a clear error message listing the cycle; do not recurse infinitely
- **Depth limit for v0.10.0**: limit to 1 level of `includes:` nesting (no includes-of-includes); document this constraint; revisit in v1.0 if demanded
- **Ad-hoc `--template a --template b`**: same `mergeTemplates()` function; templates applied left-to-right (last wins on env conflicts); if a named template also has `includes:`, those are resolved first, then ad-hoc ordering applies on top
- **TUI wizard update**: workspace creation wizard template select becomes multi-select; display selected templates in order; order matters for merge

---

## Sources

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) — official `--add-dir` flag documentation; confirmed space-separated and repeated-flag syntax; HIGH confidence
- [mise env command docs](https://mise.jdx.dev/cli/env.html) — canonical reference for env dump format flags (`-D`, `-J`, `--shell`); HIGH confidence
- [Git worktree documentation](https://git-scm.com/docs/git-worktree) — shared fetch behavior across linked worktrees; HIGH confidence
- [Hatch environment composition issue #2029](https://github.com/pypa/hatch/issues/2029) — established merge rules for template inheritance (last-wins for env, concatenate for hooks); MEDIUM confidence
- Codebase inspection: `src/lib/git.ts` `getCommitsBehind()`, `fetchOrigin()`, `ensureUpstreamTracking()`, `hasUpstreamTracking()` — confirmed existing primitives available for reuse; HIGH confidence
- Codebase inspection: `src/lib/workspace-ops.ts` `mergeEnv()`, `buildBaseEnv()`, `writeEnvFiles()`, `resolveWorkspaceArg()` — confirmed existing env merge and CWD auto-detection primitives; HIGH confidence
- Codebase inspection: `src/lib/config.ts` `TemplateSchema`, `WorkspaceRepoSchema`, `WorkspaceSchema` — confirmed schema shapes and extension points for `includes:` addition; HIGH confidence

---

*Feature research for: git-stacks v0.10.0 Multi-Agent Workspace Tooling*
*Researched: 2026-03-25*
