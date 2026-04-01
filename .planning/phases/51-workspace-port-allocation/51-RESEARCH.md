# Phase 51: Workspace Port Allocation - Research

**Researched:** 2026-04-01
**Domain:** Port allocation, filesystem locking, Zod schema extension, env injection
**Confidence:** HIGH

## Summary

Phase 51 adds a port allocation system to git-stacks. Workspaces and templates declare named port variables with null (unresolved) or number (pinned) values. On `git-stacks open`, a port allocator scans all workspaces to build a taken-port set, finds a free contiguous block for null ports, writes the resolved values back to the workspace YAML, and injects them as environment variables via the existing `mergeEnv()` chain.

The implementation touches four files (config.ts schemas, workspace-ops.ts allocator + injection, paths.ts for lock constant) plus one new file (src/lib/ports.ts for the allocator) and the workspace wizard. All locking is done via `openSync` with `O_EXCL|O_CREAT` — Bun 1.3.10 on Linux supports both `fsyncSync` and these fs constants with correct EEXIST semantics (verified by runtime probe). No external lock library is needed.

**Primary recommendation:** Implement the allocator as a standalone `src/lib/ports.ts` module called from `openWorkspace()` before `buildBaseEnv()`. Keep the lock scope minimal: acquire → scan workspaces → resolve ports → write workspace YAML → release. Inject via `mergeEnv()` which is already the single injection point.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Wizard uses a single comma-separated text prompt: "Port names (comma-separated, leave empty to skip):" — user types `PORT,DEBUG_PORT,HMR_PORT` or hits enter to skip. Written as `ports: { PORT: ~, DEBUG_PORT: ~, HMR_PORT: ~ }` in workspace YAML.
- **D-02:** Pinning allowed — `ports: { PORT: 3000, DEBUG_PORT: ~ }`. Pinned ports (explicit numbers) skip auto-allocation but ARE collision-checked against other workspaces. Pinning makes sense at workspace level; templates should generally use `~` since multiple workspaces derive from them.
- **D-03:** Adding ports post-creation: user edits workspace YAML to add new port names with `~` values, then runs `git-stacks open`. Allocator picks up new null ports. No dedicated command needed.
- **D-04:** Template + workspace same port name: workspace wins (overrides template value). Consistent with env last-wins pattern from template composition.
- **D-05:** Port env-name collision: if a port name collides with a key in `env:` or `env_file`, `open` errors with a clear message identifying the conflict. No silent overwriting.
- **D-06:** Reopen conflict (resolved port now used by another workspace): ERROR with message suggesting `--reallocate`. User must opt-in to reallocation. This protects scripts/configs that hardcoded port numbers.
- **D-07:** `--reallocate` flag reallocates ONLY the conflicting ports, not all ports. Non-conflicting resolved ports remain stable.
- **D-08:** Shared/well-known ports (e.g., always port 3000): use `env: { PORT: "3000" }` instead of `ports:`. `env:` values are NOT collision-checked. `ports:` is for managed allocation; `env:` is for unmanaged fixed values.
- **D-09:** Re-open with resolved ports: keep existing numbers if conflict-free. No reallocation unless conflicts detected.
- **D-10:** Global range change (range_start/range_end moved): treat out-of-range resolved ports the same as conflicts — error with `--reallocate` suggestion.
- **D-11:** No dedicated `--reallocate-all` flag. To force full reset: user edits YAML to set ports back to `~`, then re-opens.
- **D-12:** Ports are snapshot at workspace creation time. Template changes after creation don't flow into existing workspaces.
- **D-13:** Contiguous allocation spans ONLY auto-allocated (null) ports. Pinned ports live wherever the user put them.

### Claude's Discretion

- Filesystem lock implementation details (timeout, stale lock detection, retry behavior)
- fsync addition to existing `writeYaml` (already does tmp+rename, needs fsync before rename per PORT-WRITE-01)
- Exact error message formatting for port conflicts and out-of-range errors
- Whether `doctor` should check for port conflicts across workspaces
- Port allocation algorithm internals (first-fit scan of sorted taken ranges)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Runtime:** Bun — use Bun APIs freely (`$`, `spawn`, `Bun.file`). No Node.js compat required.
- **Language:** TypeScript strict mode, no `any`.
- **Config format:** YAML with Zod validation — preserve schema compat with existing user configs.
- **No breaking changes:** Existing workspace/template YAMLs must continue to work.
- **Imports:** Production code in `src/` must use relative imports (not `@/*`). Test code may use `@/*` for type imports.
- **File naming:** kebab-case (e.g., `ports.ts`).
- **Path constants:** `UPPER_SNAKE_CASE` in `src/lib/paths.ts`.
- **Error pattern:** `{ ok: true } | { ok: false; error: string }` for fallible operations.
- **I/O:** All YAML I/O via `src/lib/config.ts`; never raw readFileSync in business logic.
- **Test runner:** `bun run test` (not `bun test tests/` directly — mock pollution).
- **Test isolation:** `mock.module("@/lib/paths", ...)` pattern for config dir isolation.
- **GSD workflow:** File changes must go through GSD workflow (`/gsd:execute-phase`).

## Standard Stack

### Core (already present — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.3.6 | Schema validation for ports field | Already project standard |
| yaml | 2.8.3 | YAML serialization (null → `~`) | Already project standard |
| node:fs (Bun) | 1.3.10 | `openSync` O_EXCL lock, `fsyncSync` | Verified working in Bun |

**No new runtime dependencies.** The lock mechanism, fsync, and Zod schema extension all use existing project infrastructure.

**Version verification:** Confirmed with `bun pm ls` — zod@4.3.6, yaml@2.8.3. Both current for project.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

New file:
```
src/
  lib/
    ports.ts      # port allocator, lock acquire/release, conflict detection
```

Modified files:
```
src/lib/config.ts         # PortsSchema, TemplateSchema + ports, WorkspaceSchema + ports, GlobalConfigSchema + ports config
src/lib/paths.ts          # PORTS_LOCK_FILE constant
src/lib/workspace-ops.ts  # call allocator in openWorkspace(), inject in mergeEnv()
src/tui/workspace-wizard.ts  # comma-separated port names prompt
src/commands/workspace.ts    # --reallocate flag on open command
```

New test file:
```
tests/lib/ports.test.ts   # unit tests for allocator logic
```

### Pattern 1: Zod Schema for Nullable Number Record

The `ports` field uses `z.record(z.string(), z.number().nullable())` — values are either a number (resolved/pinned) or null (unresolved). Verified in Bun 1.3.10:

```typescript
// src/lib/config.ts
export const PortsSchema = z.record(z.string(), z.number().nullable()).optional()
export type Ports = z.infer<typeof PortsSchema>

// In TemplateSchema:
export const TemplateSchema = z.object({
  // ... existing fields ...
  ports: PortsSchema,
})

// In WorkspaceSchema:
export const WorkspaceSchema = z.object({
  // ... existing fields ...
  ports: PortsSchema,
})

// In GlobalConfigSchema:
export const GlobalConfigSchema = z.object({
  workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT),
  integrations: z.record(z.string(), z.unknown()).default({}),
  ports: z.object({
    range_start: z.number().int().default(10000),
    range_end: z.number().int().default(65000),
  }).default({}),
})
```

YAML representation: `ports: { PORT: ~, DEBUG_PORT: 12401 }` where `~` is YAML null.

### Pattern 2: Filesystem Lock via O_EXCL

Bun 1.3.10 supports `openSync` with `O_EXCL | O_CREAT` on Linux. This is an atomic operation on local filesystems (not NFS). Since git-stacks config is always local (`~/.config/git-stacks/`), O_EXCL is reliable here.

Lock acquire/release pattern (no external library):

```typescript
// src/lib/ports.ts
import { openSync, closeSync, unlinkSync, constants } from "node:fs"
import { PORTS_LOCK_FILE } from "./paths"

const LOCK_TIMEOUT_MS = 5000
const LOCK_RETRY_INTERVAL_MS = 50

export function acquireLock(): () => void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const fd = openSync(
        PORTS_LOCK_FILE,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600
      )
      closeSync(fd)
      return () => {
        try { unlinkSync(PORTS_LOCK_FILE) } catch { /* already removed */ }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
      // EEXIST = lock held by another process, retry after interval
      Bun.sleepSync(LOCK_RETRY_INTERVAL_MS)
    }
  }
  throw new Error(
    `Port allocation lock timeout after ${LOCK_TIMEOUT_MS}ms. ` +
    `If a previous run crashed, remove: ${PORTS_LOCK_FILE}`
  )
}
```

**Stale lock handling:** The lock file is deleted unconditionally on process completion/error. If a process crashes without releasing, the lock file remains. The timeout message tells users to delete it manually — this is acceptable for a short-lived lock on a single-user local CLI tool. A 5-second timeout with 50ms retries = up to 100 attempts before failing with a clear message.

**Synchronous retry:** `Bun.sleepSync()` is used because the lock acquisition is synchronous (on a local filesystem). This keeps the allocator pure-sync, consistent with `writeYaml()` which is also sync.

### Pattern 3: Port Allocator (First-Fit Contiguous Block)

```typescript
// src/lib/ports.ts — allocation algorithm

type PortRange = { start: number; end: number }  // inclusive

export function buildTakenRanges(
  workspaces: Workspace[],
  excludeName?: string
): PortRange[] {
  const ranges: PortRange[] = []
  for (const ws of workspaces) {
    if (ws.name === excludeName) continue
    if (!ws.ports) continue
    for (const [, value] of Object.entries(ws.ports)) {
      if (typeof value === "number") {
        // Each single resolved port is a range of size 1
        ranges.push({ start: value, end: value })
      }
    }
  }
  // Merge overlapping/adjacent ranges for efficient gap-finding
  return mergeRanges(ranges.sort((a, b) => a.start - b.start))
}

export function findContiguousBlock(
  taken: PortRange[],
  count: number,
  rangeStart: number,
  rangeEnd: number
): number | null {
  // First-fit scan: find smallest start such that [start, start+count-1] fits in a gap
  let candidate = rangeStart
  for (const r of taken) {
    if (candidate + count - 1 < r.start) return candidate  // fits before this range
    candidate = Math.max(candidate, r.end + 1)
  }
  if (candidate + count - 1 <= rangeEnd) return candidate
  return null
}
```

**Pinned port collision check:** Pinned ports (already-a-number) are checked against the taken set. If the port appears in another workspace, it is a conflict and triggers the error flow (D-06: error + `--reallocate` suggestion).

**Out-of-range check (D-10):** A resolved port that is outside `[range_start, range_end]` is treated identically to a conflict.

### Pattern 4: Port Injection via mergeEnv()

Ports are injected at `mergeEnv()` in `workspace-ops.ts`. The resolved ports map (`Record<string, number>`) is converted to `Record<string, string>` before injection:

```typescript
// src/lib/workspace-ops.ts — updated mergeEnv()
export function mergeEnv(
  workspace: Workspace,
  resolvedPorts?: Record<string, number>  // passed from openWorkspace after allocation
): Record<string, string> {
  const merged: Record<string, string> = {}
  if (workspace.env) Object.assign(merged, workspace.env)
  if (resolvedPorts) {
    for (const [k, v] of Object.entries(resolvedPorts)) {
      merged[k] = String(v)
    }
  }
  return merged
}
```

**Collision detection (D-05):** Before injecting, check whether any port name key exists in `workspace.env` or in the parsed `env_file`. Error with: `Port name conflict: '${name}' appears in both ports and env${inEnvFile ? '/env_file' : ''}. Rename the port or use env: instead.`

### Pattern 5: Atomic Write with fsync (PORT-WRITE-01)

`writeYaml()` already does `write-to-tmp + rename`. It needs `fsyncSync()` on the fd before rename to guarantee durability. Verified: `fsyncSync` is available in Bun 1.3.10.

```typescript
// src/lib/config.ts — updated writeYaml()
import { openSync, writeSync, fsyncSync, closeSync, renameSync, mkdirSync } from "fs"

function writeYaml(path: string, data: unknown) {
  ensureDir(dirname(path))
  const tmpPath = `${path}.tmp`
  const content = stringify(data)
  // Write via fd so we can fsync before rename
  const fd = openSync(tmpPath, "w")
  try {
    writeSync(fd, content, 0, "utf-8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmpPath, path)
}
```

**Why:** Without fsync, the OS may reorder the rename before the data reaches disk. On crash between rename and actual write, the file at `path` would be empty/corrupt. fsync flushes the tmp file's data before rename makes it visible.

### Pattern 6: openWorkspace() Integration Point

Port allocation must run after workspace is read but before `buildBaseEnv()` (which is where `mergeEnv()` is called). The `--reallocate` flag controls whether conflicting ports are reallocated or error-fail.

```typescript
// src/lib/workspace-ops.ts — openWorkspace() call sequence (pseudocode)
export async function openWorkspace(
  name: string,
  opts: { ide?: boolean; cmux?: boolean; captured?: boolean; reallocate?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  // ... existing: workspaceExists check, config read, workspace read ...

  // NEW: port allocation (before buildBaseEnv)
  const portResult = allocatePorts(workspace, config, { reallocate: opts.reallocate ?? false })
  if (!portResult.ok) return { ok: false, error: portResult.error }
  
  // Write back updated workspace if ports were resolved/changed
  if (portResult.changed) {
    writeWorkspace(portResult.workspace)
  }

  // mergeEnv now receives resolved ports
  const baseEnv = buildBaseEnv(portResult.workspace, tasksDir, "open")
  // ... rest unchanged ...
}
```

`allocatePorts()` signature:

```typescript
// src/lib/ports.ts
export function allocatePorts(
  workspace: Workspace,
  config: GlobalConfig,
  opts: { reallocate: boolean }
): { ok: true; workspace: Workspace; changed: boolean } | { ok: false; error: string }
```

This function acquires the lock, scans workspaces, resolves nulls, collision-checks resolved ports, writes back, releases lock.

### Pattern 7: Template Port Snapshot at Creation

In `workspace-wizard.ts`, when snapshotting template config into workspace, ports are merged (workspace wins over template per D-04):

```typescript
// Merge template ports + workspace-level ports (workspace wins)
function mergePorts(
  templatePorts: Record<string, number | null> | undefined,
  workspacePorts: Record<string, number | null> | undefined
): Record<string, number | null> | undefined {
  if (!templatePorts && !workspacePorts) return undefined
  return { ...templatePorts, ...workspacePorts }  // workspace wins
}
```

### Pattern 8: Wizard Prompt

The prompt is a single safeText call — comma-separated names, empty = skip:

```typescript
// src/tui/workspace-wizard.ts
const portsRaw = await safeText({
  message: "Port names (comma-separated, leave empty to skip):",
})
if (p.isCancel(portsRaw)) cancel()
const portNames = (portsRaw as string).trim()
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)

const wsPorts: Record<string, number | null> | undefined =
  portNames.length > 0
    ? Object.fromEntries(portNames.map(n => [n, null]))
    : undefined
```

### Anti-Patterns to Avoid

- **Reading env_file during allocation:** env_file collision check (D-05) needs to read the env_file to find its keys. Only attempt this if the file exists and is within the repo; skip gracefully if not.
- **Holding the lock across async operations:** Lock acquire-scan-write-release must be synchronous. Do not hold the lock across async hooks or integration runs.
- **Using `writeFileSync` instead of fd-based write for fsync:** `writeFileSync` does not expose the fd needed for `fsyncSync`. Must use `openSync` + `writeSync` + `fsyncSync` + `closeSync` for the tmp file.
- **Treating YAML `null` and `undefined` differently:** `yaml.stringify({ PORT: null })` produces `PORT: ~`. Zod `z.number().nullable()` parses both `null` and accepts `~` from yaml. Verified behavior.
- **Injecting ports before collision check:** Always check env/env_file conflicts BEFORE injecting. Fail fast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML null serialization | Custom null→`~` serializer | `yaml` library (already used) | Already handles null → `~` correctly |
| Zod nullable record | Custom validation | `z.record(z.string(), z.number().nullable())` | Verified works in Zod 4.3.6 |
| Filesystem locking | Complex distributed lock | `openSync` with O_EXCL | Local-only config dir, O_EXCL is atomic on local fs |
| Atomic file write | Custom write+verify | `openSync` + `writeSync` + `fsyncSync` + `closeSync` + `renameSync` | Pattern is already in writeYaml, just needs fsync |

**Key insight:** No new npm packages are needed. All required primitives (fsync, O_EXCL, Zod nullable, yaml null) are available in the existing toolchain.

## Common Pitfalls

### Pitfall 1: Lock File Left Behind on Process Exit
**What goes wrong:** If `openWorkspace()` throws after lock acquisition but before release, the lock file persists, blocking all future allocations.
**Why it happens:** No automatic cleanup when the process exits abnormally.
**How to avoid:** Wrap the lock-protected block in try/finally: `const release = acquireLock(); try { ... } finally { release() }`. Register a `process.on("exit", release)` as a backup.
**Warning signs:** User reports `open` hanging for 5 seconds then failing with timeout message.

### Pitfall 2: Range-Merge Bug Leaves Allocated Ports Free
**What goes wrong:** Allocator finds a "gap" that is actually occupied because taken-range merging is wrong.
**Why it happens:** Ranges from different workspaces may overlap or be adjacent; if not merged correctly, first-fit scan sees false gaps.
**How to avoid:** Sort taken ranges by start before merge. Test with overlapping and adjacent ranges.
**Warning signs:** Two workspaces assigned overlapping port blocks.

### Pitfall 3: env_file Collision Check Reads Stale File
**What goes wrong:** env_file was written during `new` but not yet on disk at `open` time (race). Or env_file has been manually edited to include a port name.
**Why it happens:** env_file is mutable; checked at open time, not at creation time.
**How to avoid:** Read env_file fresh at open time. If file does not exist, skip collision check for env_file (only check `workspace.env`). Log a warning if env_file read fails.
**Warning signs:** Spurious conflict errors on clean workspaces.

### Pitfall 4: fsync Overhead on Writes
**What goes wrong:** Every `writeYaml` call (including `last_opened` timestamp update at end of `openWorkspace`) now calls fsync.
**Why it happens:** PORT-WRITE-01 hardens ALL `writeYaml` calls, not just port-related ones.
**How to avoid:** This is intentional per requirements; the overhead is negligible for a CLI tool (~1-2ms per fsync). No action needed.
**Warning signs:** None — this is acceptable behavior.

### Pitfall 5: Zod 4 Schema Change Breaks Existing YAML
**What goes wrong:** Adding `ports` field to schemas breaks existing workspace/template YAMLs that don't have it.
**Why it happens:** Schema change is not backward compatible.
**How to avoid:** Use `.optional()` on the `ports` field — absence means "no ports declared", which is valid. Existing YAMLs parse correctly because the field is optional. Verified: `WorkspaceSchema.parse({ name: "ws", branch: "b", created: "d" })` continues to work.
**Warning signs:** Existing config test failures on `WorkspaceSchema.parse()` of minimal fixtures.

### Pitfall 6: Doctor Not Updated
**What goes wrong:** `git-stacks doctor` does not detect port conflicts across workspaces (nice-to-have from CONTEXT.md discretion area).
**Why it happens:** Doctor is separate from the allocator and doesn't call the port logic.
**How to avoid:** Per CONTEXT.md (Claude's Discretion), a `doctor` port-conflict check is optional. Implement as a simple scan: for each workspace, check if any resolved port appears in another workspace's resolved ports. Report as a warning, not a blocking issue.
**Warning signs:** User has two workspaces with same port, doctor gives false "all clear".

### Pitfall 7: `makeConfigMock()` in helpers.ts Missing New Fields
**What goes wrong:** Tests that use `makeConfigMock()` get a `GlobalConfig` without the `ports` config field, causing type errors or runtime failures in tests that exercise port allocation paths.
**Why it happens:** `makeConfigMock()` hardcodes the mock return value; new fields need to be added.
**How to avoid:** Update `readGlobalConfig` mock return in `makeConfigMock()` to include `ports: { range_start: 10000, range_end: 65000 }`.
**Warning signs:** TypeScript errors in test files when accessing `config.ports`.

## Code Examples

### Zod Schema: Nullable Number Record (verified)

```typescript
// Verified in Bun 1.3.10 with Zod 4.3.6
import { z } from "zod"

const schema = z.record(z.string(), z.number().nullable())
schema.parse({ PORT: null, DEBUG: 3000 })
// => { PORT: null, DEBUG: 3000 }
```

### YAML Null Serialization (verified)

```typescript
import { stringify, parse } from "yaml"
stringify({ ports: { PORT: null, DEBUG: 3000 } })
// => "ports:\n  PORT: ~\n  DEBUG: 3000\n"
parse("ports:\n  PORT: ~\n  DEBUG: 3000\n")
// => { ports: { PORT: null, DEBUG: 3000 } }
```

### O_EXCL Exclusive File Creation (verified in Bun 1.3.10)

```typescript
import { openSync, closeSync, unlinkSync, constants } from "node:fs"
// First call succeeds; second call throws EEXIST
const fd = openSync("/tmp/test.lock", constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
closeSync(fd)
// Second attempt:
// openSync(...) throws { code: "EEXIST" }
unlinkSync("/tmp/test.lock")
```

### fsyncSync (verified in Bun 1.3.10)

```typescript
import { openSync, writeSync, fsyncSync, closeSync } from "node:fs"
const fd = openSync("/tmp/test.txt", "w")
writeSync(fd, "data", 0, "utf-8")
fsyncSync(fd)
closeSync(fd)
// typeof fsyncSync => "function"
```

### First-Fit Port Allocation Sketch

```typescript
// Source: derived from interval scheduling theory
function findContiguousBlock(taken: {start: number; end: number}[], count: number, rangeStart: number, rangeEnd: number): number | null {
  let candidate = rangeStart
  for (const r of taken.sort((a, b) => a.start - b.start)) {
    if (candidate + count - 1 < r.start) return candidate
    candidate = Math.max(candidate, r.end + 1)
  }
  return (candidate + count - 1 <= rangeEnd) ? candidate : null
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `writeFileSync` (no fsync) | `writeSync` + `fsyncSync` + `renameSync` | Phase 51 | Durability guarantee on crash |
| No port management | Ports field with null/number values | Phase 51 | Collision-free env var allocation |

**No deprecations** — this phase only adds to existing patterns.

## Open Questions

1. **Bun.sleepSync() in lock retry loop**
   - What we know: `Bun.sleepSync(ms)` is a synchronous sleep, confirmed available in Bun 1.3.10.
   - What's unclear: Whether it causes issues in the test environment (tests are synchronous; if a lock is held by a test, the retry loop would block the test process).
   - Recommendation: In tests, use very short timeout (e.g., 100ms) or mock the lock. The ports.test.ts should not test concurrent lock scenarios — use separate tests that mock `acquireLock`.

2. **env_file keys for collision detection**
   - What we know: `workspace.env_file` is a filename relative to each repo's task_path. Ports collision check per D-05 must check env_file keys.
   - What's unclear: At `open` time, the env_file may or may not exist yet (could be created by post_create hooks). 
   - Recommendation: Only check env_file keys if the file exists at `open` time. If it doesn't exist, skip that check (no collision possible). This matches the principle of least surprise.

3. **Doctor port conflict check (discretion area)**
   - What we know: CONTEXT.md leaves this to Claude's discretion.
   - Recommendation: Implement as a lightweight scan in `doctor.ts` — no lock required since doctor is read-only. Emit a `warn` issue (not `fail`) for each duplicate port found across workspaces.

## Environment Availability

Step 2.6: SKIPPED — this phase is code/config changes only. All required primitives (`fsyncSync`, `openSync` with O_EXCL, Zod, yaml) are confirmed present in the existing Bun 1.3.10 installation.

Verified:
- `fsyncSync` — available (`typeof fsyncSync === "function"`)
- `constants.O_EXCL` = 128, `O_CREAT` = 64 — correct Linux values
- O_EXCL exclusive create: returns EEXIST on second call (verified by probe)
- `z.record(z.string(), z.number().nullable()).parse({ PORT: null })` — works

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10) |
| Config file | bunfig.toml |
| Quick run command | `bun test tests/lib/ports.test.ts` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-SCHEMA-01 | `WorkspaceSchema` / `TemplateSchema` accept `ports: Record<string, number \| null>` | unit | `bun test tests/lib/config.test.ts` | Already exists |
| PORT-SCHEMA-02 | `GlobalConfigSchema` accepts `ports: { range_start, range_end }` with defaults | unit | `bun test tests/lib/config.test.ts` | Already exists |
| PORT-ALLOC-01 | Null ports resolved to contiguous block; resolved ports kept if conflict-free | unit | `bun test tests/lib/ports.test.ts` | Wave 0 gap |
| PORT-ALLOC-02 | Lock prevents concurrent allocation | unit | `bun test tests/lib/ports.test.ts` | Wave 0 gap |
| PORT-INJECT-01 | Resolved ports appear as env vars in hook environment | unit | `bun test tests/lib/workspace-ops.test.ts` | Already exists |
| PORT-INJECT-02 | Port name collision with `env:` produces error | unit | `bun test tests/lib/ports.test.ts` | Wave 0 gap |
| PORT-FREE-01 | removeWorkspace deletes workspace YAML (ports released implicitly) | unit | `bun test tests/lib/workspace-ops.test.ts` | Already exists |
| PORT-WRITE-01 | `writeYaml` uses fsync before rename | unit | `bun test tests/lib/config.test.ts` | Wave 0 gap |
| PORT-WIZARD-01 | Wizard prompt produces `ports: { NAME: null }` in workspace | integ | `bun test tests/tui/workspace-wizard.test.ts` | Wave 0 gap |
| PORT-TEMPLATE-01 | Template ports snapshotted to workspace; workspace wins on same key | unit | `bun test tests/lib/ports.test.ts` | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/ports.test.ts tests/lib/config.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/ports.test.ts` — covers PORT-ALLOC-01, PORT-ALLOC-02, PORT-INJECT-02, PORT-TEMPLATE-01
- [ ] PORT-WRITE-01 test case in `tests/lib/config.test.ts` — verify fsync is called (can spy on `fsyncSync`)
- [ ] PORT-WIZARD-01 test case in `tests/tui/workspace-wizard.test.ts` (if file exists; may need creation)

## Sources

### Primary (HIGH confidence)
- Bun 1.3.10 runtime probe — `fsyncSync`, `constants.O_EXCL`, O_EXCL behavior verified by direct execution
- Bun 1.3.10 + Zod 4.3.6 runtime probe — `z.record(z.string(), z.number().nullable())` verified
- [bun.sh/docs/api/file-io](https://bun.sh/docs/api/file-io) — Bun file I/O API reference
- [bun.com/reference/node/fs](https://bun.com/reference/node/fs) — Bun fs module compatibility, fsync confirmed
- `src/lib/config.ts` (read directly) — existing schema patterns, writeYaml implementation
- `src/lib/workspace-ops.ts` (read directly) — mergeEnv(), buildBaseEnv(), openWorkspace() structure
- `src/lib/composition.ts` (read directly) — mergeEnvVars() precedence pattern (D-04 reference)
- `src/tui/workspace-wizard.ts` (read directly) — wizard structure, safeText pattern, snapshot logic
- `src/commands/workspace.ts` (read directly) — open command option registration pattern
- `tests/helpers.ts` (read directly) — useIsolatedConfig, makeConfigMock patterns
- `package.json` (read directly) — confirmed no lock library in deps, Zod 4.3.6, yaml 2.8.3

### Secondary (MEDIUM confidence)
- [nodejs.org/api/fs.html](https://nodejs.org/api/fs.html) — O_EXCL semantics, fsync documentation
- yaml library behavior: `stringify({ PORT: null })` → `PORT: ~` (verified by knowledge + project usage)

### Tertiary (LOW confidence — not needed)
- `proper-lockfile` npm library — considered but not needed; O_EXCL sufficient for local config dir
- `write-file-atomic` npm library — considered but not needed; hand-rolled fsync pattern is simpler

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified runtime probes, no new deps needed
- Architecture: HIGH — all integration points read directly from source, patterns confirmed
- Lock mechanism: HIGH — O_EXCL behavior verified in Bun 1.3.10 on Linux
- Pitfalls: HIGH — derived from reading actual code paths and test infrastructure
- Wizard integration: HIGH — read full workspace-wizard.ts

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable domain — Bun/Zod APIs unlikely to change in 30 days)
