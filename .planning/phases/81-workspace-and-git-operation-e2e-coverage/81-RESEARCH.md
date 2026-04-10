# Phase 81: Workspace and Git Operation E2E Coverage - Research

**Researched:** 2026-04-10
**Domain:** CLI subprocess testing for workspace lifecycle and git-operation commands
**Confidence:** HIGH

## Summary

Phase 81 adds real CLI subprocess E2E coverage for workspace lifecycle (create/clone/list/status/open/close/clean/remove/rename) and git-operation (merge/pull/sync/push/status --fetch) commands. The existing test infrastructure in `tests/commands/` and `tests/helpers.ts` already provides the foundation: `Bun.spawnSync()` for real CLI execution, isolated git and config environments, and fixture builders for disposable repos and workspaces.

The research reveals that:
1. **Existing harness primitives** cover 90% of Phase 81 needs — `makeGitRepo`, `getTestGitEnv`, `applyTestGitEnv`, `makeTmpDir`, fixture YAML writing, and subprocess invocation patterns are all present
2. **Git topology realism** requires extending the existing `sync-json.test.ts` bare-remote pattern to workspace create/clone/merge/pull scenarios
3. **Hidden execution context** (env/hooks/cwd/path) can be proven with probe scripts that write artifacts, mirroring the `env.test.ts` pattern
4. **Risk-focused scenarios** should target the highest-risk assumptions: branch starting points, worktree vs trunk mode behavior, remote-backed operations, and dirty-repo/missing-path guards

**Primary recommendation:** Extend `tests/helpers.ts` with bare-remote builders and probe-script helpers, then structure Phase 81 as 5-7 risk-focused test files in `tests/commands/` covering workspace creation side effects, lifecycle cascading, git operations against real remotes, execution context injection, and error guards.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Create and clone proof strategy:**
- **D-01:** Create and clone coverage should use pre-built fixtures to bypass excluded interactive wizard UX while still verifying real side effects such as workspace YAML, branch starting points, task/main path persistence, and created worktree layout.
- **D-02:** Do not spend Phase 81 effort trying to brute-force interactive create/clone wizard flows in subprocess tests. Prove the resulting behavior instead.

**Scenario granularity:**
- **D-03:** Structure Phase 81 as smaller risk-focused scenarios grouped by behavior domain, not a few giant end-to-end workspace journeys.
- **D-04:** Inventory-to-test mapping should attach to those risk-focused flows (create/clone branch selection, env/hooks/cwd, status/open/run contracts, cleanup/rename/remove, remote-backed git operations) rather than exploding into one brittle mega-scenario.

**Git topology realism:**
- **D-05:** Merge, pull, sync, and push coverage must use disposable local bare remotes plus real clones/worktrees, not simplified single-repo approximations.
- **D-06:** Dir repos, dirty repos, missing remotes/upstreams, and branch-start assumptions must be proven against real filesystem and git state rather than mocks.

**Probes for hidden execution context:**
- **D-07:** Env, hook, cwd, and path behavior should be proven with probe scripts/hooks that write verifiable artifacts into temp dirs/repos.
- **D-08:** Prefer artifact-based proof over stdout-only assertions when validating hidden execution context.
- **D-09:** Reuse Phase 80 harness behavior for diagnostics: passing tests stay quiet by default; failures surface rich debug context with a curated, redacted env subset.

### the agent's Discretion

- Exact test file boundaries and grouping, as long as the suite stays risk-focused instead of becoming a monolithic journey suite.
- Exact helper names and whether new probe helpers live directly in `tests/helpers.ts` or in nearby test-support files that still extend the Phase 80 harness layer.
- Exact artifact formats and probe-script implementations used to prove cwd/env/hook/path behavior.

### Deferred Ideas (OUT OF SCOPE)

- Directly driving interactive `new`/`clone` wizard UX in subprocess E2E tests.
- A monolithic "full workspace journey" suite as the primary coverage model.
- Mock-heavy substitutes for remote-backed git operation proof.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-08 | User-facing workspace flows have E2E coverage for create (via pre-built fixtures)/clone (via pre-built fixtures)/list/status/open (`--no-ide`)/close/cd/clean/remove/rename, run, paths, env, merge, pull/sync/push guards, `status --fetch` (against local bare remote), and JSON/text output contracts where applicable. | Existing `tests/commands/` patterns + new bare-remote fixture helpers support all required flows. Pre-built fixture approach proven by `status-json.test.ts` workspace YAML fixture pattern. |
| E2E-14 | E2E coverage proves high-risk assumptions around env injection, hook execution, command cwd/path selection, workspace branch starting points, task path persistence, and command execution that uses explicit cwd/path handling instead of relying on shell `cd` state. | Probe-script pattern (write artifacts, assert on filesystem) proven by `env.test.ts` secret resolution test. Hook execution proven via post_create/post_open/pre_close hooks that write files. Path selection proven by asserting task_path/main_path in workspace YAML after create/clone. |
</phase_requirements>

## Standard Stack

### Core Test Infrastructure

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:test | latest (Bun built-in) | Test runner and assertion library | Project standard; Jest-compatible API, runs TypeScript directly |
| Bun.spawnSync | latest (Bun built-in) | CLI subprocess execution | Only way to test real CLI with isolated environments; existing pattern in `tests/commands/` |

### Supporting Helpers (Already Present)

| Helper | Location | Purpose | When to Use |
|--------|----------|---------|-------------|
| `makeTmpDir(prefix)` | `tests/helpers.ts` | Create unique `/tmp/{prefix}-{timestamp}-{random}/` | Every test needing disposable filesystem |
| `makeGitRepo(base, name)` | `tests/helpers.ts` | Init real git repo with initial commit | Workspace fixtures needing real repos |
| `getTestGitEnv(baseDir)` | `tests/helpers.ts` | Isolated git environment (HOME, config, GPG) | Any test with real git operations |
| `applyTestGitEnv(baseDir)` | `tests/helpers.ts` | Apply isolated git env to process.env | Tests needing in-process git isolation |
| `cleanup(dir)` | `tests/helpers.ts` | `rmSync` recursive | Every test's `afterEach` |

### New Helpers Needed (Phase 81 Extensions)

| Helper | Purpose | Pattern Source |
|--------|---------|----------------|
| `makeBareRemote(base, name)` | Create bare "origin" repo | Extend `sync-json.test.ts` pattern |
| `makeRepoWithRemote(base, name, branch)` | Clone from bare origin + create worktree | Extend `sync-json.test.ts` pattern |
| `makeWorkspaceFixture(cfgDir, wsName, repos)` | Write workspace YAML with real paths | Extend `status-json.test.ts` pattern |
| `makeProbeHook(artifactPath, envVars)` | Generate hook script that writes env to file | New, based on `env.test.ts` env resolution pattern |
| `runCli(cfgDir, args, opts?)` | Standardized `Bun.spawnSync` wrapper | Extract from existing command tests |

**Installation:** None required — all built into Bun runtime or existing test helpers.

## Architecture Patterns

### Recommended Test File Structure

```
tests/commands/
├── workspace-create-clone.test.ts    # Create/clone side effects (YAML, paths, worktrees)
├── workspace-lifecycle.test.ts       # Open/close/clean/remove/rename cascading
├── workspace-git-ops.test.ts         # Merge/pull/sync/push against bare remotes
├── workspace-execution-context.test.ts # Env/hooks/cwd/path probes
├── workspace-guards.test.ts          # Dirty repo, missing path, dir repo guards
├── workspace-status-fetch.test.ts    # Status --fetch with real remote
├── workspace-json-contracts.test.ts  # JSON output stability
```

**Grouping rationale:**
- `create-clone`: Proves side-effect correctness (workspace YAML matches template, task_path exists, branch created)
- `lifecycle`: Proves cascading behavior (remove → clean → close, merge → clean → close)
- `git-ops`: Proves remote-backed operations with real git topology
- `execution-context`: Proves hidden assumptions (env vars set, hooks run in correct cwd, paths passed correctly)
- `guards`: Proves error cases and validation (dirty check before sync, missing upstream guard, dir repo skip)
- `status-fetch`: Proves `--fetch` updates ahead/behind counts
- `json-contracts`: Proves JSON stability across all `--json` flags

### Pattern 1: Bare Remote + Clone + Worktree Fixture

**What:** Real git topology with local bare "origin", main clone, and workspace worktree branch.

**When to use:** Any test covering merge, pull, sync, push, or remote-backed validation.

**Example:**
```typescript
// Source: tests/commands/sync-json.test.ts (extended)
function makeRepoWithWorktree(
  baseDir: string,
  repoName: string,
  wsBranch: string
): { originDir: string; mainPath: string; taskPath: string } {
  const originDir = join(baseDir, `${repoName}-origin`)
  const mainPath = join(baseDir, `main-${repoName}`)
  const taskPath = join(baseDir, `task-${repoName}`)

  // Create bare origin
  mkdirSync(originDir, { recursive: true })
  execSync("git init --bare -b main", gitExecOptions(originDir, baseDir))

  // Clone origin to mainPath
  execSync(`git clone ${originDir} ${mainPath}`, gitExecOptions(baseDir, baseDir))
  const opts = gitExecOptions(mainPath, baseDir)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test"', opts)
  execSync("git config commit.gpgsign false", opts)
  writeFileSync(join(mainPath, "README.md"), "init")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  execSync("git push origin main", opts)

  // Create worktree for workspace branch
  execSync(`git worktree add ${taskPath} -b ${wsBranch}`, opts)
  const taskOpts = gitExecOptions(taskPath, baseDir)
  execSync('git config user.email "test@example.com"', taskOpts)
  execSync('git config user.name "Test"', taskOpts)
  execSync("git config commit.gpgsign false", taskOpts)

  return { originDir, mainPath, taskPath }
}
```

### Pattern 2: Probe Hook for Execution Context Verification

**What:** Hook script that writes runtime env/cwd to artifact file, then assert on file content.

**When to use:** Proving env injection (GS_WORKSPACE_NAME, GS_REPO_PATH), hook cwd correctness, path handling.

**Example:**
```typescript
// New helper pattern (to add to tests/helpers.ts)
function makeProbeHook(artifactPath: string, envVars: string[]): string {
  const lines = [
    "#!/bin/sh",
    `echo "PWD=\${PWD}" >> "${artifactPath}"`,
    ...envVars.map(v => `echo "${v}=\${${v}}" >> "${artifactPath}"`),
  ]
  return lines.join("\n")
}

// Usage in test:
const probeFile = join(tmpDir, "hook-probe.txt")
const hookScript = makeProbeHook(probeFile, [
  "GS_WORKSPACE_NAME",
  "GS_WORKSPACE_BRANCH",
  "GS_REPO_NAME",
  "GS_REPO_PATH",
])
writeFileSync(join(tmpDir, "probe.sh"), hookScript)
execSync(`chmod +x ${join(tmpDir, "probe.sh")}`)

// Add to workspace YAML: hooks.post_open = ["${tmpDir}/probe.sh"]
// Run `open` command
// Assert: probeFile contains expected env vars
const probe = readFileSync(probeFile, "utf8")
expect(probe).toContain("GS_WORKSPACE_NAME=test-ws")
expect(probe).toContain(`GS_REPO_PATH=${taskPath}`)
```

### Pattern 3: Pre-Built Fixture for Create/Clone Bypass

**What:** Manually write workspace YAML + create repo dirs/worktrees, then test post-creation behavior without invoking wizard.

**When to use:** Testing workspace side effects without wizard interaction (D-01, D-02).

**Example:**
```typescript
// Source: tests/commands/status-json.test.ts (extended)
function setupWorkspaceFixture(tmpDir: string, wsName: string): string {
  const cfgDir = join(tmpDir, "config")
  const wsRoot = join(tmpDir, "workspaces")
  const taskPath = join(wsRoot, "tasks", wsName, "api")

  mkdirSync(join(cfgDir, "workspaces"), { recursive: true })
  makeGitRepo(taskPath) // Real git repo at task_path

  writeFileSync(join(cfgDir, "config.yml"), `workspace_root: ${wsRoot}\n`)
  writeFileSync(join(cfgDir, "registry.yml"), "[]\n")

  const wsYaml = `schema_version: "1"
name: ${wsName}
branch: feat/${wsName}
created: "2024-01-01"
repos:
  - name: api
    repo: api
    type: other
    mode: worktree
    main_path: ${join(wsRoot, "main", "api")}
    task_path: ${taskPath}
    base_branch: main
`
  writeFileSync(join(cfgDir, "workspaces", `${wsName}.yml`), wsYaml)

  return cfgDir
}
```

### Anti-Patterns to Avoid

- **Monolithic journey tests:** Don't create "full_workspace_lifecycle_journey.test.ts" that tests create → open → sync → merge → close → remove in one 500-line test. Split by risk domain instead (D-03).
- **Mock-heavy git topology:** Don't mock `git` or `createWorktree` in E2E tests. Use real git operations against real repos (D-06).
- **Stdout-only execution context probes:** Don't rely on parsing command stdout to verify hook execution. Use probe hooks that write files (D-07, D-08).
- **Wizard subprocess driving:** Don't try to pipe interactive prompts into `git-stacks new` subprocesses. Use pre-built fixtures instead (D-01, D-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git environment isolation | Custom `GIT_AUTHOR_NAME`, `GIT_CONFIG_GLOBAL` env setup per test | `getTestGitEnv()` + `applyTestGitEnv()` from `tests/helpers.ts` | Already handles HOME, XDG_CONFIG_HOME, GNUPGHOME, GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM, GIT_TERMINAL_PROMPT isolation |
| Bare git remote setup | Manual `git init --bare` + `git clone` + `git remote add` wiring | Extend `makeRepoWithWorktree()` from `sync-json.test.ts` | Pattern proven; handles git config (user.email, commit.gpgsign), initial commit, push to origin |
| Workspace YAML fixture | Custom workspace object construction then YAML serialization | Write YAML string directly with real paths from fixture setup | Avoids schema import dependency in test helpers; keeps fixtures lightweight |
| CLI subprocess invocation | Ad-hoc `Bun.spawnSync` with different env/cwd/stdio per test | Shared `runCli(cfgDir, args, opts?)` wrapper | Standardizes `GIT_STACKS_CONFIG_DIR` injection, stdio handling, stdout/stderr decoding |

**Key insight:** The existing test helpers (`tests/helpers.ts`) and command test patterns (`tests/commands/*.test.ts`) already solved most Phase 81 needs. The only missing pieces are bare-remote builders and probe-hook helpers, which extend existing patterns rather than inventing new ones.

## Common Pitfalls

### Pitfall 1: Git env pollution between tests

**What goes wrong:** Tests fail randomly when run together because one test's git config (user.email, commit.gpgsign) leaks into another.

**Why it happens:** `execSync` inherits parent `process.env` unless explicitly overridden; git config written to global paths persists across tests.

**How to avoid:**
1. Always use `applyTestGitEnv(baseDir)` in `beforeEach` to isolate git home
2. Always restore with `restoreGitEnv()` in `afterEach`
3. Always pass `gitExecOptions(cwd, baseDir)` to `execSync` git commands
4. Never write git config to real `~/.gitconfig`

**Warning signs:**
- Test passes in isolation but fails when run with full suite
- Git commit errors about missing user.name or user.email
- Uncommitted signature prompts or GPG errors

### Pitfall 2: Config isolation forgotten

**What goes wrong:** Tests accidentally write to real `~/.config/git-stacks/` or read production workspaces.

**Why it happens:** Test forgot to set `GIT_STACKS_CONFIG_DIR` env var before spawning CLI subprocess.

**How to avoid:**
1. Always pass `GIT_STACKS_CONFIG_DIR: cfgDir` in `env` when spawning CLI
2. Never run CLI tests without isolated config fixture
3. Verify config isolation in shared `runCli` helper

**Warning signs:**
- Test creates files in real config directory
- Test sees production workspaces in `list` output
- Test fails only when run on machine with existing workspaces

### Pitfall 3: Bare remote URL assumptions

**What goes wrong:** Git push/pull fails with "not a git repository" or "no such remote".

**Why it happens:** Bare remote path used as clone URL was relative, moved to different cwd, or deleted before clone.

**How to avoid:**
1. Always use absolute paths for bare remote directories
2. Create bare remote before cloning from it
3. Keep bare remote directory alive for entire test
4. Use `${originDir}` (absolute) not `../origin` (relative) as clone URL

**Warning signs:**
- `git clone` fails with "does not appear to be a git repository"
- `git push origin` fails with "No such remote 'origin'"
- Test passes when repos are in `/tmp` but fails when in nested subdirs

### Pitfall 4: Hook probe race conditions

**What goes wrong:** Probe hook runs but artifact file doesn't exist when test reads it.

**Why it happens:** Hook script writes to artifact file but test reads it before flush/close.

**How to avoid:**
1. Always wait for CLI command to exit before reading artifact
2. Use `Bun.spawnSync` not `Bun.spawn` for hook-invoking commands (sync ensures exit)
3. Add small delay (`await Bun.sleep(50)`) if using async spawn
4. Check artifact exists before reading: `if (!existsSync(probeFile)) fail("hook did not run")`

**Warning signs:**
- Test fails intermittently with "ENOENT: no such file"
- Artifact file exists after test finishes but not when assertion runs
- Adding `await Bun.sleep(100)` makes test pass

### Pitfall 5: Worktree path conflicts

**What goes wrong:** `git worktree add` fails with "already exists and is not an empty directory" or "already checked out".

**Why it happens:** Test created directory at worktree path before calling `git worktree add`, or previous test left worktree registered.

**How to avoid:**
1. Never pre-create worktree target directory
2. Let `git worktree add` create the directory
3. Always cleanup tmp dirs in `afterEach`
4. Use unique tmp dir per test (timestamp + random suffix)

**Warning signs:**
- `git worktree add` fails with "destination path already exists"
- Test passes on first run but fails on second run
- Test leaves behind `/tmp/{prefix}-{old-timestamp}` directories

## Code Examples

Verified patterns from existing codebase and Phase 81 requirements:

### Real CLI Subprocess Test

```typescript
// Source: tests/commands/status-json.test.ts
const PROJECT_ROOT = join(import.meta.dir, "../..")

function runStatus(
  cfgDir: string,
  args: string[],
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "status", ...args],
    {
      env: { ...process.env, ...extraEnv, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}

describe("status --json", () => {
  let tmpDir: string
  let cfgDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("status-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir()
    ;({ cfgDir } = setupFixture(tmpDir))
  })

  afterEach(() => {
    restoreGitEnv?.()
    rmSync(gitEnvDir, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("emits JSON array of workspace objects", () => {
    const { stdout } = runStatus(cfgDir, ["--json"])
    const parsed = JSON.parse(stdout.trim())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toHaveProperty("name", "test-ws")
  })
})
```

### Bare Remote + Workspace Fixture

```typescript
// Source: tests/commands/sync-json.test.ts (extended for Phase 81)
function makeRepoWithWorktree(
  baseDir: string,
  repoName: string,
  wsBranch: string
): { originDir: string; mainPath: string; taskPath: string } {
  const originDir = join(baseDir, `${repoName}-origin`)
  const mainPath = join(baseDir, `main-${repoName}`)
  const taskPath = join(baseDir, `task-${repoName}`)

  // Bare origin
  mkdirSync(originDir, { recursive: true })
  execSync("git init --bare -b main", gitExecOptions(originDir, baseDir))

  // Clone + initial commit + push
  execSync(`git clone ${originDir} ${mainPath}`, gitExecOptions(baseDir, baseDir))
  const opts = gitExecOptions(mainPath, baseDir)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test"', opts)
  execSync("git config commit.gpgsign false", opts)
  writeFileSync(join(mainPath, "README.md"), "init")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  execSync("git push origin main", opts)

  // Worktree for workspace branch
  execSync(`git worktree add ${taskPath} -b ${wsBranch}`, opts)
  const taskOpts = gitExecOptions(taskPath, baseDir)
  execSync('git config user.email "test@example.com"', taskOpts)
  execSync('git config user.name "Test"', taskOpts)
  execSync("git config commit.gpgsign false", taskOpts)

  return { originDir, mainPath, taskPath }
}
```

### Env Resolution E2E Test

```typescript
// Source: tests/commands/env.test.ts
test("resolves secrets with the same runtime env pipeline used by open", () => {
  const { stdout, stderr, exitCode } = runEnv(
    cfgDir,
    ["env-ws", "--format", "json"],
    { GS_SECRET_TEST_VALUE: "resolved-from-env" }
  )

  expect(exitCode).toBe(0)
  expect(stderr).toBe("")

  const parsed = JSON.parse(stdout.trim())
  expect(parsed).toMatchObject({
    API_PORT: "12400",
    API_URL: "https://example.test",
    GS_TRIGGERED_BY: "env",
    GS_WORKSPACE_BRANCH: "feat/env",
    GS_WORKSPACE_NAME: "env-ws",
    SECRET_TOKEN: "resolved-from-env",
  })
})
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (latest, built into Bun runtime) |
| Config file | `bunfig.toml` — preloads `@opentui/solid/preload` for JSX |
| Quick run command | `bun run test:integ` |
| Full suite command | `bun run test` |

**Test runner isolation:** `scripts/test-runner.ts` automatically runs `tests/commands/*.test.ts` in isolated per-file processes because they use `Bun.spawnSync` for subprocess execution.

**No additional setup required:** Phase 81 test files land in `tests/commands/` and inherit existing isolation.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-08 (create) | Pre-built fixture creates workspace YAML, task_path, worktree | integration | `bun test tests/commands/workspace-create-clone.test.ts -x` | ❌ Wave 0 |
| E2E-08 (clone) | Pre-built fixture clones workspace with new branch | integration | `bun test tests/commands/workspace-create-clone.test.ts -x` | ❌ Wave 0 |
| E2E-08 (list) | `list` outputs workspace names and counts | integration | `bun test tests/commands/workspace-list.test.ts -x` | ❌ Wave 0 |
| E2E-08 (status) | `status` shows per-repo dirty/ahead/behind | integration | `bun test tests/commands/status-json.test.ts -x` | ✅ (extend) |
| E2E-08 (open --no-ide) | `open --no-ide` creates worktrees, runs hooks | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |
| E2E-08 (close) | `close` removes workspace state | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |
| E2E-08 (clean) | `clean` removes worktrees but preserves YAML | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |
| E2E-08 (remove) | `remove` cascades clean → close → delete YAML | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |
| E2E-08 (rename) | `rename` updates YAML name and paths | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |
| E2E-08 (run) | `run` executes command in repos with env | integration | `bun test tests/commands/run-parallel.test.ts -x` | ✅ (extend) |
| E2E-08 (paths) | `paths` outputs repo task_path list | integration | `bun test tests/commands/workspace-paths.test.ts -x` | ❌ Wave 0 |
| E2E-08 (env) | `env` resolves secrets and workspace vars | integration | `bun test tests/commands/env.test.ts -x` | ✅ (extend) |
| E2E-08 (merge) | `merge` merges worktree → base, deletes branch | integration | `bun test tests/commands/workspace-git-ops.test.ts -x` | ❌ Wave 0 |
| E2E-08 (pull) | `pull` fast-forwards from remote | integration | `bun test tests/commands/workspace-git-ops.test.ts -x` | ❌ Wave 0 |
| E2E-08 (sync) | `sync` rebases/merges from base branch | integration | `bun test tests/commands/sync-json.test.ts -x` | ✅ (extend) |
| E2E-08 (push) | `push` pushes workspace branch to remote | integration | `bun test tests/commands/workspace-git-ops.test.ts -x` | ❌ Wave 0 |
| E2E-08 (status --fetch) | `status --fetch` updates ahead/behind from remote | integration | `bun test tests/commands/workspace-status-fetch.test.ts -x` | ❌ Wave 0 |
| E2E-08 (JSON contracts) | `--json` flags emit stable JSON schemas | integration | `bun test tests/commands/workspace-json-contracts.test.ts -x` | ❌ Wave 0 |
| E2E-14 (env injection) | Hooks receive GS_WORKSPACE_NAME, GS_REPO_PATH | integration | `bun test tests/commands/workspace-execution-context.test.ts -x` | ❌ Wave 0 |
| E2E-14 (hook cwd) | Hooks run in correct repo cwd | integration | `bun test tests/commands/workspace-execution-context.test.ts -x` | ❌ Wave 0 |
| E2E-14 (path selection) | Commands use explicit cwd/path not shell cd | integration | `bun test tests/commands/workspace-execution-context.test.ts -x` | ❌ Wave 0 |
| E2E-14 (branch starting points) | Workspace repos start from correct base branch | integration | `bun test tests/commands/workspace-create-clone.test.ts -x` | ❌ Wave 0 |
| E2E-14 (task path persistence) | task_path written to YAML survives lifecycle ops | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun run test:integ` — runs all `tests/commands/` in ~5-10 seconds
- **Per wave merge:** `bun run test` — full suite (unit + integration)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/commands/workspace-create-clone.test.ts` — covers E2E-08 create/clone, E2E-14 branch starting points
- [ ] `tests/commands/workspace-lifecycle.test.ts` — covers E2E-08 open/close/clean/remove/rename, E2E-14 task path persistence
- [ ] `tests/commands/workspace-git-ops.test.ts` — covers E2E-08 merge/pull/push
- [ ] `tests/commands/workspace-execution-context.test.ts` — covers E2E-14 env injection, hook cwd, path selection
- [ ] `tests/commands/workspace-guards.test.ts` — covers dirty repo guards, missing path guards, dir repo skips
- [ ] `tests/commands/workspace-status-fetch.test.ts` — covers E2E-08 status --fetch
- [ ] `tests/commands/workspace-json-contracts.test.ts` — covers E2E-08 JSON schema stability
- [ ] `tests/helpers.ts` extensions:
  - `makeBareRemote(base, name)` — bare git origin builder
  - `makeRepoWithRemote(base, name, branch)` — clone + worktree builder
  - `makeProbeHook(artifactPath, envVars)` — hook script generator
  - `runCli(cfgDir, args, opts?)` — standardized CLI subprocess wrapper

**Existing infrastructure covers:** Temp dirs, git env isolation, config isolation, real git repo creation, subprocess execution pattern.

**Test count estimate:** 7 new test files + 3 existing files extended = ~60-80 test cases total (based on 8-12 tests per file average from existing command tests).

## Security Domain

> Phase 81 has no additional security domain beyond existing test infrastructure. Tests run in isolated temp directories with no network access, no external integrations, and no production config/workspace interaction.

**ASVS applicability:** None — testing infrastructure, not production surface.

## Assumptions Log

> All claims in this research were verified against existing codebase patterns, test files, and helper implementations. No assumptions requiring user confirmation.

## Open Questions

None. All research domains have been investigated and verified against existing codebase.

## Environment Availability

> Phase 81 has no external dependencies beyond Bun runtime (already confirmed available in project).

**Skip condition met:** No external tools, services, or runtimes required beyond existing project stack.

## Sources

### Primary (HIGH confidence)

- `tests/helpers.ts` — Verified existing helper implementations (makeTmpDir, makeGitRepo, getTestGitEnv, applyTestGitEnv, useIsolatedConfig)
- `tests/commands/status-json.test.ts` — Verified workspace fixture pattern with real git repos
- `tests/commands/sync-json.test.ts` — Verified bare remote + clone + worktree pattern
- `tests/commands/env.test.ts` — Verified env resolution and subprocess CLI invocation pattern
- `tests/commands/run-parallel.test.ts` — Verified multi-repo command execution pattern
- `scripts/test-runner.ts` — Verified test classification and isolation logic
- `.planning/codebase/TESTING.md` — Verified test architecture documentation
- `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md` — Verified Phase 80 harness decisions
- `.planning/phases/81-workspace-and-git-operation-e2e-coverage/81-CONTEXT.md` — Verified Phase 81 locked decisions
- `.planning/REQUIREMENTS.md` — Verified E2E-08 and E2E-14 requirement definitions
- `CLAUDE.md` — Verified test command requirements and runner constraints
- `src/lib/workspace-ops.ts`, `src/lib/workspace-git.ts`, `src/lib/workspace-lifecycle.ts` — Verified production surfaces under test
- `src/commands/workspace.ts` — Verified CLI command wiring and flag surface

### Secondary (MEDIUM confidence)

None — all research based on direct codebase inspection.

### Tertiary (LOW confidence)

None — no unverified web sources used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Bun test infrastructure already proven, patterns already in use
- Architecture: HIGH — Test file structure mirrors existing `tests/commands/` patterns
- Pitfalls: HIGH — All derived from existing test failure modes and git environment isolation requirements

**Research date:** 2026-04-10
**Valid until:** 90 days (stable testing patterns, not fast-moving external dependencies)
