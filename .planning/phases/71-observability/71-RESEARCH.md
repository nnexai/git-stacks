# Phase 71: Observability - Research

**Researched:** 2026-04-05
**Domain:** Bun CLI observability, stderr-only debug logging, zero-overhead disabled path
**Confidence:** HIGH

## Summary

Phase 71 is not a generic "add logs" pass. It has three hard constraints that shape the design:

1. `GIT_STACKS_DEBUG=1` must enable timing/debug lines without changing normal stdout behavior.
2. Disabled mode must stay effectively free on normal CLI runs.
3. `git-stacks manage` must silence debug output before alternate-screen TUI rendering starts.

The current codebase already has a clean split between user/data output and runtime/domain logic:
`src/index.ts` is the bootstrap point, `src/lib/workspace-*.ts` holds the domain operations, and
existing CLI tests already spawn the real binary with isolated stdout/stderr pipes. That means the
recommended architecture is a small central observability facade plus surgical instrumentation in
the extracted domain modules, not ad-hoc `console.error()` calls spread through commands.

**Primary recommendation:** add `@logtape/logtape`, create a single `src/lib/observability.ts`
bootstrap/timing helper, configure it in `src/index.ts` before `program.parse()`, explicitly
silence it before `runDashboard()` for `manage`, then instrument exported operations in
`workspace-env.ts`, `workspace-status.ts`, `workspace-git.ts`, `workspace-yaml.ts`, and
`workspace-lifecycle.ts`. Cover the behavior with one new focused observability unit test file and
one new command-level stderr regression test file. Keep the TUI check manual.

Baseline verification run during planning:
- `bun run typecheck` passes.
- `bun run test` passes.
- Current suite baseline is 531 unit tests across 37 files plus 40/40 isolated integration files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** LogTape is configured lazily in `src/index.ts` before `program.parse()`, gated by `process.env.GIT_STACKS_DEBUG === "1"`.
- **D-02:** Both enabled and disabled paths call `configure()` explicitly; disabled mode uses `lowestLevel: null`.
- **D-03:** The disabled path must avoid timing/template work when debug is off.
- **D-04:** Call sites should use a shared observability helper rather than scattered boolean guards or raw stderr writes.
- **D-05:** The stderr sink is built from `getStreamSink()` plus a `WritableStream` around `Bun.stderr.writer()`.
- **D-06:** Debug lines go to stderr only; stdout remains the user/data channel, including JSON commands.
- **D-07:** Debug output must not be routed through progress callbacks or return payloads.
- **D-08:** Instrument the runtime modules that exist now rather than waiting for more extraction work.
- **D-09:** Labels reflect logical module ownership (`workspace-env`, `workspace-status`, `workspace-git`, `workspace-yaml`, `workspace-lifecycle`) rather than whichever file a helper once lived in.
- **D-10:** Timing should emphasize exported operations and a few meaningful substeps, not full trace spam.
- **D-11:** `git-stacks manage` must reconfigure logging to silent mode before the TUI alternate screen is entered.

### Claude's Discretion
- Exact helper API shape in `src/lib/observability.ts` as long as bootstrap remains in `src/index.ts`.
- Which meaningful substeps get explicit debug lines in addition to top-level timing.
- Whether the remaining orchestration surface in `workspace-ops.ts` also receives timing hooks after the core domain modules are covered.

### Deferred Ideas (OUT OF SCOPE)
- Namespace filtering such as `GIT_STACKS_DEBUG=open,sync`.
- Structured progress/event payloads.
- Broader module extraction or logger-backed analytics.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBSV-01 | `GIT_STACKS_DEBUG=1` enables debug trace output to stderr | `src/index.ts` is the single bootstrap point; existing CLI tests capture stderr separately already |
| OBSV-02 | Each domain module emits labeled debug lines | Current extracted modules provide clear label boundaries: `workspace-env`, `workspace-status`, `workspace-git`, `workspace-yaml`, `workspace-lifecycle` |
| OBSV-03 | Operation timing uses `performance.now()` with `[module] step: Xms` formatting | A shared timing helper can wrap sync or async exported operations without changing command code |
| OBSV-04 | Debug output is silent by default with zero overhead on normal runs | Explicit disabled configuration plus a helper-level fast path prevents timing work when debug is off |
| OBSV-05 | TUI-safe: debug output goes to stderr only and does not corrupt the OpenTUI screen | `manage` is routed through `src/index.ts` and can re-silence logging immediately before `runDashboard()` |
</phase_requirements>

---

## Standard Stack

### Existing
| Tool | Purpose | Relevant Use |
|------|---------|--------------|
| Bun 1.3.x | Runtime and stderr stream access | `Bun.stderr.writer()`, `Bun.spawnSync()` in tests |
| TypeScript | Strict typing for helper API and instrumentation | exported timing/debug helper signatures |
| `bun:test` | Unit and integration coverage | CLI spawn tests already isolate stdout/stderr |

### New dependency for this phase
| Library | Purpose | Why it fits |
|---------|---------|-------------|
| `@logtape/logtape` | Lightweight logger/configured sink routing | Matches the locked phase decision and supports a configured silent mode plus custom stderr sink wiring |

**Installation command:** `bun add @logtape/logtape`

## Architecture Patterns

### Pattern 1: Central observability facade
Create one new module, `src/lib/observability.ts`, instead of importing LogTape APIs directly into
every domain file.

Recommended exports:
```typescript
export async function configureObservability(enabled: boolean): Promise<void>
export async function silenceObservability(): Promise<void>
export function debugEnabled(): boolean
export function logDebug(category: string, detail: string): void
export function timeOperation<T>(
  category: string,
  operation: string,
  run: () => T | Promise<T>
): T | Promise<T>
```

Why this is the right seam:
- `src/index.ts` gets one bootstrap import instead of logging config details inline.
- Domain modules only need `timeOperation()` and `logDebug()`.
- The disabled fast path stays centralized and reviewable.

### Pattern 2: Explicit silent-mode configuration
Do not rely on "unconfigured logger" behavior. The phase context already locked the requirement that
disabled mode calls `configure()` with `lowestLevel: null`.

Recommended behavior:
- `configureObservability(true)` sets up the stderr sink and enables debug.
- `configureObservability(false)` calls LogTape `configure()` with `lowestLevel: null` and updates
  local helper state so `timeOperation()` returns immediately without calling `performance.now()`.
- `silenceObservability()` is a thin wrapper over the disabled path for the `manage` command.

### Pattern 3: Bootstrap in `src/index.ts`, not in commands
`src/index.ts` currently owns:
- git version gating
- command tree construction
- the `manage` subcommand bootstrap
- the final `program.parse()`

That is the correct place to:
- read `process.env.GIT_STACKS_DEBUG`
- configure observability once for the process
- re-silence before entering the TUI path

This keeps commands and modules free of startup/configuration concerns.

### Pattern 4: Module-level operation timing
Instrument exported domain operations, not leaf helpers.

Recommended first-pass coverage:
- `workspace-env.ts`: `buildWorkspaceEnv`, `writeEnvFiles`
- `workspace-status.ts`: `getWorkspaceListInfo`, `getWorkspaceStatus`, `getDirtyWorktrees`, `detectWorkspaceFromCwd`
- `workspace-git.ts`: `pushWorkspace`, `syncWorkspace`, `pullWorkspace`
- `workspace-yaml.ts`: `editWorkspaceYaml`, `openYamlInEditor`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`
- `workspace-lifecycle.ts`: `cleanWorkspace`, `closeWorkspace`, `removeWorkspace`, `mergeWorkspace`

Meaningful substeps are worth logging only where they add signal:
- `workspace-git.syncWorkspace`: fetch, conflict detection, rebase/merge, stash restore
- `workspace-status.getWorkspaceListInfo`: dirty scan and ahead/behind aggregation
- `workspace-env.buildWorkspaceEnv`: secret resolution

### Pattern 5: Use existing CLI spawn test harnesses
The repo already uses `Bun.spawnSync(["bun", "run", "src/index.ts", ...], { stdio: ["pipe", "pipe", "pipe"] })`
in command tests. That is exactly what Phase 71 needs because the key contract is stdout/stderr
separation, not internal logger implementation details.

## Anti-Patterns to Avoid

- **Raw `console.error()` debug calls in modules:** they bypass the central disabled path and make
  formatting/silencing harder to control.
- **Logging from `commands/` instead of `src/lib/workspace-*.ts`:** the phase goal is domain-module
  observability, not command-layer chatter.
- **Measuring time before checking the debug fast path:** that violates OBSV-04 by doing work even
  when no debug output is emitted.
- **Reconfiguring the logger inside each module:** startup and TUI-silencing behavior belong in the
  process bootstrap, not in runtime operations.
- **Allowing `manage` to inherit enabled debug mode into the alternate screen:** stderr writes will
  race against TUI rendering and can corrupt the screen.

## Common Pitfalls

### Pitfall 1: Disabled mode still does work
If the helper always calls `performance.now()` or builds message strings before checking the silent
state, Phase 71 misses OBSV-04 even if nothing is written to stderr.

**Avoidance:** `timeOperation()` must return `run()` immediately when debug is disabled.

### Pitfall 2: Sink uses Node stderr instead of a Web `WritableStream`
The phase context already established that the sink path needs `getStreamSink()` plus a
`WritableStream` around `Bun.stderr.writer()`.

**Avoidance:** keep the sink implementation isolated in `src/lib/observability.ts`.

### Pitfall 3: Progress callbacks become the debug transport
Functions like `openWorkspace`, `cleanWorkspace`, and `syncWorkspace` already use user-facing
progress callbacks. Reusing those callbacks for debug would mix human UX with machine-only debug.

**Avoidance:** keep debug on the observability helper only; leave progress callbacks unchanged.

### Pitfall 4: JSON stdout gets polluted indirectly
Even if debug is on stderr, changing command behavior to emit extra stdout text while adding
observability would still break `status --json`.

**Avoidance:** cover `status --json` with debug enabled in an integration test that parses stdout
and inspects stderr separately.

### Pitfall 5: TUI safety assumed but not exercised
The `manage` path is not meaningfully covered by the existing automated suite. Without an explicit
manual verification step, the plan could pass automation but still visibly corrupt the screen.

**Avoidance:** keep one manual-only verification item for `GIT_STACKS_DEBUG=1 git-stacks manage`.

## Code Examples

### Existing bootstrap point in `src/index.ts`
```typescript
// Source: src/index.ts [VERIFIED]
if (subcommand !== "completion") {
  await checkGitVersion()
}
program.parse()
```

This is the correct insertion point for:
```typescript
await configureObservability(process.env.GIT_STACKS_DEBUG === "1")
```

### Existing `manage` path in `src/index.ts`
```typescript
// Source: src/index.ts [VERIFIED]
program
  .command("manage")
  .description("Interactive workspace dashboard")
  .action(async () => {
    const { plugin } = await import("bun")
    const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")
    plugin(solidPlugin)
    const { runDashboard } = await import("./tui/dashboard/run")
    await runDashboard()
  })
```

This is where `await silenceObservability()` should happen immediately before the TUI import/run
sequence.

### Existing stderr-safe CLI test pattern
```typescript
// Source: tests/commands/status-json.test.ts [VERIFIED]
const result = Bun.spawnSync(
  ["bun", "run", "src/index.ts", "status", ...args],
  {
    env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  }
)
```

This gives Phase 71 everything needed to assert:
- stdout remains valid JSON
- stderr contains debug lines only when enabled

## State of the Art

What the codebase already gives us:
- Domain modules are extracted and easy to instrument independently.
- Command tests already capture stdout and stderr separately.
- `manage` has a single bootstrap path through `src/index.ts`.
- Full typecheck and full test suite are green before Phase 71 begins.

What Phase 71 still needs:
- Logging dependency installation
- Central observability module
- Bootstrap wiring in `src/index.ts`
- TUI silencing path for `manage`
- Module instrumentation
- End-to-end stderr regression tests

## Open Questions (Resolved)

1. **Should the helper support sync and async operations?**
   - Resolved: yes. `workspace-yaml.ts` exports synchronous helpers while the other modules are
     mostly async. A single `timeOperation<T>(..., run)` wrapper should accept either.

2. **Should `workspace-ops.ts` itself be instrumented?**
   - Resolved: not required for the phase boundary. The must-have labels are the extracted logical
     modules. `workspace-ops.ts` can be instrumented later if it still contains meaningful runtime
     orchestration after the core domain modules are covered.

3. **Can TUI safety be fully automated?**
   - Resolved: not reliably with the current suite. Keep one manual verification step and make the
     code change grep-verifiable in `src/index.ts`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none; project runner is `scripts/test-runner.ts` |
| Quick run command | `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts tests/commands/status-json.test.ts` |
| Full suite command | `bun run test` |
| Type check command | `bun run typecheck` |
| Current baseline | green on planning run |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBSV-01 | `GIT_STACKS_DEBUG=1` emits debug to stderr for `status` | integration | `bun test tests/commands/debug-output.test.ts` | ❌ Wave 0 |
| OBSV-02 | Instrumented modules contain their logical label strings and emit via the helper | unit/contract | `bun test tests/lib/observability.test.ts` | ❌ Wave 0 |
| OBSV-03 | Timed debug lines use `operation: Xms` shape | unit + integration | `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts` | ❌ Wave 0 |
| OBSV-04 | Disabled mode keeps stderr quiet and does not change normal CLI output | integration | `bun test tests/commands/debug-output.test.ts tests/commands/status-json.test.ts` | ⚠ extend existing suite |
| OBSV-05 | `manage` path silences debug before TUI entry | code contract + manual | grep `silenceObservability()` in `src/index.ts`; manual run below | ⚠ manual |

### Sampling Rate
- After helper/bootstrap changes: `bun test tests/lib/observability.test.ts && bun run typecheck`
- After instrumentation/test changes: `bun test tests/commands/debug-output.test.ts tests/commands/status-json.test.ts`
- End of phase: `bun run test && bun run typecheck`

### Wave 0 Gaps
- [ ] `tests/lib/observability.test.ts` — helper-level silent/enabled path coverage
- [ ] `tests/commands/debug-output.test.ts` — stderr-only debug integration coverage
- [ ] `tests/commands/status-json.test.ts` — debug-enabled JSON purity case
- [ ] Manual `manage` verification step recorded during execution summary

## Security Domain

No new trust boundary is introduced. The phase only adds local debug output and timing around
existing operations. Main risks are operational, not security-centric:
- leaking debug output onto stdout
- TUI screen corruption
- accidental performance cost when disabled

The right mitigation is contract testing and explicit bootstrap control, not new auth or sandboxing.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/71-observability/71-CONTEXT.md` — locked decisions and external-library constraints for the phase
- `.planning/ROADMAP.md` — Phase 71 goal and success criteria
- `.planning/REQUIREMENTS.md` — OBSV-01 through OBSV-05
- `src/index.ts` — process bootstrap and `manage` command path
- `src/lib/workspace-env.ts`
- `src/lib/workspace-status.ts`
- `src/lib/workspace-git.ts`
- `src/lib/workspace-yaml.ts`
- `src/lib/workspace-lifecycle.ts`
- `tests/commands/status-json.test.ts` — existing stdout/stderr CLI harness
- `package.json` — no logger dependency installed yet

### Planning-run verification
- `bun run typecheck` — passed during this planning session
- `bun run test` — passed during this planning session

## Metadata

**Confidence breakdown:**
- Bootstrap path: HIGH
- Module instrumentation plan: HIGH
- stderr/JSON regression strategy: HIGH
- TUI automation: MEDIUM (manual verification still required)

**Research date:** 2026-04-05
**Valid until:** Phase 71 implementation changes the current bootstrap/module surface
