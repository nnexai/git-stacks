# Phase 18: artifact-population - Research

**Researched:** 2026-03-22
**Domain:** Integration artifact population — tmux, cmux, vscode, intellij open() return values
**Confidence:** HIGH

## Summary

This phase is a focused infrastructure change to four integration `open()` methods that currently return `null`. The TypeScript types, the ArtifactBag accumulation machinery, and the runner are all complete from Phases 16-17. The work is mechanical: replace each `return null` with a real artifact value, add graceful error handling so `open()` never throws, and add tests covering the new return shapes.

The tmux and cmux integrations are straightforward: the session name is deterministic (`ctx.workspace.name`) and the cmux workspace ref is returned from `openCmuxWorkspace()` — both values are already in scope inside the existing `open()` body. VSCode and IntelliJ require switching from `Bun.$` to `Bun.spawn` to capture a launcher PID, plus deriving a known `app_id` string from the configured command name. All four integrations must catch errors and return `null` rather than propagating (graceful degradation per ART-06, already in place for tmux/cmux but needs explicit try/catch for vscode/intellij).

**Primary recommendation:** Change each `return null` at the success path to return the appropriate typed artifact; keep existing `catch` blocks returning `null`; add `tests/lib/integrations/artifacts.test.ts` with mocked underlying lib functions to verify artifact shapes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ART-01 | tmux integration returns session name artifact | Session name is `ctx.workspace.name`; already known after `openTmuxSession()` returns — trivial one-liner change |
| ART-02 | cmux integration returns workspace ref artifact | Ref is returned by `openCmuxWorkspace()` as `{ ref, created }` — already captured in `open()` body |
| ART-03 | VSCode integration returns generic window artifact (pid, app_id, window_title) via best-effort identification | Switch `Bun.$` to `Bun.spawn` for PID; derive `app_id` from cmd basename; use empty string for title; return null if `which` fails |
| ART-04 | IntelliJ integration returns generic window artifact (pid, app_id, window_title) via best-effort identification | Same pattern as VSCode: `Bun.spawn` for PID, `"idea"` as app_id, empty string for title, null if `which idea` fails |
</phase_requirements>

## Standard Stack

### Core (already present — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun` (built-in) | 1.3.10 | `Bun.spawn` for PID capture; `Bun.$` for `which` checks | Already used throughout the codebase |
| `@/lib/integrations/types` | project | `TmuxArtifact`, `CmuxArtifact`, `WindowArtifact`, `IntegrationArtifact` | Defined in Phase 16; complete and ready |
| `@/lib/tmux` | project | `openTmuxSession`, `focusTmuxSession` | Already imported by tmux integration |
| `@/lib/cmux` | project | `openCmuxWorkspace` | Already imported by cmux integration |

**No new dependencies.** This phase only changes return values within existing functions.

## Architecture Patterns

### Artifact Return Pattern

Every integration `open()` must follow this structure:

```typescript
// Source: Phase 16 design — ART-06 graceful null on failure
async open(ctx, artifactPath, _bag): Promise<IntegrationArtifact | null> {
  try {
    // ... existing setup work ...
    return { kind: "tmux", sessionName: ctx.workspace.name }  // real artifact
  } catch (err) {
    // ... existing spinner.stop / p.log.warn ...
    return null  // graceful degradation
  }
}
```

### tmux: Session Name Artifact

The session name is always `ctx.workspace.name`. It is passed verbatim to `openTmuxSession()` and `focusTmuxSession()`. No lookup needed — it is already in scope.

```typescript
// In tmux integration open():
async open(ctx, _artifactPath, _bag) {
  const spinner = p.spinner()
  spinner.start("Setting up tmux session")
  try {
    const { created } = await openTmuxSession(ctx.workspace.name, ctx.tasksDir)
    if (created) {
      await applyPaneLayout(ctx)
    }
    spinner.stop("tmux session ready")
    await focusTmuxSession(ctx.workspace.name)
    return { kind: "tmux", sessionName: ctx.workspace.name }  // <-- only change
  } catch (err) {
    spinner.stop("tmux unavailable — skipped")
    p.log.warn(`tmux: ${String(err)}`)
    return null
  }
},
```

**Confidence:** HIGH — session name is deterministic; no additional I/O needed.

### cmux: Workspace Ref Artifact

The `ref` variable from `openCmuxWorkspace()` is already in scope. Return it as the `workspaceRef`.

```typescript
// In cmux integration open():
async open(ctx, _artifactPath, _bag) {
  const spinner = p.spinner()
  spinner.start("Setting up cmux workspace")
  try {
    const { ref, created } = await openCmuxWorkspace(
      ctx.workspace.name,
      ctx.tasksDir,
      ctx.workspace.cmux_workspace_id
    )
    // ... existing writeWorkspace and applyPaneLayout calls ...
    spinner.stop("cmux workspace ready")
    return { kind: "cmux", workspaceRef: ref }  // <-- only change
  } catch (err) {
    spinner.stop("cmux unavailable — skipped")
    p.log.warn(`cmux: ${String(err)}`)
    return null
  }
},
```

**Confidence:** HIGH — ref is already in scope from `openCmuxWorkspace()` return.

### vscode: Window Artifact via Bun.spawn

The current vscode integration uses `Bun.$` (`await $\`${cmd} ${artifactPath}\`.quiet().nothrow()`). `Bun.$` does not expose a PID. Switch to `Bun.spawn` to capture the launcher PID.

**Key facts verified:**
- `Bun.spawn(args)` returns a `SubProcess` with `.pid: number` available immediately (before await)
- VSCode CLI (`code`/`code-insiders`) forks on launch — the spawned process exits almost immediately, so the launcher PID != the electron window PID
- However, the launcher PID is the best PID we can obtain synchronously; Phase 20 niri integration will primarily use snapshot-diff (NIRI-06) to identify VSCode windows, not PID matching
- `app_id` on Wayland: Electron apps use the binary's `StartupWMClass`. For `code`: `"Code"`. For `code-insiders`: `"Code - Insiders"`. In niri's JSON output these appear lowercased/normalized. Use the lowercase binary basename as a best-effort `app_id`.
- `title`: unknown at launch time — use empty string `""`

```typescript
// In vscode integration open():
async open(ctx, artifactPath, _bag) {
  if (!artifactPath) return null
  const { cmd } = getConfig(ctx)
  const check = await $`which ${cmd}`.quiet().nothrow()
  if (check.exitCode !== 0) return null

  try {
    const proc = Bun.spawn([cmd, artifactPath], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    })
    const pid = proc.pid
    // Don't await proc.exited — VSCode forks and the launcher exits immediately
    // app_id: use basename of cmd as best-effort Wayland app_id
    const app_id = cmd.split("/").at(-1) ?? cmd
    return { kind: "window", pid, app_id, title: "" }
  } catch {
    return null
  }
},
```

**Confidence:** MEDIUM — PID is the launcher PID, not the electron window PID. This is explicitly a best-effort value per ART-03. Phase 20 will use snapshot-diff as the primary identification method.

### intellij: Window Artifact via Bun.spawn

Same pattern as VSCode. The `idea` CLI is a shell/JVM wrapper that forks off the actual IntelliJ window process.

```typescript
// In intellij integration open():
async open(_ctx, artifactPath, _bag) {
  if (!artifactPath) return null
  const check = await $`which idea`.quiet().nothrow()
  if (check.exitCode !== 0) return null

  try {
    const proc = Bun.spawn(["idea", artifactPath], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    })
    return { kind: "window", pid: proc.pid, app_id: "idea", title: "" }
  } catch {
    return null
  }
},
```

**Confidence:** MEDIUM — same best-effort reasoning as VSCode.

### Anti-Patterns to Avoid

- **Awaiting `proc.exited` before returning:** For forking processes (VSCode, IntelliJ), the launcher exits immediately. However, we should not await it at all since that blocks `open()` unnecessarily. Just read `proc.pid` and return.
- **Returning artifact inside catch block:** All artifacts are returned in the `try` block only. The `catch` always returns `null`.
- **Throwing from open():** Per ART-03/ART-04, `open()` must never throw. Ensure every code path either returns an artifact or `null`.
- **Using `Bun.$` for launch when PID is needed:** `Bun.$` does not expose `.pid`. Use `Bun.spawn` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session name lookup | Query tmux for session name | Just use `ctx.workspace.name` | The session name IS the workspace name — always |
| cmux ref lookup | Call `cmux list-workspaces` again | Use `ref` returned by `openCmuxWorkspace()` | Already in scope; re-querying adds latency |
| Window PID discovery | `pgrep` loop / poll after launch | `Bun.spawn(...).pid` | Launcher PID is the best synchronous option; Phase 20 uses snapshot-diff anyway |
| Error propagation | Re-throw in open() | Return null | ART-06: integrations degrade gracefully |

## Common Pitfalls

### Pitfall 1: cmux spinner.stop placement

**What goes wrong:** Moving `return { kind: "cmux", workspaceRef: ref }` before `spinner.stop()` results in the spinner never stopping when the integration returns early.

**How to avoid:** Keep `spinner.stop("cmux workspace ready")` on the last line before the return, exactly as it is now.

### Pitfall 2: Bun.spawn and import

**What goes wrong:** `Bun.spawn` is available as a global (`Bun.spawn`) or as a named import (`import { spawn } from "bun"`). The vscode integration currently imports `$` from `"bun"` — add `spawn` to the same import. The intellij integration currently does NOT import from `"bun"` — it uses `$` as a global via the `from "bun"` import at the top.

**How to avoid:** Check the import line in each integration and add `spawn` to the existing `import { $ } from "bun"` statement.

### Pitfall 3: Test isolation via mock.module + cache-busting

**What goes wrong:** Bun caches modules globally. If a test imports the real `@/lib/tmux` module before `mock.module` is registered, the mock is ignored.

**How to avoid:** Register `mock.module("@/lib/tmux", ...)` BEFORE importing the tmux integration. Use the query-parameter cache-busting pattern: `await import("@/lib/integrations/tmux?unit-test")` (as seen in `runner.test.ts`).

### Pitfall 4: WindowArtifact title field is required

**What goes wrong:** Attempting to return `{ kind: "window", pid, app_id }` without `title` fails TypeScript compilation — `title: string` is required in `WindowArtifact`.

**How to avoid:** Always include `title: ""` as the empty-string fallback.

## Code Examples

### Verified: Bun.spawn PID access (confirmed on Bun 1.3.10)

```typescript
// Source: verified via bun -e test in this repo's environment
import { spawn } from "bun"
const proc = spawn(["code-insiders", artifactPath], {
  stdout: "ignore",
  stderr: "ignore",
  stdin: "ignore",
})
const pid = proc.pid  // number, available immediately before process exits
```

### Verified: mock.module cache-busting pattern (from runner.test.ts)

```typescript
// Source: tests/lib/integrations/runner.test.ts:119-127
mock.module("@/lib/tmux", () => ({
  openTmuxSession: mockOpenTmuxSession,
  focusTmuxSession: mockFocusTmuxSession,
}))

const { tmuxIntegration } = await import(
  // @ts-ignore — query param cache-busting for bun module cache
  "@/lib/integrations/tmux?unit-test"
)
```

### Verified: niri window data structure (live system)

```json
// Source: niri msg -j windows on this machine (2026-03-22)
{
  "id": 2,
  "title": "git-stacks ~/d/p/git-stacks",
  "app_id": "com.mitchellh.ghostty",
  "pid": 103221,
  "workspace_id": 1
}
```

The `app_id` niri shows is the Wayland `app_id` property. For Electron apps (VSCode), the app_id will be the value set via `--class` or the `StartupWMClass` from the `.desktop` file. For `code-insiders` this is `"Code - Insiders"` (from `/usr/share/applications/code-insiders.desktop`). Using the cmd basename as a proxy is best-effort.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) v1.3.10 |
| Config file | none — bun discovers `*.test.ts` automatically |
| Quick run command | `bun test tests/lib/integrations/` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ART-01 | tmux open() returns `{ kind: "tmux", sessionName: "ws-name" }` | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-01 | tmux open() returns null on openTmuxSession error | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-02 | cmux open() returns `{ kind: "cmux", workspaceRef: "workspace:2" }` | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-02 | cmux open() returns null on openCmuxWorkspace error | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-03 | vscode open() returns `{ kind: "window", pid: N, app_id: "code-insiders", title: "" }` | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-03 | vscode open() returns null when `which` fails | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-03 | vscode open() returns null when Bun.spawn throws | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-04 | intellij open() returns `{ kind: "window", pid: N, app_id: "idea", title: "" }` | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |
| ART-04 | intellij open() returns null when `which idea` fails | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test tests/lib/integrations/`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green (`389+ tests pass`) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/lib/integrations/artifacts.test.ts` — covers ART-01, ART-02, ART-03, ART-04

Mock strategy for `artifacts.test.ts`:
- Mock `@/lib/tmux` (openTmuxSession, focusTmuxSession) via `mock.module`
- Mock `@/lib/cmux` (openCmuxWorkspace) via `mock.module`
- Mock `bun` (both `$` and `spawn`) via `mock.module("bun", ...)`
- Mock `@clack/prompts` (spinner) via `mock.module`
- Use cache-busting import: `await import("@/lib/integrations/tmux?artifacts-test")`

*(Existing test infrastructure covers full suite; only the new test file is a Wave 0 gap.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `void` return from open() | `Promise<IntegrationArtifact \| null>` | Phase 16 | Enables artifact bag accumulation |
| All open() return null | Integrations return real artifacts | Phase 18 (this phase) | Enables Phase 20 niri window identification |

## Open Questions

1. **VSCode launcher PID vs window PID**
   - What we know: `Bun.spawn` gives launcher PID; VSCode forks so electron window PID is different
   - What's unclear: Whether Phase 20 niri integration will ever actually use the WindowArtifact PID for VSCode/IntelliJ, or rely purely on snapshot-diff (NIRI-06)
   - Recommendation: Implement best-effort launcher PID for Phase 18. Phase 20 design can decide whether to use it. The requirement says "best-effort" explicitly.

2. **VSCode app_id on Wayland: exact string**
   - What we know: `StartupWMClass=Code - Insiders` from desktop file; niri shows `app_id` as Wayland-reported value
   - What's unclear: Whether niri shows `"Code - Insiders"`, `"code-insiders"`, or another form for VSCode windows
   - Recommendation: Use `basename(cmd)` (e.g., `"code-insiders"` or `"code"`) as a conservative proxy. Phase 20 can correct if needed since it will query live niri data.

## Sources

### Primary (HIGH confidence)

- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/types.ts` — confirmed TmuxArtifact, CmuxArtifact, WindowArtifact shapes
- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/tmux.ts` — confirmed session name = ctx.workspace.name in open()
- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/cmux.ts` — confirmed ref from openCmuxWorkspace() is already in scope
- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/vscode.ts` — confirmed current Bun.$ usage, need switch to Bun.spawn
- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/intellij.ts` — confirmed current Bun.$ usage pattern
- Source code read: `/home/nnex/dev/prj/git-stacks/src/lib/integrations/runner.ts` — confirmed runner already handles null and real artifacts identically
- Live verification: `bun -e "import {spawn} from 'bun'; const p = spawn(['true']); console.log(p.pid)"` → confirmed `.pid` is available on SubProcess
- Live verification: `niri msg -j windows` → confirmed niri JSON structure with pid, app_id, title fields
- Desktop file read: `/usr/share/applications/code-insiders.desktop` → StartupWMClass=Code - Insiders
- Test read: `tests/lib/integrations/runner.test.ts` — confirmed mock.module + cache-busting import pattern

### Secondary (MEDIUM confidence)

- Test suite run: `bun test tests/` → 389 tests pass, 0 fail (baseline confirmed)
- Bun.spawn API: PID access confirmed via direct bun evaluation

## Metadata

**Confidence breakdown:**
- tmux artifact change: HIGH — trivial one-liner, deterministic value already in scope
- cmux artifact change: HIGH — trivial one-liner, ref already in scope
- vscode/intellij PID strategy: MEDIUM — launcher PID captured; window PID mismatch is known and accepted as "best-effort"
- Testing strategy: HIGH — follows exact patterns from runner.test.ts (mock.module + cache-busting)

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase; no fast-moving dependencies)
