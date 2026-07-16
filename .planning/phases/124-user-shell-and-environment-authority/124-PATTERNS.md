# Phase 124: User Shell and Environment Authority - Pattern Map

**Mapped:** 2026-07-16
**Files classified:** 34 expected source, test, and hosted-gate files
**Analogs found:** 33 / 34
**Inputs:** `124-CONTEXT.md` plus live source/test inspection; `124-RESEARCH.md` did not yet exist when this map was produced.

## Planning Boundary

This phase has two distinct implementation tracks that should meet only at launch planning:

1. A core-owned Bash/zsh/fish adapter plans and executes user-authored commands, hooks, CLI shells, and PTYs. It preserves the original command as one argument, applies authoritative overlays after initialization, and owns non-PTY cancellation/cleanup.
2. A service-owned volatile environment authority accepts bounded `PATH` and `SSH_AUTH_SOCK` replacement only from a same-user local TUI/CLI session, then injects it into new launch resolutions without changing snapshots or revisions.

Internal Git, filesystem, transport, package, secret-provider, and process-control commands remain argv-based or use their existing narrow deterministic shell seams. Do not mechanically replace every `sh -c` in the repository.

## File Classification

### Source and hosted-gate files

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/core/src/user-shell.ts` (new; final name discretionary) | utility/provider | request-response, streaming, process lifecycle | `packages/core/src/lifecycle.ts`; `packages/service/src/web/terminal-manager.ts` | composite exact |
| `packages/core/src/lifecycle.ts` | service utility | streaming, batch, process lifecycle | its injectable `_exec` seam + `packages/core/src/workspace-command.ts` | exact |
| `packages/core/src/workspace-lifecycle.ts` | service utility | batch, streaming, process lifecycle | `packages/core/src/lifecycle.ts` | exact; remove duplication |
| `packages/core/src/workspace-command.ts` | planner/service | batch, transform | existing pre/main/post loop | exact |
| `packages/core/src/workspace-env.ts` | utility | transform, secret resolution | existing `buildBaseEnv` / `buildRepoEnv` | exact |
| `packages/core/src/node-runtime.ts` | provider | process lifecycle | existing timeout-owned process group | role-match |
| `packages/core/src/agent-hooks/terminal-session.ts` | utility | file I/O, transform | existing PATH de-dup/wrapper prefix | exact |
| `packages/cli/src/commands/workspace.ts` | controller | interactive request-response, batch | `packages/core/src/workspace-command.ts` | role-match |
| `packages/cli/src/commands/web.ts` | controller | local request-response | existing service-client launch flow | exact |
| `packages/cli/src/lib/cli-program.ts` | controller/composition | local process handoff | existing `manage` inherited-env handoff | exact |
| `packages/protocol/src/service.ts` | model/schema | validation, request-response | `utf8BoundedString`; terminal launch schemas | exact |
| `packages/protocol/src/secure.ts` | model/schema | authorization | `SecureScopeSchema` / strict request envelope | exact |
| `packages/service/src/policy/dynamic-environment.ts` (new; final name discretionary) | volatile store/provider | CRUD/replace, transform | `workspace-lifecycle-admission.ts` in-memory factory | role-match |
| `packages/service/src/main.ts` | composition/service | process bootstrap, dependency injection | managed-service bootstrap options | exact |
| `packages/service/src/policy/client.ts` | local client/provider | authenticated request-response | `secureRequest` and `createBrowserLaunch` | exact |
| `packages/service/src/secure/router.ts` | controller/guard | authenticated request-response | local-administration guard and strict parsing cases | exact |
| `packages/service/src/policy/snapshot.ts` | planner/service | transform, launch resolution | existing terminal resolution boundary | exact; replace legacy implementation |
| `packages/service/src/web/terminal-manager.ts` | service | PTY streaming, process lifecycle | existing resolve timeout and TERM/KILL confirmation | exact |
| `packages/service/src/web/projection.ts` | projection | allowlist transform | existing `projectWebSnapshot` | exact; verification-first |
| `.github/workflows/node-runtime-matrix.yml` | hosted gate config | matrix/batch | existing Linux x64/arm64 + macOS x64/arm64 matrix | exact |

### Test files

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `tests/lib/user-shell.test.ts` (new) | unit test | adapter transform/validation | `tests/lib/workspace-command.test.ts`; production-import portions of `tests/lib/lifecycle.test.ts` | composite |
| `tests/lib/user-shell-real-fixture.test.ts` (new) | integration test | real process, file I/O, streaming | `tests/lib/lifecycle-files-env-config-real-fixture.test.ts`; `tests/service/web-terminal.test.ts` real PTY case | role-match |
| `tests/lib/lifecycle.test.ts` | unit/integration test | streaming, failure/cancellation | existing capture and first-failure cases | exact, but replace local duplicate implementation |
| `tests/lib/workspace-lifecycle-create.test.ts` | unit test | hook process injection, rollback | existing `_exec.spawn` lifecycle seam | exact |
| `tests/lib/workspace-command.test.ts` | unit test | ordered batch | existing pre/main/post and first-failure assertions | exact |
| `tests/lib/workspace-env.test.ts` | unit test | precedence transform, secret resolution | existing workspace/port/repo tests | exact |
| `tests/lib/agent-hooks/terminal-session.test.ts` | unit test | PATH transform/file I/O | long PATH de-dup tests | exact |
| `tests/commands/run-parallel.test.ts` | CLI integration test | parallel process execution | current per-repo output/exit assertions | exact |
| `tests/lib/service/contract.test.ts` | schema test | strict validation | unknown-field and secret-bearing rejection tests | exact |
| `tests/lib/service/snapshot.test.ts` | service unit test | launch resolution | current POSIX-shell and agent PATH cases | exact; invert legacy assertions |
| `tests/lib/service/launch-context.test.ts` | service unit test | projection + resolution | ordered steps and secret redaction | exact |
| `tests/service/managed-service-process.test.ts` | service unit test | bootstrap/handoff | injected spawn/environment assertions | exact |
| `tests/service/secure-router.test.ts` or nearest existing router suite | security integration test | authorization/request-response | `tests/service-node/secure-contract-runtime.test.mjs` | role-match |
| `tests/service/web-projection.test.ts` | projection security test | allowlist transform | existing environment/path non-disclosure assertion | exact |
| `tests/service/web-terminal.test.ts` | PTY integration test | streaming/process cleanup | real PTY + TERM/KILL cases | exact |
| `tests/tui/dashboard/managed-service-bootstrap.test.ts` | TUI integration test | trusted local bootstrap | existing Node-host delegation test | exact |

## Pattern Assignments

### `packages/core/src/user-shell.ts` and `tests/lib/user-shell*.test.ts`

**Purpose:** One core-owned adapter/discovery/execution contract for Bash, zsh, and fish. Consumers receive a typed plan; they do not choose flags or construct shell source.

**Analog 1 — injectable process boundary:** `packages/core/src/lifecycle.ts:22-57`

```ts
export type SpawnHandle = {
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array> | null
  stderr: ReadableStream<Uint8Array> | null
}

export const _exec = {
  spawn: (args: { cmd: string[]; cwd: string; env: Record<string, string>; stdout: "inherit" | "pipe"; stderr: "inherit" | "pipe" }): SpawnHandle => {
    const proc = spawn(args.cmd, { cwd: args.cwd, env: args.env, stdout: args.stdout, stderr: args.stderr })
    return { exited: proc.exited, stdout: args.stdout === "pipe" ? proc.stdout : null, stderr: args.stderr === "pipe" ? proc.stderr : null }
  },
}
```

Preserve this mutable-object injection convention so adapter tests can assert exact argv, command argument identity, environment, and cleanup without module-level mock races.

**Analog 2 — timeout settlement:** `packages/service/src/web/terminal-manager.ts:242-280`

```ts
const controller = new AbortController()
const timeoutMs = this.timing.launchResolutionTimeoutMs ?? WEB_TERMINAL_LAUNCH_RESOLUTION_TIMEOUT_MS
return new Promise((resolve, reject) => {
  let settled = false
  const finish = (settle: () => void) => {
    if (settled) return
    settled = true
    clearTimer(timer)
    settle()
  }
  timer = setTimer(() => {
    controller.abort()
    finish(() => reject(Object.assign(new Error(`Terminal launch resolution timed out after ${timeoutMs}ms`), { status: 504, code: "request_timeout" })))
  }, timeoutMs)
})
```

Use the same single-settlement shape for the 10-second initialization stage. The user command itself must not inherit this initialization timeout.

**Analog 3 — owned process-group shutdown:** `packages/service/src/web/terminal-manager.ts:334-369,497-499`

```ts
this.killGroup(session, "SIGTERM")
const termExited = await this.waitForExit(session)
if (!termExited) {
  this.killGroup(session, "SIGKILL")
  const killExited = await this.waitForExit(session)
  if (!killExited) session.state = "cleanup_failed"
}

private killGroup(session: Session, signal: NodeJS.Signals): void {
  try { process.kill(-session.process.pid, signal) } catch { session.process.kill(signal) }
}
```

Apply this behavior to non-PTY commands with a typed cancellation/cleanup outcome. `packages/core/src/node-runtime.ts:98-129` already has detached process-group mechanics, but only when `timeoutMs` is supplied and it jumps directly to KILL; extend or wrap it rather than conflating initialization timeout with command runtime.

**Adapter-specific requirements for the new tests:**

- Discover only a valid absolute executable from `SHELL`; missing, non-executable, or basenames fail. Do not restore the earlier `/bin/sh` fallback.
- Map executable identity to exactly Bash/zsh/fish named adapters.
- Assert interactive-login PTY argv separately from one-shot command argv.
- Assert the unchanged multiline/quoted command occupies exactly one argv slot.
- Use fixture homes/startup files to prove alias, function, nvm-style PATH, quiet captured startup, broken/noisy startup diagnostics, and unsupported shells.
- Capability-gate actual host shell binaries in the real-fixture test; the hosted matrix must still require all three adapters.

### `packages/core/src/lifecycle.ts`, `workspace-lifecycle.ts`, and `workspace-command.ts`

**Current batch pattern to retain:** `packages/core/src/workspace-command.ts:63-122`

```ts
const plan = planManualCommand(workspace, targetName, opts?.config)
const baseEnv = await buildWorkspaceEnv(workspace, { triggeredBy: `command:${targetName}`, config: opts?.config, skipSecrets: opts?.skipSecrets })

for (const step of plan) {
  const env = step.scope === "repo" && step.repo ? buildRepoEnv(baseEnv, step.repo) : baseEnv
  const result = opts?.onOutput
    ? await runShellSequenceCaptured([step.shell], step.cwd, env, (output) => opts.onOutput?.({ ...output, step }))
    : await runShellSequence([step.shell], step.cwd, env)
  if (result.exitCode !== 0) return { exitCode: result.exitCode, failedCommand: result.failedCommand ?? step.shell, plan }
}
```

Keep each pre/main/post and repository step separate and stop at the first failure. Replace only the execution call with the shared adapter. Do not move step concatenation into the adapter.

**Duplication to delete:** `packages/core/src/workspace-lifecycle.ts:45-99` mirrors `packages/core/src/lifecycle.ts:22-111`. Preserve the test seam by dependency injection or a shared executor parameter; do not retain a second implementation of shell selection, environment merging, capture, or diagnostics.

**Legacy behavior to invert:** `packages/core/src/lifecycle.ts:71-83,101-111,156-167,201-215` merges `process.env` then invokes `/bin/sh`. The replacement should accept a trusted base environment and explicit final overlays, invoke the selected adapter, preserve capture stream tags, and return typed discovery/validation/initialization/execution/cancellation/cleanup failures.

### `packages/core/src/workspace-env.ts`

**Analog:** `packages/core/src/workspace-env.ts:18-99`

```ts
export function mergeEnv(workspace: Workspace): Record<string, string> {
  const merged: Record<string, string> = {}
  if (workspace.env) Object.assign(merged, workspace.env)
  for (const [key, value] of Object.entries(workspace.ports ?? {})) {
    if (typeof value === "number") merged[key] = String(value)
  }
  return merged
}

export function buildRepoEnv(baseEnv: Record<string, string>, repo: WorkspaceRepo): Record<string, string> {
  return { ...baseEnv, GS_REPO_NAME: repo.name, GS_REPO_PATH: getRepoPath(repo), GS_REPO_CLONE_PATH: repo.main_path }
}
```

Refactor into explicit layers so the final order is visible and independently testable: refreshed trusted base → shell-initialized environment → global/workspace/repository/port/secret overlay → reserved `GS_*`. Current `buildBaseEnv` places `GS_*` before `...mergeEnv(workspace)` (`lines 37-43`), allowing workspace env to override reserved names; Phase 124 must reverse that precedence. Keep secret resolution at launch time when `skipSecrets` is false and preserve the snapshot redaction path when it is true.

### `packages/core/src/agent-hooks/terminal-session.ts`

**Analog:** `packages/core/src/agent-hooks/terminal-session.ts:22-56`

```ts
const lookupPath = [...new Set(basePath.split(delimiter).filter((entry) => entry && entry !== wrapperDir))].join(delimiter)
// resolve wrappers against lookupPath
return {
  PATH: `${wrapperDir}${delimiter}${lookupPath}`,
  GIT_STACKS_AGENT_SIGNALS: signalMode,
  GIT_STACKS_AGENT_INTEGRATION_HEALTH: ...,
}
```

Continue de-duplicating while preserving order and prefixing the owned wrapper directory. The `basePath` passed by service launch resolution must be the effective refreshed/shell-initialized PATH, never a stale direct fallback to service-start `process.env.PATH`.

### `packages/cli/src/commands/workspace.ts`

**Current controller behavior:** `packages/cli/src/commands/workspace.ts:695-849`

- Preserve `--parallel`, `--all-repos`, JSON output shape, per-repository cwd, grouped failures, and exit-code aggregation.
- Replace all four independent `spawn(["sh", "-c", shellCmd])` sites (`lines 738,758,807,842`) with the shared adapter execution API.
- Replace `process.env.SHELL || "sh"` (`lines 832-840`) with validated interactive-login planning.
- Build the same workspace/repository/port/secret/`GS_*` overlays used by configured commands; a raw CLI command is still user-authored shell text.
- Preserve concurrency by planning once per repository and owning a separate process group per child.

### Dynamic refresh: protocol, volatile store, client, router, and composition

#### Strict schema pattern

**Source:** `packages/protocol/src/service.ts:23-28` and `packages/protocol/src/secure.ts:237-258`

```ts
export function utf8BoundedString(maximum: number, minimum = 0) {
  return z.string().refine((value) => value === value.toWellFormed() && utf8.encode(value).byteLength >= minimum && utf8.encode(value).byteLength <= maximum)
}

export const SecureScopeSchema = z.enum([ /* closed set */ ])
export const SecureScopesSchema = z.array(SecureScopeSchema).max(32).refine((scopes) => new Set(scopes).size === scopes.length)
```

Define a strict replacement payload, not `z.record(string,string)`: exact optional `PATH` and `SSH_AUTH_SOCK` fields, bounded UTF-8 bytes, and omission meaning clear. Parse it before mutation. Add a dedicated local refresh scope only if needed; do not overload `target.select` or make it grantable to remote helpers.

#### Volatile store pattern

**Source:** `packages/service/src/policy/workspace-lifecycle-admission.ts:36-114`

```ts
export function createWorkspaceLifecycleAdmission(): WorkspaceLifecycleAdmission {
  const targets = new Map<string, TargetState>()
  return { acquire(...) { ... }, admitTerminal(...) { ... } }
}
```

Use a small factory-owned in-memory state object with `replace(payload)` and `snapshot()`/`effective(base)` methods. Return copies, replace the complete allowlist atomically, and provide no persistence, logging, event, snapshot, or revision integration. This is the only expected file with no exact domain analog.

#### Local authorization pattern

**Source:** `packages/service/src/secure/router.ts:71-140`

```ts
const methodScopes: Record<string, SecureScope> = { /* explicit method map */ }
const localAdministration = new Set([ /* explicit local methods */ ])

const required = methodScopes[request.method]
if (!required) throw coded("Unknown secure service method", "not_found")
if (localAdministration.has(request.method) && (context.mode === "helper" || context.mode === "pairing")) {
  throw coded("Secure service administration is local-only", "unauthorized")
}
if (!context.scopes.includes(required)) throw coded("Secure service method is not authorized", "unauthorized")
```

The refresh case must additionally require `context.mode === "tui"` and a local target. Browser, helper, pairing, and relayed remote sessions fail before payload parsing/mutation. Parse with the strict protocol schema, replace volatile state, and return only non-sensitive acknowledgement metadata such as refreshed/cleared key names—never values.

#### Trusted launcher/client pattern

**Source:** `packages/service/src/policy/client.ts:43-97,133-146`

```ts
const rpc = await authenticatedService()
return rpc.request("launch.browser", body, { signal, scope: "target.select" })

export async function closeServiceClient(reason = "one-shot client complete"): Promise<void> {
  const rpc = cachedAccess
  cachedAccess = undefined
  accessRequest = undefined
  await rpc?.close(reason)
}
```

Add an explicit local refresh client operation that snapshots only `process.env.PATH` and `process.env.SSH_AUTH_SOCK`, representing absence by omission. Invoke it before browser token issuance in `packages/cli/src/commands/web.ts:27-60` and before TUI client handoff/authentication in the `manage` path. Never append values to the browser launch fragment (`web.ts:43-55`) or `GIT_STACKS_TARGET_ID` remote selection flow.

#### Service composition/bootstrap pattern

**Source:** `packages/service/src/main.ts:298-340`

```ts
const existing = await readUsable()
if (existing) return existing
const environment = { ...process.env, [SERVICE_BOOTSTRAP_ENV]: "1" }
// strip workspace/session variables before detached service spawn
```

Preserve detached-service discovery and sanitization. A new service receives the launcher's environment at process creation, but the caller must still execute the same refresh operation used for an existing service so semantics do not depend on whether startup won a race. Construct one volatile authority in `startManagedService`, inject it into router and snapshot launch resolution, and never serialize it into `ServiceDescriptor`.

### `packages/service/src/policy/snapshot.ts`

**Projection pattern to preserve:** `packages/service/src/policy/snapshot.ts:238-292`

The snapshot currently plans named step identity/cwd/environment and strips resolved secret values. Keep command IDs, ordered step metadata, redacted names, and references stable for trusted snapshots.

**Legacy pattern to remove:** `packages/service/src/policy/snapshot.ts:218-226,449-466`

```ts
// remove generated multi-step shell source
return `(cd ${shellQuote(step.cwd)} && env ${environment} /bin/sh -lc ${shellQuote(step.command)})`

// remove implicit fallback and POSIX command plan
const shell = process.env.SHELL || "/bin/sh"
argv: ["/bin/sh", "-lc", multiple ? commandSequence(command.steps) : step.command]
```

Terminal launch resolution should validate the shell through the shared adapter, obtain the latest volatile refresh, resolve launch-time secrets, build the effective PATH before agent wrapper enrichment, and return either an interactive-login PTY plan or one configured command step. Because each step must execute separately, command-terminal sequencing likely belongs in a typed core bootstrap/runner plan rather than a generated compound string. Preserve stale revision/not-found checks at `lines 413-429` and optional agent-integration degradation at `lines 431-445`.

### `packages/service/src/web/terminal-manager.ts` and `web/projection.ts`

**PTY allocation pattern:** `packages/service/src/web/terminal-manager.ts:149-210`

```ts
const resolution = await this.resolveTerminalLaunch(request)
child = this.spawn(resolution.launch.argv, {
  cwd: resolution.launch.cwd,
  env: { ...resolution.launch.environment, TERM: ..., COLORTERM: ..., GIT_STACKS_SURFACE_ID: ..., GIT_STACKS_SIGNAL_TOKEN: ... },
  cols: input.cols,
  rows: input.rows,
  name: "xterm-256color",
})
```

Keep PTY ownership, lifecycle admission, terminal-only reserved fields, signal filtering, and TERM/KILL cleanup here. Shell semantics should arrive fully planned from core/service policy. Do not teach terminal manager Bash/zsh/fish flags.

**Browser non-disclosure pattern:** `packages/service/src/web/projection.ts:5-54`

```ts
return WebSnapshotSchema.parse({
  protocol: "web-v1",
  revision: catalog.revision,
  workspaces: snapshots.map(({ workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    repositories: workspace.repositories.map((repository) => ({ id: repository.id, name: repository.name, ... })),
    commands: (workspace.launch.named ?? []).map(({ id, name, scope, repository_id }) => ({ id, name, scope, ...(repository_id ? { repository_id } : {}) })),
  })),
})
```

Continue constructing a new allowlisted object. Do not pass trusted launch objects through and redact afterward. No refresh acknowledgement, diagnostics, PATH, socket, shell executable, startup file, cwd, command text, or secret metadata belongs in the web model.

## Test Pattern Assignments

### Adapter and lifecycle tests

- `tests/lib/user-shell.test.ts`: table-drive Bash/zsh/fish adapter identities, exact argv, unsupported/missing/non-executable discovery, typed diagnostics, and fixed single-command-argument invariants. Import production code directly.
- `tests/lib/user-shell-real-fixture.test.ts`: make disposable HOME/startup files and executables; cover alias/function/runtime PATH, command substitution, multiline/quotes/pipelines, quiet captured startup, non-zero exit, initialization timeout, TERM→grace→KILL process tree, and capability-gated real shells.
- `tests/lib/lifecycle.test.ts:187-259,316-520`: preserve capture, stream tags, env passing, stop/continue behavior, and first failure. Important: this file currently defines local copies of lifecycle functions before mocking the module. Replace or supplement those copies with direct production adapter calls so the phase cannot pass while production still uses `/bin/sh`.
- `tests/lib/workspace-lifecycle-create.test.ts:122-183,446-475`: keep the mutable `_exec.spawn` seam and rollback expectations; add exact adapter plan assertions for pre/post-create hooks.
- `tests/lib/workspace-command.test.ts:63-123`: preserve the ordered pre/main/post plan and first-failure assertions; assert one adapter execution per step and correct workspace vs repository overlay.

### Environment and agent tests

- `tests/lib/workspace-env.test.ts:67-158`: extend the existing workspace, port, repo, and secret tests with collisions that prove reserved `GS_*` always wins and secrets resolve only for launch.
- `tests/lib/agent-hooks/terminal-session.test.ts:8-61`: retain long PATH de-dup/order and wrapper prefix assertions; add a refreshed-path fixture proving stale service PATH is not consulted.

### CLI tests

- `tests/commands/run-parallel.test.ts:89-167`: preserve per-repo JSON schema, grouped output, parallelism, and aggregate exit status. Add fixture shell initialization and per-repo authoritative environment assertions.
- Add focused single-repo/interactive CLI coverage near the existing workspace command tests; verify no `sh` fallback and correct missing/unsupported diagnostics.

### Protocol, refresh, and service tests

- `tests/lib/service/contract.test.ts:21-93`: follow strict round-trip/unknown-field rejection style for refresh payload byte bounds, exact allowlist, omission-clears semantics, and terminal diagnostic shape. The existing terminal launch test already rejects undeclared secret references.
- `tests/service/managed-service-process.test.ts:7-78`: use injected `readUsable`/`spawn` to prove both existing and freshly spawned services receive a refresh, missing values clear stale state, raw values are never returned, and bootstrap sanitization remains.
- Router/security suite: create browser, tui, helper, pairing, and remote contexts; only local TUI may mutate. Verify unauthorized calls do not invoke the store. Follow the actual carrier test style in `tests/service-node/secure-contract-runtime.test.mjs` when end-to-end scope admission matters.
- `tests/lib/service/snapshot.test.ts:280-353`: replace the POSIX argv expectation with adapter plans; prove refresh rotation changes only new resolutions and does not advance snapshot revision; prove agent wrappers use effective PATH.
- `tests/lib/service/launch-context.test.ts:55-113`: keep ordered step and redaction checks; remove the compound `/bin/sh -lc` expectation and prove each step remains independently executable.

### PTY and projection tests

- `tests/service/web-terminal.test.ts:165-320`: reuse stalled-resolution timeout, TERM/KILL confirmation, retry after cleanup failure, and real PTY roundtrip. Add interactive-login argv/environment and refreshed SSH socket assertions without weakening lifecycle admission.
- `tests/service/web-projection.test.ts:8-96`: extend the current encoded-output negative checks to include actual refreshed PATH fragments, SSH socket paths, shell executable/startup paths, and diagnostics. Test absence from initial snapshot and after refresh.
- `tests/tui/dashboard/managed-service-bootstrap.test.ts:7-20`: preserve Node-host delegation and assert trusted refresh occurs before remote target switching/client handoff.

### Hosted matrix

**Analog:** `.github/workflows/node-runtime-matrix.yml:18-38,71-89`

The existing matrix already covers Ubuntu x64/arm64 and macOS Intel/arm64. Add an explicit supported-shell fixture/gate to the Node jobs. Local tests may skip a missing executable, but the hosted matrix must fail unless Bash, zsh, and fish all receive at least one required execution result across the supported Linux/macOS jobs; do not let every job silently skip zsh/fish.

## Shared Patterns

### Validation before mutation

Parse with `z.strictObject`, byte-bound strings, and closed enums before touching volatile state. Follow `packages/service/src/secure/router.ts:186-190`:

```ts
const parsed = EditTargetRequestSchema.safeParse(body)
if (!parsed.success) throw coded("Invalid edit target request", "invalid_request")
return this.options.core.editTarget(parsed.data)
```

### Local-only authorization

Method scope is necessary but not sufficient. Refresh additionally requires local TUI mode and the local service target. Remote helper/pairing/browser sessions must be rejected before value parsing.

### Failure typing

Use one diagnostic type carrying stage (`discovery`, `validation`, `initialization`, `execution`, `cancellation`, `cleanup`), shell identity, invocation mode, safe recovery text, and non-sensitive cause. Avoid embedding environment values or startup file contents in errors. Router errors continue using the repository's `Object.assign(new Error(message), { code/status })` convention.

### Environment non-disclosure

Volatile refresh values may flow only into process spawn environments. They must not enter:

- workspace YAML or config schemas,
- snapshot/project functions or revision digests,
- service descriptor or launch URL fragments,
- browser projections,
- logs/progress/events/signals,
- error messages or typed diagnostics.

### Exact command integrity

The original user command must be one argv element supplied to a fixed adapter bootstrap. Plans and tests should compare the exact string, including newlines and quotes. Never use the removed `commandSequence()` quoting/concatenation pattern.

## No Exact Analog Found

| File | Reason | Planner Direction |
|---|---|---|
| `packages/service/src/policy/dynamic-environment.ts` | No existing volatile secret-adjacent allowlisted environment replacement authority exists. | Combine the factory-owned in-memory state pattern from workspace lifecycle admission with strict protocol validation and local-only router authorization. Keep it deliberately smaller than a general environment store. |

## Suggested Plan Boundaries

1. Core adapter, discovery, typed diagnostics, environment layering, process-group ownership, and direct unit/real-fixture tests.
2. Migrate lifecycle/workspace-command/workspace-lifecycle and CLI `run` consumers; delete duplicate shell rules; preserve step/capture behavior.
3. Strict refresh protocol + volatile service authority + local-only router/client/composition tests.
4. Migrate service snapshot/PTY launch planning, launch-time secrets, refreshed PATH/SSH socket, and agent wrapper composition.
5. Browser non-disclosure, CLI web/manage/TUI refresh handoff, real SSH-agent rotation, and hosted Bash/zsh/fish Linux/macOS gates.

## Metadata

**Analog search scope:** `packages/core/src`, `packages/cli/src`, `packages/protocol/src`, `packages/service/src`, `tests/lib`, `tests/commands`, `tests/service`, `tests/service-node`, `tests/tui`, `.github/workflows`

**Primary analogs:**

- `packages/core/src/lifecycle.ts`
- `packages/core/src/workspace-command.ts`
- `packages/service/src/secure/router.ts`
- `packages/service/src/web/terminal-manager.ts`
- `packages/service/src/web/projection.ts`

**Pattern extraction date:** 2026-07-16
