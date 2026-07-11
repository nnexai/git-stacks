# Phase 104: Workspace Service and Event Contract - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 15 implementation/fixture groups
**Analogs found:** 12 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/service/contract.ts` | model | transform, request-response | `src/lib/config.ts` | role-match |
| `src/lib/service/snapshot.ts` | service | batch, file-I/O, transform | `src/lib/config.ts`, `src/lib/workspace-command.ts`, `src/lib/workspace-env.ts` | composite role-match |
| `src/lib/service/identity.ts` | service | CRUD, file-I/O | `src/lib/config.ts` | role-match |
| `src/lib/service/credentials.ts` | service | CRUD, file-I/O | `src/lib/config.ts` | partial |
| `src/lib/service/operations.ts` | service/store | event-driven, CRUD | `src/lib/operation-runner.ts` | role-match |
| `src/lib/service/event-journal.ts` | store | event-driven, file-I/O | `src/lib/messages.ts` | role/data-flow match |
| `src/lib/service/event-broker.ts` | provider/store | pub-sub, streaming | `src/lib/messages.ts` | partial |
| `src/service/server.ts` | controller | request-response, streaming | none | no analog |
| `src/service/main.ts` | provider | event-driven, request-response | none | no analog |
| `src/commands/service.ts` | controller | request-response | existing `src/commands/*.ts` command adapters | role-match |
| `src/lib/config.ts` | model/service | CRUD, file-I/O | existing schema and atomic-write sections in same file | exact |
| `tests/lib/service/*.test.ts` | test | transform, file-I/O, event-driven | `tests/lib/operation-runner.test.ts`, `tests/lib/messages.test.ts` | role-match |
| `tests/service/*.test.ts` | test | request-response, streaming | none | no analog |
| `tests/fixtures/service-v1/*` | fixture | transform | typed fixtures in existing unit tests | partial |
| `src/lib/messages.ts` (adapter/publisher integration) | service | event-driven, file-I/O | existing implementation in same file | exact |

The research names the directory structure rather than every test filename. The concrete Wave 0 files are `contract.test.ts`, `identity.test.ts`, `snapshot.test.ts`, `launch-context.test.ts`, `credentials.test.ts`, `operations.test.ts`, `idempotency.test.ts`, `event-journal.test.ts`, `event-broker.test.ts`, plus integration `discovery.test.ts`, `security.test.ts`, `operations.test.ts`, and `events.test.ts`.

## Pattern Assignments

### `src/lib/service/contract.ts` (model, transform/request-response)

**Analog:** `src/lib/config.ts`

**Schema and inferred-type pattern** (`src/lib/config.ts:50-61`):

```typescript
export const RepoTypeSchema = z.enum(["java", "typescript", "other"])
export type RepoType = z.infer<typeof RepoTypeSchema>

export const ForgeIntegrationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  base_url: z.string().url().optional(),
})
export type ForgeIntegrationConfig = z.infer<typeof ForgeIntegrationConfigSchema>
```

**Discriminated-union pattern** (`src/lib/config.ts:168-195`):

```typescript
const WorkspaceRepoBaseSchema = z.object({
  name: z.string(),
  repo: z.string(),
  type: RepoTypeSchema,
  main_path: z.string().transform(expandHome),
})
export const WorktreeRepoSchema = WorkspaceRepoBaseSchema.extend({
  mode: z.literal("worktree"),
  task_path: z.string().transform(expandHome),
})
export const WorkspaceRepoSchema = z.discriminatedUnion("mode", [
  WorktreeRepoSchema,
  TrunkRepoSchema,
  DirRepoSchema,
])
export type WorkspaceRepo = z.infer<typeof WorkspaceRepoSchema>
```

Copy the export pairing and discriminated-union organization, but make wire objects `z.strictObject(...)`. Success, error, event, operation state, cursor, capability, and launch-context shapes should all have exported schemas and `z.infer` types. Raw `Error`, YAML model objects, and undeclared fields must not cross this boundary.

### `src/lib/service/snapshot.ts` (service, batch/file-I-O/transform)

**Analogs:** `src/lib/config.ts`, `src/lib/workspace-command.ts`, `src/lib/workspace-env.ts`

**Authoritative parse/error boundary** (`src/lib/config.ts:283-293`):

```typescript
function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): T {
  const raw = readFileSync(path, "utf-8")
  try {
    return schema.parse(parse(raw))
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      throw new Error(`Invalid config at ${path}: ${formatZodError(err as ZodError)}`)
    }
    throw err
  }
}
```

**Pure launch-plan projection** (`src/lib/workspace-command.ts:52-93`):

```typescript
export function listManualCommands(workspace: Workspace, opts?: { all?: boolean }): string[] {
  const names = new Set<string>()
  for (const n of Object.keys(workspace.commands ?? {})) names.add(n)
  for (const repo of workspace.repos) {
    for (const n of Object.keys(repo.commands ?? {})) names.add(n)
  }
  const sorted = [...names].sort()
  return opts?.all ? sorted : sorted.filter((n) => !isHiddenCommand(n))
}

export function planManualCommand(workspace: Workspace, targetName: string, config?: GlobalConfig): ManualCommandStep[] {
  const plan: ManualCommandStep[] = []
  // ...resolve workspace and repo steps...
  return plan
}
```

**Resolved environment composition** (`src/lib/workspace-env.ts:81-98`):

```typescript
export async function buildWorkspaceEnv(
  workspace: Workspace,
  opts: BuildWorkspaceEnvOptions
): Promise<Record<string, string>> {
  return timeOperation(OBS_CATEGORY, "buildWorkspaceEnv", async () => {
    const config = opts.config ?? readGlobalConfig()
    const tasksDir = join(getTasksDir(config.workspace_root), workspace.name)
    const resolvedEnvVars = await timeOperation(
      OBS_CATEGORY,
      "buildWorkspaceEnv.resolveSecrets",
      () => resolveWorkspaceEnvVars(workspace, config, opts)
    )
    return { ...buildBaseEnv(workspace, tasksDir, opts.triggeredBy), ...resolvedEnvVars }
  })
}
```

Snapshot construction should remain an adapter: read through config/status modules, plan commands without executing them, resolve paths/env/ports through existing functions, then map onto contract types. Add the research-specific pre/post fingerprint retry and canonical digest/revision allocation around that composition; those consistency mechanics have no direct current analog.

### `src/lib/service/identity.ts`, `credentials.ts` (service, CRUD/file-I-O)

**Analog:** `src/lib/config.ts`

**Atomic replacement pattern** (`src/lib/config.ts:296-308`):

```typescript
function writeYaml(path: string, data: unknown) {
  ensureDir(dirname(path))
  const tmpPath = `${path}.tmp`
  const content = stringify(data)
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

**Validation-before-write pattern** (`src/lib/config.ts:425-445`):

```typescript
export function writeRegistry(entries: RepoRegistryEntry[]) {
  const parsed = RepoRegistrySchema.safeParse(entries)
  if (!parsed.success) {
    throw new Error(`Invalid registry: ${formatZodError(parsed.error)}`)
  }
  ensureDir(dirname(REGISTRY_FILE))
  writeYaml(REGISTRY_FILE, parsed.data)
}
```

Reuse validate-before-write, fsync, and rename. Extend it with service-specific owner-only modes, exclusive secret creation, symlink/ownership rejection, random IDs/tokens, and timing-safe equal-length comparison. `identity.ts` should lazily add optional UUID IDs to existing workspace/repository models without changing name-based lookups. `credentials.ts` must never log the bearer value and unauthenticated failures must not reveal route/capability details.

### `src/lib/service/operations.ts` (service/store, event-driven/CRUD)

**Analog:** `src/lib/operation-runner.ts`

**Discriminated terminal result and injected progress seam** (`src/lib/operation-runner.ts:32-36,63-83`):

```typescript
export type RunnerResult =
  | { ok: true }
  | { ok: false; error: string; rollbackErrors: string[] }

export type ProgressCallback = (message: string) => void

export function createRunner(onProgress?: ProgressCallback): Runner {
  const stack: Step[] = []
  let forwardError: string | null = null
  const rollbackErrors: string[] = []

  async function rollback(): Promise<void> {
    while (stack.length > 0) {
      const step = stack.pop()!
      onProgress?.(`Rollback: ${step.name}`)
      try { await step.undo() } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        const message = `Rollback error: ${step.name} failed (${reason})`
        rollbackErrors.push(message)
        onProgress?.(message)
      }
    }
  }
```

**Safe-boundary ordering** (`src/lib/operation-runner.ts:88-105`):

```typescript
try {
  await forward()
} catch (err) {
  forwardError = err instanceof Error ? err.message : String(err)
  await rollback()
  throw err
}
stack.push({ name, undo })
```

Preserve original failure separately from rollback failures and report rollback attempts in execution order. Wrap this vocabulary with the durable `accepted -> running -> succeeded | failed | cancelled` registry. Persist `(client_id, endpoint, idempotency_key) -> request hash + operation ID` before execution. Cancellation checks belong between named steps; terminal records must expose completed steps and rollback outcome.

### `src/lib/service/event-journal.ts`, `event-broker.ts`, and `src/lib/messages.ts`

**Analog:** `src/lib/messages.ts`

**Validated confined-path pattern** (`src/lib/messages.ts:17-29`):

```typescript
const parsed = NameSchema.safeParse(workspace)
if (!parsed.success) {
  throw new Error(`Invalid workspace name '${workspace}': ${parsed.error.issues[0].message}`)
}
const root = resolve(MESSAGES_DIR)
const path = resolve(root, `${parsed.data}.jsonl`)
const rel = relative(root, path)
if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
  throw new Error(`Invalid workspace name '${workspace}': message path escapes messages directory`)
}
```

**Append-only JSONL pattern** (`src/lib/messages.ts:32-53`):

```typescript
const record: MessageRecord = {
  workspace,
  text,
  ...(from !== undefined ? { from } : {}),
  timestamp: new Date().toISOString(),
}
const line = JSON.stringify(record) + "\n"
await appendFile(messagePath(workspace), line, "utf8")
// ...
const lines = raw.trim().split("\n").filter(Boolean)
return lines.map((l) => JSON.parse(l) as MessageRecord).reverse()
```

**Best-effort live notification precedent** (`src/lib/messages.ts:80-110`):

```typescript
await Promise.race([
  new Promise<void>((resolve) => {
    Bun.connect({
      unix: SOCKET_PATH,
      socket: {
        open(socket) {
          socket.write(JSON.stringify(record) + "\n")
          socket.end()
        },
        connectError() { resolve() },
        close() { resolve() },
        error() { resolve() },
      },
    }).catch(() => resolve())
  }),
  new Promise<void>((resolve) => setTimeout(resolve, IPC_TIMEOUT_MS)),
])
```

Keep JSONL and failure isolation, but invert authority: allocate one service-wide sequence, validate and durably append first, then enqueue to subscribers without awaiting them. Broker queues require both event and byte caps; overflow disconnects explicitly with the last safely delivered cursor. Validate each replayed record, tolerate only a partial final record, compact atomically, and surface old cursors as `replay_gap`. Existing `pushToSocket` is migration input, not the new delivery contract.

### `src/service/server.ts`, `src/service/main.ts`, `src/commands/service.ts`

There is no existing HTTP/SSE server analog. Follow the research contract directly: `Bun.serve` on explicit `127.0.0.1` and port `0`, Fetch `Request`/`Response`, `/v1` route allowlist, bearer admission before detailed routing, 256 KiB body cap, per-credential rate limits, ordinary timeouts, and SSE idle-timeout disablement. Keep `server.ts` as a thin adapter over `src/lib/service/*`; `main.ts` owns protected descriptor publication and idle shutdown only when client and active-operation counts are zero. The command module should follow the repository's thin Commander-adapter convention and must not become another workspace engine.

## Test Pattern Assignments

### Unit tests under `tests/lib/service/`

**Isolation pattern** (`tests/lib/messages.test.ts:1-10,20-26`):

```typescript
import { useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("messages-test")
const { appendMessage, listMessages } = await import("@/lib/messages")
afterAll(() => isolated.cleanup())

function wsFile(workspace: string): string {
  return join(isolated.configDir, "messages", `${workspace}.jsonl`)
}
```

Import config-root-sensitive modules only after `useIsolatedConfig`. Use injected clocks, random IDs, limits, persistence roots, and operation executors so boundary/restart/race cases stay deterministic.

**Ordered side-effect assertions** (`tests/lib/operation-runner.test.ts:118-129`):

```typescript
const result = runner.result()
expect(result.ok).toBe(false)
expect(forwardOrder).toEqual(["A", "B", "C"])
expect(undoOrder).toEqual(["B", "A"])
const rollbackMessages = messages.filter((m) => m.startsWith("Rollback"))
expect(rollbackMessages).toEqual(["Rollback: B", "Rollback: A"])
```

Use the same explicit arrays for operation transitions, sequence allocation, concurrent publication, replay/live handoff, cancellation boundaries, and producer-nonblocking proofs.

**Module-mock and late-import pattern** (`tests/lib/workspace-command.test.ts:24-33,63-73`):

```typescript
mock.module("@/lib/workspace-env", () => ({
  buildWorkspaceEnv: buildWorkspaceEnvMock,
  buildRepoEnv: buildRepoEnvMock,
}))
const { listManualCommands, planManualCommand } = await import("@/lib/workspace-command")

beforeEach(() => {
  buildWorkspaceEnvMock.mockClear()
  runShellSequenceMock.mockImplementation(async () => ({ exitCode: 0 }))
})
```

Tests using module mocks must remain eligible for the repository's isolated-process runner. Golden fixtures should be parsed by exported contract schemas and assert exact JSON, not merely snapshots of internal objects.

## Shared Patterns

### Trust-boundary validation

Use exported Zod schemas and inferred types as in `src/lib/config.ts:50-61`. Use `safeParse` where failures become structured API errors and `parse` where persisted corruption is an internal failure. Never cast unvalidated journal or request JSON directly to an interface.

### Persistence and path safety

Apply `src/lib/config.ts:296-308` atomic replacement to registries, revisions, descriptors, and compaction. Apply `src/lib/messages.ts:17-29` confinement checks to every client-influenced path. Credential material additionally requires mode/owner/symlink checks that current code does not provide.

### Error handling

Internal modules may preserve original errors as `operation-runner.ts` does, but `contract.ts` must map them to stable, non-sensitive codes. Authenticate before route-specific validation so unauthenticated callers receive one generic rejection. Do not serialize `Error` objects, stack traces, credentials, raw environment, or command output.

### Compatibility boundary

Existing CLI/OpenTUI paths continue calling `src/lib` directly. The service imports those functions and projects results; it does not move ownership into transport code. Optional `id` fields and lazy atomic migration must preserve current name lookup and YAML behavior.

### Testing and verification

Use `bun test <focused files>` during implementation, and preserve isolated config/module-mock patterns. The phase gate is `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates`; focused tests alone do not establish compatibility.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/service/server.ts` | controller | request-response, streaming | Repository has no HTTP or SSE server; use Bun research patterns. |
| `src/service/main.ts` | provider | event-driven | No daemon descriptor/idle-lifecycle precedent exists. |
| `tests/service/*.test.ts` | test | request-response, streaming | No loopback HTTP/SSE harness exists; Wave 0 must establish it. |

## Metadata

**Analog search scope:** `src/lib/`, `src/commands/`, `tests/lib/`, `scripts/test-runner*.ts`
**Strong analogs read:** 8 source/test files
**Primary analogs used:** 5 source files and 3 corresponding test files
**Pattern extraction date:** 2026-07-11
