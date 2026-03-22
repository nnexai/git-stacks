---
phase: 27-git-forge-integrations
plan: 02
subsystem: integrations
tags: [github, gitlab, gitea, forge, pr, mr, integration-plugin, commander, bun-spawn]

requires:
  - phase: 27-01
    provides: forge-utils.ts with resolveForgeRepo, formatForgeError, and D-14 forge validation

provides:
  - GitHub forge integration plugin (githubIntegration, _exec) — gh pr create/view/status
  - GitLab forge integration plugin (gitlabIntegration, _exec) — glab mr create/view/list
  - Gitea forge integration plugin (giteaIntegration, _exec + runCapture + openUrl) — tea pulls create/ls
  - Updated integrations registry (index.ts) with all three forge integrations
  - Unit tests for all three forge integrations (29 tests)
  - Updated integration-commands test with forge subcommand structure assertions

affects: [27-03, 27-04, index.ts, integration commands, forge PR workflows]

tech-stack:
  added: []
  patterns:
    - "_exec injection pattern extended to forge integrations (run + runCapture + openUrl for gitea)"
    - "pr command mapping: github uses gh pr, gitlab uses glab mr (D-11 pr->mr translation), gitea uses tea pulls"
    - "resolveForgeRepo third arg enforces D-14 forge field validation per-plugin"
    - "(mock.calls[0] as any[])[N] pattern for accessing mock call args when TypeScript infers empty tuple"

key-files:
  created:
    - src/lib/integrations/github.ts
    - src/lib/integrations/gitlab.ts
    - src/lib/integrations/gitea.ts
    - tests/lib/integrations/github.test.ts
    - tests/lib/integrations/gitlab.test.ts
    - tests/lib/integrations/gitea.test.ts
  modified:
    - src/lib/integrations/index.ts
    - tests/lib/integration-commands.test.ts

key-decisions:
  - "GitLab pr status uses 'glab mr list' not 'glab mr status' — mr status subcommand does not exist in glab CLI (verified via official docs)"
  - "Gitea _exec has three methods: run (inherit stdio), runCapture (piped stdout for JSON), openUrl (platform-aware xdg-open/open)"
  - "All forge integrations pass forge identifier string as third arg to resolveForgeRepo — triggers D-14 validation (forge mismatch produces clear error)"
  - "Forge integrations have order 50/51/52 — higher than session integrations (10-30); they are command-only, not session providers"
  - "open() returns null for all forge integrations — they are command-only, not session integrations"

patterns-established:
  - "Forge integration commands: parent.command('pr') with create/open/status subcommands; open has --web option"
  - "Gitea pr open: runCapture JSON parsing, match by head.ref or head.label suffix, exit 1 if no match"
  - "Test pattern: mock.module forge-utils before cache-busting import; replace _exec.run/runCapture/openUrl directly on module object"

requirements-completed: [FORGE-04, FORGE-05, FORGE-06, FORGE-07, FORGE-08, FORGE-09, FORGE-12]

duration: 7min
completed: 2026-03-22
---

# Phase 27 Plan 02: Git Forge Integration Plugins Summary

**Three forge CLI integration plugins (gh/glab/tea) with PR subcommands, D-14 forge validation, and 39 unit tests verifying correct CLI flag mappings**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T16:14:54Z
- **Completed:** 2026-03-22T16:22:00Z
- **Tasks:** 2
- **Files modified:** 7 (4 created integration files + 3 test files + index.ts + integration-commands.test.ts = 8 files total)

## Accomplishments

- Created `github.ts`: `gh pr create --base <branch>`, `gh pr view --web`, `gh pr status` — passes "github" to resolveForgeRepo
- Created `gitlab.ts`: `glab mr create --target-branch <branch>`, `glab mr view --web`, `glab mr list` — uses "mr list" not "mr status" (does not exist)
- Created `gitea.ts`: `tea pulls create --base <branch>`, JSON URL extraction for pr open, `tea pulls ls --state open` for status
- Updated `index.ts` to register all three forge integrations
- 39 unit tests across 4 test files — all pass; full suite 682/682 green; typecheck passes

## Task Commits

1. **Task 1: Create GitHub, GitLab, and Gitea integration plugins** — `8776574` (feat — co-committed with Phase 28 research docs)
2. **Task 2: Create unit tests for all three forge integrations** — `91554df` (feat)
3. **Task 2 typecheck fix** — `0786114` (fix — TypeScript strict type errors in test mock call assertions)

## Files Created/Modified

- `src/lib/integrations/github.ts` — GitHub integration plugin; gh pr create/view/status; _exec.run with Bun.spawn
- `src/lib/integrations/gitlab.ts` — GitLab integration plugin; glab mr create/view/list (D-11 pr->mr translation)
- `src/lib/integrations/gitea.ts` — Gitea integration plugin; tea pulls; _exec with run/runCapture/openUrl
- `src/lib/integrations/index.ts` — Registers githubIntegration, gitlabIntegration, giteaIntegration
- `tests/lib/integrations/github.test.ts` — 9 tests: gh pr create/open/status with forge arg verification
- `tests/lib/integrations/gitlab.test.ts` — 9 tests: glab mr create/view/list; confirms "mr list" not "mr status"
- `tests/lib/integrations/gitea.test.ts` — 11 tests: tea pulls create/ls JSON parsing, openUrl, forge arg
- `tests/lib/integration-commands.test.ts` — Added github/gitlab/gitea subcommand structure tests + forge-utils mock

## Decisions Made

- GitLab `pr status` maps to `glab mr list` — `glab mr status` does not exist (verified via official GitLab CLI docs)
- Gitea needs three _exec methods because `pr open` requires JSON parsing (runCapture) while create/status use inherited stdio
- All forge integrations use `order: 50/51/52` — above session integrations (10-30), forge plugins are command-only
- `(mock.calls[0] as any[])[N]` pattern needed for TypeScript strict mode because `mock()` infers call arg tuple as empty

## Deviations from Plan

**1. [Rule 1 - Bug] TypeScript strict mode errors in test mock call assertions**
- **Found during:** Task 2 verification (bun run typecheck after committing tests)
- **Issue:** `mock.calls[0][2]` typed as `undefined` because TypeScript infers mock call args as empty tuple; `mockImplementation(() => ({ok: false,...}))` fails because return type inferred from initial mock return value
- **Fix:** Cast to `(resolveForgeRepoMock.mock.calls[0] as any[])[2]` and use `(mock as any).mockImplementation()` for error cases
- **Files modified:** tests/lib/integrations/github.test.ts, gitlab.test.ts, gitea.test.ts
- **Committed in:** `0786114`

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type system quirk with mock inference)
**Impact on plan:** Minimal — type-only fix, no behavioral changes. Tests still verify same contracts.

## Issues Encountered

- Task 1 files were committed as part of a co-mingled commit with Phase 28 research docs (`8776574`) by a parallel agent. The files are correct; commit message reflects Phase 28 docs work. This is a parallel execution artifact.

## Next Phase Readiness

- All three forge integration plugins ready for `git-stacks integration github pr create <workspace>`
- `resolveForgeRepo` D-14 validation active — mismatched forge produces clear error message
- Integration commands structure tests confirm all three appear as subcommands
- Plans 27-03 and 27-04 can proceed with forge detection and repo add command integration

## Self-Check: PASSED

- FOUND: src/lib/integrations/github.ts
- FOUND: src/lib/integrations/gitlab.ts
- FOUND: src/lib/integrations/gitea.ts
- FOUND: tests/lib/integrations/github.test.ts
- FOUND: tests/lib/integrations/gitlab.test.ts
- FOUND: tests/lib/integrations/gitea.test.ts
- FOUND: .planning/phases/27-git-forge-integrations/27-02-SUMMARY.md
- FOUND commit: 8776574 (plugin files)
- FOUND commit: 91554df (test files)
- FOUND commit: 0786114 (typecheck fix)

---
*Phase: 27-git-forge-integrations*
*Completed: 2026-03-22*
