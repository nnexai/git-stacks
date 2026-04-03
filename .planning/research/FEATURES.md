# Feature Research — v0.14.0 Workflow Completion & Workspace UX

**Domain:** CLI workspace manager — workflow completion, status visibility, organization, secrets
**Researched:** 2026-04-03
**Confidence:** HIGH (project codebase + official git docs + tool ecosystem research)

---

## Context

This is a **subsequent milestone** research document. v0.13.0 shipped shell completion fixes,
`git-stacks env`, Copilot hook support, and forge/doctor polish. This research covers ONLY the
five new features for v0.14.0.

**Existing foundation (do not re-research):**
- Workspace lifecycle: new/clone/open/close/clean/remove/merge/rename/sync/pull/run/cd/status/list
- `syncWorkspace` / `mergeWorkspace` — both do dirty-repo checks and rebase-from-base
- `pullFFOnly` / `getCommitsBehind` — already in `src/lib/git.ts`
- `mergeEnv()` / `writeEnvFiles()` — env injection pipeline wired through `openWorkspace`
- Forge integrations: GitHub/GitLab/Gitea PR creation via `git-stacks integration github pr create`
- TUI dashboard: WorkspaceList, WorkspaceDetail, WorkspaceRow, ProgressView, ActionMenu
- `isRepoDirty()` in `git.ts` used by sync/merge dirty checks

**Feature set researched:**
1. `git-stacks push` — push workspace branches to remote
2. Ahead/Behind Tracking — per-repo commit distance from base
3. Secrets / Env Var References — pluggable secret resolution for env values
4. Labels / Grouping — label-based filtering and organization
5. `--stash` on Sync — auto-stash dirty worktrees before sync

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist for a workspace manager at this maturity level. Missing them makes
the product feel incomplete for real team/production use.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `git push` for all workspace repos | Every other workspace operation (`sync`, `pull`) has a multi-repo parallel command; push is the obvious missing link in the workflow. Users expect "one command sends all my branches to remote." | MEDIUM | Parallel `Promise.all` across worktree repos; trunk repos silently skipped; per-repo progress rows like `syncWorkspace`. Pattern already established by `pushWorkspace`. |
| `--force-with-lease` as the safe default force push | `git push --force` is universally taught as dangerous; `--force-with-lease` is the standard safe alternative that checks lease before overwriting. Any tool surfacing force-push must offer `--force-with-lease` first. | LOW | `--force-with-lease` checks local tracking ref state; fails if remote advanced since last fetch — exact behavior users expect from a "safe force push." Offer `--force` as an escape hatch only. |
| Ahead/behind count in workspace status | Multi-repo tools (`multi-git-status`, GitHub UI, `git status` on a tracked branch) all surface ahead/behind counts. For a workspace manager, it's the most actionable status metric: "3 commits ahead = ready to push; 14 behind = sync needed urgently." | MEDIUM | `git rev-list --count base..head` (ahead) and `head..base` (behind). Both can run in parallel per repo. `getCommitsBehind` already exists; `getCommitsAhead` is its mirror. |
| Ahead/behind visible in `list` output | Users running `git-stacks list` want to see which workspaces have unpushed commits at a glance, without running `status` on each. | LOW | New columns AHEAD/BEHIND in list table. Per-workspace aggregate: sum ahead across repos, max behind. Display as numbers; zero values dim or omitted. |
| Ahead/behind visible in TUI WorkspaceRow | The TUI dashboard is the primary interface for users with many workspaces. The `↑N ↓N` pattern (used by popular TUI tools like lazygit, gitui) is the recognized compact format. | LOW | Render `↑3 ↓0` inline with branch name in WorkspaceRow. Dim when zero. Space-constrained: truncate to fit terminal width. |
| Secret references survive without plaintext exposure | Any serious team config tool (GitHub Actions, Doppler, 1Password op CLI) stores secret references, not values. A YAML config with plaintext API keys is a security anti-pattern users actively avoid now in 2025+. | HIGH | `${{ op://... }}`, `${{ doppler:... }}`, `${{ env:... }}` reference syntax. Resolved at runtime only; raw references written back to YAML, never resolved values. |
| Resolved secrets injected before hooks and env files | The existing `mergeEnv()` + `writeEnvFiles()` pipeline already handles injection; secret resolution is a preprocessing step that fits cleanly before those calls. Users expect their secrets to be available to hooks just like any other env var. | MEDIUM | `resolveSecrets(rawEnv, resolvers)` runs after `mergeEnv()` and before `writeEnvFiles()` in `openWorkspace`. Failure modes: resolver not found or resolver error → `ok: false` with actionable message. |

### Differentiators (Competitive Advantage)

Features that set git-stacks apart. Not universally expected, but highly valued for the target
audience (multi-repo, multi-feature, single-developer or AI agent workflows).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Push + forge PR suggestion as a workflow unit | After push, surfacing `git-stacks integration github pr create <name>` as the next step completes the "commit → push → PR" loop without leaving git-stacks. No other multi-repo workspace manager closes this loop. | LOW | Post-push output: check if a forge is configured; if yes, print the PR create command as a hint. No automation required — the suggestion is enough to make the workflow obvious. |
| `--dry-run` on push | Dry-run is rare in push commands for most tools but extremely useful when pushing 5+ repos. Users can verify which repos/branches would be touched without side effects. | LOW | Print what would be pushed without executing. Consistent with `--dry-run` on `sync`. |
| Staleness flag on ahead/behind (`aheadBehindStale`) | `origin/<branch>` only reflects the last fetch. Showing stale counts without warning is misleading. Surfacing a staleness flag (based on `FETCH_HEAD` mtime vs 15-minute threshold) is an honest UX that competing tools omit. | LOW | Check mtime of `.git/FETCH_HEAD`; set `aheadBehindStale: true` if older than 15 minutes. Display subtle indicator in TUI. No network call during `list`. |
| Pluggable secret resolvers with clear error messages | 1Password `op`, Doppler, `pass`, shell env, and arbitrary `cmd` are the 5 most common secret sources in developer workflows. Supporting all 5 with structured failure messages ("Install 1Password CLI to use `op://` references") is meaningfully better than "failed to resolve." | MEDIUM | `SecretResolver` interface with `id`, `canResolve()`, `resolve()`. Each resolver checks for tool availability first and returns a human-readable installation hint on missing binary. |
| `${{ resolver:path }}` reference syntax | Borrowed from GitHub Actions — the most-recognized expression syntax for secret references in config files. Familiar to most developers; unambiguous in YAML strings; easy to grep for. | LOW | Regex: `/^\$\{\{\s*(\w+):(.+?)\s*\}\}$/`. Plain values (no `${{`) pass through unchanged — zero friction for non-secret env values. |
| `--skip-secrets` escape hatch on open | In CI or environments without the secret store tool available, `--skip-secrets` allows the workspace to open with empty strings for unresolvable secrets. Essential for agent workflows where the secret store may not be accessible. | LOW | Log warnings per unresolvable reference, substitute empty string. Allows `openWorkspace` to succeed with degraded env — better than hard-failing in CI. |
| Labels as first-class metadata with namespacing | `sprint:14`, `client:acme`, `type:bugfix` — namespaced labels let users impose structure without rigid folders. Terraform Cloud uses this exact pattern for workspace organization; it scales from 10 to 10,000 workspaces. | MEDIUM | Label regex: `[A-Za-z0-9._:-]+`. Colon as namespace separator. Labels on templates union onto workspaces at creation time (not inherited dynamically). |
| Group-by-label view in TUI (`g` toggle) | Flat list becomes noise above ~10 workspaces. Grouping by label, with unlabeled workspaces at the bottom, matches the mental model of "show me all my sprint-14 work." No other worktree manager has this. | MEDIUM | Toggle state ephemeral (not persisted). Workspace appears in each group it belongs to. `[unlabeled]` group at bottom. |
| `--stash` on sync for mid-task rebases | `git rebase --autostash` has been in git since 2.6 (2014) and `rebase.autoStash` is a widely recommended config. Exposing it as `--stash` on `git-stacks sync` mirrors user muscle memory while adding the multi-repo coordination layer (stash all repos, sync all, pop all). | HIGH | Three-phase: stash dirty repos → sync → pop in reverse. Conflict on pop: leave stash in place, print actionable message with exact `git stash pop` command. Never block remaining pops on one conflict. |
| `git-stacks label` CRUD subcommand | Labeling from a script or agent (`git-stacks label add my-workspace sprint:14`) is more composable than opening an editor. Enables agents to self-organize their workspaces without TUI access. | LOW | `label add/remove/list/clear <workspace> [labels...]` — pure YAML write operations. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-push after sync | "Sync and push in one step" | Sync does a rebase that can conflict; auto-push after a conflicted sync would push a broken state. Users need to verify the post-sync state before pushing. | Keep push as a separate explicit command. Suggest `git-stacks push` in sync output as the next step. |
| `--force` as default for push | "My branches are rebased, force-push is normal" | Blindly force-pushing across 5 repos with a single command is too destructive a default; one wrong repo name or stale tracking ref destroys remote history. | Default to no-force. Require `--force-with-lease` or `--force` explicitly. |
| Persistent group-by-label state in TUI | "Remember my grouping preference" | Persisting UI state to YAML (the only storage layer) creates noisy diffs and sync conflicts in any config-tracking setup. Ephemeral UI state is the right scope for a display toggle. | Keep `g` toggle ephemeral per session. If user always wants grouped, they can set a filter. |
| Secret caching to disk | "Re-resolving secrets on every open is slow" | Caching resolved secret values to disk defeats the entire point of using a secret manager — the risk surface is a local cache file containing plaintext credentials. | Accept the latency. `op read` and `doppler secrets get` are sub-second for warm CLI sessions. If performance is critical, users can inject via shell env (`${{ env:MY_TOKEN }}`) which is instant. |
| Auto-creating labels from free-form text | "Just add any string as a label" | Without format validation, labels accumulate typos (`sprint-14` vs `sprint:14` vs `Sprint14`), breaking filtering. | Enforce the regex `[A-Za-z0-9._:-]+` at write time. Reject invalid labels with a clear error. |
| Global stash enable via config | "`sync` should always stash" | `rebase.autoStash` in git config is widely known but also widely regretted — it silently hides dirty state and pop conflicts appear at unexpected times. At the workspace-manager level, the risk compounds across multiple repos. | Require explicit `--stash` per invocation. Keeps the dirty-repo check as the default conservative path. |
| Stash with `--dry-run` | Logically requested but nonsensical | A dry-run does not actually do the sync, so there is nothing to stash or pop. The combination is undefined behavior. | `--stash` is incompatible with `--dry-run`; reject with a clear error message. |
| Resolving secrets from forge-specific stores (GitHub Secrets, GitLab CI vars) | "My secrets are in GitHub Actions Secrets" | GitHub/GitLab secrets are not accessible outside CI pipelines — there is no API to read them into a local CLI session. Attempting to support them would create an unreliable resolver that always fails outside CI. | Use `env` resolver (`${{ env:MY_TOKEN }}`) and inject via the forge CLI or shell profile outside git-stacks. |

---

## Feature Dependencies

```
[git-stacks push]
    └──requires (existing)──> [pushBranch() in git.ts — new git primitive]
    └──requires (existing)──> [workspace repo list with mode detection — already in workspace-ops.ts]
    └──enhances──> [forge integration PR creation — suggests next step after push]
    └──mirrors pattern of──> [syncWorkspace parallel Promise.all]

[Ahead/Behind Tracking]
    └──requires (new)──> [getCommitsAhead() in git.ts]
    └──reuses (existing)──> [getCommitsBehind() already in git.ts]
    └──extends──> [WorkspaceListInfo type — adds ahead/behind/aheadBehindStale fields]
    └──requires (existing)──> [FETCH_HEAD mtime check — filesystem stat, no git calls]
    └──enhances──> [git-stacks push — ahead count tells user what will be pushed]

[Secrets / Env Var References]
    └──requires (new)──> [src/lib/secrets.ts — SecretResolver interface + built-in resolvers]
    └──hooks into (existing)──> [mergeEnv() in workspace-ops.ts — runs after mergeEnv]
    └──hooks into (existing)──> [writeEnvFiles() — receives resolved env, not raw references]
    └──extends──> [GlobalConfigSchema — adds secrets.resolvers array]
    └──independent of──> [ahead/behind, push, labels, stash]

[Labels / Grouping]
    └──extends (schema)──> [WorkspaceSchema + TemplateSchema — adds optional labels field]
    └──extends (CLI)──> [git-stacks list --label filter]
    └──extends (CLI)──> [git-stacks new --label flag]
    └──extends (TUI)──> [WorkspaceRow — tag rendering]
    └──extends (TUI)──> [WorkspaceList — group-by toggle + filter extension]
    └──adds (CLI)──> [git-stacks label add/remove/list/clear subcommand]
    └──independent of──> [push, ahead/behind, secrets, stash]

[--stash on Sync]
    └──requires (new)──> [stashPush() / stashPop() in git.ts]
    └──hooks into (existing)──> [syncWorkspace dirty-repo check — replaces/precedes check]
    └──optionally extends──> [mergeWorkspace — same dirty-check location]
    └──conflicts with──> [--dry-run flag on sync — incompatible, reject explicitly]
    └──independent of──> [push, ahead/behind, secrets, labels]
```

### Dependency Notes

- **Ahead/behind requires no schema changes** — `WorkspaceListInfo` is a runtime type, not a YAML schema. Zero migration risk.
- **Push depends only on `git.ts` primitives** — no schema changes, no TUI state changes beyond adding "push" to the Action union. Lowest-risk feature to ship first.
- **Secrets is the most architecturally isolated** — entirely new subsystem (`src/lib/secrets.ts`) with one hook point into `openWorkspace`. Does not affect any other feature.
- **Labels are schema-additive** — `labels` field is optional in both `WorkspaceSchema` and `TemplateSchema`; existing YAML files remain valid without any migration.
- **Stash integrates at the same location as the dirty check** — `syncWorkspace` already checks `isRepoDirty`; `--stash` replaces the hard stop with a stash-then-proceed flow.
- **Push + ahead/behind are complementary** — ship them together: ahead count tells the user what push will send; push gives them the action to take.

---

## MVP Definition

### Must Ship (v0.14.0 core)

- [ ] `git-stacks push` command with `--force-with-lease`, `--force`, `--dry-run` — completes core workflow
- [ ] `pushWorkspace()` in `workspace-ops.ts` — parallel push across worktree repos
- [ ] `pushBranch()` in `git.ts` — structured error parsing (non-fast-forward, auth failure, no upstream)
- [ ] `getCommitsAhead()` in `git.ts` — mirror of existing `getCommitsBehind()`
- [ ] Ahead/behind in `WorkspaceListInfo` — aggregate counts for list command
- [ ] Ahead/behind in `git-stacks list` output — AHEAD/BEHIND columns
- [ ] `↑N ↓N` indicators in TUI WorkspaceRow — compact display
- [ ] `aheadBehindStale` flag based on FETCH_HEAD mtime — honest staleness reporting
- [ ] `src/lib/secrets.ts` — `SecretResolver` interface + 5 built-in resolvers (`op`, `doppler`, `pass`, `env`, `cmd`)
- [ ] `resolveSecrets()` hooked into `openWorkspace` after `mergeEnv()` — runtime injection, no YAML write-back
- [ ] `GlobalConfigSchema` extension: `secrets.resolvers` array
- [ ] `labels` field on `WorkspaceSchema` and `TemplateSchema` (optional, with regex validation)
- [ ] `git-stacks list --label` filter flag
- [ ] `git-stacks new --label` flag + wizard prompt
- [ ] `git-stacks label add/remove/list/clear` subcommand

### Add After Validation (v0.14.x)

- [ ] `--stash` on `git-stacks sync` — implement after push+secrets are stable; stash failure modes are the riskiest part
- [ ] `--stash` on `git-stacks merge` — follow-on once sync stash is validated
- [ ] Per-repo ahead/behind in `git-stacks status <name>` per-repo table
- [ ] Push action in TUI dashboard ActionMenu (ProgressView pattern from sync)
- [ ] Group-by-label toggle (`g`) in TUI WorkspaceList

### Future Consideration (v0.15+)

- [ ] `--stash` in `mergeWorkspace` if demand signals emerge
- [ ] Secret resolver for Bitwarden CLI (`bw get password`) — if community requests
- [ ] Label autocomplete in shell completions (requires reading workspace YAMLs at completion time)
- [ ] Saved TUI filter state (needs a persistent UI config layer first)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `git-stacks push` | HIGH | MEDIUM | P1 — missing link in core workflow |
| `--force-with-lease` on push | HIGH | LOW | P1 — table stakes safety guard |
| `--dry-run` on push | MEDIUM | LOW | P1 — pairs naturally with push implementation |
| Ahead count in `list` | HIGH | LOW | P1 — complements existing `behind` tracking |
| `↑N ↓N` in TUI WorkspaceRow | HIGH | LOW | P1 — primary display surface for most users |
| `aheadBehindStale` flag | MEDIUM | LOW | P1 — prevents misleading stale counts |
| Secret references (`${{ ... }}`) | HIGH | HIGH | P1 — blocks real team/production use without it |
| `--skip-secrets` escape hatch | MEDIUM | LOW | P1 — required for CI/agent use cases |
| Labels schema + `list --label` filter | HIGH | LOW | P1 — scales to >10 workspaces |
| `git-stacks label` subcommand | MEDIUM | LOW | P1 — scripting/agent composability |
| Label tags in TUI WorkspaceRow | MEDIUM | LOW | P2 — polish; list filter ships first |
| Group-by-label TUI toggle | MEDIUM | MEDIUM | P2 — TUI complexity; list filter is the MVP |
| `--stash` on sync | MEDIUM | HIGH | P2 — failure modes need careful handling |
| Push action in TUI ActionMenu | MEDIUM | MEDIUM | P2 — add after CLI push is stable |
| Per-repo ahead/behind in `status` | MEDIUM | LOW | P2 — add alongside WorkspaceDetail extension |

**Priority key:**
- P1: Must have for v0.14.0
- P2: Valuable, add after P1 is stable
- P3: Future milestone

---

## Tool/Pattern Analysis

### Push in Similar Tools

- **multi-git-status** shows "needs push" as a status flag — no push command, just detection. Confirms that
  push visibility (ahead count) is table stakes even if the push command itself is not.
- **Worktrunk** (AI agent workflow tool) has a push command as one of its three core commands — confirms push
  is an expected primitive in any worktree manager.
- git's own push UX: `--force-with-lease` is the recommended safe default since git 2.30. Tooling that
  exposes force-push should default to `--force-with-lease`, not `--force`.

### Ahead/Behind in Similar Tools

- **multi-git-status** (`github.com/fboender/multi-git-status`) — shows "needs push (BRANCH)" and "needs pull (BRANCH)"
  as status indicators. Column-based display with per-repo rows. Confirms the standard pattern.
- **RepoStatus** (macOS multi-repo tool) — organizes repos into named groups and shows colored ahead/behind counts.
  Confirms that grouping + commit distance is the expected multi-repo status display.
- git's own `git status` shows "Your branch is 3 commits ahead of 'origin/main'." — users are conditioned
  to expect this information; surfacing it in workspace context is natural extension.

### Staleness / Fetch Behavior

- Standard pattern: compute ahead/behind from local refs (no network during list/status), offer `--fetch` to
  trigger a network fetch before computing. `git-stacks status --fetch` already follows this pattern for `behind`
  tracking; `aheadBehindStale` via FETCH_HEAD mtime is the honest companion.

### Secret Resolution Patterns

- **1Password CLI** (`op run`, `op inject`): uses `op://vault/item/field` URI syntax; injects via subprocess env
  or file injection. The `op://` prefix is the canonical reference format.
- **Doppler**: `doppler run --` prefix wraps commands; `doppler secrets get KEY --plain` for single-key access.
  `doppler:project/config/KEY` is the standard path format for programmatic access.
- **pass** (Unix password store): `pass show path/to/secret` returns plaintext value. Simple, widely used.
- **GitHub Actions `${{ secrets.KEY }}`**: The `${{ expression }}` syntax is the most widely recognized
  secret-reference format in developer tooling. Borrowing it reduces cognitive load.
- Industry consensus (2025): store references, never values. Runtime injection is meaningful improvement over
  plaintext files even though env vars are readable via `/proc/self/environ` on Linux. For git-stacks' use case
  (local developer env injection), this is an appropriate threat model.

### Labels / Grouping Patterns

- **HCP Terraform workspace tags**: Exact same problem space — many workspaces, need filtering/grouping metadata.
  Tags use `key:value` format (e.g., `env:production`, `team:platform`). Filtering is AND-logic (all tags required).
  This is the mature reference implementation for workspace tagging.
- **Kubernetes labels**: `app.kubernetes.io/name` style with dots and slashes; git-stacks uses simpler
  `[A-Za-z0-9._:-]+` (no slashes to avoid path confusion). Colon-namespacing is established convention.
- **Filter UX pattern**: `/` to open filter, filter matches name OR label, `label:prefix` for label-only match.
  This matches the pattern established by existing `/` filter in WorkspaceList.

### Auto-Stash Patterns

- **`git rebase --autostash`** (git 2.6+, 2014): stash before rebase, pop after. `rebase.autoStash = true`
  global config is widely recommended. The multi-repo complication git-stacks adds: pop failures in one repo
  must not block pops in other repos.
- **Community caution**: ~38% of developers report stash-related merge difficulties monthly (per web research).
  The right default is "stash on explicit request only" — not a global config option. The `--stash` flag-per-invocation
  design matches this conservative recommendation.
- **Conflict handling imperative**: when stash pop conflicts, the stash must be preserved (not dropped) and the
  user must get an actionable message with the exact command to recover. Silent failure or dropped stashes are
  the most-reported frustration with auto-stash.

---

## Sources

- `FEATURES.md` (project root) — detailed feature specs for all 5 features; HIGH confidence
- `.planning/PROJECT.md` — v0.14.0 milestone goals and recent state; HIGH confidence
- `src/lib/git.ts` — existing `getCommitsBehind`, `pullFFOnly`, `isRepoDirty` patterns; HIGH confidence
- `src/lib/workspace-ops.ts` — existing `syncWorkspace`, `mergeEnv`, `writeEnvFiles` hook points; HIGH confidence
- github.com/fboender/multi-git-status — ahead/behind/needs-push display pattern reference; MEDIUM confidence
- git-scm.com/docs/git-push — `--force-with-lease` semantics; HIGH confidence
- git-scm.com/docs/git-rebase — `--autostash` behavior and conflict handling; HIGH confidence
- developer.1password.com/docs/cli/secret-references — `op://` reference syntax; MEDIUM confidence
- eficode.com/blog/git-autostash — autostash conflict pitfalls; MEDIUM confidence
- developer.hashicorp.com/terraform/enterprise/workspaces/tags — workspace tag organization patterns; MEDIUM confidence
- oneuptime.com/blog/post/2026-02-23-how-to-use-workspace-tags-for-organization-in-hcp-terraform — tag filtering UX; MEDIUM confidence
- adamj.eu/tech/2022/11/05/git-automatically-stash-rebase-merge — autostash configuration and caveats; MEDIUM confidence

---

*Feature research for: git-stacks v0.14.0 Workflow Completion & Workspace UX*
*Researched: 2026-04-03*
