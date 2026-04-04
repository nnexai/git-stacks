# Technical Concerns

**Analysis Date:** 2026-04-04

## High Priority

### Dashboard App.tsx God Component (1523 lines)
- **Issue:** `src/tui/dashboard/App.tsx` is 1523 lines with heavy `as any` casting (14 occurrences), inline workspace creation logic (lines 760-962), and mixed concerns (state management, keyboard handlers, business logic, rendering). It duplicates env file writing and file ops logic that already exists in `src/lib/workspace-ops.ts`.
- **Files:** `src/tui/dashboard/App.tsx`
- **Impact:** Every dashboard change risks regressions in unrelated flows. The `as any` casts defeat type safety for view state (e.g., `(view() as any).index`, `(view() as any).prefill`), workspace file ops (`(wsRepo as any).files`), and status rendering (`(status() as any).repos`). Contributors must understand the full 1523 lines to safely modify any behavior.
- **Fix approach:** Extract workspace creation into a dedicated function (reuse `workspace-ops.ts` patterns). Replace `as any` casts with discriminated union types for view state. Extract keyboard handler into a separate hook.

### `cmd` Secret Resolver Executes Arbitrary Shell Commands
- **Issue:** The `cmd` resolver in `src/lib/secrets.ts:156-165` runs `sh -c <user-provided-path>` with a 10-second timeout. Any env var value matching `${{ cmd:<anything> }}` results in arbitrary command execution. While this is by design, the resolver is enabled by default when listed in `config.yml` secrets.resolvers, and there is no sandboxing, allowlisting, or audit logging.
- **Files:** `src/lib/secrets.ts` (lines 156-165, 167-171)
- **Impact:** A shared template with `env: { DANGEROUS: "${{ cmd:rm -rf ~ }}" }` would execute on `git-stacks open`. The `cmd` resolver is not in the default set (only `keychain` and `env` are defaults at line 10), but adding it to config is a single YAML line.
- **Fix approach:** Add a confirmation prompt or `--trust` flag when `cmd` resolver is first used. Log all `cmd` resolutions to stderr. Consider requiring explicit opt-in per-workspace rather than global enablement.

### No Schema Migration System
- **Issue:** `src/lib/config.ts:152` has a comment "Migration strategy: bump default when schema changes; read-time migration functions keyed by version" but no migration code exists. The `schema_version` field is hardcoded to `"1"` in all creation paths (11 occurrences across `src/tui/workspace-wizard.ts`, `src/tui/template-wizard.ts`, `src/tui/dashboard/App.tsx`, `src/commands/repo.ts`, `src/tui/repo-wizard.ts`). When the schema does change, existing YAML files will fail Zod validation with no upgrade path.
- **Files:** `src/lib/config.ts:152`, all creation paths
- **Impact:** Any schema change is a breaking change for existing users. Adding a required field or restructuring YAML will crash on read for every existing workspace/template.
- **Fix approach:** Implement a version-dispatch pattern in `readYaml()` that calls migration functions keyed by `schema_version`. Add a `git-stacks migrate` command as a fallback.

## Medium Priority

### Port Lock File Has No Stale Lock Recovery
- **Issue:** `src/lib/ports.ts:19-58` uses a file-based lock (`~/.config/git-stacks/.ports.lock`) with a 5-second timeout. If the process crashes or is killed (SIGKILL) while holding the lock, the file persists and all subsequent port allocations fail with a timeout. The only cleanup is `process.on("exit", release)` which does not fire on SIGKILL. There is no SIGINT/SIGTERM handler.
- **Files:** `src/lib/ports.ts` (lines 19-58), `src/lib/paths.ts:17`
- **Impact:** A crashed `git-stacks open` permanently blocks all future port allocations until the user manually deletes `~/.config/git-stacks/.ports.lock`.
- **Fix approach:** Write PID into the lock file. On lock acquisition failure, check if the PID is still alive. If not, delete the stale lock and retry. Add SIGINT/SIGTERM handlers.

### Repeated readGlobalConfig() Calls (31 occurrences across 16 files)
- **Issue:** `readGlobalConfig()` re-reads and re-parses `~/.config/git-stacks/config.yml` on every call. A single `openWorkspace` invocation calls it at least twice (once directly, once via `allocatePorts` which calls `listWorkspaces` which parses all workspace YAMLs). The `findWorkspaceFile()` function scans all YAML files in the workspaces directory for every `workspaceExists()` and `readWorkspace()` call.
- **Files:** `src/lib/config.ts` (lines 221-240, 267-269, 282-290), `src/lib/workspace-ops.ts`
- **Impact:** For a user with 50+ workspaces, every command reads and Zod-parses all workspace YAML files multiple times. Currently tolerable but scales poorly.
- **Fix approach:** Add a per-process in-memory cache for config reads. Invalidate on write. Alternatively, index workspace names by filename (the common case) and fall back to scan only when filename doesn't match.

### `workspace-ops.ts` is 1699 Lines
- **Issue:** `src/lib/workspace-ops.ts` contains all workspace lifecycle operations (open, close, clean, remove, merge, rename, sync, push, pull, status, env, CWD detection). Functions are well-structured individually but the file is unwieldy.
- **Files:** `src/lib/workspace-ops.ts`
- **Impact:** Difficult to navigate. Related concerns are far apart (e.g., `mergeWorkspace` at line 649, `syncWorkspace` at line 1240). Adding new operations increases the problem.
- **Fix approach:** Split into focused modules: `workspace-lifecycle.ts` (open/close/clean/remove/merge), `workspace-sync.ts` (sync/push/pull), `workspace-env.ts` (env resolution and file writing), `workspace-status.ts` (status/list/detect).

### `process.env.HOME` Mutation in Tests
- **Issue:** Tests redirect `process.env.HOME` and use `GIT_STACKS_CONFIG_DIR` to isolate config paths, then dynamically re-import modules. Path constants in `src/lib/paths.ts` are computed at module load time (`export const WS_CONFIG_DIR = process.env.GIT_STACKS_CONFIG_DIR ?? ...`), so re-importing is required after env changes. If Bun ever caches ESM modules across re-imports, these tests break silently.
- **Files:** `src/lib/paths.ts` (lines 10-11), `tests/lib/config.test.ts`
- **Impact:** Fragile test isolation. The custom test runner (`scripts/test-runner.ts`) exists partly to work around mock pollution between files.
- **Fix approach:** Make path resolution injectable (accept a config dir parameter) rather than reading env at module load time.

### Dashboard Duplicates Workspace Creation Logic
- **Issue:** `src/tui/dashboard/App.tsx` (lines 760-962) contains inline workspace creation that duplicates logic from `src/tui/workspace-wizard.ts`. The dashboard version handles worktree creation, file ops, env file writing, and hook execution independently, without calling the shared `openWorkspace()` or the wizard's creation flow. This means bug fixes to the wizard don't propagate to the dashboard and vice versa.
- **Files:** `src/tui/dashboard/App.tsx` (lines 760-962), `src/tui/workspace-wizard.ts` (lines 150-250)
- **Impact:** Two code paths for workspace creation that must be kept in sync manually. The dashboard version notably skips secret resolution during creation.
- **Fix approach:** Extract a shared `createWorkspace()` function in `workspace-ops.ts` that both the wizard and dashboard call.

## Low Priority

### `@clack/prompts` Empty-String Quirk
- **Issue:** `@clack/prompts` returns `undefined` (not `""`) on empty text input. A `safeText()` wrapper exists in `src/tui/utils.ts`, but any new TUI code using `p.text()` directly will receive `undefined` as a string, causing silent bugs.
- **Files:** `src/tui/utils.ts`
- **Impact:** Footgun for contributors adding TUI prompts.
- **Fix approach:** Document in CLAUDE.md (already done). Consider re-exporting a modified `prompts` object that wraps `text` automatically.

### Legacy Artifact Generators Alongside Integration Plugins
- **Issue:** Standalone artifact generators (`src/lib/vscode.ts`, `src/lib/intellij.ts`, `src/lib/cmux.ts`, `src/lib/tmux.ts`) exist alongside their integration plugin counterparts in `src/lib/integrations/`. The integrations call the standalone generators, creating two layers. The dashboard imports from both.
- **Files:** `src/lib/vscode.ts`, `src/lib/intellij.ts`, `src/lib/cmux.ts`, `src/lib/tmux.ts`, `src/lib/integrations/vscode.ts`, `src/lib/integrations/intellij.ts`, etc.
- **Impact:** Confusion about which layer to modify. Adding a new integration requires touching both layers.
- **Fix approach:** Inline the standalone generators into their integration plugin files, or document the split as intentional (generator = pure artifact writer, integration = lifecycle wrapper).

### No Formatter Configured
- **Issue:** No Prettier, Biome, or other formatter is configured. Formatting consistency relies on developer discipline and CLAUDE.md conventions.
- **Files:** Project root (no `.prettierrc`, no `biome.json`, no `eslint.config.*`)
- **Impact:** Minor inconsistencies in formatting across files. Low impact given single-developer project.
- **Fix approach:** Add Biome or Prettier with a minimal config matching existing style.

### `Bun.sleepSync` Blocks Event Loop
- **Issue:** `src/lib/ports.ts:32` uses `Bun.sleepSync(50)` in a retry loop for lock acquisition. This blocks the event loop for up to 5 seconds (100 retries x 50ms) if the lock is contended.
- **Files:** `src/lib/ports.ts:32`
- **Impact:** Blocks all async operations during lock wait. Acceptable for CLI but would be problematic if the codebase ever runs in a long-lived server context.
- **Fix approach:** Convert to async sleep with `await Bun.sleep(50)` and make `acquireLock()` async.

## Technical Debt

### Dashboard `as any` Casts (14 occurrences)
- **Debt:** The view state in `App.tsx` uses a single signal that holds different shapes depending on the current view. Accessing view-specific fields requires `(view() as any).index`, `(view() as any).prefill`, `(view() as any).message`, etc.
- **Files:** `src/tui/dashboard/App.tsx` (lines 133, 135, 238, 909, 910, 916, 1253, 1325, 1351, 1362, 1371, 1428), `src/tui/dashboard/WorkspaceDetail.tsx` (line 62), `src/tui/dashboard/StatusIndicator.tsx` (lines 17, 20)
- **Cleanup:** Define a discriminated union type for `ViewState` with distinct shapes per view, then use TypeScript narrowing instead of casts.

### `err: any` in Port Lock
- **Debt:** `src/lib/ports.ts:30` uses `catch (err: any)` which is the only `any` type annotation in the `src/lib/` layer.
- **Files:** `src/lib/ports.ts:30`
- **Cleanup:** Replace with `catch (err: unknown)` and narrow with `err instanceof Error` or duck-type `(err as {code?: string}).code`.

### Silent `catch {}` Blocks (40+ occurrences)
- **Debt:** Numerous empty catch blocks throughout the codebase silently swallow errors. Most are intentional (e.g., checking if a file exists by trying to lstat it), but some hide real failures (e.g., `src/tui/dashboard/App.tsx:317`, `src/tui/dashboard/App.tsx:565`).
- **Files:** Spread across `src/tui/dashboard/App.tsx`, `src/lib/config.ts`, `src/lib/aerospace.ts`, `src/lib/niri.ts`, `src/tui/dashboard/run.tsx`, `src/lib/integrations/*.ts`
- **Cleanup:** Add inline comments explaining what error is expected in each empty catch. For non-obvious cases, log to stderr at debug level.

### Rename Uses String.replace Instead of Path Manipulation
- **Debt:** `renameWorkspace()` in `src/lib/workspace-ops.ts` (lines 1039-1059) uses `String.replace()` to compute new worktree paths from old ones. This is fragile if the old workspace name is a substring of the path for other reasons.
- **Files:** `src/lib/workspace-ops.ts` (lines 1039-1059)
- **Cleanup:** Compute new paths from components (`join(tasksDir, newName, repoName)`) rather than string replacement.

### `workspaceExists()` Scans All YAML Files
- **Debt:** `workspaceExists(name)` at `src/lib/config.ts:282-283` calls `findWorkspaceFile(name)` which reads and Zod-parses every `.yml` file in the workspaces directory to find one by name. This happens because the YAML `name` field might not match the filename.
- **Files:** `src/lib/config.ts` (lines 221-240, 282-283)
- **Cleanup:** Fast path: check if `{name}.yml` exists and its `name` field matches. Fall back to full scan only if the fast path fails. The `findWorkspaceNameDrift()` in doctor already detects mismatches.

## Security Considerations

### Hook Commands Have Full Shell Access
- **Risk:** Hooks execute arbitrary shell commands via `sh -c` with inherited environment. A shared template with malicious hooks could execute harmful commands.
- **Files:** `src/lib/lifecycle.ts` (lines 55-78), `src/lib/secrets.ts` (lines 156-165)
- **Current mitigation:** Hooks come from user-authored YAML, not external input. `NameSchema` in `src/lib/config.ts:51-53` restricts workspace/template names to `[A-Za-z0-9._-]+`, preventing shell injection via name-based env vars.
- **Recommendations:** Document the trust model clearly. When sharing templates, users should review hooks before use. Consider a `--dry-run` flag for hooks that shows what would execute.

### Env File Path Traversal Protection
- **Risk:** The `env_file` field could theoretically point to paths outside the repo root.
- **Files:** `src/lib/workspace-ops.ts` (lines 242-248)
- **Current mitigation:** `writeEnvFiles()` validates that `resolve(repo.task_path, envFileName)` starts with `resolve(repo.task_path)`, rejecting path traversal. Symlink targets are also rejected (line 252-256). This is well-implemented.
- **Recommendations:** No action needed. The path traversal protection is thorough.

### IPC Socket Has No Authentication
- **Risk:** The Unix socket at `/tmp/git-stacks.sock` accepts JSON messages from any local process. A malicious local process could inject fake messages into the dashboard notification system.
- **Files:** `src/tui/dashboard/run.tsx` (lines 33-63), `src/lib/messages.ts` (lines 68-97)
- **Current mitigation:** Messages are display-only (notification overlay). No control actions are exposed over the socket. Impact is limited to visual noise.
- **Recommendations:** Low priority. If control actions are ever added to the socket, add token-based auth.

### Secret Values in Process Environment
- **Risk:** Resolved secrets are merged into `process.env` via hook execution (`mergedEnv = { ...process.env, ...env }`). Child processes spawned by hooks inherit all resolved secrets.
- **Files:** `src/lib/lifecycle.ts` (line 63), `src/lib/workspace-ops.ts` (lines 892-905)
- **Current mitigation:** This is intentional behavior (secrets must be available to hooks). Secrets are not written to YAML or logs.
- **Recommendations:** Document that hooks and their child processes have access to resolved secrets. Consider masking secret values in progress output.

## Performance Considerations

### Workspace List Always Runs Dirty Checks and Ahead/Behind
- **Problem:** `git-stacks list` runs `git status --porcelain` and three `git rev-list --count` commands per worktree repo. For a user with 10 workspaces averaging 3 worktree repos each, that is 40+ git subprocess spawns.
- **Files:** `src/lib/workspace-ops.ts` (lines 94-152)
- **Cause:** The `_checkStatus` parameter is ignored (line 96-97: "dirty check is always on now per UX-04"). Ahead/behind always computed.
- **Improvement path:** Cache results for a short TTL (e.g., 5 seconds). Or compute ahead/behind only when `--status` flag is passed, leaving the always-on check for dirty only.

### No Config Read Caching
- **Problem:** Each `readGlobalConfig()` call reads and Zod-parses `config.yml`. Each `workspaceExists()` call scans all workspace YAML files.
- **Files:** `src/lib/config.ts`
- **Cause:** No in-memory caching. Every function independently reads from disk.
- **Improvement path:** Add a process-level config cache that invalidates on `writeGlobalConfig()` / `writeWorkspace()` calls.

## Scalability Notes

### Workspace Count Linear Scan
- **Current capacity:** Works well with <50 workspaces.
- **Limit:** `findWorkspaceFile()` and `listWorkspaces()` scan every `.yml` file in the directory. At 200+ workspaces, startup latency becomes noticeable (200+ file reads + Zod parses per command).
- **Scaling path:** Index by filename (fast path), or introduce a lightweight index file that maps names to filenames.

### Port Allocation Contention
- **Current capacity:** Single-process CLI usage. Lock is held for <100ms typically.
- **Limit:** The synchronous lock with 5-second timeout would bottleneck concurrent AI agents each opening workspaces simultaneously.
- **Scaling path:** Convert to async lock. Consider per-workspace port ranges to eliminate contention entirely.

## Test Coverage Gaps

### No Unit Tests for `pushWorkspace`
- **What's not tested:** `pushWorkspace()` in `src/lib/workspace-ops.ts` (lines 1152-1238) has integration-level tests (`tests/lib/workspace-ops.test.ts:344`) but these mock the git layer. The actual `pushBranch()` function in `src/lib/git.ts` (lines 171-229) with its complex error categorization (non-fast-forward, no upstream, auth failure, network error) lacks dedicated unit tests against real git repos.
- **Files:** `src/lib/git.ts` (lines 171-229)
- **Risk:** Incorrect error categorization could lead to misleading user messages.
- **Priority:** Medium

### No Tests for Dashboard Workspace Creation
- **What's not tested:** The inline workspace creation flow in `src/tui/dashboard/App.tsx` (lines 760-962) is not tested. It is a separate code path from the wizard-based creation in `src/tui/workspace-wizard.ts`.
- **Files:** `src/tui/dashboard/App.tsx` (lines 760-962)
- **Risk:** Dashboard creation could diverge from CLI creation (different hooks fired, different env handling, missing secret resolution).
- **Priority:** High

### No Tests for Stale Lock Recovery
- **What's not tested:** There are no tests verifying behavior when the port lock file is stale (left behind by a crashed process). `src/lib/ports.ts` has tests (`tests/lib/ports.test.ts`) but they test the happy path of lock acquisition and release.
- **Files:** `src/lib/ports.ts` (lines 19-58), `tests/lib/ports.test.ts`
- **Risk:** Users encountering a stale lock have no recovery path other than manual deletion.
- **Priority:** Medium

### Integration Command Tests Are Shallow
- **What's not tested:** `tests/lib/integration-commands.test.ts` (284 lines) tests that integration commands register and respond to `--help`, but does not test actual execution of forge operations (PR creation, issue listing). These are inherently hard to test without real forge APIs.
- **Files:** `tests/lib/integration-commands.test.ts`
- **Risk:** Low (forge CLI wrappers are thin). But command argument parsing errors would go undetected.
- **Priority:** Low

---

*Concerns audit: 2026-04-04*
