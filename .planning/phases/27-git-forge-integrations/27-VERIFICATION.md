---
phase: 27-git-forge-integrations
verified: 2026-03-22T17:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 27: Git Forge Integrations Verification Report

**Phase Goal:** Add GitHub, GitLab, and Gitea forge integrations as Integration plugins, each wrapping their respective CLI tool (gh, glab, tea) to create PR/MRs, open them in browser, and check status. Forge type is stored per-repo in the registry. CLI-only (no TUI dashboard actions).
**Verified:** 2026-03-22
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `RepoRegistryEntrySchema` accepts optional `forge` field; existing YAML without it parses cleanly | VERIFIED | `src/lib/config.ts` line 31: `ForgeTypeSchema = z.enum(["github","gitlab","gitea"]).optional()`; line 50: `forge: ForgeTypeSchema` on `RepoRegistryEntrySchema`; 31 config tests pass including 5 forge schema tests |
| 2 | `git-stacks integration github pr create <workspace>` invokes `gh pr create --base <branch>` in the correct repo's task_path | VERIFIED | `src/lib/integrations/github.ts` line 51: `_exec.run(["pr", "create", "--base", baseBranch], repoPath)`; 9 github tests pass including CLI flag assertions |
| 3 | `git-stacks integration gitlab pr create <workspace>` invokes `glab mr create --target-branch <branch>` (pr->mr translation) | VERIFIED | `src/lib/integrations/gitlab.ts` line 52: `_exec.run(["mr", "create", "--target-branch", baseBranch], repoPath)`; uses `glab mr list` not `glab mr status` (which does not exist); 9 gitlab tests pass |
| 4 | `git-stacks integration gitea pr create <workspace>` invokes `tea pulls create --base <branch>` | VERIFIED | `src/lib/integrations/gitea.ts` line 65: `_exec.run(["pulls", "create", "--base", baseBranch], repoPath)`; 11 gitea tests pass |
| 5 | `pr open --web` opens browser; `pr open` prints URL to stdout | VERIFIED | GitHub: `gh pr view --web` (line 66) vs `gh pr view --json url --jq .url` (line 69); GitLab: `glab mr view --web` (line 67); Gitea: JSON parsing + `_exec.openUrl(found.html_url)` (line 103) or `console.log(found.html_url)` (line 105); tests verify both paths |
| 6 | Forge detection at `repo add`/`repo scan` suggests forge from remote URL and CLI availability | VERIFIED | `src/commands/repo.ts` line 50: `detectForgeForRepo(localPath)`; `src/tui/repo-wizard.ts` line 63: `detectForgeForRepo(repo.path)`; auto-selects on single match, prompts on zero or multiple; 9 forge detection tests pass |
| 7 | `git-stacks doctor` checks availability of `gh`, `glab`, `tea` | VERIFIED | `src/commands/doctor.ts` lines 196-218: all three `checkBinary()` calls with warn-level push to `binaryIssues` including install links |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config.ts` | ForgeTypeSchema + forge field on RepoRegistryEntrySchema | VERIFIED | Lines 31-32: ForgeTypeSchema and ForgeType exported; line 50: forge field on schema |
| `src/lib/integrations/forge-utils.ts` | resolveForgeRepo, formatForgeError, detect functions | VERIFIED | 155 lines; exports resolveForgeRepo, formatForgeError, ForgeRepoResolution, ForgeRepoResolutionError, _detect, detectGitHubForge, detectGitLabForge, detectGiteaForge, detectForgeForRepo |
| `src/lib/integrations/github.ts` | GitHub forge integration plugin | VERIFIED | Exports _exec and githubIntegration; commands() registers pr with create/open/status subcommands |
| `src/lib/integrations/gitlab.ts` | GitLab forge integration plugin | VERIFIED | Exports _exec and gitlabIntegration; pr->mr translation throughout; uses glab mr list for status |
| `src/lib/integrations/gitea.ts` | Gitea forge integration plugin | VERIFIED | Exports _exec with run/runCapture/openUrl; JSON parsing for pr open; platform-aware URL opener |
| `src/lib/integrations/index.ts` | Registry with all three forge integrations | VERIFIED | Lines 6-8: imports; line 18: all three in integrations array |
| `src/commands/repo.ts` | Forge detection integrated into repo add | VERIFIED | Line 11: detectForgeForRepo import; lines 50-76: forge detection with auto-select and p.select prompt |
| `src/tui/repo-wizard.ts` | Forge detection integrated into repo scan | VERIFIED | Line 5: detectForgeForRepo import; lines 63-94: forge detection loop with auto-select and p.select prompt |
| `src/commands/doctor.ts` | gh/glab/tea binary checks | VERIFIED | Lines 196-218: all three checkBinary() calls, always pushed to binaryIssues with pass/warn icon |
| `tests/lib/integrations/forge-utils.test.ts` | Unit tests for resolveForgeRepo and detection | VERIFIED | 353 lines; 25 tests in 3 describe blocks covering all resolution scenarios, error variants, and forge detection |
| `tests/lib/integrations/github.test.ts` | GitHub integration unit tests | VERIFIED | 141 lines; 9 tests verifying CLI flags and forge arg |
| `tests/lib/integrations/gitlab.test.ts` | GitLab integration unit tests | VERIFIED | 140 lines; 9 tests; confirms mr list not mr status |
| `tests/lib/integrations/gitea.test.ts` | Gitea integration unit tests | VERIFIED | 188 lines; 11 tests including JSON parsing and openUrl |
| `CHANGELOG.md` | Forge integration documentation | VERIFIED | Lines 24-36: forge feature entries under [Unreleased] Added |
| `README.md` | Forge integration in Integrations section | VERIFIED | Lines 188-190: table rows; lines 229-255: forge documentation section with usage examples |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/integrations/github.ts` | `src/lib/integrations/forge-utils.ts` | `import { resolveForgeRepo, formatForgeError }` | WIRED | Line 3; used in all three pr subcommand actions |
| `src/lib/integrations/gitlab.ts` | `src/lib/integrations/forge-utils.ts` | `import { resolveForgeRepo, formatForgeError }` | WIRED | Line 3; used in all three mr subcommand actions |
| `src/lib/integrations/gitea.ts` | `src/lib/integrations/forge-utils.ts` | `import { resolveForgeRepo, formatForgeError }` | WIRED | Line 3; used in all three pulls subcommand actions |
| `src/lib/integrations/index.ts` | `src/lib/integrations/github.ts` | `import { githubIntegration }` | WIRED | Lines 6, 18: imported and added to integrations array |
| `src/lib/integrations/index.ts` | `src/lib/integrations/gitlab.ts` | `import { gitlabIntegration }` | WIRED | Lines 7, 18: imported and added to integrations array |
| `src/lib/integrations/index.ts` | `src/lib/integrations/gitea.ts` | `import { giteaIntegration }` | WIRED | Lines 8, 18: imported and added to integrations array |
| `src/commands/repo.ts` | `src/lib/integrations/forge-utils.ts` | `import { detectForgeForRepo }` | WIRED | Line 11; called at line 50 in repo add action |
| `src/tui/repo-wizard.ts` | `src/lib/integrations/forge-utils.ts` | `import { detectForgeForRepo }` | WIRED | Line 5; called at line 63 in scan loop |
| `src/lib/integrations/forge-utils.ts` | `src/lib/config.ts` | `imports readWorkspace, workspaceExists, readRegistry` | WIRED | Lines 3-9: all three imported and used in resolveForgeRepo |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| FORGE-01 | 27-01, 27-04 | RepoRegistryEntrySchema accepts optional forge field | SATISFIED | config.ts line 50; ForgeTypeSchema is z.enum().optional() |
| FORGE-02 | 27-01 | Existing registry YAML without forge field parses cleanly | SATISFIED | .optional() on ForgeTypeSchema means undefined is valid; config.test.ts has backward compat test |
| FORGE-03 | 27-01 | resolveForgeRepo resolves workspace+repo context | SATISFIED | forge-utils.ts lines 30-77; auto-selects single worktree, errors on multiple without repoArg |
| FORGE-04 | 27-02, 27-04 | GitHub integration plugin implements Integration interface with commands() | SATISFIED | github.ts: full Integration interface implementation with pr create/open/status subcommands |
| FORGE-05 | 27-02 | GitLab plugin translates pr to mr terminology | SATISFIED | gitlab.ts: all glab CLI calls use "mr" not "pr"; comments document D-11 translation |
| FORGE-06 | 27-02, 27-04 | Gitea plugin handles pr open via JSON parsing of tea pulls ls | SATISFIED | gitea.ts lines 81-106: runCapture + JSON.parse + head.ref matching + html_url print/openUrl |
| FORGE-07 | 27-02 | All forge CLI invocations use stdio: "inherit" for interactive pass-through | SATISFIED | github.ts/gitlab.ts/gitea.ts: all Bun.spawn calls use stdin/stdout/stderr: "inherit" |
| FORGE-08 | 27-02 | Each forge plugin exports _exec object for injectable shell commands | SATISFIED | github.ts exports _exec.run; gitlab.ts exports _exec.run; gitea.ts exports _exec with run/runCapture/openUrl |
| FORGE-09 | 27-02, 27-04 | pr create passes base branch via correct flags for each forge | SATISFIED | gh: --base; glab: --target-branch; tea: --base; all resolved from workspace repo's base_branch/registry default_branch |
| FORGE-10 | 27-03 | Forge detection at repo add/scan | SATISFIED | repo.ts lines 50-76; repo-wizard.ts lines 63-94; both implement D-05 auto-select/prompt logic |
| FORGE-11 | 27-01 | Missing forge or no forge configured produces clear error | SATISFIED | forge-utils.ts lines 61-72: forge_not_configured error; formatForgeError lines 149-152: actionable messages |
| FORGE-12 | 27-02 | All three forge integrations registered in index.ts | SATISFIED | index.ts lines 6-8, 18: all three imported and in integrations array |
| FORGE-13 | 27-03, 27-04 | git-stacks doctor checks gh/glab/tea availability | SATISFIED | doctor.ts lines 196-218: three checkBinary() calls with install links |

**No orphaned requirements** — all 13 FORGE requirements claimed by plans and verified in implementation.

### Anti-Patterns Found

No blockers or warnings found.

- No TODO/FIXME/placeholder comments in forge implementation files
- No stub implementations (empty returns, hardcoded data without queries)
- All three forge plugins: _exec objects are real Bun.spawn wrappers, not placeholders
- forge-utils.ts: detection functions use real shell commands via injectable _detect (not hardcoded results)
- repo.ts and repo-wizard.ts: forge field flows through to writeRegistry() — data is persisted, not discarded
- doctor.ts: forge checks always push to binaryIssues (pass or warn) — results appear in output

### Human Verification Required

The following items require human testing with actual forge CLI tools installed:

#### 1. End-to-end GitHub PR creation

**Test:** In a workspace with a GitHub repo (forge: github), run `git-stacks integration github pr create <workspace>`
**Expected:** `gh pr create --base <base-branch>` launches interactively in the repo's task_path directory
**Why human:** Requires gh CLI, GitHub authentication, and a real workspace with a GitHub repo registered

#### 2. GitLab MR pr->mr translation in practice

**Test:** In a workspace with a GitLab repo (forge: gitlab), run `git-stacks integration gitlab pr create <workspace>`
**Expected:** `glab mr create --target-branch <branch>` launches — NOT `glab pr create`
**Why human:** Requires glab CLI and GitLab authentication to confirm the translation works end-to-end

#### 3. Gitea pr open URL extraction

**Test:** In a workspace with a Gitea repo that has an open PR, run `git-stacks integration gitea pr open <workspace>`
**Expected:** URL printed to stdout matches the PR URL; `--web` opens browser at the URL
**Why human:** Requires tea CLI, Gitea instance, and a real PR to verify JSON field matching works against actual tea output format

#### 4. Forge detection accuracy at repo add

**Test:** Run `git-stacks repo add <path-to-github-repo>` with gh installed
**Expected:** `Detected forge: github` logged automatically without prompt; registry YAML has `forge: github`
**Why human:** Requires gh installed and a repo with github.com remote to confirm auto-selection behavior

#### 5. Doctor output with forge CLIs absent

**Test:** On a machine without gh, glab, tea installed, run `git-stacks doctor`
**Expected:** Runtime dependencies section shows three warn entries for gh/glab/tea with install URLs
**Why human:** Requires a machine without those CLIs to confirm warn entries appear and are readable

---

## Gaps Summary

None — all phase goals verified as achieved.

All seven success criteria are met:
1. Schema change is backward compatible and validated by 31 passing tests
2. GitHub CLI invocation with correct flags verified by 9 tests
3. GitLab pr->mr translation verified by 9 tests (including explicit mr list vs mr status check)
4. Gitea JSON-based URL extraction verified by 11 tests
5. pr open with and without --web verified for all three forges
6. Forge detection wired into both repo add and repo scan with auto-select and prompt logic
7. Doctor binary checks for all three forge CLIs wired and always shown (pass/warn)

Full test suite: 682 pass / 0 fail. Type checking: clean.

---

_Verified: 2026-03-22_
_Verifier: Claude (gsd-verifier)_
