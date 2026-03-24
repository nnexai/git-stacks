# Project Research Summary

**Project:** git-stacks v0.8.0 — Integration Polish & Workspace UX
**Domain:** CLI workspace manager — bug fixes and ergonomic improvements to integration layer
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

v0.8.0 is a focused integration polish release containing two confirmed bugs and two UX ergonomic improvements. All four features are additive or corrective changes to the existing codebase — no new npm dependencies, no schema migrations, no architectural changes. The existing stack (Bun, TypeScript, Commander.js, SolidJS + OpenTUI, Zod + YAML, `@clack/prompts`) is unchanged. Each feature maps cleanly to one or two files in the integration layer and is independent of the others.

The recommended implementation order, derived from architecture research, is: (1) the upstream branch tracking fix in `git.ts` — smallest blast radius, six call sites benefit automatically; (2) the dashboard linked issues display fix in `WorkspaceDetail.tsx` — pure display logic, root cause fully understood; (3) the Jira workspace auto-detection change in `jira.ts` and `issue-utils.ts` — requires careful Commander.js argument design to avoid positional ambiguity; (4) the GitLab branch slash investigation — must diagnose root cause before writing any code. Feature 4 is the most uncertain because the failure may be in glab itself rather than our code.

The key risks are: (a) path normalization correctness in workspace CWD detection — must use `resolve()` + `expandHome()` on both sides with `startsWith(path + "/")` not `===`; (b) Commander.js positional argument ambiguity for the Jira `issue link` command when workspace becomes optional — use `--workspace` flag, not an optional positional; (c) performance regression if upstream branch check uses `git ls-remote` directly instead of checking local remote-tracking refs after an existing `fetchOrigin()` call.

## Key Findings

### Recommended Stack

No new dependencies are needed for any of the four features. All changes use standard git CLI commands already established in the codebase (`ls-remote --exit-code`, `fetch origin`, `worktree add --track`), built-in `process.cwd()` and `path.resolve()`, and existing SolidJS primitives (`createMemo`, `For`, `Show`).

**Core technologies relevant to v0.8.0:**
- `Bun.$` shell — git CLI invocations for upstream branch check; same `.quiet().nothrow()` pattern already used in `isBranchGoneOnRemote()` in `git.ts`
- `process.cwd()` + `path.resolve()` — CWD-to-workspace detection; no library needed, 5-line implementation
- SolidJS `ws()` reactive signal — already available in `WorkspaceDetail.tsx` props; data is already present, only the display path needs fixing
- Commander.js `--workspace` flag pattern — cleaner than optional positional for the Jira argument redesign

**New functions (no new files needed):**
- `checkRemoteBranchExists(repoPath, branch)` — in `src/lib/git.ts`; uses `git ls-remote --exit-code --heads origin <branch>`
- `resolveWorkspaceFromCwd(cwd?)` — in `src/lib/integrations/issue-utils.ts`; path-prefix match against all workspace `task_path` values

**Version-sensitive note:** `git worktree add --track` is available since git 2.5. Project already requires git 2.24+. No version concern.

### Expected Features

All four features have been scoped to their minimal correct implementation. Extended features (applying auto-detection to GitHub/GitLab/Gitea, doctor checks for missing upstream tracking) are explicitly deferred to v0.8.x or v0.9.0.

**Must ship (v0.8.0):**
- Per-workspace linked issue displayed correctly in dashboard detail pane — active bug, shows global Jira config as if it were workspace data
- Upstream branch tracking during worktree creation — prevents silent "no tracking" defect causing `git push --set-upstream` requirement for every new workspace on an existing branch
- Jira workspace auto-detection from CWD — ergonomic improvement reducing friction in the most common single-developer workflow
- GitLab branch slash investigation — identify root cause and either fix (one-liner in `gitlab.ts`) or document (known glab limitation)

**Defer to v0.8.x:**
- Extend workspace auto-detection to GitHub/GitLab/Gitea issue commands (same pattern as Jira, low complexity)
- Verbose output showing detected workspace name during auto-detection
- Doctor warning for existing worktrees missing upstream tracking

**Defer to v0.9.0+:**
- Separate "Linked Issues" visual section in dashboard detail pane (beyond the minimum bug fix)
- Minimum glab version enforcement in doctor (contingent on slash investigation result)
- Cross-workspace issue aggregation view

### Architecture Approach

All four features sit at well-defined architectural seams with no cross-layer changes required. Feature 4 (`git.ts`) is a pure core library change that propagates to six existing call sites automatically — none of the callers need modification. Feature 1 (`WorkspaceDetail.tsx`) is a TUI display-only change with no data model impact. Feature 3 (`jira.ts` + `issue-utils.ts`) is confined to the integration plugin layer. Feature 2 (`gitlab.ts`) is investigation-first with a conditional one-line fix.

**Major components touched:**
1. `src/lib/git.ts` — `createWorktree()` internal logic change; new `checkRemoteBranchExists()` function following existing `isBranchGoneOnRemote()` pattern
2. `src/tui/dashboard/WorkspaceDetail.tsx` — configSummary source corrected to read from workspace settings only; linked issue display section added
3. `src/lib/integrations/issue-utils.ts` — new `resolveWorkspaceFromCwd()` using path-prefix matching against all workspace `task_path` values
4. `src/lib/integrations/jira.ts` — workspace argument made optional; CWD fallback wired in; `--workspace` flag used to avoid positional ambiguity
5. `src/lib/integrations/gitlab.ts` — conditional one-liner adding `--source-branch` to `glab mr view` if investigation confirms our code is at fault

### Critical Pitfalls

1. **Commander.js positional ambiguity for `jira issue link`** — making `[workspace]` optional before `<issue-id>` causes Commander to assign a single positional arg to `workspace`, leaving `issue-id` undefined and silently wrong. Use `--workspace <name>` flag instead of an optional positional. The `issue open` and `issue unlink` commands have only one positional each and can use `[workspace]` safely.

2. **Path normalization in CWD workspace detection** — comparing `process.cwd()` to stored `task_path` without normalization fails when `task_path` uses `~/` prefix (common; written at workspace creation time with tilde unexpanded). Fix: apply `path.resolve(expandHome(repo.task_path))` to every stored path before comparison; use `cwd.startsWith(taskPath + "/")` with the trailing separator to match subdirectories and prevent false-positive prefix collisions (e.g., `/tasks/ws` should not match `/tasks/ws-other`).

3. **ls-remote latency on multi-repo workspace creation** — `git ls-remote` is a network call (0.5–3s per repo). For a 5-repo workspace this adds 2–15 seconds of overhead. Fix: verify whether `fetchOrigin()` is already called before `createWorktree()` in the workspace creation flow in `workspace-ops.ts`. If yes, use `git rev-parse --verify origin/<branch>` (local remote-tracking ref check) instead of `ls-remote`. Only use `ls-remote` if no prior fetch is guaranteed.

4. **Dashboard configSummary config-scope conflation** — the `??` fallback from workspace to global config in `WorkspaceDetail.tsx` lines 127–138 is correct for integration config fields (`open_cmd`) but wrong for linked issue IDs. The `issue` key must be read exclusively from workspace settings; the global fallback path must explicitly exclude `issue` keys. Two separate read paths: config summary from global config, linked issue from workspace settings.

5. **Double-encoding risk for glab branch slash** — our code does not pass branch names to glab for `mr view --web`; glab reads HEAD branch from the CWD. Adding `encodeURIComponent()` on our side would double-encode if glab also encodes. Confirm bug ownership via manual testing before writing any encoding fix.

## Implications for Roadmap

Based on research, the four features map to four independent phases. The recommended sequence minimizes risk by addressing the lowest-blast-radius change first and the most uncertain change last. Phases 1 and 2 are independent and can be parallelized.

### Phase 1: Upstream Worktree Branch Tracking

**Rationale:** Single-function change in `git.ts` with no dependencies on other features. Root cause fully understood, fix strategy verified against official git docs. Six call sites benefit automatically with no caller changes required. Lowest risk, highest correctness payoff. Resolves a silent defect present in all workspace creation paths.

**Delivers:** Worktrees for branches that already exist on `origin` are created with upstream tracking set. `git push` and `git pull` work without `--set-upstream`. Brand-new branch behavior (no remote counterpart) is unchanged — three-way check: local exists, remote exists, neither.

**Addresses:** FEATURES.md Feature 4 table stakes (upstream branch tracking)

**Avoids:** PITFALLS.md Pitfall 5 (missing `--track` during worktree creation) and Pitfall 6 (ls-remote latency — resolve fetch-vs-ls-remote strategy before implementing)

**No research phase needed** — git CLI flags verified against official docs; `ls-remote --exit-code` pattern established in `isBranchGoneOnRemote()` in same file.

### Phase 2: Dashboard Linked Issues Display Fix

**Rationale:** Pure TUI display change. Root cause identified precisely in `WorkspaceDetail.tsx` lines 127–138. Data is already in workspace props; no new data loading, no schema changes. Fix isolates two concerns that are currently conflated: integration config display (reads from global config) vs. linked issue data (reads from workspace settings only).

**Delivers:** Dashboard detail pane shows per-workspace linked issue ID for each tracker integration that has one. Empty state is correct when no issue is linked. Global config values are not shown in the linked issue row. Source annotation shows `[workspace]` not `[global]` for issue fields.

**Addresses:** FEATURES.md Feature 1 table stakes (per-workspace linked issue display, correct empty state, correct source annotation)

**Avoids:** PITFALLS.md Pitfall 1 (global config fallback contaminating workspace display) and the technical debt anti-pattern of conflating config scope in display logic

**No research phase needed** — root cause confirmed by direct source inspection; fix is pure JSX/display logic using already-loaded workspace props.

### Phase 3: Jira Workspace Auto-Detection from CWD

**Rationale:** Adds `resolveWorkspaceFromCwd()` to `issue-utils.ts` and rewires three Jira issue subcommands in `jira.ts`. Requires careful Commander.js argument design — the positional ambiguity pitfall is well-understood and the solution (use `--workspace` flag) is unambiguous. Follows Phases 1 and 2 to keep PR scope manageable.

**Delivers:** `git-stacks integration jira issue link PROJ-123` (no workspace arg) auto-detects workspace when run from inside a worktree. Clear, actionable error when workspace cannot be determined from CWD. Custom `workspace_root` paths honored via global config. Existing explicit `--workspace my-workspace` invocations continue to work (backward compatible).

**Addresses:** FEATURES.md Feature 3 table stakes (optional workspace arg, error message, config-sourced workspace root, all three Jira subcommands covered)

**Avoids:** PITFALLS.md Pitfall 3 (path normalization with `expandHome` + `resolve`), Pitfall 4 (Commander.js positional arg ambiguity via `--workspace` flag), and the UX pitfall of silent detection failure

**No research phase needed** — path detection algorithm derived directly from `paths.ts` and `config.ts` source. Commander.js argument design decision already resolved.

**Shell completion update required:** `src/lib/completion-generator.ts` walks the Commander.js tree to generate completions automatically — verify post-implementation that the new `--workspace` flag appears in fish/bash/zsh completions.

### Phase 4: GitLab Branch Slash Investigation and Fix

**Rationale:** Must be last because investigation is required before any code is written. If the bug is in glab (not our code), the deliverable shifts to documentation and optionally a doctor version check — no code change in `gitlab.ts`. If the bug is confirmed in our code, the fix is a one-line addition. Placing this last avoids blocking earlier phases on an uncertain investigation.

**Delivers:** Confirmed root cause documented. Either: (a) one-line fix in `gitlab.ts` adding `--source-branch workspace.branch` to `glab mr view --web` invocation, or (b) release notes stating the known glab limitation and recommended glab version. Not both.

**Addresses:** FEATURES.md Feature 2 (GitLab branch slash escaping — all three table stakes items: transparent slash handling, investigation documented, root cause confirmed)

**Avoids:** PITFALLS.md Pitfall 2 (double-encoding risk — do not add encoding before confirming our code is at fault) and the FEATURES.md anti-feature warning against URL-encoding branch names before passing to glab

**Investigation required** — manual test with a real GitLab project on a `feature/...` branch before writing any code. This is the only phase with a conditional deliverable.

### Phase Ordering Rationale

- Phases 1 and 2 touch different layers (`git.ts` core library vs. TUI dashboard) with no shared state — they can be developed in parallel by two developers.
- Phase 3 has no technical dependency on Phases 1 or 2 but should follow them to keep each PR reviewable in isolation.
- Phase 4 must be last because the investigation determines what (if anything) gets coded. Assigning it last prevents discovery of a "it's glab's bug" from blocking shipping the other three features.
- The `--workspace` flag change in Phase 3 requires verifying shell completions post-implementation — this is automatic via the Commander.js tree walker but must be confirmed.

### Research Flags

Phases with standard patterns (no `research-phase` needed):
- **Phase 1** — git CLI pattern established in `isBranchGoneOnRemote()` in same file; `--track` flag verified in official git docs; implementation is mechanical
- **Phase 2** — pure display logic fix using already-loaded SolidJS reactive props; no new API surface
- **Phase 3** — path detection algorithm fully derived from `paths.ts`; Commander.js arg design decision resolved (use flag not positional)

Phase requiring investigation before coding:
- **Phase 4** — glab behavior with slash-containing branch names must be tested manually on a real GitLab instance before determining whether a code change is warranted. Document findings; write code only if the bug is confirmed to be in our invocation of glab.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; all git CLI flags verified against official docs and codebase; existing patterns reused throughout |
| Features | HIGH | All four features grounded in direct source code inspection; scope tightly bounded; must-ship vs. defer line explicitly drawn |
| Architecture | HIGH | All modified files read directly; component boundaries confirmed; six call sites for Feature 4 enumerated in source |
| Pitfalls | HIGH (except glab) | Pitfalls 1, 3, 4, 5, 6 derived directly from codebase inspection with file/line evidence; Pitfall 2 (glab slash) is MEDIUM — upstream glab behavior requires live testing to confirm |

**Overall confidence:** HIGH

### Gaps to Address

- **ls-remote vs. fetch strategy for Phase 1**: Before implementing `createWorktree()` changes, inspect `workspace-ops.ts` to confirm whether `fetchOrigin()` is called before the `createWorktree()` loop for each repo. If yes, use `git rev-parse --verify origin/<branch>` (local check, zero network) rather than `git ls-remote` (network call per repo). This decision affects latency for every workspace creation and must be made before writing Phase 1 code.

- **GitLab slash branch root cause (Phase 4)**: Whether the deliverable is a code fix or documentation depends entirely on whether manual testing with a `feature/...` branch shows the failure in our `gitlab.ts` invocation or in glab's URL construction. Allocate investigation time before Phase 4 work begins. If glab is the cause, consider whether a minimum glab version check in `git-stacks doctor` is worth adding as a v0.8.x follow-up.

- **Shell completion verification (Phase 3)**: The `--workspace` flag addition changes the CLI signature for three Jira issue subcommands. `completion-generator.ts` auto-generates from the Commander.js tree (confirmed in CLAUDE.md architecture section), so the completion update should be automatic. Verify by running `git-stacks completion fish` and checking for the new flag after Phase 3 ships.

## Sources

### Primary (HIGH confidence)
- `src/tui/dashboard/WorkspaceDetail.tsx` lines 127–138 — configSummary fallback bug, direct source read
- `src/lib/integrations/issue-utils.ts` — `linkIssue()` writes to `workspace.settings.integrations[id].issue`; confirms data model for linked issues
- `src/lib/git.ts` — `createWorktree()` and `isBranchGoneOnRemote()` implementation; `ls-remote --exit-code` pattern established
- `src/lib/paths.ts` — `getTasksDir()` layout confirmed; `expandHome()` available for tilde expansion in CWD detection
- `src/lib/integrations/jira.ts` — current command structure with required `<workspace>` positional args; call sites confirmed
- `src/lib/workspace-ops.ts` — six `createWorktree()` call sites enumerated; confirms single-function change propagates everywhere
- https://git-scm.com/docs/git-worktree — `--track` flag for `worktree add` verified
- https://git-scm.com/docs/git-ls-remote — `--exit-code --heads` exit code behavior confirmed

### Secondary (MEDIUM confidence)
- https://gitlab.com/gitlab-org/cli/-/merge_requests/1183 — glab added `url.PathEscape` for branch names in web URLs; whether current released glab has a regression requires live testing
- https://github.com/jesseduffield/lazygit/issues/4321 — double-encoding pattern `%2F` to `%252F` confirmed in browser URL handling; informs the "don't encode on our side" recommendation

### Tertiary (informational)
- https://gitlab.com/gitlab-org/cli/-/work_items/8020 — glab issue: slash in branch name causes `mr checkout` 404; confirms the problem class exists in glab ecosystem; specific fix status requires live verification

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
