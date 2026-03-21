---
phase: quick-260321-sqp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/commands/doctor-fix.test.ts
  - tests/commands/doctor-json.test.ts
  - tests/commands/run-parallel.test.ts
  - tests/commands/status-json.test.ts
  - tests/commands/sync-json.test.ts
  - tests/commands/list-columns.test.ts
autonomous: true
requirements: [TODO-TESTS]

must_haves:
  truths:
    - "All 28 TODO tests are replaced with real implementations"
    - "All 6 test files pass via bun test"
    - "Tests mock config/workspace-ops functions — no real filesystem or git operations"
    - "JSON output tests validate shape, field presence, and no human-readable text contamination"
  artifacts:
    - path: "tests/commands/doctor-fix.test.ts"
      provides: "6 tests for doctor --fix flow"
    - path: "tests/commands/doctor-json.test.ts"
      provides: "5 tests for doctor --json output"
    - path: "tests/commands/run-parallel.test.ts"
      provides: "6 tests for run --parallel flow"
    - path: "tests/commands/status-json.test.ts"
      provides: "4 tests for status --json output"
    - path: "tests/commands/sync-json.test.ts"
      provides: "4 tests for sync --json output"
    - path: "tests/commands/list-columns.test.ts"
      provides: "5 tests for list default columns"
  key_links:
    - from: "tests/commands/doctor-fix.test.ts"
      to: "src/commands/doctor.ts"
      via: "mocks config/paths, captures console output, tests fix execution flow"
      pattern: "mock\\.module.*config|console\\.log"
    - from: "tests/commands/status-json.test.ts"
      to: "src/commands/workspace.ts"
      via: "mocks listWorkspaces/readWorkspace/getWorkspaceStatus, captures JSON output"
      pattern: "mock\\.module.*workspace-ops"
    - from: "tests/commands/list-columns.test.ts"
      to: "src/commands/workspace.ts"
      via: "mocks listWorkspaces/getWorkspaceListInfo, captures formatted column output"
      pattern: "mock\\.module.*workspace-ops"
---

<objective>
Implement all 28 TODO tests across 6 test files in tests/commands/.

Purpose: These stub tests define the expected behavior of CLI JSON output, doctor --fix flow, run --parallel execution, and list column formatting. Implementing them provides regression coverage for these command features.

Output: 6 fully implemented test files, all passing.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@tests/helpers.ts
@tests/commands/workspace-edit.test.ts (mocking pattern reference)

<interfaces>
<!-- Key types the executor needs for building test mocks and assertions -->

From src/commands/doctor.ts:
```typescript
interface Issue {
  icon: "pass" | "fail" | "warn"
  entity: string
  message: string
  fix?: string
}
// Action opts: { json?: boolean; fix?: boolean; force?: boolean }
// JSON output (no --fix): { healthy: boolean, issues: Issue[] }
// JSON output (with --fix): { healthy: boolean, issues: Issue[], fixes: Array<{ entity, fix, success, exit_code? error? }> }
// Human --fix output: lists issues, asks p.confirm(), runs fixes via Bun.spawn("sh", "-c", fix), prints "N fixed, M failed."
// Unfixable issues print "(no auto-fix -- manual action needed)" annotation
```

From src/lib/workspace-ops.ts:
```typescript
export type WorkspaceListInfo = {
  name: string; branch: string; description: string; created: string;
  age: string; lastOpened: string; dirty: boolean | null;
  dirtyRepos: string[]; worktreeCount: number; trunkCount: number; repoCount: number;
}

export type RepoStatus = {
  name: string; exists: boolean; dirty: boolean; branch: string; mode: "trunk" | "worktree";
}

export type SyncResult = {
  ok: boolean;
  synced: Array<{ repo: string; commits: number }>;
  skipped: Array<{ repo: string; reason: string }>;
  error?: string;
}
```

From src/commands/workspace.ts status --json output shape:
```typescript
// Array of: { name, branch, template, repos: [{ name, mode, branch, exists, dirty, task_path }] }
```

From src/commands/workspace.ts sync --json output shape:
```typescript
// Single: { workspace, repos: [{ name, strategy, result, commits_behind_before, error }] }
// --all: Array of above
// result values: "up-to-date" | "rebased" | "merged" | "failed"
```

From src/commands/workspace.ts list output (line 209-215):
```typescript
// Format: "  {dirtyMark} {name.padEnd(20)} {branch.padEnd(30)} {repoStr.padEnd(10)} {lastOpened.padEnd(6)}"
// dirtyMark: "~" if dirty, " " otherwise
// repoStr: "{repoCount} repos"
// --status flag accepted but no-op (dirty checks always run)
```

From src/commands/workspace.ts run --parallel --json output (line 486-500):
```typescript
// JSON array: [{ repo: string, exit_code: number, stdout: string, stderr: string }]
// Human mode: checkmark or cross per repo, flushes failed output after all complete
// Exit code: 1 if any fail, 0 if all pass
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement doctor-json and doctor-fix tests (11 tests)</name>
  <files>tests/commands/doctor-json.test.ts, tests/commands/doctor-fix.test.ts</files>
  <action>
Both files test `src/commands/doctor.ts`. Use `mock.module` to mock all dependencies:
- `@/lib/config` — mock `listWorkspaces`, `readRegistry`, `readGlobalConfig`
- `@/lib/paths` — mock `getTasksDir`
- `@clack/prompts` — mock `confirm`, `isCancel`, `spinner`
- Mock `Bun.spawn` for fix execution tests (or use subprocess approach)
- Mock `fs.existsSync` to control which paths "exist"
- Mock `bun:$` quiet/nothrow for binary checks

**Strategy:** The doctor action function is deeply integrated — the cleanest approach is to use `spawnSync` subprocess testing: spawn `bun --eval` that imports and runs the command action directly with controlled mocks. However, given the complexity, the more practical approach is:

1. Import the `doctorCommand` from `src/commands/doctor.ts`
2. Mock all external dependencies via `mock.module` at the top
3. Capture `console.log` output via `spyOn(console, "log")`
4. Call `doctorCommand.parseAsync(["doctor", ...flags])` to trigger the action

**doctor-json.test.ts (5 tests):**
- "emits pure JSON with { healthy, issues } shape": Mock zero issues, capture output, JSON.parse it, verify `{ healthy: true, issues: [] }`
- "healthy is true when issues array is empty": Same as above, explicit `healthy === true` check
- "healthy is false when issues exist": Mock `existsSync` to return false for some registry paths, verify `healthy === false`
- "issues array mirrors Issue interface: icon, entity, message, fix?": Verify each issue object has exactly those keys
- "no human-readable text mixed with JSON output": Verify all `console.log` calls produce valid JSON (only one call, parseable)

**doctor-fix.test.ts (6 tests):**
- "lists all issues then asks confirmation for fixable ones": Mock issues with fixable items, mock `p.confirm` to return false (cancel), verify confirm was called with correct message
- "--fix --force skips confirmation prompt": Parse with `["doctor", "--fix", "--force"]`, verify `p.confirm` NOT called
- "continues past individual fix failure": Mock Bun.spawn to fail for first fix and succeed for second, verify both attempted
- "reports N fixed, M failed summary at end": Verify console output contains "N fixed, M failed"
- "issues without fix show (no auto-fix) annotation": Mock an issue without `fix` field, verify output contains "no auto-fix"
- "--json + --fix emits JSON with fix results": Parse with `["doctor", "--json", "--fix"]`, verify output includes `fixes` array

Important: Since `existsSync` is imported at module level, mock it via `mock.module("fs", ...)` or use a test pattern that controls which paths exist. For the `which` binary check, mock `bun:$` or ensure the function returns predictable results. The simplest approach: mock `findOrphanedTaskDirs`, `findMissingWorktrees`, etc. by mocking their dependencies (`existsSync`, `readdirSync`, `listWorkspaces`, `readRegistry`).

Note: The doctor command's action calls `Bun.spawn(["sh", "-c", fix])` for fix execution. In tests, mock `Bun.spawn` to return a controlled `{ exited: Promise.resolve(0) }` object. Use `const originalSpawn = Bun.spawn; Bun.spawn = mock(...)` in beforeEach and restore in afterEach — or use the fact that mocking the fs/config layer means no real fixes attempt to run.

Actually, the most reliable approach: create a thin wrapper. Since we cannot easily mock Bun.spawn, test the --json + --fix path which captures spawn results, and for human-mode tests, focus on the console output by mocking at the config/fs layer so no fixable issues exist (for unfixable annotation) or mock the entire flow at a higher level.

Alternative practical approach: Use subprocess testing (`Bun.spawnSync(["bun", "--eval", script])`) where the eval script sets up mocks and runs the command. This avoids module-cache issues and gives clean stdout capture. Follow the pattern from the STATE.md decision about subprocess spawning for isolation.
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun test tests/commands/doctor-json.test.ts tests/commands/doctor-fix.test.ts</automated>
  </verify>
  <done>All 11 doctor tests pass. JSON shape tests verify { healthy, issues } structure. Fix tests verify confirmation flow, --force bypass, failure continuation, summary output, no-auto-fix annotation, and JSON fix results.</done>
</task>

<task type="auto">
  <name>Task 2: Implement status-json, sync-json, and list-columns tests (13 tests)</name>
  <files>tests/commands/status-json.test.ts, tests/commands/sync-json.test.ts, tests/commands/list-columns.test.ts</files>
  <action>
All three files test actions from `src/commands/workspace.ts`. Use `mock.module` to mock:
- `@/lib/config` — `listWorkspaces`, `readWorkspace`, `workspaceExists`, `readGlobalConfig`
- `@/lib/workspace-ops` — `getWorkspaceStatus`, `getWorkspaceListInfo`, `syncWorkspace`
- `@/lib/paths` — `getTasksDir`
- `@clack/prompts` — `spinner` (for list command's spinner-less path)

Capture output via `spyOn(console, "log")`.

**status-json.test.ts (4 tests):**
Create mock workspace fixtures:
```typescript
const mockWs = { name: "test-ws", branch: "feat/test", template: "my-tmpl", repos: [
  { name: "api", mode: "worktree", repo: "api", main_path: "/main/api", task_path: "/tasks/test-ws/api" },
] }
```
Mock `getWorkspaceStatus` to return `[{ name: "api", exists: true, dirty: false, branch: "feat/test", mode: "worktree" }]`.

- "emits JSON array of workspace objects": Parse output, verify it's an array with workspace objects having `name`, `branch`, `template`
- "each workspace includes repos array with per-repo detail": Verify `.repos` is array, each has `name`, `mode`, `branch`, `exists`, `dirty`
- "per-repo objects include task_path field": Verify each repo object has `task_path` field
- "no human-readable text mixed with JSON output": Verify single `console.log` call, output is valid JSON

Note: `status` action uses `readWorkspace` when name provided, `listWorkspaces` when not. Test the named path: mock `readWorkspace("test-ws")` to return the fixture. Since commander parses args, invoke via `statusCmd.parseAsync(["status", "test-ws", "--json"])` or find the status subcommand on the registered program.

**sync-json.test.ts (4 tests):**
Mock `syncWorkspace` to return `{ ok: true, synced: [{ repo: "api", commits: 3 }], skipped: [] }`:
- "emits per-repo sync result JSON": Verify JSON output has `workspace` and `repos` array
- "per-repo objects include name, strategy, result, commits_behind_before, error": Verify each field present
- "result values match: up-to-date | rebased | merged | failed": Test with commits=0 (up-to-date), commits>0 (rebased), and skipped entry (failed)
- "--all --json emits array of per-workspace results": Mock `listWorkspaces` to return 2 workspaces, verify output is array of workspace results

Note: Must also mock `process.exit` since sync/run call it. Use `spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })` and catch in test.

**list-columns.test.ts (5 tests):**
Mock `getWorkspaceListInfo` to return a fixture with known values:
```typescript
{ name: "my-ws", branch: "feat/thing", description: "", created: "2026-01-01",
  age: "2d", lastOpened: "1h", dirty: true, dirtyRepos: ["api"],
  worktreeCount: 2, trunkCount: 1, repoCount: 3 }
```
- "default output includes branch column": Verify console output contains "feat/thing"
- "default output includes repo count": Verify output contains "3 repos"
- "default output includes last-opened age": Verify output contains "1h"
- "default output includes dirty indicator": Verify output contains "~" mark
- "--status flag still accepted for backward compat": Parse with `["list", "--status"]`, verify no error thrown, same output produced

Note for all workspace.ts tests: The commands are registered via `registerWorkspaceCommands(program)` on a parent Command. To test, either:
(a) Import and call `registerWorkspaceCommands`, get the subcommand, call parseAsync — but this is fragile with commander's exit behavior.
(b) Better: extract the action handler logic into a testable function, but that changes source code.
(c) Best practical approach: Use subprocess spawning to test CLI output directly, controlling HOME env to point at mock config. Create temp dirs with workspace YAML files, then run `bun run src/index.ts status test-ws --json` and capture stdout.

Choose approach (c) for these tests — it's the most reliable and matches the project's existing pattern (STATE.md: "Subprocess spawning required for paths env override tests"). Create fixture workspace/config YAML in a temp dir, set HOME to that dir, spawn the CLI, capture and parse stdout.

However, if subprocess approach is too heavy for all 13 tests, use approach (a) with mock.module for the simpler cases and subprocess only where needed.
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun test tests/commands/status-json.test.ts tests/commands/sync-json.test.ts tests/commands/list-columns.test.ts</automated>
  </verify>
  <done>All 13 tests pass. Status JSON tests verify workspace/repo shape with task_path. Sync JSON tests verify per-repo fields, result enum values, and --all array output. List tests verify branch, repo count, last-opened, dirty indicator columns and --status backward compat.</done>
</task>

<task type="auto">
  <name>Task 3: Implement run-parallel tests (6 tests)</name>
  <files>tests/commands/run-parallel.test.ts</files>
  <action>
Tests for `run --parallel` from `src/commands/workspace.ts` (lines 473-541). This command:
- Filters workspace repos to worktree mode only
- Spawns `sh -c {cmd}` in each repo's `task_path` simultaneously via `Promise.all`
- Human mode: spinner, per-repo checkmark/cross, flushes failed output
- JSON mode: emits `[{ repo, exit_code, stdout, stderr }]` array
- Exits 1 if any repo fails, 0 if all pass

**Approach:** Use subprocess spawning with fixture workspaces. Create real git repos in temp dirs (using `makeGitRepo` from helpers), write workspace YAML pointing at them, set HOME, run CLI.

Mock setup:
- `mock.module("@/lib/config")` — `readWorkspace`, `workspaceExists`, `readGlobalConfig`
- `mock.module("@/lib/paths")` — `getTasksDir`
- `mock.module("@clack/prompts")` — `spinner`
- `spyOn(process, "exit")` — prevent test runner exit
- `spyOn(console, "log")` — capture output

Create mock workspace with 2-3 worktree repos pointing at real temp dirs (they need to exist for cwd).

Alternatively (simpler): Use subprocess approach — create temp HOME with workspace YAML containing repos pointing at temp dirs, run `bun run src/index.ts run test-ws --parallel --json -- echo hello` and parse stdout.

**Tests:**
- "executes command in all worktree repos simultaneously": Create workspace with 2 worktree repos, run `-- echo hello`, verify both repos appear in output
- "shows per-repo result with checkmark or cross": Run in human mode (no --json), verify output contains checkmark character (\u2713) for success
- "flushes failed repo output after all complete": Run a command that fails in one repo (e.g., `exit 1`), verify failed output appears after per-repo summary
- "exits 1 if any repo fails, 0 if all pass": Test exit code via subprocess; run succeeding command (exit 0) and failing command
- "--parallel --json emits per-repo JSON array": Run with --json flag, JSON.parse output, verify it's an array
- "--parallel --json includes repo, exit_code, stdout, stderr per entry": Verify each JSON entry has all four fields with correct types

For subprocess tests: `Bun.spawnSync(["bun", "run", "src/index.ts", "run", wsName, "--parallel", "--json", "--", "echo", "hello"], { env: { ...process.env, HOME: tmpHome }, cwd: projectRoot })`. Check stdout and exitCode.

Important: The workspace YAML must have repos with valid `task_path` directories that exist on disk. Use `makeGitRepo` or just `mkdirSync` for the task paths. The `--parallel` command spawns `sh -c` in those dirs, so they must exist.
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun test tests/commands/run-parallel.test.ts</automated>
  </verify>
  <done>All 6 run-parallel tests pass. Tests verify simultaneous execution across repos, per-repo result display (checkmark/cross), failed output flushing, exit code behavior, and JSON output shape with repo/exit_code/stdout/stderr fields.</done>
</task>

</tasks>

<verification>
Run all 6 test files together to confirm no cross-file interference:
```bash
bun test tests/commands/doctor-json.test.ts tests/commands/doctor-fix.test.ts tests/commands/status-json.test.ts tests/commands/sync-json.test.ts tests/commands/list-columns.test.ts tests/commands/run-parallel.test.ts
```
All 28 tests (previously TODO) should pass. No test.todo remaining in any file.
</verification>

<success_criteria>
- 0 test.todo calls remain across all 6 files
- All 28 tests pass
- No existing tests in the suite are broken (run `bun test tests/` to confirm)
- Tests use mock.module or subprocess isolation — no real config/workspace/git side effects
</success_criteria>

<output>
After completion, create `.planning/quick/260321-sqp-implement-todo-tests-across-the-test-sui/260321-sqp-SUMMARY.md`
</output>
