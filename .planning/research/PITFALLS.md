# Pitfalls Research

**Domain:** AeroSpace window manager integration — adding macOS tiling WM support to an existing CLI workspace manager (git-stacks v0.11.0)
**Researched:** 2026-03-28
**Confidence:** HIGH (pitfalls grounded in direct reads of `_references/aerospace.md`, `src/lib/niri.ts`, `src/lib/integrations/niri.ts`, `tests/lib/niri.test.ts`, `tests/lib/integrations/niri.test.ts`, and `src/lib/integrations/types.ts`)

---

## Critical Pitfalls

### Pitfall 1: Using `split` When Normalization Is Enabled

**What goes wrong:**
`aerospace split vertical` (and `split horizontal`, `split opposite`) returns exit code `1` with the message:

```
'split' has no effect when 'enable-normalization-flatten-containers' normalization enabled.
My recommendation: keep the normalizations enabled, and prefer 'join-with' over 'split'.
```

If the implementation calls `split` without first detecting normalization state, it silently fails — the command exits non-zero, the layout does not change, and no window stacking occurs. With the default AeroSpace config (`enable-normalization-flatten-containers = true`), `split` is effectively unavailable for the vast majority of users.

**Why it happens:**
The AeroSpace beta documentation treats `split` and `join-with` as alternatives. Developers familiar with i3/Sway assume `split` works unconditionally. The normalization setting is buried in TOML config and not surfaced by `aerospace split` itself until it fails. Since `_exec.run` calls in tests use mocked responses, tests pass even when the real command would fail.

**How to avoid:**
Do not expose `split` as a user-facing layout primitive at all. Use `join-with` plus `flatten-workspace-tree` as the layout substrate for all implementations. The implementation should not accept a `split` option in its config schema. If a future AeroSpace version makes `split` normalization-aware, it can be added then.

If normalization detection is needed for any other purpose, read `enable-normalization-flatten-containers` from the TOML config file directly — `aerospace config --get` does not reliably expose all TOML keys (observed in `_references/aerospace.md`).

**Warning signs:**
- Any call to `_exec.run(["split", ...])` anywhere in `src/lib/aerospace.ts`
- A config schema that includes a `split_direction` or `split` option for users
- Tests that only verify `split` exits 0 using a mocked `_exec` without testing the real exit-code behavior

**Phase to address:**
AeroSpace shell wrappers (`src/lib/aerospace.ts`) — never implement a `split` wrapper. The layout control wrapper should be `joinWith(direction)` and `flattenWorkspaceTree(workspace?)` only.

---

### Pitfall 2: Parsing `--format` Output with Split on Whitespace Instead of Tab

**What goes wrong:**
`list-windows --format '%{window-id}\t%{app-name}\t...'` uses tab as separator, but tab-delimited fields may have multiple spaces in `app-name` or `window-title` values. If the parser uses `.split(/\s+/)` or `.split(" ")` instead of `.split("\t")`, a window titled "My App — Feature Branch" splits into 4+ tokens instead of the expected field count. The `window-id` may parse correctly (it is numeric and always first), but `app-pid` or `workspace` shifts position and is read from the wrong column.

A subtler form: `window-title` can contain tabs if the application title contains one (rare but possible). A split-on-tab parser then produces more columns than expected for that row.

**Why it happens:**
The niri integration uses JSON output (parsed with `JSON.parse`), which has no delimiter ambiguity. Developers copying the niri pattern and adapting to AeroSpace may use a quick `.split(/\s+/)` without noticing that the format string uses `\t` delimiters. The `_references/aerospace.md` shows example rows with multiple spaces used for visual alignment — these are not the actual tab-separated values.

**How to avoid:**
Always split on `"\t"` (literal tab, not whitespace regex). Use a named-field parsing function that validates column count before accessing by index. If the column count does not match the format string's field count, skip the row and log a warning rather than indexing out of bounds.

For `window-title`, treat everything after the last expected fixed-position field as the title — do not assume title is free of tabs.

Example safe parsing approach:
```typescript
function parseWindowRow(row: string): AerospaceWindow | null {
  const fields = row.split("\t")
  if (fields.length < 7) return null  // guard: must have all expected fields
  const [windowId, appBundleId, appName, appPid, workspace, windowLayout, windowIsFullscreen, ...titleParts] = fields
  const windowTitle = titleParts.join("\t")  // re-join if title had embedded tabs
  // ...parse remaining fields
}
```

**Warning signs:**
- `.split(/\s+/)` or `.split(" ")` anywhere in the `--format` output parser
- Column access by fixed index without a field-count guard
- Tests that only use `app-name` values with no spaces and `window-title` values with no special characters

**Phase to address:**
AeroSpace shell wrappers — the parsing function in `listAerospaceWindows()` must use tab splitting from the first implementation.

---

### Pitfall 3: Cross-Platform Code Running `aerospace` Binary on Linux Build Machine

**What goes wrong:**
`aerospace` is a macOS-only binary. There is no `aerospace` command on Linux. If the implementation does not gate at the `isAerospaceRunning()` check, any code path that calls `_exec.run(["list-windows", ...])` on the Linux CI machine will fail with:

```
bun: command not found: aerospace
```

This causes tests to fail if the tests call the real `_exec.run` rather than the mocked version. It also causes the `open()` method in the integration plugin to crash rather than silently return `null`.

A related risk: the `doctor` command checks for `aerospace` binary availability. If doctor does not guard `macOS-only` and runs on a Linux developer machine, it outputs a false-positive "aerospace not found" error for every Linux user, polluting their doctor output with irrelevant warnings.

**Why it happens:**
The niri integration uses `process.env.NIRI_SOCKET` as its runtime gate — an environment variable that is only set when niri is running on Linux. AeroSpace has no equivalent socket env var. The gate for AeroSpace must be: (1) macOS platform check and (2) `aerospace` binary exists on PATH. If either check is omitted, the integration tries to run on Linux.

**How to avoid:**
`isAerospaceRunning()` must be a two-condition gate:

```typescript
export async function isAerospaceRunning(): Promise<boolean> {
  if (process.platform !== "darwin") return false
  const result = await _exec.run(["--version"])
  return result.exitCode === 0
}
```

The `open()` method in the integration plugin must check `isAerospaceRunning()` as its first line and return `null` immediately if false — matching the niri pattern exactly.

For doctor: doctor checks should gate on `process.platform === "darwin"` before attempting to resolve the aerospace binary. Report the check as "not applicable" (or skip entirely) on non-macOS platforms.

**Warning signs:**
- `isAerospaceRunning()` that only checks binary exit code without a `process.platform !== "darwin"` guard
- Doctor check for `aerospace` that runs unconditionally on all platforms
- Tests that do not set up the `_exec` mock and rely on the real binary being absent (accidental integration test rather than unit test)

**Phase to address:**
AeroSpace shell wrappers — `isAerospaceRunning()` must include the platform guard. Doctor checks — add `platform: "darwin"` condition before the binary check.

---

### Pitfall 4: Window Detection Race — Snapshot Taken After App Launch Instead of Before

**What goes wrong:**
The snapshot-delta strategy requires capturing the window list BEFORE the app launch action, then polling AFTER. If the `before` snapshot is taken after the launch command is issued (e.g., because the developer swaps the order), windows that appear very quickly (already-running apps opening a new window) may already appear in the "before" set. The delta then contains zero new IDs and the window is never moved to the target AeroSpace workspace.

A subtler form: there is a window between "before snapshot" and "launch" where another application opens a window. That window appears in the delta as a false positive. The integration then moves the wrong window to the target workspace.

**Why it happens:**
The niri `snapshotWindowIds()` function in `src/lib/niri.ts` handles this correctly — it takes the before-snapshot first, then calls `spawnFn()`. But the AeroSpace integration bypasses `snapshotWindowIds` (which is niri-specific) and implements its own before/after diff using `listAerospaceWindows()`. A copy-paste that misorders the steps introduces a race.

**How to avoid:**
The AeroSpace `snapshotWindowIds()` equivalent must follow the exact same ordering as niri:

```
1. before = await listAerospaceWindows()   // before set
2. await spawnFn()                          // launch
3. poll: after = await listAerospaceWindows()
4. newIds = after.filter(w => !before.has(w.windowId))
```

Make the ordering a test: the unit test for `snapshotAerospaceWindows` must assert that `spawnFn` is called AFTER the first `listAerospaceWindows` call (use call-order tracking as in `tests/lib/niri.test.ts` line 668).

**Warning signs:**
- Any snapshot implementation that calls `spawnFn()` before the before-snapshot
- Integration plugin that calls `listAerospaceWindows()` only once after spawn, not once before
- Missing exponential backoff — polling immediately once after spawn without a retry loop means slow-starting apps are always missed

**Phase to address:**
AeroSpace shell wrappers — implement `snapshotAerospaceWindows(spawnFn, opts)` with `_sleep` and `_listWindows` injection matching niri's pattern. The integration plugin then delegates to this function.

---

### Pitfall 5: `mock.module("@/lib/aerospace")` Not Re-Applied in aerospace.test.ts — Stale Mock From Integration Test Pollutes Unit Tests

**What goes wrong:**
The niri test file (`tests/lib/niri.test.ts`) contains a detailed comment explaining this exact problem (lines 6-11):

> `integration-commands.test.ts` mocks `@/lib/niri` (as a consumer test). Because of Bun's live binding patching, the real module captures in helpers.ts end up using the mock's `_exec` after integration-commands runs.

If `tests/lib/aerospace.test.ts` does not re-apply `mock.module("@/lib/aerospace", ...)` with its own local `_exec` implementation, the test runner may share a polluted module state from `tests/lib/integrations/aerospace.test.ts`. The `_exec.run` inside `aerospace.test.ts` would be the integration test's mock, which returns fixed responses regardless of the `args` passed. Tests would pass but verify nothing.

**Why it happens:**
Bun's `mock.module` patches live bindings at the module level. When the test runner executes files in the same process, mocks from file A can leak into file B. The project's test runner (`scripts/test-runner.ts`) runs mock-heavy files in isolated processes, but the isolation is only effective if aerospace.test.ts is added to the isolation list. If it is not listed, it runs in the shared process and is vulnerable.

**How to avoid:**
Follow the niri test pattern exactly:
1. `tests/lib/aerospace.test.ts` must re-apply `mock.module("@/lib/aerospace", ...)` at the top using its own local `_exec` object and inline implementations of all wrappers.
2. Add `tests/lib/aerospace.test.ts` and `tests/lib/integrations/aerospace.test.ts` to the isolation list in `scripts/test-runner.ts` (check how niri tests are listed there).
3. The integration test (`tests/lib/integrations/aerospace.test.ts`) must register all mocks via `mock.module("@/lib/aerospace", ...)` BEFORE any import of the integration module.

**Warning signs:**
- `tests/lib/aerospace.test.ts` that imports from `@/lib/aerospace` without a `mock.module` re-application at the top
- `scripts/test-runner.ts` does not include `aerospace.test.ts` in its isolation list
- Integration test that imports `@/lib/integrations/aerospace` before registering mocks (cross-file contamination pattern)

**Phase to address:**
AeroSpace shell wrappers test file — the mock re-application must be in the test file from the start, not added as a fix after mysteriously passing tests are observed.

---

### Pitfall 6: AeroSpace Workspace Named as Number vs. String — Move-Node-to-Workspace Type Confusion

**What goes wrong:**
AeroSpace workspaces can be named with numbers (e.g., `5`, `6`) or strings (e.g., `"main"`, `"feature-x"`). `move-node-to-workspace --window-id 21106 5` uses numeric name `5`. If the TypeScript implementation accepts the workspace target as `string | number` but the CLI always expects a string argument, passing `5` (number) calls `String(5)` which produces `"5"` — this works correctly for numeric workspace names.

The problem is the reverse: if a user configures `workspace: "05"` (zero-padded string) and the implementation coerces it through `Number()` somewhere, the leading zero is stripped and the window moves to workspace `5` instead of `05`. This may be a different workspace entirely.

A related issue: AeroSpace workspace names are case-sensitive. If the config stores `workspace: "Feature"` but the actual workspace is named `"feature"`, `move-node-to-workspace` will silently fail (likely creating a new empty workspace named "Feature" rather than targeting the existing one, depending on AeroSpace version).

**Why it happens:**
The config schema `workspace: z.string().or(z.number()).optional()` accepts both forms. When the implementation converts to string via `String(value)`, numeric names work. But if any validation, normalization, or comparison path treats the workspace name as a number (e.g., `parseInt` or `Number()`), zero-padded names are corrupted. Case sensitivity is easy to miss because the user types the name in YAML and never sees it compared.

**How to avoid:**
Store and pass workspace names as strings throughout. Use `z.string()` in the config schema (not `z.string().or(z.number())`). If users configure numeric workspace names like `5`, they write them as strings in YAML: `workspace: "5"`. The string `"5"` is passed directly to `aerospace move-node-to-workspace ... 5` without conversion.

Never call `Number()`, `parseInt()`, or numeric coercion on workspace name values.

Add a test case for zero-padded workspace name `"05"` — verify the string is passed unchanged to `_exec.run`.

**Warning signs:**
- Config schema `workspace: z.string().or(z.number())`
- `String(workspaceName)` calls in the implementation (numeric coercion risk)
- No test with a workspace name that has a leading zero or mixed case

**Phase to address:**
AeroSpace shell wrappers — workspace name type must be `string` only from the schema definition forward.

---

### Pitfall 7: `list-windows --all` vs `list-windows --focused` — Wrong Flag Returns Empty or Partial Results

**What goes wrong:**
`aerospace list-windows` without `--all` returns windows only from the currently focused workspace. During workspace setup, git-stacks has just switched the AeroSpace focus to the target workspace and launched apps. If any of those apps appear on a different AeroSpace workspace (e.g., because AeroSpace placed them on the focused space at launch time before the workspace was switched), the snapshot-delta misses those windows.

`list-windows --all` is the correct flag for the snapshot strategy. But `--all` may not exist in older AeroSpace beta versions, or its behavior may differ (observed: `--all` is confirmed working in v0.20.3-Beta).

**Why it happens:**
The niri equivalent uses `listNiriWindows()` which internally calls `niri msg -j windows` — niri returns all windows regardless of workspace. AeroSpace's default behavior is workspace-scoped, which is different from niri's global default. A direct translation of the niri pattern without checking the AeroSpace scoping semantics produces a wrapper that silently returns incomplete window lists.

**How to avoid:**
Always use `--all` in `listAerospaceWindows()`. Document the reason in a comment:

```typescript
// --all: required for snapshot-delta strategy — default scopes to focused workspace only
const result = await _exec.run(["list-windows", "--all", "--format", FORMAT_STRING])
```

**Warning signs:**
- `list-windows` call without `--all`
- Snapshot function that produces empty `before` set when no windows are on the target workspace yet (may be correct behavior, but verify it is not a missing `--all`)
- Tests that do not cover windows on non-focused workspaces

**Phase to address:**
AeroSpace shell wrappers — `listAerospaceWindows()` always uses `--all`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Expose `split` command as layout option | Matches AeroSpace docs | Fails with exit 1 for majority of users who have normalization enabled; breaks silently | Never — use `join-with` only |
| Parse `--format` output with `.split(/\s+/)` | One-liner parser | Wrong column indices for app/window names with spaces; data corruption | Never — always split on `"\t"` |
| Omit `process.platform !== "darwin"` in `isAerospaceRunning()` | Simpler check | Integration silently runs (and fails) on Linux CI; doctor emits false warnings for Linux users | Never |
| Accept workspace name as `string \| number` in config schema | Matches user intuition | Zero-padded names corrupted by numeric coercion | Never — strings only in schema |
| Skip mock re-application in `aerospace.test.ts` | Less boilerplate | Stale mocks from integration test file; passing tests that verify nothing | Never |
| Skip `_sleep` injection in snapshot polling function | Simpler function signature | Tests run real delays (up to 10 seconds per test); CI timeout failures | Never — always injectable |
| Single-poll snapshot (no retry loop) | Simpler implementation | Slow-starting apps always missed; integration silently does nothing | Never — exponential backoff required |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AeroSpace `split` | Call `split` for layout control | Use `join-with <direction>` and `flatten-workspace-tree`; never call `split` |
| AeroSpace `--format` parsing | `.split(/\s+/)` | `.split("\t")` with field-count guard; re-join tail fields for window-title |
| AeroSpace `list-windows` | Omit `--all` flag | Always `list-windows --all --format ...` — default is workspace-scoped |
| AeroSpace `isAerospaceRunning()` | Binary check only | Platform check (`process.platform !== "darwin"`) first, then binary check |
| AeroSpace doctor check | Run unconditionally | Gate on `process.platform === "darwin"` before checking binary |
| AeroSpace workspace target config | Accept number type | Store and pass workspace names as strings always; `z.string()` in Zod schema |
| AeroSpace snapshot-delta | Snapshot after spawn | Snapshot BEFORE spawn, spawn, then poll — same ordering as `snapshotWindowIds` in niri.ts |
| AeroSpace `move-node-to-workspace` on single monitor | No monitor count check | Monitor-moving commands (`move-node-to-monitor`) fail on single monitor; gate or skip |
| Bun mock.module pollution | Import aerospace module without re-applying mock | Re-apply `mock.module("@/lib/aerospace", ...)` at top of `aerospace.test.ts` with local `_exec` |
| AeroSpace config TOML reading | `aerospace config --get` | Read TOML file directly for normalization flags — `--get` does not expose all keys reliably |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Snapshot polling with real `setTimeout` in tests | Each snapshot test takes 200ms–10s waiting for poll | Inject `_sleep` parameter (same pattern as niri `SnapshotOpts._sleep`) | Immediately — every test run |
| Calling `isAerospaceRunning()` per window move in integration `open()` | Multiple `aerospace --version` subprocess calls per workspace open | Call `isAerospaceRunning()` once at start of `open()` and gate the entire function | With 5+ windows per workspace |
| `listAerospaceWindows()` called without caching inside snapshot poll loop | N subprocess calls for N poll iterations, each spawning `aerospace` | Use injectable `_listWindows` parameter like niri's `SnapshotOpts._listWindows` | Immediately in tests |
| Snapshot timeout too short for slow app launch | Windows missed; integration silently skips moves | Default `timeoutMs: 10_000` matching niri; make configurable | On any slow-starting app |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing user-configured workspace name directly to shell string interpolation | Shell injection if name contains metacharacters | Pass workspace name as a positional argument to `_exec.run([..., workspaceName])`, never via shell string; NameSchema regex already blocks metacharacters at YAML parse time |
| Logging `window-title` values from `list-windows` output | Window titles may contain sensitive information (passwords in terminal, private filenames) | Log window IDs only, never titles, in debug/warn output |
| AeroSpace config TOML path traversal in `configPath` option | User could configure a config path pointing to sensitive files | Do not expose `configPath` as a user-configurable option; read from default AeroSpace config location only |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Integration fails silently when AeroSpace is not running | User opens a workspace, windows are not moved, no feedback | Log "aerospace: not running — skipped" at info level (not warning) so user knows why |
| Integration moves windows to wrong AeroSpace workspace number | User's windows appear on wrong space; disorienting | Validate workspace name exists via `list-workspaces` before attempting move; warn if not found |
| Snapshot detection times out and logs a warning on every slow app launch | Repeated "timed out waiting for window" warnings become noise | Log timeout as info level with note about increasing `timeout_ms` config; not an error |
| `flatten-workspace-tree` applied to wrong workspace | Destroys user's manually arranged layout | Always pass `--workspace <name>` to `flatten-workspace-tree`; never call without explicit workspace argument |
| AeroSpace workspace named `5` conflicts with user's existing workspace | git-stacks moves windows to user's existing workspace 5 without warning | Document that `settings.integrations.aerospace.workspace` must be a dedicated workspace name; doctor check warns if configured workspace already has windows |

---

## "Looks Done But Isn't" Checklist

- [ ] **`isAerospaceRunning()` platform gate:** Run the integration on a Linux machine — verify `open()` returns `null` immediately without calling `_exec.run`
- [ ] **`split` rejection:** Verify the implementation has no `split` call anywhere; `grep -r "split" src/lib/aerospace.ts` should return 0 matches for split as an aerospace command
- [ ] **`--format` tab parsing:** Test with a window title containing spaces and verify `window-id`, `app-pid`, and `workspace` fields parse to correct values (not shifted)
- [ ] **Snapshot ordering:** Unit test verifies `listAerospaceWindows` is called BEFORE `spawnFn` in the before-snapshot; use call-order tracking array
- [ ] **Snapshot backoff:** Test with 3 failed polls then success — verify `_sleep` delays follow exponential backoff and all delays are at or below `maxDelayMs`
- [ ] **Mock isolation:** Add `aerospace.test.ts` to `scripts/test-runner.ts` isolation list; verify tests pass in isolation AND when run after `integrations/aerospace.test.ts` in the same process
- [ ] **Workspace name as string:** Configure `workspace: 5` (integer) in YAML and verify `listAerospaceWindows` receives `"5"` (string) not `5` (number) as the arg
- [ ] **`--all` flag present:** `grep` the implementation for `list-windows` — every call must include `--all`
- [ ] **Doctor macOS gate:** Run `git-stacks doctor` on a Linux machine — verify no aerospace check appears in output
- [ ] **`flatten-workspace-tree` workspace arg:** Every call to `flattenWorkspaceTree()` passes the target workspace name — grep for bare `flatten-workspace-tree` calls without `--workspace`
- [ ] **Normalization detection read from TOML:** If normalization detection is needed, verify it reads the TOML file directly, not `aerospace config --get`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `split` used and silently no-ops for majority of users | MEDIUM | Replace all `split` calls with `join-with`; existing workspace YAML does not store layout commands so no migration needed |
| `--format` parser returns wrong fields | MEDIUM | Fix parser to split on `"\t"`; existing workspaces unaffected (no layout state stored in YAML) |
| Integration runs on Linux and crashes | LOW | Add `process.platform !== "darwin"` guard; re-release; no user data affected |
| Snapshot race moves wrong window | LOW | window was moved to wrong AeroSpace workspace; user manually moves it back; fix detection ordering |
| Mock pollution causes false-passing tests | MEDIUM | Add mock re-application to aerospace.test.ts; re-run test suite; no production code change needed |
| `flatten-workspace-tree` without `--workspace` destroys wrong workspace layout | HIGH | User must manually rebuild their AeroSpace workspace layout; add `--workspace` arg in fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `split` used for layout | AeroSpace shell wrappers — exclude `split` from implementation | `grep -r '"split"' src/lib/aerospace.ts` returns no matches |
| `--format` tab parsing | AeroSpace shell wrappers — `listAerospaceWindows` parser | Unit test: row with multi-word app name → all fields parse to correct positions |
| Cross-platform `aerospace` binary call | AeroSpace shell wrappers — `isAerospaceRunning()` | Unit test: `process.platform = "linux"` → returns false without calling `_exec.run` |
| Snapshot ordering race | AeroSpace shell wrappers — `snapshotAerospaceWindows()` | Unit test: call-order tracking verifies before-snapshot before spawnFn |
| Test mock pollution | AeroSpace shell wrappers tests | Run `bun test tests/lib/aerospace.test.ts` after `tests/lib/integrations/aerospace.test.ts` in same process — all tests still pass |
| Workspace name as string only | AeroSpace integration plugin — config schema | Unit test: YAML with numeric `workspace: 5` → `_exec.run` receives `"5"` string |
| `--all` missing from list-windows | AeroSpace shell wrappers — `listAerospaceWindows` | `grep` assertion in tests: captured args always contain `"--all"` |
| Doctor false warnings on Linux | Doctor checks — platform gate | Run doctor on Linux — no aerospace entry in output |
| `flatten-workspace-tree` bare call | AeroSpace integration plugin — layout step | Code review gate: all `flattenWorkspaceTree` calls pass workspace name |

---

## Sources

- `_references/aerospace.md` — direct CLI exploration on macOS v0.20.3-Beta; `split` no-op finding; `--format` field inventory; single-monitor findings; snapshot-delta algorithm
- `src/lib/niri.ts` lines 76-92 — injectable `_exec` pattern; `SnapshotOpts` with `_sleep` and `_listWindows` injection
- `src/lib/niri.ts` lines 217-244 — `snapshotWindowIds()` — correct ordering: before-snapshot, spawnFn, poll loop
- `src/lib/integrations/niri.ts` lines 1-9 — `isNiriRunning()` used as first gate in `open()` — pattern to replicate
- `tests/lib/niri.test.ts` lines 1-20 — Bun mock.module pollution comment; re-application pattern
- `tests/lib/niri.test.ts` lines 668-690 — call-order tracking test for snapshot ordering
- `tests/lib/integrations/niri.test.ts` lines 1-44 — mock registration before import pattern
- AeroSpace v0.20.3-Beta behavior observed: `split` exits 1 when normalization enabled; `--format` uses `\t` delimiters; `list-windows` default is workspace-scoped; `aerospace config --get` unreliable for all TOML keys
- Bun test mock isolation: `scripts/test-runner.ts` — project-specific isolation list for mock-heavy test files

---
*Pitfalls research for: v0.11.0 — AeroSpace window management integration in git-stacks*
*Researched: 2026-03-28*
