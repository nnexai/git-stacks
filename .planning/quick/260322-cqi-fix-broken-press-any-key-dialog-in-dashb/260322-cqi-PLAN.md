---
phase: quick
plan: 260322-cqi
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/integrations/types.ts
  - src/lib/workspace-ops.ts
  - src/lib/integrations/cmux.ts
  - src/lib/integrations/tmux.ts
  - src/lib/integrations/niri.ts
  - src/tui/dashboard/App.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Dashboard TUI open action runs hooks and integrations without corrupting the screen"
    - "Hook output and integration status are routed through onProgress callback in captured mode"
    - "Non-dashboard open (CLI) continues to use inherited stdio and spinners as before"
  artifacts:
    - path: "src/lib/integrations/types.ts"
      provides: "IntegrationContext with optional silent field"
      contains: "silent"
    - path: "src/lib/workspace-ops.ts"
      provides: "openWorkspace with captured mode"
      contains: "runHooksCaptured"
    - path: "src/lib/integrations/cmux.ts"
      provides: "Silent-aware cmux open"
      contains: "ctx.silent"
    - path: "src/lib/integrations/tmux.ts"
      provides: "Silent-aware tmux open"
      contains: "ctx.silent"
    - path: "src/lib/integrations/niri.ts"
      provides: "Silent-aware niri open"
      contains: "ctx.silent"
    - path: "src/tui/dashboard/App.tsx"
      provides: "Dashboard passes captured: true to openWorkspace"
      contains: "captured: true"
  key_links:
    - from: "src/tui/dashboard/App.tsx"
      to: "src/lib/workspace-ops.ts"
      via: "openWorkspace(name, { captured: true }, onProgress)"
      pattern: "captured.*true"
    - from: "src/lib/workspace-ops.ts"
      to: "src/lib/lifecycle.ts"
      via: "runHooksCaptured when captured is true"
      pattern: "runHooksCaptured"
    - from: "src/lib/workspace-ops.ts"
      to: "src/lib/integrations/runner.ts"
      via: "IntegrationContext with silent: true when captured"
      pattern: "silent.*true"
---

<objective>
Fix the broken "press any key to continue" dialog when opening a workspace from the dashboard TUI.

Purpose: The dashboard TUI runs in raw terminal mode. When `openWorkspace()` is called from the dashboard, `runHooks()` inherits raw-mode stdin/stdout (garbling output), and integration `open()` methods use `@clack/prompts` spinners that write ANSI escape sequences directly to stdout (corrupting the OpenTUI screen). This makes the dashboard unusable for opening workspaces.

Output: `openWorkspace()` gains a `captured` mode that routes hook output through `runHooksCaptured` and passes `silent: true` on `IntegrationContext` so integrations skip `p.spinner()`/`p.log.warn()`. The dashboard passes `captured: true`.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/workspace-ops.ts (openWorkspace function, lines 462-602)
@src/lib/lifecycle.ts (runHooks and runHooksCaptured)
@src/lib/integrations/types.ts (IntegrationContext interface)
@src/lib/integrations/runner.ts (runIntegrations passes ctx to integration.open)
@src/lib/integrations/cmux.ts (p.spinner in open)
@src/lib/integrations/tmux.ts (p.spinner in open)
@src/lib/integrations/niri.ts (p.spinner and p.log.warn in open)
@src/tui/dashboard/App.tsx (openWorkspace call at line 252)

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/lib/integrations/types.ts:
```typescript
export interface IntegrationContext {
  workspace: Workspace
  tasksDir: string
  config: GlobalConfig
}
```

From src/lib/lifecycle.ts:
```typescript
export async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true
): Promise<HookResult[]>
```

From src/lib/workspace-ops.ts:
```typescript
export type ProgressCallback = (msg: string) => void

export async function openWorkspace(
  name: string,
  opts: { ide?: boolean; cmux?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add silent flag to IntegrationContext and captured mode to openWorkspace</name>
  <files>src/lib/integrations/types.ts, src/lib/workspace-ops.ts</files>
  <action>
  **1. Add `silent` to IntegrationContext** (`src/lib/integrations/types.ts`):

  Add an optional `silent?: boolean` field to the `IntegrationContext` interface:
  ```typescript
  export interface IntegrationContext {
    workspace: Workspace
    tasksDir: string
    config: GlobalConfig
    silent?: boolean
  }
  ```

  **2. Add `captured` to openWorkspace opts** (`src/lib/workspace-ops.ts`):

  Change the opts type from `{ ide?: boolean; cmux?: boolean }` to `{ ide?: boolean; cmux?: boolean; captured?: boolean }`.

  Add import for `runHooksCaptured` at the top (alongside existing `runHooks` import from `../lifecycle`).

  **3. Replace `runHooks` calls with conditional logic** in `openWorkspace`:

  Create a local helper inside openWorkspace (after the opts destructuring, before the first hook call):
  ```typescript
  const execHooks = async (commands: string[] | undefined, cwd: string, env: Record<string, string>) => {
    if (opts.captured) {
      await runHooksCaptured(commands, cwd, env, (output) => onProgress?.(output.line))
    } else {
      await runHooks(commands, cwd, env)
    }
  }
  ```

  Replace all three `runHooks(...)` call sites (lines 505, 519, 591) with `execHooks(...)`:
  - Line 505: `await execHooks([cmd], join(tasksDir, name), baseEnv)`
  - Line 519: `await execHooks([cmd], repo.task_path, repoEnv)`
  - Line 591: `await execHooks([cmd], join(tasksDir, name), hookEnv)`

  **4. Pass `silent: true` on IntegrationContext when captured**:

  Change line 584 from:
  ```typescript
  const ctx: IntegrationContext = { workspace, tasksDir, config }
  ```
  to:
  ```typescript
  const ctx: IntegrationContext = { workspace, tasksDir, config, ...(opts.captured && { silent: true }) }
  ```
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun run typecheck</automated>
  </verify>
  <done>openWorkspace accepts `captured: true` option, uses runHooksCaptured for hooks when captured, and passes silent: true to IntegrationContext. Non-captured calls are unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Make integration open() methods silent-aware and wire dashboard</name>
  <files>src/lib/integrations/cmux.ts, src/lib/integrations/tmux.ts, src/lib/integrations/niri.ts, src/tui/dashboard/App.tsx</files>
  <action>
  **1. Update cmux.ts open()** — wrap spinner in silent check:

  Replace the `open` method body to conditionally use spinner. When `ctx.silent` is true, skip `p.spinner()` and `p.log.warn()` entirely (the integration still runs, just without terminal output):
  ```typescript
  async open(ctx, _artifactPath, _bag): Promise<CmuxArtifact | null> {
    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up cmux workspace")
    try {
      const { ref, created } = await openCmuxWorkspace(
        ctx.workspace.name,
        ctx.tasksDir,
        ctx.workspace.cmux_workspace_id
      )
      if (workspaceExists(ctx.workspace.name)) {
        const saved = readWorkspace(ctx.workspace.name)
        if (saved.cmux_workspace_id !== ref) {
          writeWorkspace({ ...saved, cmux_workspace_id: ref })
        }
      }
      if (created) {
        await applyPaneLayout(ref, ctx)
      }
      spinner?.stop("cmux workspace ready")
      return { kind: "cmux", workspaceRef: ref }
    } catch (err) {
      spinner?.stop("cmux unavailable — skipped")
      if (!ctx.silent) p.log.warn(`cmux: ${String(err)}`)
      return null
    }
  },
  ```

  **2. Update tmux.ts open()** — same pattern:
  ```typescript
  async open(ctx, _artifactPath, _bag): Promise<TmuxArtifact | null> {
    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up tmux session")
    try {
      const { created } = await openTmuxSession(ctx.workspace.name, ctx.tasksDir)
      if (created) {
        await applyPaneLayout(ctx)
      }
      spinner?.stop(`tmux session ready: ${ctx.workspace.name}`)
      return { kind: "tmux", sessionName: ctx.workspace.name }
    } catch (err) {
      spinner?.stop("tmux unavailable — skipped")
      if (!ctx.silent) p.log.warn(`tmux: ${String(err)}`)
      return null
    }
  },
  ```

  **3. Update niri.ts open()** — same pattern for spinner, and guard ALL `p.log.warn()` calls:

  At line 108, change to:
  ```typescript
  const spinner = ctx.silent ? null : p.spinner()
  spinner?.start("Setting up niri workspace")
  ```

  At line 297, change to:
  ```typescript
  spinner?.stop("niri workspace ready")
  ```

  At line 299, change to:
  ```typescript
  spinner?.stop("niri unavailable -- skipped")
  if (!ctx.silent) p.log.warn(`niri: ${String(err)}`)
  ```

  For EVERY `p.log.warn(...)` call inside open() (lines 148, 190, 223, 231, 254, 266, 280, 300), prefix with `if (!ctx.silent)`:
  ```typescript
  if (!ctx.silent) p.log.warn(`niri: failed to move window ${windowId}: ${String(err)}`)
  ```
  Apply this pattern to all 8 `p.log.warn` occurrences in the open() method.

  **4. Wire dashboard to pass captured: true** (`src/tui/dashboard/App.tsx`):

  At line 252, change:
  ```typescript
  const result = await openWorkspace(name, {}, (msg) =>
  ```
  to:
  ```typescript
  const result = await openWorkspace(name, { captured: true }, (msg) =>
  ```
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun run typecheck && bun test tests/</automated>
  </verify>
  <done>All integration open() methods skip p.spinner() and p.log.warn() when ctx.silent is true. Dashboard passes captured: true to openWorkspace. Typecheck passes. All existing tests pass (no behavior change for non-silent path).</done>
</task>

</tasks>

<verification>
1. `bun run typecheck` passes — no type errors from the new `silent` field or `captured` option
2. `bun test tests/` passes — all existing tests unchanged (they don't pass `captured: true`)
3. Manual verification: open dashboard with `bun run src/index.ts manage`, select a workspace, press Enter to open — hook output and integration status should appear as progress lines without garbled escape sequences, and "press any key" should work cleanly
</verification>

<success_criteria>
- Dashboard open action no longer corrupts the TUI screen
- Hook output flows through onProgress callback (visible as progress lines)
- Integration open() methods run silently in captured mode (no spinner ANSI, no clack log output)
- CLI open (non-dashboard) behavior is completely unchanged
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260322-cqi-fix-broken-press-any-key-dialog-in-dashb/260322-cqi-SUMMARY.md`
</output>
