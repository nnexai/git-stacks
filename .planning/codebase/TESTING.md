# Testing Patterns

**Analysis Date:** 2026-04-04

## Test Framework

**Runner:**
- bun:test (Bun's built-in test runner, Jest-compatible API)
- Config: `bunfig.toml` -- preloads `@opentui/solid/preload` for JSX support
- TypeScript executed directly by Bun (no compilation step)

**Assertion Library:**
- bun:test built-in `expect()` (Jest-compatible matchers)
- `expect(x).toBe(y)`, `expect(x).toEqual(y)`, `expect(x).toThrow()`, `expect(x).toContain(y)`
- `expect(x).toMatch(/regex/)` for pattern matching
- `expect(frame).toMatchSnapshot()` for TUI snapshot tests
- `expect(fn).toHaveBeenCalled()`, `expect(fn).not.toHaveBeenCalled()` for mock assertions

**Run Commands:**
```bash
bun run test              # Run all tests (custom runner, isolated processes)
bun run test:unit         # Run unit tests only (shared process)
bun run test:integ        # Run integration tests only (per-file isolation)
bun test tests/lib/detect.test.ts   # Run a single test file directly
bun run typecheck         # Type-check without emitting (tsc --noEmit)
```

## Test Runner

**Custom Runner: `scripts/test-runner.ts`**

The project uses a custom test runner because `bun:test`'s `mock.module()` is process-global -- mocks from one test file contaminate other files in the same process. The runner solves this by classifying tests into two groups:

**Unit tests** (shared Bun process, run in parallel):
- `tests/lib/*.test.ts` -- only files that do NOT use `mock.module()`
- `tests/tui/dashboard/*.test.tsx` -- only non-`integ-` files without `mock.module()`

**Integration tests** (each file gets its own Bun process):
- `tests/commands/*.test.ts` -- always isolated
- `tests/tui/*.test.ts` (direct children of tui/, not subdirs) -- always isolated
- `tests/tui/dashboard/integ-*.test.tsx` -- always isolated
- `tests/lib/*.test.ts` files that contain `mock.module(` -- automatically detected and isolated

**Classification Logic (in `scripts/test-runner.ts`):**
```typescript
function fileUsesMockModule(filePath: string): boolean {
  const content = require("fs").readFileSync(filePath, "utf8") as string
  return content.includes("mock.module(")
}
```
Files in `tests/lib/` are scanned for `mock.module(` -- if present, they run in isolation. This is detected at runtime, not configured manually.

**CRITICAL: Never run `bun test tests/` directly** -- it runs all test files in a shared process where `mock.module()` calls pollute each other, producing false failures.

## Test Organization

**File Layout:**
```
tests/
  helpers.ts                         # Shared test utilities and mock factories
  lib/                               # Unit tests for src/lib/
    config.test.ts
    git.test.ts
    lifecycle.test.ts
    workspace-ops.test.ts
    secrets.test.ts
    composition.test.ts
    concurrency-limiter.test.ts
    ports.test.ts
    env.test.ts
    labels.test.ts
    detect.test.ts
    files.test.ts
    version.test.ts
    ...
    integrations/                    # Unit tests for integration plugins
      runner.test.ts
      forge-utils.test.ts
      github.test.ts
      gitlab.test.ts
      gitea.test.ts
      jira.test.ts
      tmux.test.ts
      niri.test.ts
      ...
  commands/                          # Integration tests for CLI commands
    doctor-fix.test.ts
    doctor-json.test.ts
    label.test.ts
    list-columns.test.ts
    run-parallel.test.ts
    status-json.test.ts
    sync-json.test.ts
    workspace-edit.test.ts
    env.test.ts
  tui/
    workspace-wizard.test.ts         # Integration test for wizard prompts
    messageUtils.test.ts             # Integration test for message utilities
    dashboard/
      ActionMenu.test.tsx            # Unit test for TUI components
      FilterIndicator.test.tsx
      InlineInput.test.tsx
      WorkspaceDetail.test.tsx
      WizardView.test.tsx
      ...
      integ-action-menu.test.tsx     # Integration tests (isolated process)
      integ-tab-switching.test.tsx
      integ-sync-progress.test.tsx
      integ-wizard.test.tsx
      snapshots/                     # Snapshot tests for TUI components
        BatchBar.snap.test.tsx
        CenteredDialog.snap.test.tsx
        StatusIndicator.snap.test.tsx
        WorkspaceRow.snap.test.tsx
        __snapshots__/               # Auto-generated snapshot files
```

**Naming:**
- Test files mirror source file names: `src/lib/detect.ts` -> `tests/lib/detect.test.ts`
- Integration test prefix: `integ-*.test.tsx` for dashboard tests needing process isolation
- Snapshot test suffix: `*.snap.test.tsx`

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from "bun:test"
import { makeTmpDir, cleanup, useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("my-test")

describe("ComponentName", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("my-test") })
  afterEach(() => cleanup(tmp))

  test("does something specific", () => {
    // arrange
    const data = SomeSchema.parse({ name: "test", ... })
    // act
    const result = someFunction(data)
    // assert
    expect(result).toBe(expected)
  })
})

afterAll(() => isolated.cleanup())
```

**Patterns:**
- `describe` blocks group related tests by feature or function
- Nested `describe` for sub-categories
- `test()` (not `it()`) is the primary test function -- though `it()` also appears in `concurrency-limiter.test.ts`
- `beforeEach` / `afterEach` for per-test setup/teardown (temp dirs, mock resets)
- `afterAll` for cleanup of shared resources (isolated config dirs)

## Mocking Patterns

**`mock.module()` for Module-Level Mocking:**
```typescript
import { mock } from "bun:test"

// Mock BEFORE importing the module under test
mock.module("@/lib/config", () => makeConfigMock({
  listWorkspaces: mock(() => myWorkspaces),
}))

// Dynamic import AFTER mock is set up
const { someFunction } = await import("@/lib/some-module")
```
- Process-global scope -- persists for the entire test file
- Files using `mock.module()` automatically run in isolated processes (detected by the custom runner)
- Must be called before importing the module that consumes the mocked dependency
- Use dynamic `await import()` after `mock.module()` to get the patched version

**`useIsolatedConfig()` for Config Isolation (`tests/helpers.ts`):**
```typescript
const isolated = useIsolatedConfig("my-test-prefix")

// All config reads/writes now go to /tmp/my-test-prefix-{random}/
// Sets up: workspaces/, templates/, messages/ directories
// Mocks @/lib/paths with temp paths

afterAll(() => isolated.cleanup())
```
- Creates a temp directory structure mirroring `~/.config/git-stacks/`
- Calls `mock.module("@/lib/paths", ...)` internally to redirect all path constants
- Returns `{ configDir, cleanup }` -- caller must call `cleanup()` in `afterAll`
- Because `paths.ts` constants are evaluated at import time, modules that import paths must be dynamically imported after calling `useIsolatedConfig()`

**`_exec` Injectable Replacement (lifecycle, tmux, niri, etc.):**
```typescript
let originalSpawn: typeof _exec.spawn

beforeEach(() => {
  originalSpawn = _exec.spawn
  _exec.spawn = mockSpawn as any
})

afterEach(() => {
  _exec.spawn = originalSpawn
})
```
- Replace the mutable `_exec.spawn` property to intercept subprocess calls
- Always restore original in `afterEach` to avoid test pollution
- Verify call shapes (cmd, cwd, env, stdio mode) without executing real processes

**Real Module Captures (`tests/helpers.ts`):**
```typescript
// Captured at helpers.ts load time, BEFORE any mock.module calls
export const {
  runHooks: realRunHooks,
  runHooksCaptured: realRunHooksCaptured,
  _exec: lifecycleRealExec,
} = await import("@/lib/lifecycle") as any

export const {
  writeWorkspace: realWriteWorkspace,
  readWorkspace: realReadWorkspace,
  // ...
} = await import("@/lib/config") as any
```
- Destructured named exports are STABLE references -- not updated when `mock.module` replaces the module later
- Allows test files that need real implementations to use `realWriteWorkspace` etc. even after other test files have mocked those modules
- Import with renaming convention: `real{FunctionName}`

**Mock Factory Helpers (`tests/helpers.ts`):**
- `makeConfigMock(overrides)` -- Complete mock of `src/lib/config.ts` with all schemas and functions
- `makeWorkspaceOpsMock(overrides)` -- Complete mock of `src/lib/workspace-ops.ts`
- `makeGitMock(overrides)` -- Complete mock of `src/lib/git.ts`
- `makePathsMock(overrides)` -- Complete mock of `src/lib/paths.ts`
- `makeLifecycleMock(overrides)` -- Complete mock of `src/lib/lifecycle.ts`
- `makeTmuxMock(overrides)` -- Complete mock of `src/lib/tmux.ts`
- `makeForgeUtilsMock(overrides)` -- Complete mock of `src/lib/integrations/forge-utils.ts`
- `makeIssueUtilsMock(overrides)` -- Complete mock of `src/lib/integrations/issue-utils.ts`

Each factory returns ALL exports of the target module with sensible stubs. Override specific functions:
```typescript
mock.module("@/lib/config", () => makeConfigMock({
  listWorkspaces: mock(() => [myWorkspace]),
  readWorkspace: mock(() => myWorkspace),
}))
```

**IMPORTANT: When adding a new export to a source module, add a corresponding stub to its mock factory in `tests/helpers.ts`.** Missing exports cause runtime errors in test files that use `mock.module()` with the factory.

## Test Helpers (`tests/helpers.ts`)

**Filesystem Utilities:**
```typescript
makeTmpDir(prefix)      // Create unique /tmp/{prefix}-{timestamp}-{random}/
cleanup(dir)            // rmSync recursive
mkdir(base, ...parts)   // mkdirSync recursive
touch(base, ...parts)   // Create empty file (with parent dirs)
write(base, rel, content) // Write content to file (with parent dirs)
makeFileTree(base, entries) // Create directory tree from flat map
makeGitRepo(base, name)    // Init a real git repo with initial commit
```

**Config Isolation:**
```typescript
useIsolatedConfig(prefix)   // Mock paths to temp dir, create structure
// Returns { configDir: string, cleanup: () => void }
```

**Mock Factories:**
```typescript
makeConfigMock(overrides)
makeWorkspaceOpsMock(overrides)
makeGitMock(overrides)
makePathsMock(overrides)
makeLifecycleMock(overrides)
makeTmuxMock(overrides)
makeForgeUtilsMock(overrides)
makeIssueUtilsMock(overrides)
```

## Command-Level Integration Tests

**Pattern: Subprocess Execution via `Bun.spawnSync()`**

Tests in `tests/commands/` run the CLI as a subprocess with controlled environment:
```typescript
const PROJECT_ROOT = join(import.meta.dir, "../..")

function runCommand(cfgDir: string, args: string[], stdinInput = "") {
  const result = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "doctor", ...args],
    {
      env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
      cwd: PROJECT_ROOT,
      stdin: stdinInput ? Buffer.from(stdinInput) : "pipe",
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode ?? 0,
  }
}
```
- Use `GIT_STACKS_CONFIG_DIR` env var to redirect config dir (supported by `src/lib/paths.ts`)
- Write fixture YAML files to temp config dir before running
- Assert on stdout content, stderr content, and exit code
- Pipe controlled input to stdin for interactive prompts

## TUI Component Tests

**OpenTUI `testRender()` Pattern:**
```typescript
/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"

const renderOpts = { kittyKeyboard: true }

test("renders correctly", async () => {
  const { renderOnce, captureCharFrame } = await testRender(
    () => <MyComponent prop="value" />,
    renderOpts
  )
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("Expected text")
})
```
- Use `kittyKeyboard: true` to avoid flaky escape key timing
- `renderOnce()` advances the render cycle
- `captureCharFrame()` returns the terminal frame as a string for text assertions
- `mockInput.pressArrow("down")`, `mockInput.pressEnter()` for simulating keyboard input

**Snapshot Tests (`tests/tui/dashboard/snapshots/`):**
```typescript
test("renders with default props", async () => {
  const { renderOnce, captureCharFrame } = await testRender(
    () => <Component prop="value" />,
    { kittyKeyboard: true, width: 80, height: 24 }
  )
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toMatchSnapshot()
})
```
- Snapshots stored in `__snapshots__/{file}.snap`
- Fixed `width`/`height` for deterministic rendering

## Fixture Patterns

**Workspace Fixtures (inline):**
```typescript
const wsFixtures = [
  {
    name: "test-ws",
    schema_version: "1" as const,
    branch: "feature/test",
    created: "2026-01-15T00:00:00.000Z",
    repos: [] as any[],
    labels: ["backend"],
  },
]
```

**Workspace Fixtures (schema-parsed):**
```typescript
const ws = WorkspaceSchema.parse({
  name: "test-workspace",
  branch: "feature/test",
  created: "2026-01-01",
  template: "my-app",
})
```

**Unique Names per Test (collision avoidance):**
```typescript
const FILE_RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let _testCounter = 0
function uniqueWsName(prefix = "test-ws"): string {
  _testCounter++
  return `_wsops-${prefix}-${FILE_RUN_ID}-${_testCounter}`
}
```

**Real Git Repos for Integration Tests:**
```typescript
const repoPath = makeGitRepo(tmp, "repo-name")
// Creates a real git repo with initial commit
// Can create worktrees from it for workspace ops tests
```

## Coverage

**Requirements:** No formal coverage target enforced

**What is well-tested:**
- Zod schema validation (`tests/lib/config.test.ts`) -- comprehensive edge cases, backward compat, name validation
- YAML config I/O round-trips
- Git operations (`tests/lib/git.test.ts`)
- Lifecycle hooks: both real-shell and injected-mock tests (`tests/lib/lifecycle.test.ts`)
- Workspace operations: merge, remove, clean, rename, sync (`tests/lib/workspace-ops.test.ts`)
- Integration runner: ordering, enable/disable, artifact accumulation (`tests/lib/integrations/runner.test.ts`)
- Forge utilities: GitHub, GitLab, Gitea (`tests/lib/integrations/forge-utils.test.ts`, `github.test.ts`, etc.)
- Template composition: includes, repo merging, hooks, circular detection (`tests/lib/composition.test.ts`)
- Port allocation and concurrency limiter (`tests/lib/ports.test.ts`, `tests/lib/concurrency-limiter.test.ts`)
- Secrets resolver system (`tests/lib/secrets.test.ts`)
- Env formatting (`tests/lib/env.test.ts`)
- Labels matching (`tests/lib/labels.test.ts`)
- TUI dashboard components: action menus, progress views, filter indicators
- TUI snapshot tests for visual regression
- CLI commands via subprocess: doctor, label, list, status, sync, env, run, workspace edit

**Test isolation safety nets:**
- `GIT_STACKS_CONFIG_DIR` env var for subprocess tests
- `useIsolatedConfig()` for in-process config isolation
- `_exec` injectable for subprocess mocking
- Real module captures (`real*` exports) for tests that need real behavior despite other files mocking

## Test Types

**Unit Tests:**
- Pure function testing (schemas, formatters, matchers, path helpers)
- Mock-heavy module testing with `mock.module()` and factory helpers
- `_exec` injection for subprocess testing without real execution

**Integration Tests:**
- Real git repo creation and worktree operations (`tests/lib/workspace-ops.test.ts`)
- Real shell execution for lifecycle hooks (`tests/lib/lifecycle.test.ts`)
- CLI subprocess tests via `Bun.spawnSync()` (`tests/commands/`)
- TUI integration tests with mocked data flows (`tests/tui/dashboard/integ-*.test.tsx`)

**Snapshot Tests:**
- TUI component visual regression via `@opentui/solid`'s `testRender` + `captureCharFrame`
- Stored in `tests/tui/dashboard/snapshots/__snapshots__/`

**E2E Tests:**
- Not present as a separate category -- command-level subprocess tests serve this role

## Common Patterns

**Async Testing:**
```typescript
test("resolves with correct value", async () => {
  await expect(someAsyncFn("arg")).resolves.toBe("expected")
})

test("rejects with error", async () => {
  await expect(someAsyncFn("bad")).rejects.toThrow("expected error")
})
```

**Error Testing:**
```typescript
test("rejects invalid input", () => {
  expect(() => SomeSchema.parse({ invalid: true })).toThrow()
})

test("throws with specific message", () => {
  expect(() => readWorkspace("ghost")).toThrow(/not found/)
})
```

**Isolation Strategy Comments:**
- Test files that have complex mock ordering include an `Isolation strategy` comment block at the top explaining why specific mocking is needed:
```typescript
// --- Isolation strategy ---
// integration-commands.test.ts mocks @/lib/lifecycle (as a consumer test).
// Because of Bun's live binding patching, the realRunHooksCaptured capture
// in helpers.ts ends up using the mock's _exec after integration-commands runs.
//
// Fix: re-apply mock.module("@/lib/lifecycle", ...) at the start of this file
```

---

*Testing analysis: 2026-04-04*
