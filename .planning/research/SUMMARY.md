# Project Research Summary

**Project:** git-stacks
**Domain:** Multi-repo workspace manager CLI (git worktrees + IDE/terminal orchestration)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

git-stacks is a developer environment orchestration tool: it manages git worktrees across multiple repos, snapshots workspace definitions into YAML, and coordinates IDE/terminal launch via an integration plugin system. The tool already has a working PoC covering the full workspace lifecycle, hooks, IDE/terminal integrations, shell completions, a TUI dashboard, and a `doctor` health-check command. Research confirms the current Bun + TypeScript + Commander.js + Zod + YAML stack is well-chosen and should not be replaced — the work ahead is hardening, not rebuilding.

The recommended approach is a phased stabilization: first fix the critical safety gaps (partial-failure corruption, silent config errors, destructive-op UX) and add the table-stakes features that distinguish a trustworthy tool from a PoC (dry-run, confirmation prompts, actionable errors, `--json` output). Second, extend the power-user surface (PR checkout, parallel `run`, richer status, additional terminal integrations, programmatic API). Third, pursue the differentiation layer (agent-aware dashboard, batch workspace generation) once the core is proven stable.

The three highest-risk areas the roadmap must address explicitly are: (1) git worktree operations that corrupt or leave state inconsistent on partial failure — specifically `mergeWorkspace`, `removeWorkspace`, and `renameWorkspace`; (2) the total absence of git-operation tests, which means regressions in the most critical code paths are caught only in production; and (3) Zod schema evolution, where adding any required field without a `.default()` breaks all existing user config files silently. These are not hypothetical risks — the codebase analysis identified concrete code paths for each.

---

## Key Findings

### Recommended Stack

The current stack is correct. No major substitutions are needed. The only prioritized change is upgrading `@clack/prompts` from `0.9.1` to `1.1.0` (ESM-only since v1.0; Bun handles this natively), which adds autocomplete prompts, a `p.tasks()` progress API, and removes the picocolors dependency. OpenTUI + SolidJS for the `manage` dashboard is pre-1.0 with low adoption and should be monitored — Ink (React for CLIs, used by Claude Code, Gemini CLI, Wrangler) is the documented migration target if OpenTUI creates blockers.

**Core technologies:**
- **Bun 1.3.10:** Runtime, test runner, `$` shell API — decisive for CLI startup speed and native TypeScript execution; keep
- **TypeScript 5.9.3:** Strict mode required for config-heavy tool where incorrect schema inference causes silent data loss; keep
- **Commander.js 14.x:** CLI command tree; deeply coupled to shell completion generator — do not upgrade to v15; keep
- **Zod 3.25.76:** Config schema validation; do NOT migrate to v4 until schema compatibility tests exist — migration risk to existing user configs is real; keep on v3
- **yaml 2.8.2:** Full YAML 1.2 spec implementation; v3.0 prerelease drops default export and goes ESM-only — stay on 2.x; keep
- **@clack/prompts:** Upgrade to 1.1.0 for new prompt types and `p.tasks()` progress API
- **OpenTUI + SolidJS (dashboard):** Monitor; Ink is migration target if pre-1.0 stability becomes an issue

**What not to use:** blessed/neo-blessed (unmaintained), shelljs (deprecated), execa (redundant with Bun `$`), ts-node (redundant), jest (use bun:test), Commander.js v15 (Node 22+ requirement, no Bun benefit).

### Expected Features

The tool already has a complete MVP. Research identifies what is needed to graduate from PoC to polished stable tool.

**Must have for v1.0 (table stakes — absence causes churn):**
- Dry-run mode for `merge`, `remove`, `clean` — every serious CLI exposes `--dry-run`; absence means users fear destructive operations
- Confirmation prompts on `remove` and `clean` without `--force` — absence feels broken to power users
- Actionable error messages throughout — currently raw git stderr leaks; users need guided recovery ("repo X has uncommitted changes — stash or use --force")
- Config validation errors as human-readable field messages — Zod stack traces are not acceptable UX
- `--json` output on `status`, `doctor`, `sync` — required for scripting and agent automation; `list` already has it
- `doctor --fix` auto-repair mode — doctor already lists fix commands; execute them with `--fix`

**Should have for v1.x (competitive differentiators):**
- PR checkout (`clone --pr <number>` via `gh` CLI) — removes 4-5 manual steps for PR review workflows
- Parallel `run --parallel` — users with 5+ repos hit sequential execution pain; Bun's `spawn` supports this
- Per-repo ahead/behind counts in `status` — "how stale is my workspace?" is a frequent ask
- WezTerm and Zellij integration plugins — the plugin pattern already supports this cleanly
- Programmatic API surface — `workspace-ops.ts` is already API-shaped; export it as a package entry point

**Defer to v2+ (high complexity, not yet validated):**
- Agent-aware dashboard with status indicators — requires agent status protocol definition before implementation
- Multi-worktree batch generation (`new --count N`) — primarily useful for agent-parallel workflows; complex template variable system needed
- Secret injection at open time via secrets manager — hooks provide a sufficient escape hatch for now
- Container/sandbox isolation — out of scope per PROJECT.md; revisit when agent-safety requirements clarify
- Watch mode for `run` — composable with `mise watch` via hooks; defer

**Anti-features (do not build):** remote/cloud workspace sharing, built-in package/tool version management (use mise), GUI application, Nix as a first-class dependency, AI-triggered conflict resolution, monorepo build caching (Nx/Turborepo's domain).

### Architecture Approach

The existing architecture is sound and correctly layered: `commands/` are thin dispatchers, `lib/` is UI-agnostic domain and infrastructure, `tui/` depends on `lib/` but never vice versa, and `lib/integrations/` is the sole extensibility boundary. The "config as snapshot" pattern (workspace YAML snapshots repo metadata at creation time rather than re-reading the stack) is the right call — workspaces survive stack edits. The `{ ok: boolean; error?: string }` return type from all workspace-ops functions makes a future programmatic API straightforward. Three architectural clean-ups are identified but not urgent: consolidating duplicate artifact generators (`src/lib/vscode.ts` alongside `src/lib/integrations/vscode.ts`), extracting a shared `Result<T>` type alias, and replacing `process.env.HOME` mutation in tests with dependency injection in `paths.ts`.

**Major components:**
1. `lib/config.ts` — Zod schemas + YAML I/O; foundation that everything else depends on; any changes have wide blast radius
2. `lib/workspace-ops.ts` — all core domain operations (open/clean/merge/sync/rename); the programmatic API surface in waiting
3. `lib/git.ts` + `lib/lifecycle.ts` — infrastructure layer; zero test coverage today; highest regression risk
4. `lib/integrations/` — plugin registry; adding a new integration requires one new file + one registry line; no other files change
5. `tui/dashboard/` — SolidJS TUI for `manage`; pre-1.0 library risk; Ink is migration target

### Critical Pitfalls

1. **Partial failure leaves repos in inconsistent state** — `mergeWorkspace` deletes the workspace YAML before all repos are processed; a failure mid-way leaves some repos merged and the workspace record gone with no recovery path. Fix: stage all operations, validate first, commit side effects only after all succeed; never delete YAML until done.

2. **`renameWorkspace` breaks git worktree registration** — it calls `renameSync` on the filesystem but does not re-register worktrees with git; after rename, `git status` inside the worktree fails. Fix: use `git worktree remove` + `git worktree add` on the new path instead of a filesystem rename.

3. **`mergeNoFF` switches HEAD of the main clone** — running `git checkout <baseBranch>` in the main clone can break dependent worktrees and leaves the clone stranded on the wrong branch if merge fails. Fix: use a temporary worktree for the merge target, or `git merge-tree` to avoid switching HEAD.

4. **Any new Zod schema field without `.default()` breaks all existing user configs** — no versioning or migration mechanism exists; all `readWorkspace`/`readStack` calls throw for all users on upgrade. Fix: all new schema fields must be `.optional()` or have `.default()`; treat schemas as a public API contract; add `schema_version` field.

5. **Zero test coverage for git operations** — `src/lib/git.ts` and `src/lib/workspace-ops.ts` have no tests; regressions are caught in production only. Fix: `makeGitRepo(tmpDir)` test helper (5 lines, runs in milliseconds), then integration tests for all critical git paths.

---

## Implications for Roadmap

Based on combined research, a four-phase structure is recommended. The ordering is driven by: (a) architectural dependency order (`config.ts` foundations must be stable before safe feature additions), (b) safety-before-features principle (critical pitfalls are currently live bugs, not future risks), and (c) feature value/cost ratio (P1 items are high value at low cost).

### Phase 1: Foundation Safety and Config Robustness

**Rationale:** Three of the six critical pitfalls are live bugs affecting existing users today: silent YAML parse failures that make all commands unusable on one corrupt file, schema additions that break existing configs, and the absence of any git operation test coverage. These must be addressed before adding any features — otherwise new features will be built on an unstable base that randomly breaks user environments.

**Delivers:** A tool that does not break mysteriously and has a safety net for future changes.

**Addresses from FEATURES.md:**
- Config validation errors as human-readable field messages (P1)
- Test infrastructure (`makeGitRepo` helper, git.ts and workspace-ops.ts coverage)

**Avoids from PITFALLS.md:**
- Pitfall 2: Silent YAML parse failures (wrap file reads in try/catch, warn to stderr, continue)
- Pitfall 5: Schema field addition breaking existing configs (`.default()` rule, `schema_version` field, CI fixture test)
- Pitfall 6: No git operation test coverage (`makeGitRepo` helper + integration tests for critical paths)

**Research flag:** Standard patterns — no research-phase needed; solutions are well-defined.

---

### Phase 2: Destructive Operation Hardening

**Rationale:** `mergeWorkspace`, `removeWorkspace`, `cleanWorkspace`, and `renameWorkspace` all have live bugs where failure leaves repos and config in an unrecoverable state. These are the operations users rely on most and fear most. The architectural fix (stage-then-commit, never delete YAML until operations complete) is clear but requires careful implementation with integration tests to verify.

**Delivers:** Destructive operations that are safe, reversible where possible, and recoverable when not.

**Addresses from FEATURES.md:**
- Dry-run mode for `merge`, `remove`, `clean` (P1)
- Confirmation prompts on `remove` and `clean` (P1)
- `--force` flag consistency audit across all destructive commands

**Avoids from PITFALLS.md:**
- Pitfall 1: Partial failure corrupt state (two-stage verify-then-commit; never delete YAML early)
- Pitfall 3: `renameWorkspace` git worktree breakage (`git worktree remove` + `git worktree add` pattern)
- Pitfall 4: `mergeNoFF` HEAD mutation (temporary worktree or `git merge-tree` approach)

**Research flag:** `mergeNoFF` safe merge approach (git 2.38+ `--into-name` flag vs. temporary worktree fallback) — brief research-phase recommended to verify git version compatibility on target platforms.

---

### Phase 3: UX Polish and Observability

**Rationale:** With the safety foundation in place, this phase addresses the features that make the tool feel complete and professional to users. These are all P1 items from FEATURES.md with low-to-medium implementation cost. They are grouped together because they share a common pattern: standardizing error/output types across the codebase.

**Delivers:** A tool that communicates clearly, works with scripts and agents, and surfaces workspace health at a glance.

**Addresses from FEATURES.md:**
- Actionable error messages throughout (P1) — requires standardized `Result<T>` type and `suggestion` field
- `--json` output on `status`, `doctor`, `sync` (P1)
- `doctor --fix` auto-repair mode (P1)
- Richer `list` columns (branch, age, repo count, dirty indicators)
- Per-repo ahead/behind counts in `status` (P2)

**Uses from STACK.md:**
- `@clack/prompts` 1.1.0 `p.tasks()` API for multi-step operation progress display
- Result type extraction (`type Result<T>`) as a shared type in `lib/`

**Architecture component:** Formalize `Result<T>` type alias; doctor `Issue` type gets structured `action` field (not display string) enabling `--fix` auto-execution.

**Research flag:** Standard patterns — no research-phase needed.

---

### Phase 4: Power User Features

**Rationale:** With a stable, safe, well-communicating core, add the differentiating features that pull git-stacks ahead of comparable tools. These are all P2 items — high user value, medium implementation cost — and have now been de-risked by the foundation work in phases 1-3.

**Delivers:** Features that serve power users and position git-stacks as the best-in-class tool for multi-repo dev workflows.

**Addresses from FEATURES.md:**
- PR checkout: `clone --pr <number>` via `gh` CLI (P2)
- Parallel `run --parallel` with per-repo spinner and aggregated results (P2)
- WezTerm and Zellij integration plugins (P2) — integration plugin pattern already supports this cleanly
- Programmatic API surface: export `workspace-ops.ts` as a typed package entry point (P2)
- Stack composition polish: inter-stack dependency ordering, conflict detection

**Uses from STACK.md:**
- Integration plugin pattern (`src/lib/integrations/`) — add `wezterm.ts` and `zellij.ts` following existing pattern
- Bun `spawn` for parallel subprocess management
- `gh` CLI external dependency for PR checkout (gate behind availability check)

**Research flag:** Programmatic API surface — brief research-phase recommended to understand what API surface shape agent framework integrations (LangChain, Claude Code SDK) expect.

---

### Phase 5: Agent-Aware Features (v2+)

**Rationale:** The agent-parallel workflow use case (multiple AI agents working in separate worktrees simultaneously) is the long-term differentiator. But it requires: (a) a defined agent status file protocol, (b) stable programmatic API from Phase 4, (c) validated product-market fit from v1.x. Do not start this until Phase 4 ships and gathers feedback.

**Delivers:** The features that make git-stacks uniquely suited to AI-agent-parallel development workflows.

**Addresses from FEATURES.md:**
- Agent-aware dashboard with status indicators (P3)
- Multi-worktree batch generation (`new --count N --template`) (P3)
- Agent status protocol definition (prerequisite for everything else in this phase)

**Avoids:** Building to an undefined contract — agent dashboard and batch generation must share the same status file protocol; define the protocol before implementing either.

**Research flag:** Research-phase strongly recommended — agent status file conventions are not yet standardized across tools; workmux's approach is a starting point but not a universal standard.

---

### Phase Ordering Rationale

- Phases 1-2 address live bugs before adding features — this is non-negotiable; adding features to a broken base makes the bugs harder to fix later
- Phase 3 before Phase 4 because `Result<T>` standardization and structured error types are prerequisites for a clean programmatic API
- Phase 5 last because it requires the programmatic API (Phase 4) and a protocol definition that should be informed by real v1.x user feedback
- Architecture dependency order from ARCHITECTURE.md confirms: `config.ts` schemas must be stable (Phase 1) before `workspace-ops.ts` changes (Phase 2) before CLI/TUI changes (Phases 3-4)

### Research Flags

Phases needing deeper research during planning:
- **Phase 2:** `mergeNoFF` safe approach — verify git 2.38+ `--into-name` availability on macOS/Linux target platforms; if unavailable, document the temporary-worktree fallback pattern
- **Phase 5:** Agent status file protocol — research workmux's status file format, Claude Code's workspace conventions, and any emerging standards before committing to an implementation

Phases with standard patterns (skip research-phase):
- **Phase 1:** Config robustness patterns (try/catch file iteration, Zod `.default()`, schema versioning) are well-established
- **Phase 3:** UX patterns (actionable errors, `--json` output, auto-repair modes) are standard CLI best practices
- **Phase 4 (WezTerm/Zellij):** Integration plugin pattern already proven; adding a new integration is mechanical

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack verified against official releases (Bun 1.3.10, Commander.js 14.0.3, yaml 2.8.2, Zod 3.25.76, @clack/prompts 1.1.0). OpenTUI section MEDIUM due to pre-1.0 status and limited public documentation. |
| Features | MEDIUM | Table-stakes features verified against tmuxinator, workmux, mise, moonrepo READMEs (HIGH for those tools). nx/turborepo features MEDIUM (WebFetch blocked for official sites; training knowledge used). |
| Architecture | HIGH | Primary source is direct codebase analysis of `src/`. Comparative tool patterns (mise, tmuxinator, devenv) MEDIUM (training knowledge, not live docs). All architectural conclusions are grounded in actual code. |
| Pitfalls | HIGH | All six critical pitfalls sourced from direct code reading with specific line-level evidence. Git worktree internal behavior MEDIUM (training data, well-established since Git 2.5, no live docs verified). |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenTUI stability timeline:** No public roadmap or 1.0 commitment documented. During Phase 3/4, evaluate whether the dashboard needs an Ink migration. Decision criterion: any breaking change in OpenTUI that requires significant rework should trigger migration.

- **git `--into-name` flag availability:** PITFALLS.md cites Git 2.38+ for the safe merge approach. The minimum Git version requirement for git-stacks users is not documented. Address in Phase 2 planning: check git version and provide fallback, or document a minimum requirement.

- **Programmatic API shape:** `workspace-ops.ts` is API-ready but what external consumers (agent frameworks, CI tools) actually need has not been researched. Address in Phase 4 planning with a brief research spike before committing to an API surface.

- **`process.env.HOME` test fragility:** Identified in PITFALLS.md as a race condition risk under parallel `bun test`. Acceptable for Phase 1 (note it, don't fix it yet); must be replaced with `configDir` dependency injection before Phase 2 integration tests are added.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `/home/nnex/dev/prj/git-stacks/src/` — architecture, pitfalls, component boundaries
- `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/CONCERNS.md` — existing design documentation
- Bun v1.3.10 release: https://github.com/oven-sh/bun/releases
- Commander.js v14.0.3 release notes: https://github.com/tj/commander.js/releases
- @clack/prompts v1.1.0 release notes: https://github.com/natemoo-re/clack/releases
- yaml v2.8.2 release notes: https://github.com/eemeli/yaml/releases
- workmux README: https://github.com/raine/workmux (verified March 2026)
- tmuxinator README: https://github.com/tmuxinator/tmuxinator
- mise official docs: https://mise.jdx.dev
- direnv README: https://github.com/direnv/direnv
- devenv README: https://github.com/cachix/devenv
- Ink adoption evidence: https://github.com/vadimdemedes/ink (Claude Code, Gemini CLI, Wrangler, GitHub Copilot)

### Secondary (MEDIUM confidence)
- Zod v4 breaking changes: GitHub releases — specific version 4.3.6 confirmed; migration path inferred from release notes
- moonrepo README and docs — partial access
- nx/turborepo — training knowledge (WebFetch blocked for official sites)
- git worktree internal behavior (`.git/worktrees/` metadata structure) — training data, well-established since Git 2.5
- mise, tmuxinator, moonrepo, devenv design patterns — training knowledge used for comparative analysis only

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
