# Testing Patterns

**Analysis Date:** 2026-03-17

## Test Framework

**Runner:**
- Bun's built-in `bun:test`
- Config: None — uses defaults
- Jest-compatible API

**Assertion Library:**
- Bun's built-in assertions (Jest-like)
- Methods: `expect().toBe()`, `expect().toEqual()`, `expect().toContain()`, `expect().toHaveLength()`, etc.

**Run Commands:**
```bash
bun test tests/                         # Run all tests
bun test tests/lib/detect.test.ts       # Run single file
```

No watch mode or coverage tool configured.

## Test File Organization

**Location:**
- Tests in `tests/lib/` mirror source structure: `src/lib/X.ts` → `tests/lib/X.test.ts`
- Helper utilities in `tests/helpers.ts` — filesystem helpers for all tests
- Test fixtures defined inline in test files or via factory functions

**Naming:**
- Suffix: `.test.ts` (e.g., `detect.test.ts`, `config.test.ts`, `completion-generator.test.ts`)
- Test count: ~81 test cases across 5 test files (mainly unit tests for lib/)
- No E2E or integration tests

**File Structure:**
```
tests/
├── helpers.ts                 # makeTmpDir, cleanup, mkdir, touch, write
└── lib/
    ├── detect.test.ts         # detectRepoType, scanForRepos
    ├── config.test.ts         # Schema parsing + I/O round-trip
    ├── vscode.test.ts         # generateCodeWorkspace
    ├── intellij.test.ts        # generateIntellijProject
    └── completion-generator.test.ts  # Shell completion generation
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test"

describe("detectRepoType", () => {
  test("detects java from pom.xml", () => {
    touch(tmp, "repo/pom.xml")
    expect(detectRepoType(join(tmp, "repo"))).toBe("java")
  })
})
```

**Patterns:**
- `describe()` groups related tests by function/feature
- `test()` for individual assertions
- `beforeEach()` / `afterEach()` for setup/cleanup
- Each test is self-contained; state not shared between tests

**Lifecycle:**
- `beforeEach`: `tmp = makeTmpDir("prefix")` — isolate each test with unique temp dir
- Test body: Create fixtures, run function under test, assert result
- `afterEach`: `cleanup(tmp)` — recursive delete temp directory

## Mocking

**Framework:** No mocking library (Bun doesn't require one for file I/O)

**Patterns:**
- Redirect `process.env.HOME` to temp directory for config tests:
  ```typescript
  beforeEach(() => { tmp = makeTmpDir("config") })
  afterEach(() => cleanup(tmp))

  test("writeStack + readStack round-trips correctly", async () => {
    process.env.HOME = tmp
    const { writeStack, readStack } = await import("../../src/lib/config")
    // ... test code ...
  })
  ```
- This works because config path constants are evaluated at import time

**What to Mock:**
- File system (via makeTmpDir) — tests create real temp files/dirs
- `process.env.HOME` — redirect config directory
- Shell commands not mocked — full Bun `$` integration tested

**What NOT to Mock:**
- Git operations — tests assume `git` available in environment
- File I/O — tests use real temporary directories
- External APIs — none called in lib code (integrations configure them but don't call at test time)

## Fixtures and Factories

**Test Data:**
Factory functions create test objects:
```typescript
// In detect.test.ts
function makeTmpDir(prefix = "ws-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// In vscode.test.ts
function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: "WEB-1234",
    branch: "feature/WEB-1234",
    created: "2026-01-01",
    repos: [...],
    ...overrides,
  }
}

// In intellij.test.ts
const javaRepo = (name: string, taskPath: string) => ({
  name,
  stack: "platform",
  type: "java" as const,
  mode: "worktree" as const,
  main_path: `/main/${name}`,
  task_path: taskPath,
})
```

**Location:**
- Shared helpers: `tests/helpers.ts` (`makeTmpDir`, `cleanup`, `mkdir`, `touch`, `write`)
- Test-specific factories: inline in each test file (e.g., `makeWorkspace()`, `javaRepo()`)

**Filesystem Helpers:**
```typescript
export function makeTmpDir(prefix = "ws-test"): string  // Unique timestamped dir
export function cleanup(dir: string)                     // Recursive delete
export function mkdir(base: string, ...parts: string[])  // Create nested dirs
export function touch(base: string, ...parts: string[])  // Create empty file
export function write(base: string, rel: string, content: string)  // Write content
```

## Coverage

**Requirements:** None enforced

**Current gaps:**
- `src/commands/*` — No tests for CLI command handlers
- `src/tui/*` — No tests for interactive prompts
- `src/lib/workspace-ops.ts` — Core orchestration logic untested
- `src/lib/git.ts` — Git operations not tested (would require git repo)
- `src/lib/lifecycle.ts` — Hook execution not tested
- All integration plugins (`src/lib/integrations/*`) — Artifact generation has tests, plugin interface untested

**What IS tested:**
- Schema parsing and validation (Zod): `config.test.ts`
- File I/O round-trip: `config.test.ts` (stack and workspace read/write)
- Repository detection: `detect.test.ts` (repo type, scanning)
- Artifact generation: `vscode.test.ts`, `intellij.test.ts` (folder config, module files)
- Shell completion generation: `completion-generator.test.ts` (bash, zsh, fish)

## Test Types

**Unit Tests:**
- Most tests: Pure functions with I/O via filesystem helpers
- Scope: Single function or closely related functionality
- Approach: Create fixtures, call function, assert return value or file state
- Example: `detectRepoType(path)` returns correct `RepoType`; `readStack(name)` loads and parses YAML

**Integration Tests:**
- `config.test.ts` YAML round-trip: Tests read + write + parse in sequence
- `vscode.test.ts`, `intellij.test.ts`: Generate artifacts then verify file contents
- Approach: Set up realistic data, call multiple functions in sequence, verify end state

**E2E Tests:**
- None present
- Would require: full worktree setup, git operations, multi-repo scenarios
- Current focus: Unit tests for pure logic, integration tests for I/O

## Common Patterns

**Async Testing:**
Tests use `async` / `await`:
```typescript
test("writeStack + readStack round-trips correctly", async () => {
  process.env.HOME = tmp
  const { writeStack, readStack } = await import("../../src/lib/config")
  writeStack(stack)
  const loaded = readStack("test-stack")
  expect(loaded.name).toBe("test-stack")
})
```

**Error Testing:**
Schema validation errors caught with `.toThrow()`:
```typescript
test("rejects invalid repo type", () => {
  expect(() =>
    StackSchema.parse({ name: "x", repos: [{ name: "r", path: "/p", type: "python" }] })
  ).toThrow()
})
```

**File State Assertions:**
Verify files created with correct content:
```typescript
test("creates .code-workspace file", () => {
  const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
  expect(outPath).toEndWith("WEB-1234.code-workspace")
  const content = JSON.parse(readFileSync(outPath, "utf-8"))
  expect(content.folders).toHaveLength(2)
})
```

**Isolation via Direct Import:**
Tests that need to modify `process.env.HOME` dynamically import modules:
```typescript
beforeEach(() => { process.env.HOME = tmp })
afterEach(() => { delete process.env.HOME })
const { readStack, writeStack } = await import("../../src/lib/config")
```

This ensures path constants are re-evaluated with the modified HOME directory.
