# Phase 4: UX and Execution - Research

**Researched:** 2026-03-18
**Domain:** CLI UX, error formatting, JSON output, parallel process execution, spinner UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Error message format (UX-01)**
- Style: `error:` prefix line, followed by `  → <recovery hint>` on the next line — same visual style doctor already uses for fix suggestions
- Only include a recovery hint when there is a specific, actionable fix available — do not invent generic hints
- Git operation failures: translate to a human-readable message, include the raw git error in parentheses for debugging
  e.g., `error: Could not create worktree for 'api' (branch 'feature/auth' already exists)\n  → delete with: git branch -d feature/auth`
- A shared `formatError(message: string, hint?: string): string` helper lives in `src/lib/` — all commands use it instead of ad-hoc `console.error` strings
- `console.error(formatError(...))` + `process.exit(1)` remains the execution pattern — no changes to error flow, just the message content

**--json output shape (UX-02)**

`git-stacks status --json` — Array of workspace objects with full per-repo detail including `task_path`.

`git-stacks doctor --json` — Mirrors the existing `Issue` interface exactly: `{ healthy: boolean, issues: Issue[] }` where `healthy: true` when issues array is empty.

`git-stacks sync --json` — Per-repo sync results: `{ workspace, repos: [{ name, strategy, result, commits_behind_before, error }] }` where result values are `"up-to-date" | "rebased" | "merged" | "failed"`.

**doctor --fix behavior (UX-03)**
- Prints all issues first, then asks: `N fixes available. Execute all? [y/N]`
- Single confirmation for all — no per-issue prompting
- `--fix --force` skips confirmation (consistent with Phase 2 --force pattern)
- On partial failure: continue past failures, report all results at the end — `"N fixed, M failed"` summary
- Issues without a `fix` command: shown with `(no auto-fix — manual action needed)` annotation, not silently hidden

**list richer columns by default (UX-04)**
- Default columns: name, branch, repo count, last-opened time, dirty indicator — no extra flags required
- `getWorkspaceListInfo` already returns `worktreeCount + trunkCount` — repo count is their sum
- `last_opened` field may need to be added to WorkspaceSchema and updated on `open`
- `--status` flag retained for backward compatibility

**run --parallel output (RUN-01)**
- `--parallel` is a new flag; adds concurrent execution replacing `--all-repos` semantics (but runs simultaneously)
- Each repo gets a spinner line while running; spinner resolves to checkmark (exit 0) or cross (exit N) on completion
- Output for failed repos only flushed after all spinners resolve, grouped by repo with `——— <repo> ———` header
- Passing repos: output discarded
- Aggregated exit code: exit 1 if any repo failed, exit 0 if all pass
- `run --parallel --json` emits per-repo result array: `[{ "repo": "api", "exit_code": 0, "stdout": "...", "stderr": "" }]`
- `--json` mode: suppress spinners, emit JSON to stdout at the end

### Claude's Discretion

- Exact dirty-check strategy for `list` default columns (always sync, deferred/cached, or "?" placeholder with background check)
- `formatError()` function signature details and location in `src/lib/`
- Spinner library/approach for `run --parallel` (Bun's spawn + @clack/prompts spinner, or direct terminal control)
- Whether `--fix --force` is a flag combination or `doctor` gets a standalone `--force` option

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | Error messages across all commands include context and a suggested recovery action | `formatError(message, hint?)` helper in `src/lib/` + audit of existing `console.error` call sites |
| UX-02 | `status`, `doctor`, and `sync` support `--json` output for scripting and agent automation | `--json` flag with `commander` `.option()`, `JSON.stringify()` to stdout; doctor uses existing `Issue` interface; sync result type already structured |
| UX-03 | `doctor` supports a `--fix` flag that auto-executes the suggested repair actions | `Bun.spawn(["sh", "-c", issue.fix])` for each fixable issue; `p.confirm` for confirmation; `--force` to skip |
| UX-04 | `list` shows richer columns by default: branch name, repo count, last-opened time, dirty indicator | Extend `WorkspaceListInfo` type + `WorkspaceSchema` with `last_opened`; `getWorkspaceListInfo` already computes counts |
| RUN-01 | `run <workspace> <cmd>` supports `--parallel` to execute command across all repos simultaneously, with per-repo spinner and aggregated exit code | `Bun.spawn` with `stdio: "pipe"` for capture; `p.spinner()` for per-repo spinners; `Promise.all` for concurrency |
</phase_requirements>

## Summary

Phase 4 is a polish-and-plumbing phase: no new concepts, only additions to existing commands. All five requirements are isolated modifications to `src/commands/workspace.ts`, `src/commands/doctor.ts`, and `src/lib/workspace-ops.ts` plus a new `src/lib/errors.ts` helper. The existing code is well-structured for these additions.

The key technical challenges are: (1) implementing `run --parallel` with per-repo spinners that update independently — `@clack/prompts` `spinner()` is single-stream so multiple concurrent spinners require tracking state and writing final lines after all processes complete; (2) adding `last_opened` to the workspace schema without breaking existing YAML (use `.optional()` and update it in `openWorkspace`); (3) the dirty-check for `list` default columns needs a strategy that does not regress performance for large workspaces.

**Primary recommendation:** Use `@clack/prompts` `p.spinner()` one at a time (sequentially started, then awaited all together via `Promise.all`) — start all spinners before launching processes, track results in a `Map`, then call `stop()` on each in order. For `--json` on `run --parallel`, suppress spinners entirely and emit JSON at end.

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@clack/prompts` | 0.9.1 (installed) | `p.spinner()`, `p.confirm()` | Already used throughout project; `spinner()` API is `{ start, stop, message }` |
| `commander` | 12.1.0 | `.option()` flag addition | Already used for all commands |
| `bun` (runtime) | 1.3.10 | `Bun.spawn` with `stdio: "pipe"` | Native to project; subprocess capture without `inherit` |

**Note on @clack/prompts version:** 1.1.0 is the current published version; project uses 0.9.1. The 0.9.1 installed version already includes `p.spinner()`, `p.confirm()`, `p.tasks()`, and `Task` type — all APIs needed for this phase are present. No upgrade needed. `p.tasks()` is available in 0.9.1 but runs tasks sequentially (not parallel) — cannot be used for `run --parallel`.

### No New Packages Required

All functionality is achievable with what is installed. No new npm installs.

## Architecture Patterns

### Recommended Project Structure (changes only)

```
src/
  lib/
    errors.ts            — new: formatError(message, hint?) helper
  commands/
    doctor.ts            — add --fix, --json flags to existing action
    workspace.ts         — add --json to status/sync; extend list; add --parallel to run
```

### Pattern 1: formatError Helper

**What:** Single source of truth for `error:` + `  → hint` formatting
**When to use:** Every `console.error(...)` + `process.exit(1)` in command files

```typescript
// src/lib/errors.ts
export function formatError(message: string, hint?: string): string {
  if (hint) {
    return `error: ${message}\n  → ${hint}`
  }
  return `error: ${message}`
}
```

Usage in commands:
```typescript
import { formatError } from "../lib/errors"

// Before:
console.error(`Workspace '${name}' not found. Run \`ws list\` to see available workspaces.`)

// After:
console.error(formatError(`Workspace '${name}' not found`, `run: ws list`))
```

### Pattern 2: Adding --json to an existing command

```typescript
// In registerWorkspaceCommands, existing status command:
program
  .command("status [name]")
  .option("--json", "Output as JSON")
  .action(async (name?: string, opts: { json?: boolean } = {}) => {
    // ...collect data...
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2))
      return
    }
    // ...human output...
  })
```

The `--json` flag is already present on `list` in `workspace.ts` and on the `doctor` action block. The pattern is `.option("--json", "...")` then a guard at the start of the human-output section.

### Pattern 3: doctor --fix execution

**What:** Execute `issue.fix` strings as shell commands via `Bun.spawn`
**When to use:** After user confirms (or `--force` set)

```typescript
// In doctorCommand action, after printing issues:
const fixableIssues = allIssues.filter(i => i.fix)
if (fixableIssues.length > 0 && opts.fix) {
  if (!opts.force) {
    const ok = await p.confirm({
      message: `${fixableIssues.length} fix${fixableIssues.length === 1 ? "" : "es"} available. Execute all?`,
      initialValue: false,
    })
    if (p.isCancel(ok) || !ok) { console.log("Cancelled."); return }
  }

  let fixed = 0, failed = 0
  for (const issue of fixableIssues) {
    const proc = Bun.spawn(["sh", "-c", issue.fix!], { stdio: ["inherit", "inherit", "inherit"] })
    const code = await proc.exited
    if (code === 0) {
      fixed++
      console.log(`  ✓ fixed: ${issue.entity}`)
    } else {
      failed++
      console.error(`  ✗ failed: ${issue.entity} (exit ${code})`)
    }
  }
  console.log(`\n${fixed} fixed, ${failed} failed.`)
}
```

Issues without a `fix`: print them with annotation before the fixable ones or inline as `(no auto-fix — manual action needed)`.

### Pattern 4: run --parallel with per-repo spinners

`@clack/prompts` `p.spinner()` renders to a single TTY line (the last active spinner). Running multiple simultaneously does not work well — each `start()` call overwrites the line. The correct approach for this requirement:

**Approach: Sequential spinner starts with concurrent process execution**

1. Start all spinners sequentially (fast — just renders the initial line for each)
2. Launch all `Bun.spawn` processes in parallel via `Promise.all`
3. Each process promise resolves to `{ repo, exitCode, stdout, stderr }`
4. After all resolve, stop spinners with final status

Since `@clack/prompts` spinner is single-line, true concurrent spinner animation is not possible without a custom terminal approach. The practical solution that matches the CONTEXT.md spec: use one spinner per repo in sequence for the "resolving" phase — start a spinner labeled `running: <repo>`, wait for that process, stop it, move to next. This is sequential, not parallel execution.

**True parallel with status lines**: Use `console.log` to write a static "running: <repo>..." line for each repo (no animation), then `Promise.all` all processes, then write results. This matches the spec's "spinner resolves to checkmark/cross" if we treat "spinner" as a status indicator rather than animated spinner.

**Recommended implementation for CONTEXT.md spec:**

```typescript
// For each repo: write a "pending" line. Use a single spinner for overall progress.
// After all complete: rewrite result lines (or print results below).

const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree")
const repoResults: Array<{ repo: string; exitCode: number; stdout: string; stderr: string }> = []

if (opts.json) {
  // No spinners — just run and collect
  const procs = await Promise.all(worktreeRepos.map(async (r) => {
    const proc = Bun.spawn(["sh", "-c", shellCmd], {
      cwd: r.task_path,
      stdio: ["inherit", "pipe", "pipe"],
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { repo: r.name, exit_code: exitCode, stdout, stderr }
  }))
  console.log(JSON.stringify(procs, null, 2))
  process.exit(procs.some(r => r.exit_code !== 0) ? 1 : 0)
}

// Human output: print "running" lines, await all, then print results
const spinner = p.spinner()
spinner.start(`Running in ${worktreeRepos.length} repos...`)

const procs = await Promise.all(worktreeRepos.map(async (r) => {
  const proc = Bun.spawn(["sh", "-c", shellCmd], {
    cwd: r.task_path,
    stdio: ["inherit", "pipe", "pipe"],
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { repo: r.name, exitCode, stdout, stderr }
}))

const failed = procs.filter(r => r.exitCode !== 0)
const passed = procs.filter(r => r.exitCode === 0)
spinner.stop(`${passed.length} passed, ${failed.length} failed`)

// Print per-repo summary lines
for (const r of procs) {
  const icon = r.exitCode === 0 ? "✓" : `✗ (exit ${r.exitCode})`
  console.log(`  ${icon}  ${r.repo}`)
}

// Flush failed output
if (failed.length > 0) {
  console.log("")
  for (const r of failed) {
    console.log(`——— ${r.repo} ———`)
    if (r.stdout.trim()) process.stdout.write(r.stdout)
    if (r.stderr.trim()) process.stderr.write(r.stderr)
  }
}

process.exit(failed.length > 0 ? 1 : 0)
```

**Key: Bun stdout capture**: `new Response(proc.stdout).text()` reads the `ReadableStream` from `Bun.spawn` when `stdio` is `"pipe"`. This is the Bun-idiomatic pattern (not Node's `readline`).

### Pattern 5: last_opened tracking for UX-04

**What:** Add `last_opened?: string` to `WorkspaceSchema`; update it in `openWorkspace`

```typescript
// In src/lib/config.ts, WorkspaceSchema:
export const WorkspaceSchema = z.object({
  // ...existing fields...
  last_opened: z.string().optional(),   // ISO timestamp, updated by openWorkspace
})

// In src/lib/workspace-ops.ts, openWorkspace, near the end before return:
workspace.last_opened = new Date().toISOString()
writeWorkspace(workspace)
```

`getWorkspaceListInfo` then uses `last_opened ?? created` for display. Using `.optional()` means all existing workspace YAMLs continue to parse (CONF-02 compliant).

**Dirty-check strategy for list default columns:** Run dirty checks in parallel always (same as `--status` currently does). Performance concern: `git status --porcelain` per repo is fast (<100ms each). For workspaces with missing `task_path`, skip the check (`existsSync` guard already in `getWorkspaceListInfo`). This keeps the implementation simple and the output authoritative. The `--status` flag becomes redundant but is kept for backward compatibility (it already triggers the same code path).

### Anti-Patterns to Avoid

- **Starting multiple `p.spinner()` instances simultaneously**: The library renders to a single TTY stream; only the last started spinner animates. Use one spinner for the whole parallel operation, or use plain `console.log` status lines per repo.
- **Using `stdio: "inherit"` when capturing stdout for --json**: `inherit` pipes directly to the parent process's stdout — cannot capture it. Use `"pipe"` and read the stream.
- **Calling `process.exit()` before flushing stdout**: Bun flushes synchronously but `console.log` buffering may drop output. After writing JSON, let the process fall through to natural exit or use `await Bun.write(Bun.stdout, ...)`.
- **Making `last_opened` a required field**: Breaks existing workspace YAMLs on upgrade. Must be `.optional()`.
- **Guarding `--json` output with human-readable prefixes**: `--json` must output pure JSON — no `console.log` header lines before the JSON object/array.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation prompts | Custom readline | `p.confirm()` from `@clack/prompts` | Already used in Phase 2; handles cancel signal, TTY detection |
| Subprocess execution | Custom shell runner | `Bun.spawn(["sh", "-c", cmd])` | Already used in `run` command and `lifecycle.ts` |
| ANSI spinner animation | Direct escape codes | `p.spinner()` | Already installed, handles TTY detection |
| JSON output | Custom serializer | `JSON.stringify(data, null, 2)` | Correct, handles all types, matches `list --json` pattern |
| Stream reading | Manual buffer accumulation | `new Response(proc.stdout).text()` | Bun-idiomatic; handles backpressure |

**Key insight:** Everything in this phase builds on existing patterns already in the codebase. The only new concept is `Bun.spawn` with `stdio: "pipe"` for stdout capture — the rest reuses established code.

## Common Pitfalls

### Pitfall 1: Missing Task Paths in --json Output
**What goes wrong:** `status --json` omits `task_path` from per-repo objects, breaking agent consumers that need to reference the worktree directory.
**Why it happens:** The CONTEXT.md spec explicitly requires `task_path` in the status JSON shape — easy to overlook when modeling from `RepoStatus` type which has it.
**How to avoid:** Match the exact JSON shape from CONTEXT.md verbatim, including `task_path`.
**Warning signs:** Test consumers like `jq '.[].repos[].task_path'` return `null`.

### Pitfall 2: doctor --json Mixes Text Output with JSON
**What goes wrong:** Doctor still prints human-readable headers ("workspace checks:", "runtime deps:") to stdout before the JSON, breaking `jq` parsing.
**Why it happens:** The current doctor action has many `console.log` calls; adding `--json` guard requires suppressing ALL human output.
**How to avoid:** When `opts.json` is true, collect all issues first (no printing), then emit `JSON.stringify({ healthy, issues })` once.
**Warning signs:** `git-stacks doctor --json | jq .` fails with parse error.

### Pitfall 3: run --parallel Silently Ignores Trunk Repos
**What goes wrong:** `--parallel` (like `--all-repos`) only runs in worktree repos. If a user expects trunk repos to be included, they see partial results with no explanation.
**Why it happens:** The existing `--all-repos` already filters to `mode === "worktree"` — reusing that filter is correct but should be surfaced.
**How to avoid:** If worktree repo count is 0, emit a clear error message. If trunk repos exist but are skipped, print a note (or include them — check CONTEXT.md: "Run command in every worktree repo").
**Warning signs:** User runs `--parallel` on a trunk-only workspace and gets "0 repos" with no explanation.

### Pitfall 4: formatError Audit Misses Call Sites
**What goes wrong:** Some commands updated, others missed, resulting in inconsistent error styling.
**Why it happens:** `console.error(...)` appears in both `workspace.ts` and `doctor.ts` with many variations; easy to miss some.
**How to avoid:** After adding `formatError`, do a grep audit of all `console.error` calls in `src/commands/` and convert each.
**Warning signs:** Some errors still print bare strings without `error:` prefix.

### Pitfall 5: last_opened Not Updated on Recreate
**What goes wrong:** `ws open --recreate` updates the workspace but `last_opened` is set before the recreate logic, so recreated workspaces show the pre-recreate time.
**Why it happens:** `openWorkspace` is called after the recreate block in `workspace.ts`. The timestamp write needs to be inside `openWorkspace` itself (in `workspace-ops.ts`), not in the command layer.
**How to avoid:** Write `last_opened` inside `openWorkspace` in `workspace-ops.ts`, not in `workspace.ts`.

### Pitfall 6: Bun.spawn stdout Stream Already Consumed
**What goes wrong:** Reading `proc.stdout` twice (e.g., once for real-time output and once for capture) fails — streams are consumed once.
**Why it happens:** `Bun.spawn` with `stdio: "pipe"` returns a `ReadableStream`. Once read, it cannot be re-read.
**How to avoid:** Capture to a string variable once via `new Response(proc.stdout).text()`, then use the string. Do not mix `inherit` and `pipe` for the same stream.

## Code Examples

### doctor --json output (verified from Issue interface in doctor.ts)
```typescript
// Source: src/commands/doctor.ts Issue interface
interface Issue {
  icon: "pass" | "fail" | "warn"
  entity: string
  message: string
  fix?: string
}

// --json output shape:
const output = {
  healthy: allIssues.length === 0,
  issues: allIssues,  // Issue[] directly — matches CONTEXT.md spec
}
console.log(JSON.stringify(output, null, 2))
```

### sync --json output (verified from SyncResult type in workspace-ops.ts)
```typescript
// Source: src/lib/workspace-ops.ts SyncResult
// Current SyncResult: { ok, synced: [{repo, commits}], skipped: [{repo, reason}], error? }
// --json output needs different shape per CONTEXT.md:
const output = {
  workspace: name,
  repos: repoInfos.map(({ repo, baseBranch, strategy }) => ({
    name: repo.name,
    strategy,
    result: computeResult(repo),  // "up-to-date" | "rebased" | "merged" | "failed"
    commits_behind_before: commitsBefore,
    error: errorMsg ?? null,
  }))
}
```

The `--json` for sync requires collecting per-repo results differently than the current `SyncResult` accumulator. The sync action will need to track per-repo outcome in a separate array when `--json` is requested, OR `syncWorkspace` can return richer data. Least-invasive: collect per-repo results in the command layer for `--json`, reuse `syncWorkspace` for the human path.

### WorkspaceSchema last_opened addition
```typescript
// Source: src/lib/config.ts WorkspaceSchema — add one line
export const WorkspaceSchema = z.object({
  // ...all existing fields unchanged...
  last_opened: z.string().optional(),   // ISO timestamp — CONF-02 compliant
})
```

### getWorkspaceListInfo extended return type
```typescript
// Source: src/lib/workspace-ops.ts WorkspaceListInfo
export type WorkspaceListInfo = {
  // ...existing fields...
  repoCount: number     // worktreeCount + trunkCount
  lastOpened: string    // formatted: "2h", "3d" etc — from last_opened ?? created
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `console.error("bare string")` | `console.error(formatError(msg, hint?))` | Consistent error style across all commands |
| `list --status` for dirty info | dirty check always on in default `list` | Default output is useful without extra flags |
| Sequential `--all-repos` | `--parallel` concurrent execution | Faster multi-repo operations in CI |
| Doctor identifies fixes (no execute) | Doctor `--fix` executes fixes | Reduces fix loop from 3 steps to 1 |

## Open Questions

1. **sync --json: where to collect per-repo results**
   - What we know: `syncWorkspace()` returns `SyncResult` which aggregates `synced[]` and `skipped[]`, not per-repo outcome objects with the CONTEXT.md shape
   - What's unclear: whether to extend `syncWorkspace()` to return the richer per-repo data, or collect it in the command layer with a separate tracking variable
   - Recommendation: Collect in the command layer when `--json` is requested — add a `perRepo` array alongside the `SyncResult` call. Avoids modifying the `SyncResult` type which would touch all callers.

2. **run --parallel: trunk repos included or excluded**
   - What we know: Current `--all-repos` filters to `mode === "worktree"` only
   - What's unclear: CONTEXT.md says "across all repos simultaneously" but the existing flag explicitly uses worktree repos
   - Recommendation: Match `--all-repos` behavior (worktree-only), emit a note if trunk repos are present but skipped.

3. **list dirty-check performance with many workspaces**
   - What we know: `isRepoDirty` is `git status --porcelain` — fast but adds latency per repo across all workspaces
   - What's unclear: At what workspace/repo count does this become visibly slow
   - Recommendation: Always run (same as `--status` does now), use `Promise.all` for parallelism. If user has >20 workspaces and complains, add a `--no-status` opt-out later. Do not add complexity now.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (bun 1.3.10) |
| Config file | none — `bun test tests/` |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | `formatError(message, hint?)` returns correct string format | unit | `bun test tests/lib/errors.test.ts` | ❌ Wave 0 |
| UX-01 | `formatError(message)` without hint omits arrow line | unit | `bun test tests/lib/errors.test.ts` | ❌ Wave 0 |
| UX-02 | `status --json` emits valid JSON array with per-repo `task_path` | integration | `bun test tests/commands/status-json.test.ts` | ❌ Wave 0 |
| UX-02 | `doctor --json` emits `{ healthy, issues }` shape | unit (mock issues) | `bun test tests/commands/doctor-json.test.ts` | ❌ Wave 0 |
| UX-02 | `sync --json` emits per-repo result array | integration | `bun test tests/commands/sync-json.test.ts` | ❌ Wave 0 |
| UX-03 | `doctor --fix` executes fixable issues' fix commands | integration | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 |
| UX-03 | `doctor --fix --force` skips confirmation | integration | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 |
| UX-03 | Issues without `fix` field show `(no auto-fix)` annotation | unit | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 |
| UX-04 | `WorkspaceSchema` parses with `last_opened` absent (backward compat) | unit | `bun test tests/lib/config.test.ts` | ✅ (extend) |
| UX-04 | `getWorkspaceListInfo` returns `repoCount` (worktreeCount + trunkCount) | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ (extend) |
| UX-04 | `list` default output includes branch and repo count columns | integration (snapshot) | `bun test tests/commands/list-columns.test.ts` | ❌ Wave 0 |
| RUN-01 | `run --parallel` executes all repos concurrently and exits 0 when all pass | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 |
| RUN-01 | `run --parallel` exits 1 when any repo fails | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 |
| RUN-01 | `run --parallel --json` emits per-repo JSON array | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/errors.test.ts` (or specific new test file for that task)
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/errors.test.ts` — unit tests for `formatError` (UX-01)
- [ ] `tests/commands/doctor-json.test.ts` — doctor --json and --fix tests (UX-02, UX-03)
- [ ] `tests/commands/status-json.test.ts` — status --json integration test (UX-02)
- [ ] `tests/commands/sync-json.test.ts` — sync --json integration test (UX-02)
- [ ] `tests/commands/list-columns.test.ts` — list default columns test (UX-04)
- [ ] `tests/commands/run-parallel.test.ts` — run --parallel integration tests (RUN-01)
- [ ] `tests/commands/` directory — does not exist yet, needs `mkdirSync`

Existing test files to extend:
- `tests/lib/config.test.ts` — add schema backward-compat test for `last_opened?: string`
- `tests/lib/workspace-ops.test.ts` — add `repoCount` field test in `getWorkspaceListInfo`

## Sources

### Primary (HIGH confidence)
- Source code read directly: `src/commands/doctor.ts` — Issue interface, current doctor action structure
- Source code read directly: `src/commands/workspace.ts` — list, status, sync, run command structures
- Source code read directly: `src/lib/workspace-ops.ts` — `WorkspaceListInfo`, `SyncResult`, `getWorkspaceListInfo`, `syncWorkspace`, `openWorkspace`
- Source code read directly: `src/lib/config.ts` — `WorkspaceSchema`, `formatZodError`
- Source code read directly: `node_modules/@clack/prompts/dist/index.d.ts` — verified `spinner()` API: `{ start, stop, message }`, `p.confirm`, `p.tasks`, `Task` type
- Source code read directly: `node_modules/@clack/prompts/dist/index.cjs` — verified `tasks()` is sequential

### Secondary (MEDIUM confidence)
- `npm view @clack/prompts version` output: 1.1.0 is latest published; 0.9.1 is installed
- `npm view opentui-spinner version` output: 0.0.6
- Bun documentation (knowledge cutoff Aug 2025): `new Response(proc.stdout).text()` is the idiomatic Bun pattern for reading subprocess stdout from a `ReadableStream` when `stdio: "pipe"`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed node_modules and package.json
- Architecture: HIGH — based on direct code reading of existing patterns to extend
- Pitfalls: HIGH — derived from direct code analysis of current implementations
- JSON shapes: HIGH — exact shapes specified in CONTEXT.md locked decisions

**Research date:** 2026-03-18
**Valid until:** 2026-06-18 (stable ecosystem; @clack/prompts API is stable)
