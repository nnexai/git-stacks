# Phase 1: Foundation - Research

**Researched:** 2026-03-17
**Domain:** TypeScript CLI hardening — config resilience, git integration tests, atomicity bugs, prerequisite checks
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test infrastructure**
- `makeGitRepo()` creates a local-only git repo: `git init`, configure `user.email`/`user.name`, create an initial commit on main. No remote or bare repo needed — worktree operations are purely local.
- `makeGitRepo()` is added to `tests/helpers.ts` alongside existing `makeTmpDir`, `cleanup`, `mkdir`, `touch`, `write` helpers.
- Git primitive tests go in `tests/lib/git.test.ts` (new file, mirrors `src/lib/git.ts`).
- Workspace lifecycle tests go in `tests/lib/workspace-ops.test.ts` (new file, mirrors `src/lib/workspace-ops.ts`).
- TEST-03 approach: full integration — set up real git repos + workspace YAML fixtures, call `workspace-ops` functions directly. This is the approach that catches the known partial-failure bugs.

**schema_version**
- Add `schema_version: z.string().default('1')` to both `StackSchema` and `WorkspaceSchema` in `src/lib/config.ts`.
- Existing user YAML files without the field parse as version 1 via the default — no breakage.
- Document migration strategy as an inline comment in `config.ts` (no separate ADR doc).
- CONF-02 enforcement: add a schema shape test in `config.test.ts` that parses a minimal YAML (only currently-required fields present). Any new required field without a `.default()` breaks this test before CI passes.

**BUG-04 merge safety (mergeNoFF)**
- Fix via temp worktree using detached HEAD: `git worktree add --detach <tmp-path> <base-branch-sha>`.
- Detached HEAD approach avoids the branch-already-in-use error when the base branch is checked out in another worktree.
- Run `mergeNoFF` in the temp worktree, then remove it. Main clone HEAD is never touched.

**Atomic destructive operations (BUG-01, BUG-02, BUG-03)**
- All three fixes use the same collect-verify-execute pattern: collect all operations, verify pre-conditions, then execute. State (workspace YAML) is not permanently mutated until all operations succeed.
- `mergeWorkspace`: YAML deleted only after all repo merges succeed.
- `removeWorkspace`/`cleanWorkspace`: stage then commit — full operation succeeds or nothing is written.
- `renameWorkspace`: re-register via `git worktree remove` + `git worktree add` at new path, then rename YAML — not a bare filesystem rename.

**Error message format**
- CONF-04: Write a small `formatZodError(err: ZodError): string` utility that produces field-path messages: `repos[0].path: expected string, got undefined`. Used in all YAML read functions where `.parse()` is called.
- PREREQ-01 install instruction: generic message only — `git >= 2.24 required. Visit https://git-scm.com to install.` No OS-specific platform detection.
- PREREQ-01 check location: on startup in `src/index.ts`, before any command runs. Fail fast with clear message.

### Claude's Discretion
- Exact structure of the `formatZodError` utility (standalone function vs helper class)
- `getCommitsBehind` implementation approach for TEST-02 (the function doesn't yet exist in `git.ts`)
- Specific temp path naming strategy for detached HEAD worktrees
- Order of prerequisite checks (git version vs integration binary checks)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | `makeGitRepo(tmpDir)` helper creates a real local git repo | Bun `$` shell pattern; `tests/helpers.ts` structure confirmed — extend with git init sequence |
| TEST-02 | Core git operations (createWorktree, removeWorktree, mergeNoFF, rebaseBranch, getCommitsBehind) have integration test coverage | All five functions exist in `src/lib/git.ts`; `getCommitsBehind` already implemented; test patterns from existing test files |
| TEST-03 | Workspace lifecycle critical paths have integration tests catching partial-failure bugs | `workspace-ops.ts` functions are directly callable; process.env.HOME redirect pattern isolates config; real git repos needed |
| CONF-01 | Corrupt/invalid YAML skipped with stderr warning, no crash | `listStacks()` and `listWorkspaces()` call `readYaml` which throws; wrap with `safeParse` + catch to skip |
| CONF-02 | New schema fields must use `.optional()` or `.default()` — enforced by CI test | Minimal-YAML parse test in `config.test.ts` catches any new bare required field |
| CONF-03 | `schema_version` field added to Stack and Workspace schemas | `z.string().default('1')` on both `StackSchema` and `WorkspaceSchema` |
| CONF-04 | Zod validation errors surface as human-readable field-level messages | `ZodError.issues` array has `path` and `message`; format into `path.join('.'): message` strings |
| PREREQ-01 | Startup git version check with clear error if < 2.24 | `git --version` output parsed via regex; check in `src/index.ts` before `program.parse()` |
| PREREQ-02 | Each integration checks for required binary before generating artifacts | Integration `applies()` or `open()` wraps binary check; missing binary causes graceful skip |
| PREREQ-03 | `doctor` reports missing runtime dependencies with install commands | Extend existing `doctorCommand` with binary checks for `code`, `code-insiders`, `idea`, `tmux`, `cmux` |
| BUG-01 | `mergeWorkspace` is atomic — YAML not deleted until all merges succeed | Current code: `unlinkSync(workspacePath(name))` happens mid-flow; move after all merges complete |
| BUG-02 | `removeWorkspace`/`cleanWorkspace` stage-then-commit pattern | Current code removes worktrees then `unlinkSync`; restructure to collect ops, execute all, then mutate state |
| BUG-03 | `renameWorkspace` uses git worktree re-registration not filesystem rename | Current code uses `renameSync(oldTaskDir, newTaskDir)` — replace with remove+add worktree pattern |
| BUG-04 | `mergeNoFF` uses detached HEAD temp worktree — does not touch main clone HEAD | Current `mergeNoFF` does `git checkout baseBranch` on main clone — replace with temp worktree approach |
</phase_requirements>

## Summary

Phase 1 is a hardening phase on an existing TypeScript CLI codebase (`git-stacks`) built with Bun. The code is already functional but has four classes of known weaknesses: config reads that can throw on malformed YAML, no integration tests for git operations, atomicity bugs in destructive workspace operations, and missing startup prerequisite checks.

All decisions are locked and prescriptive. The work is codebase-internal — no new dependencies are required. The main technical challenges are (1) writing `makeGitRepo()` that produces a properly configured git repo suitable for worktree operations, (2) fixing `mergeNoFF` to use a detached HEAD temp worktree rather than checking out on the main clone, and (3) applying the collect-verify-execute atomicity pattern consistently across `mergeWorkspace`, `removeWorkspace`/`cleanWorkspace`, and `renameWorkspace`.

The test framework is Bun's built-in `bun:test` with Jest-compatible API. All existing tests use real temp directories — no mocking library needed. New tests for git operations run real git commands and require git to be installed in the CI environment (which matches existing practice: "shell commands not mocked").

**Primary recommendation:** Work in five focused units — (1) test helpers + git tests, (2) workspace-ops tests, (3) config resilience, (4) prerequisite checks, (5) atomicity bug fixes — each unit independently verifiable.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:test | built-in | Test runner + assertions | Already used across all 5 test files; Jest-compatible API |
| zod | ^3.25.76 | Schema validation + safe parsing | Already the schema layer for all YAML; `safeParse` used in integrations |
| yaml | ^2.8.2 | YAML parse/stringify | Already the YAML I/O library |
| bun `$` | built-in | Shell operations for git commands | All git ops use this pattern; `.quiet().nothrow()` + exitCode checks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (Node built-in) | built-in | `existsSync`, `unlinkSync`, `mkdirSync` | All file-system operations in `workspace-ops.ts` |
| path (Node built-in) | built-in | `join`, `dirname` | All path construction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bun `$` for git ops | execa, child_process | Bun `$` is already used everywhere; switching adds no value |
| ZodError formatting by hand | zod-error npm package | Hand-rolled `formatZodError` is 10 lines and zero new dependencies |
| Real git repos for tests | mock-git | Real git is already assumed available; mocking adds complexity without isolation benefit |

**Installation:** No new packages needed for Phase 1. All work uses existing dependencies.

## Architecture Patterns

### Recommended Project Structure
No structural changes needed. New files slot into existing layout:
```
tests/
  helpers.ts                      # ADD: makeGitRepo() here
  lib/
    git.test.ts                   # NEW: integration tests for src/lib/git.ts
    workspace-ops.test.ts         # NEW: integration tests for src/lib/workspace-ops.ts
    config.test.ts                # EXTEND: add minimal-YAML shape test + corrupt-YAML tests
src/
  index.ts                        # EXTEND: prerequisite check before program.parse()
  lib/
    config.ts                     # EXTEND: safeParse in listStacks/listWorkspaces, schema_version field, formatZodError
    git.ts                        # EXTEND: mergeNoFF rewritten with detached HEAD approach
    workspace-ops.ts              # EXTEND: atomicity fixes for merge/remove/clean/rename
    integrations/
      vscode.ts                   # EXTEND: applies() binary check for PREREQ-02
      intellij.ts                 # EXTEND: applies() binary check for PREREQ-02
      cmux.ts                     # EXTEND: applies() binary check for PREREQ-02
      tmux.ts                     # EXTEND: applies() binary check for PREREQ-02
  commands/
    doctor.ts                     # EXTEND: binary presence checks for PREREQ-03
```

### Pattern 1: makeGitRepo() Helper
**What:** Creates a real local git repo in a temp directory with one commit on `main`, configured user identity, and no remote.
**When to use:** Any test that exercises createWorktree, removeWorktree, mergeNoFF, rebaseBranch, or workspace-ops functions.
**Example:**
```typescript
// tests/helpers.ts — extend existing helpers
import { execSync } from "child_process"

export async function makeGitRepo(tmpDir: string, name = "repo"): Promise<string> {
  const repoPath = join(tmpDir, name)
  mkdirSync(repoPath, { recursive: true })
  // Configure identity first — required for commits in isolated environments
  execSync("git init -b main", { cwd: repoPath })
  execSync('git config user.email "test@example.com"', { cwd: repoPath })
  execSync('git config user.name "Test"', { cwd: repoPath })
  writeFileSync(join(repoPath, "README.md"), "init\n")
  execSync("git add .", { cwd: repoPath })
  execSync('git commit -m "init"', { cwd: repoPath })
  return repoPath
}
```
Note: Use `execSync` (not Bun `$`) in helpers.ts because helpers are synchronous. Test bodies are async and use Bun `$` freely.

### Pattern 2: safeParse + stderr Warning in list functions
**What:** Wrap YAML reads in `listStacks` and `listWorkspaces` with `.safeParse()` — log to stderr and skip invalid entries rather than throwing.
**When to use:** Any list/scan operation that iterates over user config files.
**Example:**
```typescript
// src/lib/config.ts — updated listStacks
export function listStacks(): Stack[] {
  if (!existsSync(STACKS_DIR)) return []
  const results: Stack[] = []
  for (const f of readdirSync(STACKS_DIR).filter((f) => f.endsWith(".yml"))) {
    const name = f.replace(".yml", "")
    try {
      const raw = readFileSync(stackPath(name), "utf-8")
      const parsed = StackSchema.safeParse(parse(raw))
      if (parsed.success) {
        results.push(parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt stack '${name}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable stack '${name}': ${err}`)
    }
  }
  return results
}
```

### Pattern 3: Collect-Verify-Execute for Atomic Operations
**What:** Gather all operations needed, verify all pre-conditions, then execute. Mutate state (YAML delete/write) only after all git operations succeed.
**When to use:** `mergeWorkspace`, `removeWorkspace`, `cleanWorkspace`, `renameWorkspace`.
**Example (mergeWorkspace fix):**
```typescript
// After all mergeNoFF calls succeed — move unlinkSync to here
for (const { repo, baseBranch } of repoBases) {
  const result = await mergeNoFF(repo.main_path, baseBranch, workspace.branch)
  if (!result.ok) return { ok: false, error: `Merge failed for ${repo.name}: ${result.error}` }
  onProgress?.(`merged  ${repo.name}  →  ${baseBranch}`)
}
// Only delete YAML after all merges succeed
unlinkSync(workspacePath(name))
```

### Pattern 4: Detached HEAD Temp Worktree for mergeNoFF
**What:** Instead of `git checkout baseBranch` on the main clone, create a temporary worktree at a detached HEAD pointing to base branch's SHA, perform the merge there, then remove it.
**When to use:** `mergeNoFF` in `src/lib/git.ts`.
**Example:**
```typescript
// src/lib/git.ts — rewritten mergeNoFF
export async function mergeNoFF(
  repoPath: string,
  baseBranch: string,
  branch: string
): Promise<{ ok: boolean; error?: string }> {
  // Resolve base branch SHA — needed for --detach
  const shaResult = await $`git -C ${repoPath} rev-parse ${baseBranch}`.quiet().nothrow()
  if (shaResult.exitCode !== 0) {
    return { ok: false, error: `Cannot resolve ${baseBranch}: ${shaResult.stderr}` }
  }
  const baseSha = shaResult.stdout.toString().trim()

  // Temp worktree path — named to avoid collision
  const tmpPath = join(repoPath, `../.gs-merge-${Date.now()}`)

  // Add detached worktree at base SHA
  const addResult = await $`git -C ${repoPath} worktree add --detach ${tmpPath} ${baseSha}`.quiet().nothrow()
  if (addResult.exitCode !== 0) {
    return { ok: false, error: `Cannot create temp worktree: ${addResult.stderr}` }
  }

  try {
    const mergeResult = await $`git -C ${tmpPath} merge --no-ff ${branch}`.quiet().nothrow()
    if (mergeResult.exitCode !== 0) {
      // Abort merge in temp worktree before removing it
      await $`git -C ${tmpPath} merge --abort`.quiet().nothrow()
      return { ok: false, error: mergeResult.stderr.toString().trim() }
    }
    return { ok: true }
  } finally {
    // Always clean up temp worktree
    await $`git -C ${repoPath} worktree remove ${tmpPath} --force`.quiet().nothrow()
  }
}
```

### Pattern 5: formatZodError Utility
**What:** Converts a Zod `ZodError` into a human-readable string with field paths.
**When to use:** Any `safeParse` result that has `success: false`.
**Example:**
```typescript
// src/lib/config.ts — add near top of file
import type { ZodError } from "zod"

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join(".")
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join("; ")
}
```

### Pattern 6: Startup Git Version Check
**What:** Parse `git --version` output, compare semver components, exit with clear message if below 2.24.
**When to use:** `src/index.ts`, before `program.parse()`.
**Example:**
```typescript
// src/index.ts — add before program.parse()
async function checkGitVersion(): Promise<void> {
  const result = await $`git --version`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error("git-stacks: git is not installed. Visit https://git-scm.com to install.")
    process.exit(1)
  }
  // "git version 2.39.2" → ["2", "39", "2"]
  const match = result.stdout.toString().match(/(\d+)\.(\d+)/)
  if (!match) return // Cannot parse version — allow proceeding
  const [major, minor] = [parseInt(match[1]), parseInt(match[2])]
  if (major < 2 || (major === 2 && minor < 24)) {
    console.error(`git-stacks: git >= 2.24 required (found ${match[0]}). Visit https://git-scm.com to install.`)
    process.exit(1)
  }
}

await checkGitVersion()
program.parse()
```

### Pattern 7: Integration Binary Check for PREREQ-02
**What:** Each integration's `applies()` (or `open()`) checks whether its required binary is available using `which` before proceeding.
**When to use:** vscode, intellij, cmux, tmux integrations.
**Example (adding to vscode integration):**
```typescript
// src/lib/integrations/vscode.ts
applies: async (workspace: Workspace) => {
  const { cmd } = getConfig(ctx) // NOTE: cmd known at runtime only
  // Binary check done in open() where config is available
},

async open(ctx, artifactPath) {
  if (!artifactPath) return
  const { cmd } = getConfig(ctx)
  const check = await $`which ${cmd}`.quiet().nothrow()
  if (check.exitCode !== 0) {
    // Debug-level note, not an error
    return
  }
  await $`${cmd} ${artifactPath}`.quiet().nothrow()
},
```
Note: For integrations where the binary is a fixed string (not user-configurable), add the check to `applies()`. For vscode where `cmd` is user-configurable, add to `open()`.

### Anti-Patterns to Avoid
- **Throwing in list functions:** `listStacks()` and `listWorkspaces()` currently call `readYaml()` which throws on invalid YAML — never propagate throws in bulk-read loops.
- **Mutating state before all operations succeed:** `mergeWorkspace` currently calls `unlinkSync` before post_merge hooks have run on success — always write state changes last.
- **`git checkout` on main clone in mergeNoFF:** The existing `mergeNoFF` does `git -C ${repoPath} checkout ${baseBranch}` — this leaves the main clone on a different branch if the merge fails.
- **Filesystem rename for worktree dirs:** `renameSync(oldTaskDir, newTaskDir)` moves the directory but does not update git's internal worktree registration — git still tracks the old path, causing drift detected by `git worktree list`.
- **Using `execSync` in async test bodies:** Use Bun `$` in test bodies; reserve `execSync` for synchronous helper setup functions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zod error formatting | Custom error class | `formatZodError(err: ZodError): string` utility from `err.issues` | Zod's `issues` array already has `path` and `message` — 8 lines is enough |
| Git version semver comparison | semver library | Regex + integer comparison on `git --version` output | Only need major.minor; full semver library is overkill |
| Binary existence check | Shell script | `which <cmd>` via Bun `$` with `.quiet().nothrow()` | Follows existing pattern; cross-platform enough for this tool's target environments |
| Temp path uniqueness | UUID library | `Date.now()` suffix (same as `makeTmpDir`) | Existing pattern in `tests/helpers.ts`; collision risk negligible in single-process execution |

**Key insight:** The codebase already has all the patterns needed. Phase 1 is about applying them consistently to currently-unguarded paths, not introducing new approaches.

## Common Pitfalls

### Pitfall 1: `git init` Default Branch Name
**What goes wrong:** On some git versions/configs, `git init` creates a `master` branch, not `main`. Tests that hard-code `main` as the branch name will fail in these environments.
**Why it happens:** git >= 2.28 allows user-configurable `init.defaultBranch`; older git defaults to `master`.
**How to avoid:** Use `git init -b main` (requires git 2.28+) or follow with `git checkout -b main`. Since the project requires git >= 2.24, use `git symbolic-ref HEAD refs/heads/main` immediately after `git init` as a portable workaround for versions 2.24–2.27.
**Warning signs:** Tests pass locally but fail on CI with "branch 'main' not found".

### Pitfall 2: Worktree Operations Require At Least One Commit
**What goes wrong:** `git worktree add` fails on a fresh `git init` repo with no commits ("fatal: Not a valid object name").
**Why it happens:** git cannot create a worktree on a branch that has no commits (the branch itself doesn't exist as a real ref yet).
**How to avoid:** `makeGitRepo()` MUST create an initial commit before returning. The locked decision specifies this.
**Warning signs:** `createWorktree` tests fail with "fatal: Not a valid object name" or "fatal: invalid reference".

### Pitfall 3: `process.env.HOME` Mutation Leaks Between Tests
**What goes wrong:** `workspace-ops.test.ts` sets `process.env.HOME = tmp` in `beforeEach`. If a test throws before `afterEach` runs (unlikely with bun:test but possible), subsequent tests see the wrong HOME.
**Why it happens:** Bun test runs in a single process; env mutations persist until explicitly reversed.
**How to avoid:** Always restore in `afterEach`. Also use `await import()` (dynamic import) for any module whose path constants are computed at import time — including `config.ts` and `paths.ts`. Store original HOME before mutating: `const origHome = process.env.HOME`.
**Warning signs:** Tests pass individually (`bun test tests/lib/workspace-ops.test.ts`) but fail when run together (`bun test tests/`).

### Pitfall 4: Detached HEAD Worktree Cleanup on Merge Failure
**What goes wrong:** If `git worktree remove` in the `finally` block fails (e.g., the temp path has uncommitted changes from a failed merge), the temp worktree directory is left on disk.
**Why it happens:** A failed merge leaves the working tree dirty; `git worktree remove` refuses to remove dirty worktrees without `--force`.
**How to avoid:** Always use `git worktree remove --force` in the finally block. The merge was already aborted before reaching cleanup, so no data to preserve.
**Warning signs:** `.gs-merge-*` directories accumulate in the parent of the repo path.

### Pitfall 5: ZodError on Partially Valid YAML
**What goes wrong:** CONF-01 test sets up a YAML file that is syntactically valid but fails Zod schema validation (e.g., wrong type for a field). The current `readYaml` calls `schema.parse(parse(raw))` — `parse(raw)` succeeds (valid YAML), but `schema.parse()` throws a `ZodError`. The safeParse wrapper must catch both `SyntaxError` (from yaml parser) and `ZodError` (from Zod).
**Why it happens:** The `try/catch` in `listStacks` needs to cover the Zod validation step, not just the YAML parse step.
**How to avoid:** Use `StackSchema.safeParse(parse(raw))` — this handles Zod errors without throwing. Keep a separate try/catch around `readFileSync + parse(raw)` for YAML syntax errors and file I/O errors.
**Warning signs:** The corrupted-YAML test succeeds for syntax errors but crashes on schema validation errors.

### Pitfall 6: renameWorkspace Re-registration with Trunk Repos
**What goes wrong:** `renameWorkspace` needs to re-register worktrees for `mode === "worktree"` repos only. Trunk repos don't have worktrees to re-register — their `task_path` equals `main_path` and is not moved.
**Why it happens:** The current `renameSync(oldTaskDir, newTaskDir)` moves the entire tasks directory, affecting all repos. The replacement (worktree remove + add) must loop only over worktree-mode repos.
**How to avoid:** Filter `workspace.repos.filter(r => r.mode === 'worktree')` before the re-registration loop.
**Warning signs:** Trunk repos appear with stale `task_path` values after rename.

### Pitfall 7: mergeNoFF Return Type Change
**What goes wrong:** The current `mergeNoFF` signature is `Promise<void>` (throws on failure). The replacement returns `Promise<{ ok: boolean; error?: string }>`. Callers in `mergeWorkspace` must be updated to check `.ok` instead of catching exceptions.
**Why it happens:** Changing the function signature without updating callers causes TypeScript errors only if strict null checks catch it — the existing call site `await mergeNoFF(...)` ignores the return value.
**How to avoid:** Update `mergeWorkspace` to `const result = await mergeNoFF(...)` and check `result.ok`. TypeScript `noUnusedLocals` will NOT catch this — the return value is just discarded. Manual review required.
**Warning signs:** Merge failures no longer surface as errors to the user despite the fix being in place.

## Code Examples

### makeGitRepo helper (tests/helpers.ts)
```typescript
// Source: derived from existing makeTmpDir pattern in tests/helpers.ts
import { execSync } from "child_process"

export function makeGitRepo(base: string, name = "repo"): string {
  const repoPath = join(base, name)
  mkdirSync(repoPath, { recursive: true })
  // -b main: set default branch name regardless of user git config
  execSync("git init -b main", { cwd: repoPath, stdio: "pipe" })
  execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: "pipe" })
  execSync('git config user.name "Test User"', { cwd: repoPath, stdio: "pipe" })
  writeFileSync(join(repoPath, "README.md"), "init\n")
  execSync("git add .", { cwd: repoPath, stdio: "pipe" })
  execSync('git commit -m "init"', { cwd: repoPath, stdio: "pipe" })
  return repoPath
}
```

### git.test.ts structure
```typescript
// Source: mirrors existing test file structure from tests/lib/detect.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { makeTmpDir, cleanup, makeGitRepo } from "../helpers"
import { createWorktree, removeWorktree, isWorktreeRegistered, rebaseBranch, getCommitsBehind } from "../../src/lib/git"

describe("createWorktree", () => {
  let tmp: string
  let repoPath: string

  beforeEach(() => {
    tmp = makeTmpDir("git-test")
    repoPath = makeGitRepo(tmp)
  })
  afterEach(() => cleanup(tmp))

  test("creates worktree for new branch", async () => {
    const wtPath = join(tmp, "worktrees", "feature-x")
    await createWorktree(repoPath, wtPath, "feature/x")
    expect(await isWorktreeRegistered(repoPath, wtPath)).toBe(true)
  })
})
```

### Minimal-YAML shape test (CONF-02 enforcement)
```typescript
// Source: pattern from tests/lib/config.test.ts — add to StackSchema describe block
test("minimal YAML (no optional fields) still parses — CONF-02 guard", () => {
  // If any new required field (without .default()) is added to StackSchema,
  // this test will throw a ZodError and CI will fail before release.
  expect(() =>
    StackSchema.parse({ name: "minimal" })
  ).not.toThrow()
  expect(() =>
    WorkspaceSchema.parse({ name: "w", branch: "main", created: "2026-01-01" })
  ).not.toThrow()
})
```

### formatZodError utility
```typescript
// Source: Zod documentation — ZodError.issues structure
import type { ZodError } from "zod"

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join(".")
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join("; ")
}
```

### Doctor binary check (PREREQ-03)
```typescript
// Source: mirrors existing $ pattern in doctor.ts
async function checkBinary(cmd: string): Promise<boolean> {
  const result = await $`which ${cmd}`.quiet().nothrow()
  return result.exitCode === 0
}

// In doctorCommand action:
const binaries = [
  { name: "git", install: "https://git-scm.com" },
  { name: "code", install: "https://code.visualstudio.com" },
  { name: "code-insiders", install: "https://code.visualstudio.com/insiders" },
  { name: "idea", install: "https://www.jetbrains.com/idea" },
  { name: "tmux", install: "https://github.com/tmux/tmux" },
  { name: "cmux", install: "https://github.com/nicholasgasior/cmux" },
]

for (const { name, install } of binaries) {
  const found = await checkBinary(name)
  if (!found) {
    issues.push({ icon: "fail", entity: name, message: "not found", fix: `See ${install}` })
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `schema.parse()` in list functions | `schema.safeParse()` + stderr warning | Phase 1 | One bad YAML file no longer crashes all list operations |
| `mergeNoFF` via `git checkout` on main clone | `mergeNoFF` via detached HEAD temp worktree | Phase 1 | Main clone HEAD never changes; merge failures leave no stray branch checkout |
| `renameSync` for worktree dirs | `git worktree remove` + `git worktree add` at new path | Phase 1 | Git's internal worktree registry stays consistent with filesystem |
| `unlinkSync` mid-flow in `mergeWorkspace` | `unlinkSync` only after all git operations succeed | Phase 1 | Partial merge failure leaves workspace YAML intact — recoverable state |
| No startup prerequisite check | `checkGitVersion()` before `program.parse()` | Phase 1 | Clear error message instead of cryptic git command failure |

**Deprecated/outdated:**
- Throwing `mergeNoFF` signature (`Promise<void>`): Replaced with `Promise<{ ok: boolean; error?: string }>` matching the `rebaseBranch` pattern already established.

## Open Questions

1. **`git init -b main` availability in CI**
   - What we know: `-b` flag requires git >= 2.28. The project requires git >= 2.24.
   - What's unclear: The CI environment's git version. If CI has git 2.24-2.27, `git init -b main` will fail silently or error.
   - Recommendation: Use `git init` followed by `git symbolic-ref HEAD refs/heads/main` (portable for 2.24+) OR document that CI must have git >= 2.28. The plan should pick one approach and be consistent.

2. **PREREQ-02: `applies()` vs `open()` as the check point for binary presence**
   - What we know: `applies()` is synchronous in the `Integration` interface; binary checks via `which` are async. `open()` is async.
   - What's unclear: Whether the `Integration` interface should be extended to allow async `applies()`, or whether binary checks should live in `open()` only.
   - Recommendation: Put binary checks in `open()` with an early return — this requires no interface change and is consistent with how `cmux` and `tmux` already handle unavailability (try/catch + spinner stop). For doctor (PREREQ-03), check binaries independently in the doctor command.

3. **Temp worktree path location for BUG-04**
   - What we know: The decision says "Claude's discretion" for specific temp path naming strategy. The example uses `join(repoPath, '../.gs-merge-{timestamp}')`.
   - What's unclear: Whether placing the temp path as a sibling of the repo (in the parent directory) is safe in all workspace layouts (especially when `repoPath` is deep inside a workspace root with limited write permissions).
   - Recommendation: Use `join(repoPath, '../.gs-merge-${Date.now()}')` — the parent directory must be writable since the main clone lives there. Document this assumption with a comment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, Jest-compatible) |
| Config file | none — uses defaults |
| Quick run command | `bun test tests/lib/git.test.ts tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | `makeGitRepo()` creates usable git repo | unit | `bun test tests/lib/git.test.ts -t "makeGitRepo"` | ❌ Wave 0 |
| TEST-02 | createWorktree, removeWorktree, mergeNoFF, rebaseBranch, getCommitsBehind covered | integration | `bun test tests/lib/git.test.ts` | ❌ Wave 0 |
| TEST-03 | mergeWorkspace, removeWorkspace, cleanWorkspace, renameWorkspace with partial failure | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| CONF-01 | Corrupt YAML skipped with warning, valid entries load | unit | `bun test tests/lib/config.test.ts -t "corrupt"` | ✅ (file exists, new tests needed) |
| CONF-02 | Minimal YAML parse test fails if new required field added | unit | `bun test tests/lib/config.test.ts -t "minimal"` | ✅ (file exists, new test needed) |
| CONF-03 | schema_version defaults to '1' on existing YAML | unit | `bun test tests/lib/config.test.ts -t "schema_version"` | ✅ (file exists, new test needed) |
| CONF-04 | ZodError produces field-path message string | unit | `bun test tests/lib/config.test.ts -t "formatZodError"` | ✅ (file exists, new test needed) |
| PREREQ-01 | Startup exits with message when git missing/old | integration | manual / CI pipeline check | N/A — startup code, not unit-testable |
| PREREQ-02 | Integration skips when binary missing | unit | `bun test tests/lib/` (integration plugin tests) | N/A — behavior verified via existing vscode/intellij tests |
| PREREQ-03 | Doctor lists missing binaries with install hints | integration | manual / `bun run src/index.ts doctor` | N/A — CLI command |
| BUG-01 | mergeWorkspace YAML intact after partial merge failure | integration | `bun test tests/lib/workspace-ops.test.ts -t "merge partial failure"` | ❌ Wave 0 |
| BUG-02 | removeWorkspace/cleanWorkspace atomic | integration | `bun test tests/lib/workspace-ops.test.ts -t "remove atomic"` | ❌ Wave 0 |
| BUG-03 | renameWorkspace re-registers worktrees | integration | `bun test tests/lib/workspace-ops.test.ts -t "rename"` | ❌ Wave 0 |
| BUG-04 | mergeNoFF does not checkout on main clone | integration | `bun test tests/lib/git.test.ts -t "mergeNoFF"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/git.test.ts tests/lib/workspace-ops.test.ts tests/lib/config.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/git.test.ts` — covers TEST-01, TEST-02, BUG-04
- [ ] `tests/lib/workspace-ops.test.ts` — covers TEST-03, BUG-01, BUG-02, BUG-03
- [ ] `makeGitRepo()` in `tests/helpers.ts` — prerequisite for all git integration tests

*(Existing `tests/lib/config.test.ts` covers CONF-01 through CONF-04 with new test cases added to the existing file — no new file needed.)*

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `src/lib/git.ts`, `src/lib/config.ts`, `src/lib/workspace-ops.ts`, `src/index.ts`, `src/commands/doctor.ts`, `src/lib/integrations/*.ts` — all patterns confirmed by reading actual source
- Direct inspection of `tests/helpers.ts` and `tests/lib/*.test.ts` — test patterns confirmed
- `.planning/codebase/TESTING.md` and `.planning/codebase/CONVENTIONS.md` — canonical pattern references
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- Zod documentation pattern for `ZodError.issues` — standard Zod API; format utility is a common pattern across Zod-using codebases
- `git worktree add --detach` — documented git behavior; detached HEAD worktree avoids branch-in-use errors

### Tertiary (LOW confidence)
- `git init -b main` availability on git 2.24–2.27: noted as open question requiring CI environment verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries confirmed present in package.json
- Architecture: HIGH — all patterns derived from existing source code, not external references
- Bug fix patterns: HIGH — root causes identified by reading actual workspace-ops.ts code
- Test patterns: HIGH — mirrors existing working test files in the repo
- Pitfalls: HIGH — derived from direct code analysis (actual call sites and their consequences)

**Research date:** 2026-03-17
**Valid until:** 2026-09-17 (stable — no external ecosystem dependencies for Phase 1)
