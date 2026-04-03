# Project Research Summary

**Project:** git-stacks v0.14.0 — Workflow Completion & Workspace UX
**Domain:** Bun CLI tool — multi-repo workspace manager (push, ahead/behind, labels, secrets, stash)
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

git-stacks v0.14.0 completes the core developer workflow loop that was missing after v0.13.0. The five features — push, ahead/behind tracking, labels, secrets, and auto-stash on sync — are all additive to the existing architecture with zero breaking changes. Every new primitive mirrors an existing pattern in the codebase: `pushBranch` mirrors `pullFFOnly`, `getCommitsAhead` mirrors `getCommitsBehind`, `stashPush`/`stashPop` follow the same `.quiet().nothrow()` pattern as all other git operations, and the secrets subsystem inserts as a pure transform step between `mergeEnv()` and `writeEnvFiles()` in the already-established env pipeline. No new npm dependencies are required.

The recommended implementation order is dictated by dependency levels: ahead/behind and labels first (pure read-path or additive schema work, zero risk), then push and stash-on-sync (require new git primitives but are otherwise independent), then secrets last (touches `openWorkspace`, the most complex function, and requires a new subsystem with dedicated test coverage). The highest-risk feature is secrets due to external CLI subprocess behavior — specifically the 1Password CLI TTY hang issue and the `cmd:` resolver's arbitrary code execution surface. The second-highest risk is auto-stash, where pop conflicts must set `SyncResult.ok = false` (not just warn) and double-stash accumulation must be guarded against.

The critical security constraint that must be enforced from the start: `resolveSecrets` must never mutate the workspace object — it operates on a derived `Record<string, string>` only, and `writeWorkspace` is always called with the pre-resolution workspace object. Any deviation from this constraint causes plaintext secrets to be written to YAML on disk. The label filter logic must be extracted to a single shared utility before implementing CLI or TUI surfaces; independent implementations will diverge on AND/OR semantics.

---

## Key Findings

### Recommended Stack

The entire milestone is buildable within the existing Bun + TypeScript + Commander.js + Zod v4 + yaml stack. All five features use Bun `$` shell with `.quiet().nothrow()` for git and external CLI subprocess operations — the same API used by every existing git operation. `Promise.all` parallelism follows the established `syncWorkspace` pattern for push and ahead/behind aggregation. Zod v4 `.optional()` handles schema additions with zero migration risk for existing YAML files.

**Core technologies:**
- **Bun `$` shell (`.quiet().nothrow()`)**: All new git primitives (`pushBranch`, `stashPush`, `stashPop`, `getCommitsAhead`) and all external secret CLI subprocesses — consistent error-handling without subprocess boilerplate
- **Zod v4 `.optional()`**: `labels` field on `WorkspaceSchema` + `TemplateSchema`, `secrets` on `GlobalConfigSchema` — existing YAML files parse with `undefined` for new fields; no migration scripts
- **`git rev-parse --git-common-dir`**: FETCH_HEAD mtime staleness check path resolution — required for worktrees where `.git` is a file not a directory
- **`Promise.all`**: Parallel push and parallel ahead/behind per repo — mirrors existing `syncWorkspace` pattern
- **No new npm packages**: All five features are within the existing dependency set

### Expected Features

**Must have (table stakes) — v0.14.0 core:**
- `git-stacks push` with `--force-with-lease`, `--force`, `--dry-run` — completes the commit→push→PR workflow loop
- `getCommitsAhead` + ahead/behind in `list` output and TUI `↑N ↓N` — most actionable status metric
- `aheadBehindStale` flag via FETCH_HEAD mtime — honest UX; competing tools omit this
- Secret references (`${{ op://... }}`, `${{ doppler:... }}`, `${{ env:... }}`, `${{ pass:... }}`, `${{ cmd:... }}`) — blocks real team/production use without this
- `--skip-secrets` escape hatch — required for CI/agent use cases
- `labels` field on workspaces + templates, `--label` filter on `list`, `git-stacks label` CRUD subcommand

**Should have (competitive, P2 — after P1 stable):**
- `--stash` on `git-stacks sync` — ship after push and secrets are validated; pop failure modes are the riskiest part
- Push action in TUI ActionMenu — add after CLI push is stable
- Group-by-label toggle (`g`) in TUI WorkspaceList
- Per-repo ahead/behind in `git-stacks status <name>` per-repo table

**Defer (v0.15+):**
- `--stash` on `git-stacks merge`
- Bitwarden CLI secret resolver
- Label autocomplete in shell completions
- Saved TUI filter state (needs a persistent UI config layer first)

### Architecture Approach

All five features are additive to the existing layered architecture (Commands → Business Logic → Config Layer → TUI). One new file (`src/lib/secrets.ts`) is created; everything else is extension of existing files. The secrets subsystem is architecturally isolated — it has a single entry point into `workspace-ops.ts:openWorkspace` and no circular dependencies. Label commands either extend `workspace.ts` or extract to a new `src/commands/label.ts` (consistent with the existing `repo` and `template` command pattern). No TUI structural changes — all dashboard work extends existing components in-place.

**Major components changed:**
1. `src/lib/git.ts` — add `pushBranch`, `getCommitsAhead`, `stashPush`, `stashPop`
2. `src/lib/workspace-ops.ts` — add `pushWorkspace`, extend `getWorkspaceListInfo` with ahead/behind, stash in `syncWorkspace`, call `resolveSecrets` in `openWorkspace`
3. `src/lib/secrets.ts` (new) — `SecretResolver` interface, 5 built-in resolvers, `resolveSecrets()`, `buildResolvers()`
4. `src/lib/config.ts` — `labels` field on schemas, `secrets` field on `GlobalConfigSchema`
5. TUI dashboard — `WorkspaceRow` (↑N ↓N, label tags), `WorkspaceList` (group-by toggle, filter extension), `ActionMenu` (push action)

**Build order (3 dependency levels):**
- Level 1 (parallel): Ahead/behind + Labels — no cross-feature dependencies, pure additive
- Level 2 (parallel, after git.ts changes): Push + Stash-on-sync — both need new git primitives
- Level 3 (after config.ts schema): Secrets — new subsystem touching `openWorkspace`

### Critical Pitfalls

1. **FETCH_HEAD wrong path for worktrees** — `join(repoPath, ".git", "FETCH_HEAD")` fails for worktrees (`.git` is a file not a dir). Use `git rev-parse --git-common-dir` to resolve the shared `.git` dir first. Non-negotiable fix for staleness detection.

2. **Secret values written to workspace YAML** — if `resolveSecrets` mutates `workspace.env` in place (rather than returning a new Record), any subsequent `writeWorkspace` call persists plaintext secrets to disk. Design constraint: `resolveSecrets` signature is `(rawEnv: Record<string, string>, resolvers) => Record<string, string>` — never accepts a workspace object.

3. **Secret resolver subprocess hangs** — `op read` hangs when 1Password needs biometric auth; Doppler hangs with no VPN. Every resolver subprocess must be wrapped in a `Promise.race` with a 10s timeout. Surface "Is 1Password unlocked?" in the error message.

4. **Stash pop conflict masked as success** — `syncWorkspace` returning `{ ok: true }` when pop conflicts occurred misleads scripts and the TUI. Any stash pop failure must set `SyncResult.ok = false`. Also guard against double-stash accumulation: if a `git-stacks auto-stash` entry already exists in `stash list`, refuse to stash again.

5. **Label filter AND/OR inconsistency** — CLI `--label` and TUI `/` filter implemented independently will diverge on semantics. Extract `matchesLabels(workspace, terms[])` as a shared utility before implementing either surface. Define once: case-sensitive, AND across terms, exact match per label.

6. **`--force-with-lease` defeated by background fetch** — bare `--force-with-lease` uses the local tracking ref, which any preceding `fetchOrigin` (e.g., during sync) has already updated. For MVP, acceptable with documented limitation; for safety, use explicit SHA form `--force-with-lease=<refname>:<expected-sha>`.

7. **`cmd:` resolver is arbitrary code execution** — `${{ cmd:... }}` executes `sh -c` on the value from YAML. Must require explicit opt-in in `config.yml secrets.resolvers`; not enabled by default; log every execution; warn in config wizard.

---

## Implications for Roadmap

Based on research, the architecture dictates 5 natural phases where phases 1+2 are parallelizable and phases 3+4 are parallelizable:

### Phase 1: Ahead/Behind Tracking

**Rationale:** Pure read-path additions with no schema changes and no risk to existing behavior. Delivers immediate visual value (↑N ↓N in TUI, AHEAD/BEHIND in list). Ahead count unblocks push dry-run messaging. All patterns directly mirror existing `getCommitsBehind`.
**Delivers:** `getCommitsAhead()` in `git.ts`, `aheadBehindStale` via `git rev-parse --git-common-dir`, ahead/behind in `WorkspaceListInfo`, AHEAD/BEHIND in `git-stacks list`, `↑N ↓N` in TUI WorkspaceRow
**Avoids:** FETCH_HEAD wrong path pitfall (use `--git-common-dir`); silent zero for missing ref (return `null`, not `0`)
**Research flag:** Standard patterns — skip research phase

### Phase 2: Labels

**Rationale:** Schema-additive only (zero migration risk). Can build in parallel with Phase 1. Delivers filtering and organization infrastructure before the operational features (push, stash) land. The `matchesLabels()` shared utility must be written before CLI or TUI label filter implementations.
**Delivers:** `labels` field on `WorkspaceSchema` + `TemplateSchema`, `git-stacks label add/remove/list/clear`, `--label` filter on `list`, label tags in TUI WorkspaceRow, group-by-label toggle in WorkspaceList
**Avoids:** Label filter AND/OR inconsistency (shared `matchesLabels()` utility first)
**Research flag:** Standard patterns — skip research phase

### Phase 3: Push

**Rationale:** Requires new `git.ts` primitives (`pushBranch`). Can build in parallel with stash-on-sync (Phase 4). Completes the "commit → push → PR" workflow loop. Ahead count from Phase 1 feeds dry-run messaging. Force-with-lease limitation must be documented.
**Delivers:** `pushBranch()` in `git.ts`, `pushWorkspace()` in `workspace-ops.ts`, `git-stacks push` command with `--force-with-lease`/`--force`/`--dry-run`, push action in TUI ActionMenu, forge PR hint in post-push output
**Avoids:** Parallel push shared .git lock (group by `main_path`); `GIT_TERMINAL_PROMPT=0` for credential prompt suppression; non-zero exit when any repo fails
**Research flag:** Standard patterns — skip research phase

### Phase 4: Stash-on-Sync

**Rationale:** Also requires new `git.ts` primitives; buildable in parallel with Phase 3. Higher failure-mode complexity than push — pop conflicts, double-stash guard, and `--include-untracked` size warnings require careful testing. Deferring to after push is validated reduces risk.
**Delivers:** `stashPush()`/`stashPop()` in `git.ts`, `--stash` flag on `sync`, three-phase execution (stash dirty → sync → pop in reverse), `stashPopFailures` in `SyncResult`
**Avoids:** Pop conflict masked as success (`SyncResult.ok = false` on any pop failure); double-stash accumulation guard; `--include-untracked` size warning for large repos
**Research flag:** Standard patterns but failure modes need careful test coverage — no research phase needed, but plan extra test scenarios

### Phase 5: Secrets

**Rationale:** Architecturally isolated (new `src/lib/secrets.ts` module, single hook into `openWorkspace`) but touches the most complex function in the codebase. Requires config schema changes. Build last to avoid touching `openWorkspace` while it is still changing for push/stash. The TTY hang and code injection pitfalls must be addressed in the initial design.
**Delivers:** `SecretResolver` interface, 5 built-in resolvers (`op`, `doppler`, `pass`, `env`, `cmd`), `resolveSecrets()` in pipeline after `mergeEnv()`, `--skip-secrets` escape hatch, secrets resolver config in `git-stacks config` wizard
**Avoids:** Secret values written to YAML (immutable Record contract); resolver subprocess hangs (10s `Promise.race` timeout); `cmd:` enabled by default (explicit opt-in only)
**Research flag:** Needs implementation care — `op` TTY behavior is MEDIUM confidence; test against actual or mock `op` CLI to verify `OP_BIOMETRIC_UNLOCK_ENABLED=0` behavior

### Phase Ordering Rationale

- **Phases 1 and 2 are parallel:** Both are purely additive with no cross-feature dependencies. Ahead/behind feeds push dry-run messaging; labels are fully independent of everything else.
- **Phases 3 and 4 are parallel:** Both require new `git.ts` primitives but are otherwise independent. Building them together keeps the git.ts changes in one review cycle.
- **Phase 5 is last:** Secrets touches `openWorkspace` (most complex function) and has external subprocess unpredictability. Building it after the other features are stable reduces interaction risks.
- **This order ensures the highest-confidence, most impactful features (push, ahead/behind) land first**, with the riskiest feature (secrets) having the most test coverage and review attention.

### Research Flags

Needs deeper research or careful testing during planning:
- **Phase 5 (Secrets):** `op` CLI TTY behavior with `OP_BIOMETRIC_UNLOCK_ENABLED=0` is MEDIUM confidence (community sources, not full official exit code spec). Plan to test against real or mock `op` CLI. `pass` + GPG pinentry in TUI context needs `GPG_TTY` validation.

Standard patterns (skip research phase):
- **Phase 1 (Ahead/Behind):** Direct mirror of `getCommitsBehind`; `--git-common-dir` worktree path resolution is documented git behavior
- **Phase 2 (Labels):** Zod `.optional()` schema pattern, Commander.js subcommand registration — both established patterns in this codebase
- **Phase 3 (Push):** Mirror of `pullFFOnly`; `--force-with-lease` semantics fully documented
- **Phase 4 (Stash):** `git stash` behavior is stable; pop conflict output format is documented

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All patterns verified against existing codebase (`git.ts`, `workspace-ops.ts`, `package.json`); no new dependencies required |
| Features | HIGH | Derived from project's own `FEATURES.md` + existing codebase analysis; table stakes and anti-features well-justified |
| Architecture | HIGH | All integration points from direct code analysis; build order derived from actual dependency relationships |
| Pitfalls | HIGH (mostly) | git behavior, Zod patterns, and architecture risks are HIGH; `op` TTY behavior and `pass` GPG pinentry are MEDIUM (community sources) |

**Overall confidence:** HIGH

### Gaps to Address

- **`op` exact exit codes and TTY behavior:** The `OP_BIOMETRIC_UNLOCK_ENABLED=0` mitigation is derived from community discussion, not official docs. During secrets implementation, test against actual `op` CLI (or a mock that simulates the hang) to verify the mitigation works. Official 1Password docs do not publish a complete exit code spec.

- **`pass` + GPG pinentry in TUI context:** `pass show` may open a pinentry dialog in some desktop configurations. The 10s timeout mitigates the hang, but `GPG_TTY` may need to be set in the resolver subprocess env to prevent pinentry from trying to open a graphical prompt. Validate during implementation.

- **SSH multiplexer contention on parallel push:** The pitfall research recommends grouping repos by remote host for sequential push within a host. The current MVP plan groups by `main_path` (same .git object store). For repos with distinct `main_path` but the same remote, SSH multiplexer contention is still possible. Document the limitation; address if users report it.

---

## Sources

### Primary (HIGH confidence)

- `src/lib/git.ts` — `getCommitsBehind`, `pullFFOnly`, `fetchOrigin`, `checkRemoteTrackingRef`, `existsSync` usage — direct code read
- `src/lib/workspace-ops.ts` — `syncWorkspace`, `mergeEnv`, `writeEnvFiles`, `openWorkspace`, `getWorkspaceListInfo`, `Promise.all` parallelism — direct code read
- `src/lib/config.ts` — `WorkspaceSchema`, `TemplateSchema`, `GlobalConfigSchema`, Zod patterns — direct code read
- `package.json` — confirmed `zod ^4.3.6`, `commander ^14.0.3`, `@clack/prompts ^1.2.0` — direct file read
- `FEATURES.md` (project root) — full v0.14.0 feature specifications
- `bun.com/docs/runtime/shell` — `$` shell `.quiet().nothrow()`, per-command env var prefix, stdout buffer API
- `git-scm.com/docs/git-push` — `--force-with-lease` semantics, explicit SHA form
- `git-scm.com/docs/git-stash` — conflict behavior, stash list preservation on pop conflict
- `git-scm.com/docs/git-worktree` — `.git` file structure, shared object database, `--git-common-dir`

### Secondary (MEDIUM confidence)

- `github.com/fboender/multi-git-status` — ahead/behind display patterns in multi-repo tools
- `developer.1password.com/docs/cli/secrets-scripts/` — `op read` scripting context, service account recommendation
- `1password.community` — `op` hangs on biometric auth when stdin is not TTY; `OP_BIOMETRIC_UNLOCK_ENABLED=0` workaround
- `docs.doppler.com/docs/accessing-secrets` — `doppler secrets get --plain` syntax
- `passwordstore.org` + `github.com/twpayne/chezmoi/issues/784` — `pass show` requires GPG agent passphrase cache
- `www.atlassian.com/blog/it-teams/force-with-lease` — `--force-with-lease` defeated by background fetch
- `developer.hashicorp.com/terraform/enterprise/workspaces/tags` — workspace tag organization patterns (label design reference)
- `github.com/oven-sh/bun/issues/24690` — `Bun.spawn` with `stdout: 'pipe'` returns empty output inside `bun test`

### Tertiary (LOW confidence)

- Community stash caution (~38% stash-related merge difficulties monthly) — supports conservative "explicit `--stash` flag per invocation" design decision

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
