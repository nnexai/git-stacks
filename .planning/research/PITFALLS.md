# Pitfalls Research

**Domain:** TypeScript CLI refactoring — extracting a 1735-line monolithic module, adding DI, and structured logging to a working Bun CLI with 800+ tests and existing npm users
**Researched:** 2026-04-05
**Confidence:** HIGH — grounded in direct reads of `src/lib/workspace-ops.ts` (1735 lines, imports from config/git/lifecycle/integrations/files/ports/secrets), `tests/lib/workspace-ops.test.ts` (mock.module patterns, _exec injection, useIsolatedConfig), `CLAUDE.md` (conventions, test isolation architecture), and cross-referenced with TypeScript module system behavior and structured logging ecosystem patterns

---

## Critical Pitfalls

### Pitfall 1: Circular Imports Created During Module Split

**What goes wrong:**
`workspace-ops.ts` currently imports from `config.ts`, `git.ts`, `lifecycle.ts`, `integrations/runner.ts`, `files.ts`, `ports.ts`, and `secrets.ts`. When splitting workspace-ops into domain modules (e.g., `workspace-lifecycle.ts`, `workspace-sync.ts`, `workspace-env.ts`), the new modules typically need shared types from each other and from config.ts. This creates circular import chains: `workspace-lifecycle.ts` → `workspace-env.ts` → `workspace-lifecycle.ts`. TypeScript compiles circular imports silently. Bun executes them with undefined values for the circular dependency at startup, causing runtime errors that are not caught by `tsc --noEmit`.

The specific risk here: `openWorkspace` calls `buildWorkspaceEnv`, which calls `mergeEnv`, and `mergeEnv` needs `Workspace` type from config. If `buildWorkspaceEnv` is extracted to `workspace-env.ts` and `openWorkspace` stays in `workspace-lifecycle.ts`, then any shared type from `workspace-env.ts` imported by `workspace-lifecycle.ts` creates a cycle if `workspace-env.ts` imports `workspace-lifecycle.ts` types.

**Why it happens:**
The original monolith has no import cycles because everything is in one file. When splitting, developers extract the functions they want and then add the imports they need. The imports form a web that was previously invisible because it was all in one module scope.

**How to avoid:**
Before splitting, draw the dependency graph: for each function in workspace-ops.ts, list what it imports from _other functions in workspace-ops.ts_ (not external modules). Extract shared types and pure utilities to a separate `workspace-types.ts` or keep them in `config.ts`. The rule: domain modules import from config/git/lifecycle (the stable leaves), not from each other. If two new modules need each other, the shared part belongs in a third module or back in config.ts.

```
Allowed: workspace-lifecycle.ts → config.ts, git.ts, lifecycle.ts
Allowed: workspace-sync.ts → config.ts, git.ts, workspace-env.ts
NOT ALLOWED: workspace-lifecycle.ts → workspace-sync.ts → workspace-lifecycle.ts
```

**Warning signs:**
- A new module imports from another new module that imports back from the first
- `tsc --noEmit` passes but runtime throws "Cannot read property X of undefined" on a well-tested code path
- `bun run test` shows a test file importing two new modules where one worked before and both work in isolation but fail together

**Phase to address:**
Phase 1 of extraction — before writing any code, produce the intra-module dependency graph of workspace-ops.ts. This is the architectural decision that determines all splitting boundaries.

---

### Pitfall 2: Tests Break Because Import Paths Changed but mock.module() Calls Did Not

**What goes wrong:**
The test suite uses `mock.module("@/lib/workspace-ops", ...)` and `mock.module("@/lib/lifecycle", ...)` to inject test doubles. When workspace-ops is split into `workspace-lifecycle.ts`, `workspace-sync.ts`, etc., any test that imports a specific function from the old path will fail with "module not found." But more insidiously: tests that mock the OLD path will silently stop applying their mocks. The production code now imports from the new path. The mock targets the old path. The mock does nothing. Tests that relied on mock isolation will now call real git operations and fail unpredictably — or worse, silently call real git operations in CI and pass because the git environment happens to be in the right state.

This codebase has approximately 30 test files with `mock.module()` calls. At least workspace-ops.test.ts explicitly restores lifecycle via `mock.module("@/lib/lifecycle")`. If `workspace-lifecycle.ts` imports lifecycle directly (not via workspace-ops), then the workspace-ops mock.module call no longer intercepts lifecycle calls.

**Why it happens:**
`mock.module()` in Bun intercepts the module at the path given. It does not follow re-exports. If the production code moves and the mock stays on the old path, the mock is a no-op. The test does not error — it silently runs without the mock.

**How to avoid:**
Migrate mock.module() calls in lockstep with each module split. After each split, run the full test suite with `bun run test` (not `bun test` directly — per CLAUDE.md). Any test that calls real git operations where it previously used mocks will either (a) fail with a git error if no git repo is present, or (b) silently pass with real git state. Detect case (b) by adding an assertion that verifies the mock was called when expected.

For each moved function: update every test file that mocks it, not just the primary test for that function.

**Warning signs:**
- A test passes but the mock assertion (`expect(mockFn).toHaveBeenCalled()`) is absent — the test can't tell if mock was applied
- `mock.module("@/lib/workspace-ops")` in a test file after workspace-ops is split — the old path no longer exists or no longer has the target function
- A test that previously ran in <100ms now takes 2–5s — it is calling real git operations

**Phase to address:**
Every extraction phase. Each split must include a "verify mock coverage" step: grep for `mock.module` references to the moved module path, update all hits.

---

### Pitfall 3: DI Container Fights the Existing `_exec` Injection Pattern

**What goes wrong:**
The codebase already has a working, battle-tested DI pattern: modules export a mutable `_exec` object that tests replace directly. This pattern works because Bun ESM modules expose objects (not primitives), and object property mutation is visible across all importers of the same module instance.

Adding a DI container (constructor injection, service locator, or factory pattern) alongside this existing pattern creates two competing systems. The new container requires tests to be written differently from the ~30 existing test files that use `_exec` property replacement. During migration, some modules use one system and some use the other. Test authors are unsure which pattern to use for new tests. Code reviewers cannot easily verify that a new module is properly testable.

The deeper problem: if DI is introduced via function parameter injection (e.g., `openWorkspace(workspace, { exec, logger })`), the function signature changes. All 30+ callers in `commands/workspace.ts` and `tui/` must be updated. The TUI calls workspace-ops functions directly — changing signatures there is non-trivial because TUI components have their own calling conventions.

**Why it happens:**
DI is introduced to improve testability and configurability, but the project already has testability via `_exec`. The new system is often introduced as "better" without a migration plan, leaving an inconsistent codebase where the old pattern and new pattern coexist indefinitely.

**How to avoid:**
Decide on one approach before starting. Two valid options:

Option A: Keep `_exec` property injection for subprocess mocking. Add a `Logger` object to modules using the same pattern:
```ts
export const _logger = { log: defaultLogger }  // tests replace _logger.log
```
This is consistent with existing patterns, requires zero changes to callers, and keeps all 800+ tests valid.

Option B: Introduce parameter injection only in newly extracted modules (not in existing workspace-ops functions). New code uses the new pattern; existing code keeps `_exec`. Document the boundary clearly.

Do NOT introduce a DI framework. The `_exec` pattern is already "DI" — it is constructor-free property injection. The goal is consistency, not architectural purity.

**Warning signs:**
- A PR introduces `class WorkspaceService { constructor(exec, logger) {...} }` — class-based DI in a codebase with no existing classes
- Function signatures for existing exported functions (openWorkspace, syncWorkspace, mergeWorkspace) change to accept a deps/context object — all callers must change
- Two test files for the same module use different injection approaches

**Phase to address:**
DI design phase — before any code is written. The decision must be documented in CLAUDE.md so all future contributors use the same pattern.

---

### Pitfall 4: Structured Logging Corrupts CLI stdout and TUI Screen

**What goes wrong:**
`git-stacks` is a CLI tool. Callers pipe its output (`git-stacks list --json | jq`), script it (`if git-stacks status --json | jq '.dirty'`), and use `--json` flags for machine-readable output. Structured log output written to stdout (even in development mode) breaks these patterns. Pino and Winston default to stdout. Winston specifically defaults to `console.log` in some transports.

The TUI problem is more acute: `git-stacks manage` renders an OpenTUI screen using ANSI escape sequences. Any log output written to stdout or stderr during TUI operation corrupts the terminal. The existing codebase handles this with `runHooksCaptured()` — hook output is captured, not written to the terminal. Structured logging that bypasses this mechanism (e.g., a logger that writes directly to `process.stderr`) will corrupt the screen.

The `--json` flag scenario: a user runs `git-stacks status --json`. The command calls `openWorkspace` internally. If the logging library writes a JSON log line to stdout before the status output, the caller's JSON parser fails on the log line. Debug logs written to stdout in development can silently break scripted users who upgrade to a version with logging enabled.

**Why it happens:**
Structured logging is designed for server applications where stdout is the log stream. CLI tools have a different contract: stdout is program output, stderr is diagnostics. Logging libraries often default to stdout. Developers test with `console.log` and assume the transport is irrelevant — it is not.

**How to avoid:**
All log output goes to stderr, never stdout. Use a logger that defaults to stderr or is explicitly configured to stderr:
```ts
const logger = pino({ level: "warn" }, pino.destination(2))  // fd 2 = stderr
```

Default log level is `warn` in production (not `info` or `debug`). Log level is controlled by `GIT_STACKS_LOG_LEVEL` env var or `--log-level` flag, defaulting to `warn`. In TUI mode (`git-stacks manage`), log level is forced to `silent` or log output is captured to a buffer — not written to stderr.

The `--json` flag commands must be audited: every code path that a `--json` command calls must be verified to produce no stdout output other than the JSON payload.

**Warning signs:**
- Logger transport not explicitly set to stderr — uses default (often stdout or console.log)
- Log level defaults to `info` or `debug` in production builds
- No test verifying that `--json` output is valid JSON (log lines would break JSON.parse)
- TUI tests that check screen output start failing with unexpected characters after logging is added
- Pino/Winston configured without explicit stream/transport in the logger constructor

**Phase to address:**
Logging infrastructure phase — before any log calls are added. The transport and default level must be established once; retrofitting is error-prone.

---

### Pitfall 5: Log Volume Makes CLI Output Noisy for End Users

**What goes wrong:**
Structured logging is a backend pattern. Applied naively to a CLI tool, it produces output that end users see as noise. A user running `git-stacks open my-feature` does not want to see:
```
{"level":30,"time":1234567890,"msg":"reading workspace","name":"my-feature"}
{"level":30,"time":1234567890,"msg":"found 3 repos","count":3}
{"level":30,"time":1234567890,"msg":"creating worktree","path":"/workspaces/tasks/..."}
```

But log verbosity that is invisible at `warn` level is not useful for debugging. The failure mode is that developers add `logger.info(...)` at every significant step (which is correct for server apps) and then suppress all of them with a `warn` default level, making the logging investment useless for debugging actual user issues.

**Why it happens:**
The logging patterns from server development (log every significant state transition at `info`) are carried over without adapting to the CLI contract. The result is either: (a) a noisy tool that logs everything by default, or (b) a tool with logging infrastructure that is always silent and therefore useless.

**How to avoid:**
Use a tiered approach for CLI logging:
- `error`: Failures that cause the command to fail. Always surface to stderr with user-friendly messaging (the existing discriminated union return pattern already does this).
- `warn`: Unexpected conditions that don't fail the command but indicate something is wrong. Currently handled with `onWarn` callbacks — structured logging can replace these.
- `debug`: Internal state transitions. Only useful with `GIT_STACKS_LOG_LEVEL=debug`. Log these liberally — they are invisible at default level.
- No `info` level log calls in production paths — the tool already uses `onProgress` callbacks for user-facing progress output.

The `onWarn` and `onProgress` callback pattern already in workspace-ops.ts is the correct user-facing output mechanism. Structured logging complements it for machine-readable debugging, not replaces it.

**Warning signs:**
- `logger.info(...)` calls in functions that also have `onProgress` callbacks — double-reporting the same event
- Log messages that contain the same text as user-facing output — the logger is being used as a substitute for onProgress
- No `GIT_STACKS_LOG_LEVEL` env var or `--log-level` flag — log level is compile-time constant
- Default log level set to `info` — users see structured output without opting in

**Phase to address:**
Logging design phase — establish the log level taxonomy before any calls are added. The `onWarn` callback pattern should be evaluated for replacement or coexistence with structured logging.

---

### Pitfall 6: Module Split Breaks `commands/` and `tui/` Import Paths, Causing Undiscovered Failures in TUI Code Paths

**What goes wrong:**
`commands/workspace.ts` imports directly from `workspace-ops.ts` (openWorkspace, syncWorkspace, etc.). `tui/workspace-wizard.ts` and `tui/dashboard/` also import workspace-ops functions. When workspace-ops is split, these import paths need updating. The `commands/` updates are obvious — TypeScript will error. But the TUI code is less likely to have comprehensive test coverage for every code path (TUI tests use `testRender` + `mockInput` which covers UI flows, not necessarily every imported function from workspace-ops).

The specific risk: a TUI code path imports a function that is moved to a new module. TypeScript errors on the import. The developer fixes the import path. But the moved function now has a different signature or different behavior because it was refactored during extraction. The TUI component compiles but behaves incorrectly at runtime.

**Why it happens:**
The TUI dashboard (`src/tui/dashboard/`) is a SolidJS reactive application. Reactive components are harder to test exhaustively than pure functions. The TUI test suite covers major flows but cannot cover every edge case in every reactive effect. Import updates that also include behavioral changes go unnoticed.

**How to avoid:**
Separate import path updates from behavioral changes. The first commit for any module split should: (1) create the new module by copy-paste from workspace-ops, (2) re-export from workspace-ops for backward compatibility, (3) update no behavior. Only after all tests pass does the second commit remove the re-export and update callers. This means the test suite validates each step independently.

```ts
// workspace-ops.ts — step 1 (still works for all callers)
export { openWorkspace } from "./workspace-lifecycle"
export { syncWorkspace } from "./workspace-sync"
// ... old implementations remain as re-exports until all callers are updated
```

**Warning signs:**
- A module split PR changes function signatures AND updates import paths in the same commit
- TUI test coverage for the affected workspace-ops functions is below 60% — indicates missing coverage
- No integration test that calls a workspace-ops function through the TUI code path (only unit tests of workspace-ops directly)

**Phase to address:**
Every extraction phase. The re-export intermediary pattern must be the standard approach for all splits.

---

### Pitfall 7: DI Makes `_exec` Tests Non-Obvious — New Test Authors Use the Wrong Pattern

**What goes wrong:**
The `_exec` injectable object pattern works because it is simple: every module that spawns subprocesses exports `_exec`, and tests replace `_exec.spawn` or `_exec.run`. When DI is added (even via the consistent `_exec`-style pattern), new modules may be added over time with inconsistent injection approaches. A new contributor writing a test for `workspace-lifecycle.ts` will look at the nearest test file (possibly one that uses `mock.module()` for a different module) and use that pattern instead of `_exec` replacement. The two patterns are not mutually exclusive, but a module that can be tested via either approach will be tested via the wrong one depending on which test the author happened to look at.

The deeper issue: if some module tests use `_exec` replacement and others use `mock.module()`, the test runner's mock isolation (the custom `scripts/test-runner.ts`) may not handle the combination correctly. The custom runner isolates `mock.module()`-heavy files in separate processes. If a test uses both patterns in one file, the isolation boundary becomes unclear.

**Why it happens:**
The existing codebase documents the `_exec` pattern in CLAUDE.md but does not document when to use `_exec` vs `mock.module`. New contributors use whatever pattern they see first in a nearby test file.

**How to avoid:**
Add an explicit decision rule to CLAUDE.md:
- Use `_exec` property replacement for modules that export `_exec` (git.ts, lifecycle.ts, integration plugins)
- Use `mock.module()` only for modules that do not export `_exec` and cannot be refactored to do so (external npm packages, config.ts I/O paths)
- Never mix both approaches for the same module in the same test file

**Warning signs:**
- A test for a new workspace domain module uses `mock.module("@/lib/workspace-lifecycle")` when the module exports `_exec` — the property replacement approach would be cleaner
- Two test files for related modules use different injection approaches with no comment explaining why
- `scripts/test-runner.ts` isolation logic starts failing for test files that combine both patterns

**Phase to address:**
DI design phase — document the decision rule before implementation so test authors have clear guidance.

---

### Pitfall 8: Structured Logging Adds Latency to `getWorkspaceListInfo` (the Hot Path)

**What goes wrong:**
`getWorkspaceListInfo` is called for every workspace in `git-stacks list` and in the TUI dashboard's workspace list render. It runs `Promise.all` across repos doing dirty checks and ahead/behind computations. Adding structured log calls inside this function (even at `debug` level) adds overhead: log serialization, string formatting, and potentially I/O if the logger is not buffered. At `warn` default level this is filtered before serialization in well-implemented loggers (Pino filters before format). But if the logger is Pino with a slow transport (file, network), even `warn`-level overhead can impact the 5-minute TUI poll cycle.

The more concrete risk: adding `logger.debug({ workspace, repos }, "computing ahead/behind")` inside `getWorkspaceListInfo` serializes the entire `workspace` object on every call. The workspace object includes all repo metadata. For a workspace with 5 repos, this serializes ~5KB of data per call at debug level. In the TUI, `getWorkspaceListInfo` is called on cursor movement to refresh the detail pane — user-visible latency on every arrow keypress.

**Why it happens:**
Developers add detailed debug logs inside hot loops without measuring the serialization cost. "It's only at debug level" assumes the logger filters before serialization — not all loggers do.

**How to avoid:**
Use lazy log evaluation where possible:
```ts
if (logger.isLevelEnabled("debug")) {
  logger.debug({ workspaceName: workspace.name, repoCount: repos.length }, "computing ahead/behind")
}
```
Or use Pino's approach where object serialization is deferred. Never log the full workspace or repo object — log only scalar identifiers. Add a performance test: `getWorkspaceListInfo` with 5 repos must complete in under 500ms with logging enabled at `debug` level.

**Warning signs:**
- `logger.debug(workspace, "...")` with the full workspace object as the first argument
- No performance test for `getWorkspaceListInfo` latency before and after logging is added
- TUI arrow key navigation feels sluggish after logging is introduced (noticeable in interactive testing)

**Phase to address:**
Logging implementation phase — add a performance regression test for `getWorkspaceListInfo` before adding any log calls to it.

---

### Pitfall 9: Re-export Intermediaries Left in Place Indefinitely, Creating Import Path Confusion

**What goes wrong:**
The safe extraction pattern (see Pitfall 6) uses re-exports from `workspace-ops.ts` as an intermediary: split the module, re-export for backward compatibility, then update callers. But the "then update callers" step is often deferred because tests pass and there is no forcing function. The re-exports persist indefinitely. Three months later, `workspace-ops.ts` is a file full of re-exports that developers import from (because it still works), while the actual implementations live in `workspace-lifecycle.ts` and `workspace-sync.ts`. New functions get added to workspace-ops.ts directly (because that's where everything is imported from). The split never fully happens.

The specific risk for the npm package: the published package includes all source files. Users who deep-import (`import { openWorkspace } from 'git-stacks/lib/workspace-ops'`) — unlikely but possible — will get re-exported functions. If workspace-ops.ts is eventually removed, it is a breaking change for those users.

**Why it happens:**
Re-exports are "just a one-liner" and removing them requires updating callers, which touches many files. The re-export is the path of least resistance. Without a deadline or enforcement mechanism, it stays.

**How to avoid:**
Set a maximum lifetime for re-export intermediaries: they must be removed within the same milestone that introduces them. The extraction phase and the caller-update phase are the same phase (or consecutive phases in the same PR). Use `@deprecated` JSDoc comments on re-exported functions to cause IDE warnings on the old import path:
```ts
/** @deprecated Import from './workspace-lifecycle' directly */
export { openWorkspace } from "./workspace-lifecycle"
```

**Warning signs:**
- `workspace-ops.ts` exists only as re-exports after the extraction milestone — the file was not removed or repurposed
- New functions added to the re-export file rather than the domain module it should belong to
- `grep "from.*workspace-ops" src/` still shows hits in commands/ and tui/ after the migration phase

**Phase to address:**
Extraction completion phase — the PR that splits the module must include the caller updates, not a separate follow-up.

---

### Pitfall 10: Logger Instance Creation Pattern Incompatible with Bun ESM Module Caching

**What goes wrong:**
In Node.js/Bun ESM, a module is evaluated once and the result is cached. If `logger.ts` creates and exports a singleton logger instance:
```ts
export const logger = pino({ level: process.env.GIT_STACKS_LOG_LEVEL ?? "warn" })
```
The log level is set at module evaluation time, not at call time. If a test sets `process.env.GIT_STACKS_LOG_LEVEL = "debug"` after the module is imported, the logger ignores it — the level was already read. Tests that verify log output by setting an env var before a function call will fail silently (logger still at `warn`, no debug output captured).

The TUI context makes this worse: the TUI imports workspace-ops which imports the logger. The logger is created with whatever log level `process.env` has at startup. There is no mechanism to change the log level once the TUI is running — a user cannot enable debug logging mid-session.

**Why it happens:**
Singleton module-level logger instances are the standard pattern in Node.js applications. They work correctly when the process starts with all configuration in place. They fail when log level needs to change dynamically (test setup, `--log-level` flag on a specific command).

**How to avoid:**
Separate logger creation from logger configuration. Create the singleton, but set the level lazily:
```ts
// logger.ts
export const logger = pino()  // created at module load with default level

export function configureLogger(level: string): void {
  logger.level = level  // Pino supports dynamic level changes
}
```
Call `configureLogger(process.env.GIT_STACKS_LOG_LEVEL ?? "warn")` in `src/index.ts` (the Commander entrypoint) after all environment is established. Tests call `configureLogger("debug")` before the function under test.

**Warning signs:**
- Logger level read from `process.env` at module evaluation time (top-level `const`)
- No `configureLogger` or equivalent function in the logger module
- Tests that set `process.env.GIT_STACKS_LOG_LEVEL` and then import the module under test — the env var change arrives too late

**Phase to address:**
Logging infrastructure phase — the lazy configuration pattern must be in the initial implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Re-export intermediaries left indefinitely | No callers need updating immediately | workspace-ops.ts never fully decomposed; new code added to the wrong file | Never — set a removal deadline in the same milestone |
| Mixed `_exec` and `mock.module` patterns for the same module | Test passes quickly | Test authors unsure which approach to use; isolation edge cases | Never — pick one pattern per module |
| Logger level hardcoded at module load time | Simple singleton | Tests cannot change log level without re-importing module; `--log-level` flag ignored | Never — use lazy configuration |
| `logger.info()` calls on the hot path (`getWorkspaceListInfo`) | Detailed observability | User-visible latency in TUI on every arrow keypress at debug level | Acceptable at debug level only if serialization is deferred/lazy |
| Class-based DI alongside `_exec` pattern | "Modern" architecture | Two competing test patterns; callers must change signatures; TUI components affected | Never — keep property injection pattern for consistency |
| Default log level `info` in production | More log output without configuration | Pipe-based users (`--json \| jq`) get corrupted output; TUI screen corruption | Never — default must be `warn` or `silent` |
| Split modules with behavioral changes in same commit | Fewer commits | Cannot bisect whether breakage is from split or from behavior change | Never — separate structural changes from behavioral changes |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `mock.module()` after module split | Mocking the old `workspace-ops` path when the function has moved | Update every `mock.module` path in lockstep with every function move |
| Pino logger + TUI (OpenTUI) | Pino writes to stderr even in TUI mode; ANSI escape sequences are corrupted | Force `logger.level = "silent"` before launching the TUI renderer in `git-stacks manage` |
| Pino logger + `--json` flag | `pino` default pretty-print transport writes to stdout | Always use `pino.destination(2)` (stderr) or explicit `stream: process.stderr` |
| Pino with Bun | Pino's `pino/file` transport uses Node.js `worker_threads` — not available in Bun without polyfill | Use `pino({ transport: undefined })` with a custom Bun-compatible stream; avoid worker-based transports |
| `_exec` pattern on new domain modules | New module calls `$` shell directly without exporting `_exec` | Every module that calls `$` or `Bun.spawn` must export `_exec`; tests must inject before calling any function |
| `useIsolatedConfig` + logger | Logger singleton initialized before `useIsolatedConfig` redirects `HOME` | Create logger after config isolation is set up; or use lazy logger initialization |
| TUI `runHooksCaptured` + logger | Logger writes to stderr during captured hooks; output mixed with capture | Logger must be silent or redirected during `runHooksCaptured` calls |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full workspace object serialized in debug log inside `getWorkspaceListInfo` | TUI arrow-key navigation takes 200–500ms | Log only scalar identifiers; use `isLevelEnabled` guard | With logging enabled at debug level, 3+ repos |
| Synchronous log writes on the critical path (git-stacks list) | `git-stacks list` slower than pre-logging baseline | Use async/buffered log transport; measure before/after baseline | At `info` level; any workspace with 5+ repos |
| Multiple small modules all importing the logger singleton causes import chain delay | Cold-start latency increases by 50–100ms | Keep logger module minimal; no side effects at import time | After 10+ domain modules all import logger at startup |
| Circular import detection at runtime (undefined values) | Random `TypeError: X is not a function` on first call | Run `madge --circular src/` before and after each split | Immediately on first test run after introducing a cycle |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Structured log output includes workspace env vars | Secret values from `${{ op://... }}` references appear in log output | Never log `workspace.env` values; log only key names, not values |
| Logger writes to a file in the workspace directory | Log file committed to a git repo if inside a tracked path | Default log destination is stderr; file logging requires explicit opt-in with a path outside any workspace |
| Debug logs expose resolved secret values | Resolved plaintext secrets in log output captured by log aggregation systems | `resolveSecrets` result must never be passed to any log call; mask values in log output |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Default log level `info` — users see JSON lines in terminal | Every command outputs structured JSON to stderr; users confused | Default `warn`; users must explicitly set `GIT_STACKS_LOG_LEVEL=debug` to see internal logs |
| Log output intermixed with `onProgress` callback output | User sees both human-readable progress AND structured log lines for the same event | Log events and progress events are distinct concerns; do not duplicate them |
| `--log-level` flag on every subcommand vs. global flag | Users must remember to add `--log-level debug` to each specific command | Single global `--log-level` flag on the root Commander command; inherited by all subcommands |
| Log output visible during `git-stacks manage` TUI | Screen corruption: ANSI frames mixed with JSON log lines | Detect TUI mode and force `logger.level = "silent"` before rendering starts |

---

## "Looks Done But Isn't" Checklist

- [ ] **Module split: no circular imports:** Run `madge --circular src/` (or equivalent) after each split — zero cycles before merge
- [ ] **Module split: re-exports removed:** After caller updates, workspace-ops.ts has no re-exports of moved functions — verified by grep
- [ ] **Mock coverage: all mock.module paths updated:** After each split, `grep -r "mock.module" tests/` shows no references to moved function paths
- [ ] **Logger: stderr transport:** Verify with a test that `git-stacks list --json 2>/dev/null` produces valid JSON — no log lines in stdout
- [ ] **Logger: default level warn:** Run `git-stacks open <workspace>` without env vars — no log output emitted to stderr
- [ ] **Logger: TUI silent mode:** Run `git-stacks manage` and verify no log output corrupts the screen — checked with a TUI headless test
- [ ] **Logger: dynamic level change:** Test sets `GIT_STACKS_LOG_LEVEL=debug` then calls a function — debug log is captured
- [ ] **DI consistency: all new modules export `_exec`:** Every new domain module that spawns subprocesses has `export const _exec = { ... }` — verified by grep
- [ ] **`_exec` tests for new modules:** New domain modules have tests that inject `_exec` mocks — not just `mock.module` — matching existing patterns in git.test.ts and lifecycle.test.ts
- [ ] **Hot path performance:** `getWorkspaceListInfo` benchmark (5 repos) does not regress by more than 10% after logging is added

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Circular import introduced during split | LOW | Identify cycle with `madge --circular src/`; extract shared types to a new `workspace-types.ts`; remove cycle |
| Mock paths not updated after split — tests pass incorrectly | MEDIUM | Add mock assertion (`toHaveBeenCalled`) to all tests that rely on mock isolation; re-run with assertions; fix paths |
| Logger writing to stdout corrupts `--json` output | MEDIUM | Change transport to `pino.destination(2)` (stderr); re-run `--json` integration tests |
| TUI screen corruption from logger | LOW | Add `logger.level = "silent"` guard before TUI renderer; existing TUI test suite will catch regression |
| Re-exports left indefinitely — new code added to wrong module | MEDIUM | Identify all re-exports in workspace-ops.ts; add `@deprecated` JSDoc; enforce removal in next milestone |
| DI and `_exec` patterns mixed — test authors confused | MEDIUM | Document decision rule in CLAUDE.md; add a lint rule or test helper that enforces pattern per module |
| Logger level set at module load time — tests cannot control it | LOW | Add `configureLogger(level)` function; call in index.ts; update tests to call `configureLogger` instead of setting env var |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Circular imports from module split | Phase 1: intra-module dependency graph before any splitting | `madge --circular src/` returns zero cycles after each split commit |
| Mock paths not updated after split | Every extraction phase — lockstep with each function move | grep for mock.module references to moved paths returns zero hits |
| DI fights `_exec` pattern | DI design phase — decision documented in CLAUDE.md before code written | All new modules follow same injection pattern as git.ts and lifecycle.ts |
| Logger corrupts stdout / TUI | Logging infrastructure phase — transport and default level fixed before any log calls | `--json` output parses as valid JSON; TUI headless tests pass |
| Log verbosity noise for users | Logging design phase — taxonomy established before calls added | Default `warn` level: no output on a clean `git-stacks list` run |
| Logger level baked at module load | Logging infrastructure phase — lazy configuration from the start | Test: set env var after import → `configureLogger` still changes the level |
| Re-exports left indefinitely | Extraction completion phase — callers updated in same PR | `grep "from.*workspace-ops" src/` returns only legitimate imports, not re-exported moved functions |
| Module split with behavioral changes | Every extraction phase — structural change and behavior change in separate commits | Each split commit: only file moves + re-exports; behavioral changes in subsequent commits |
| Full workspace object in debug log | Logging implementation phase — performance test for `getWorkspaceListInfo` before adding log calls | Benchmark: `getWorkspaceListInfo(workspace, 5 repos)` < 500ms at debug level |
| Logger incompatible with Bun ESM | Logging infrastructure phase — test with Bun specifically (not Node.js) | Pino logger works in Bun without worker_threads; `bun run test` passes with logger imported |

---

## Sources

- `src/lib/workspace-ops.ts` — 1735 lines; imports from config, git, lifecycle, integrations/runner, files, ports, secrets — full import graph analyzed
- `tests/lib/workspace-ops.test.ts` — `mock.module("@/lib/lifecycle")`, `_exec` injection, `useIsolatedConfig` patterns — test architecture confirmed
- `CLAUDE.md` — `_exec` injection pattern documentation; `mock.module` vs `_exec` usage notes; TUI `runHooksCaptured` requirement; Bun APIs (no Node.js compat required)
- Bun ESM module caching behavior — module evaluated once; singleton values set at evaluation time; dynamic `process.env` changes after import do not affect existing module-level constants
- Pino documentation — `logger.level` is dynamically settable post-creation; `pino.destination(fd)` for file descriptor targeting; `pino/file` transport uses worker_threads (incompatible with Bun without polyfill)
- TypeScript circular import behavior — `tsc --noEmit` does not error on circular imports; runtime undefined values are the symptom; `madge` is the detection tool
- Commander.js global flag inheritance — root-level `.option()` is inherited by all subcommands; subcommand-level options are not available on the root command

---
*Pitfalls research for: core engine extraction (workspace-ops.ts split), DI pattern consistency, structured logging for Bun CLI*
*Researched: 2026-04-05*
