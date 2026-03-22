---
phase: 27-git-forge-integrations
plan: 03
subsystem: integrations
tags: [forge, github, gitlab, gitea, detection, repo-add, repo-scan, doctor]

# Dependency graph
requires:
  - 27-01 (ForgeTypeSchema, ForgeType, forge field on RepoRegistryEntry)
provides:
  - _detect injectable object for shell command isolation in forge detection tests
  - detectGitHubForge, detectGitLabForge, detectGiteaForge per-forge detection functions
  - detectForgeForRepo aggregation function returning NonNullable<ForgeType>[]
  - Forge detection integrated into repo add (auto-select or prompt)
  - Forge detection integrated into repo scan (auto-select or prompt per repo)
  - Doctor binary checks for gh, glab, tea with warn severity
affects:
  - 27-02 (GitHub PR integration — registry now gets forge field set at registration time)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - _detect injectable pattern: mutable object with which/gitRemoteUrl/teaPullsLs for test isolation
    - Bun.spawn for tea detection: avoids $`cmd`.cwd() which doesn't exist in Bun's shell API
    - D-05 fork: auto-select when exactly 1 match; prompt with p.select when 0 or multiple matches

key-files:
  created: []
  modified:
    - src/lib/integrations/forge-utils.ts
    - src/commands/repo.ts
    - src/tui/repo-wizard.ts
    - src/commands/doctor.ts
    - tests/lib/integrations/forge-utils.test.ts

key-decisions:
  - "Bun.spawn instead of $`tea pulls ls`.cwd() for teaPullsLs — Bun's $ shell template doesn't have .cwd() chain method"
  - "Gitea detection uses teaPullsLs success (not URL matching) — tea login resolves from remote; success means configured login matches"
  - "Zero-forge-match prompt shows all forge options with initialValue:'none' (per D-05) — user can skip easily with Enter"
  - "Doctor forge checks use push to binaryIssues (always included, pass or warn) rather than only pushing when not found"

patterns-established:
  - "_detect injectable pattern applied to forge detection — matches existing _exec pattern in niri.ts, tmux.ts, cmux.ts"

requirements-completed: [FORGE-10, FORGE-13]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 27 Plan 03: Forge Detection in Registration Flow Summary

**Forge detection (gh/glab/tea + remote URL) integrated into repo add/scan with auto-select on single match and p.select prompt on zero/multiple matches; doctor checks gh/glab/tea availability at warn severity**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T16:14:47Z
- **Completed:** 2026-03-22
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `_detect` injectable object with `which`, `gitRemoteUrl`, and `teaPullsLs` shell command hooks to `forge-utils.ts` — matches the existing `_exec` pattern used in niri.ts/tmux.ts/cmux.ts
- Added `detectGitHubForge`, `detectGitLabForge`, `detectGiteaForge`, `detectForgeForRepo` — exported from forge-utils.ts
- GitHub detection: `gh` installed + remote URL contains `github.com`
- GitLab detection: `glab` installed + remote URL contains `gitlab.com` (SaaS only, per Pitfall 4)
- Gitea detection: `tea` installed + `tea pulls ls` exits 0 (URL-agnostic, matches configured tea login)
- `detectForgeForRepo` aggregates all three detectors and returns `NonNullable<ForgeType>[]`
- `repo add`: calls `detectForgeForRepo`, auto-selects and logs when exactly 1 match; prompts `p.select` with detected options (multiple) or all options with `initialValue:"none"` (zero matches)
- `repo scan`: same logic per repo in the registration loop; spinner pauses to show prompt, resumes after selection
- `doctor`: adds gh/glab/tea to binary issue list with `pass` when installed, `warn` with install URL when not installed
- Added 9 new forge detection tests with mocked `_detect` — 25 total in forge-utils.test.ts, all pass
- Full test suite: 648 tests pass, 0 failures, typecheck clean

## Task Commits

Each task committed atomically (TDD: RED then GREEN for Task 1):

1. **Task 1 RED** - `322d968` (test) — failing tests for forge detection functions
2. **Task 1 GREEN** - `a00b439` (feat) — forge detection implementation in forge-utils.ts
3. **Task 2** - `0f612fc` (feat) — forge detection integrated into repo add/scan and doctor checks

## Files Modified

- `src/lib/integrations/forge-utils.ts` — Added `_detect`, `detectGitHubForge`, `detectGitLabForge`, `detectGiteaForge`, `detectForgeForRepo`
- `tests/lib/integrations/forge-utils.test.ts` — Added `describe("forge detection")` with 9 tests, secondary cache-busted import for detection functions
- `src/commands/repo.ts` — Added `detectForgeForRepo` import, forge detection + prompt logic in `repo add` action
- `src/tui/repo-wizard.ts` — Added `detectForgeForRepo` import, forge detection + prompt logic in scan loop
- `src/commands/doctor.ts` — Added gh/glab/tea binary availability checks in doctor action

## Decisions Made

- `Bun.spawn` used for `teaPullsLs` instead of `$\`tea pulls ls\`.cwd()` — Bun's `$` template literal shell does not have a `.cwd()` chain method
- Gitea detection is URL-agnostic (uses `tea pulls ls` success) because tea self-hosted instances can have any domain; URL pattern matching would have high false-negative rate
- Zero-forge-match prompt includes all three forge options with `initialValue:"none"` so users can press Enter to skip without selecting anything — good UX for repos without a forge
- Doctor forge checks always push to `binaryIssues` (with `pass` icon when installed) rather than only on failure — this makes the forge CLIs visible in doctor output even when healthy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bun shell .cwd() doesn't exist**
- **Found during:** Task 1 implementation
- **Issue:** The plan's draft code suggested `$\`tea pulls ls --limit 1\`.quiet().nothrow().cwd(repoPath)` but Bun's `$` shell template API does not have a `.cwd()` chain method
- **Fix:** Used `Bun.spawn(["tea", "pulls", "ls", "--limit", "1"], { cwd: repoPath, stdout: "ignore", stderr: "ignore" })` instead — matching the plan's own corrected example
- **Files modified:** `src/lib/integrations/forge-utils.ts`
- **Commit:** a00b439

**2. [Rule 2 - Missing Critical Behavior] Doctor forge checks always shown (pass/warn)**
- **Found during:** Task 2 implementation
- **Issue:** The plan spec used `push({ icon: ghAvailable ? "pass" : "warn", ... })` but the existing doctor pattern only pushes issues when binary is NOT found. The plan's spec explicitly uses pass/warn icons.
- **Fix:** Followed the plan spec — always push to `binaryIssues` with `"pass"` when installed so forge CLIs are visible in doctor output
- **Files modified:** `src/commands/doctor.ts`
- **Commit:** 0f612fc

## Known Stubs

None — all detection and prompting is fully wired. Registry forge field is set at registration time and flows through to resolveForgeRepo validation in 27-01.

## Self-Check: PASSED

- src/lib/integrations/forge-utils.ts: FOUND
- tests/lib/integrations/forge-utils.test.ts: FOUND (with forge detection describe block)
- src/commands/repo.ts: FOUND (with detectForgeForRepo import and logic)
- src/tui/repo-wizard.ts: FOUND (with detectForgeForRepo import and logic)
- src/commands/doctor.ts: FOUND (with gh/glab/tea checks)
- Commit 322d968: FOUND
- Commit a00b439: FOUND
- Commit 0f612fc: FOUND
