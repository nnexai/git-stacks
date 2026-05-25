# Phase 102: workspace-root-auto-detection - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/workspace-status.ts` | service | transform | `src/lib/workspace-status.ts` | exact |
| `src/lib/workspace-resolution.ts` | utility | request-response | `src/lib/integrations/issue-utils.ts`, `src/commands/notes.ts` | role-match |
| `src/lib/integrations/issue-utils.ts` | utility | request-response | `src/lib/integrations/issue-utils.ts` | exact |
| `src/commands/workspace.ts` | controller | request-response | `src/commands/workspace.ts` | exact |
| `src/commands/files.ts` | controller | request-response | `src/commands/files.ts` | exact |
| `src/commands/command.ts` | controller | request-response | `src/commands/command.ts` | exact |
| `src/commands/notes.ts` | controller | request-response | `src/commands/notes.ts` | exact |
| `tests/lib/detect-workspace-cwd.test.ts` | test | transform | `tests/lib/detect-workspace-cwd.test.ts` | exact |
| `tests/commands/workspace-wrapper-edges.test.ts` | test | request-response | `tests/commands/workspace-wrapper-edges.test.ts` | exact |
| `tests/commands/files.test.ts` | test | request-response | `tests/commands/files.test.ts` | exact |
| `tests/commands/command.test.ts` | test | request-response | `tests/commands/command.test.ts` | exact |
| `tests/commands/notes.test.ts` | test | request-response | `tests/commands/notes.test.ts` | exact |

## Pattern Assignments

### `src/lib/workspace-status.ts` (service, transform)

**Analog:** `src/lib/workspace-status.ts`

**Imports pattern** (lines 1-7):
```typescript
import { existsSync } from "fs"
import { resolve } from "path"
import { listWorkspaces, getRepoPath, isGitRepo, isWorktreeRepo, type Workspace } from "./config"
import { logDebug, timeOperation } from "./observability"
import { expandHome } from "./paths"
```

**Core resolver pattern** (lines 199-226):
```typescript
export function detectWorkspaceFromCwd(cwd?: string): CwdDetectionResult {
  return timeOperation<CwdDetectionResult>(OBS_CATEGORY, "detectWorkspaceFromCwd", () => {
    const currentDir = cwd ?? process.cwd()
    const workspaces = listWorkspaces()

    let bestMatch: Workspace | null = null
    let bestPathLen = 0

    for (const ws of workspaces) {
      for (const repo of ws.repos) {
        if (!isWorktreeRepo(repo)) continue
        const resolvedTaskPath = resolve(expandHome(repo.task_path))
        if (currentDir === resolvedTaskPath || currentDir.startsWith(resolvedTaskPath + "/")) {
          if (resolvedTaskPath.length > bestPathLen) {
            bestMatch = ws
            bestPathLen = resolvedTaskPath.length
          }
        }
      }
    }

    if (!bestMatch) return { ok: false as const, error: "no_match" as const }
    return { ok: true as const, workspace: bestMatch }
  })
}
```

**Error contract pattern** (lines 187-189, 224-225):
```typescript
export type CwdDetectionResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: "no_match" }
```

---

### `src/lib/workspace-resolution.ts` (utility, request-response)

**Analog:** `src/lib/integrations/issue-utils.ts` and `src/commands/notes.ts`

**Role-match rationale:** This is a new shared helper extracted from existing command-local optional-workspace resolver behavior. Use `issue-utils.ts` for explicit argument validation and cwd detection failure handling, and `notes.ts` for the existing opt-in `GS_WORKSPACE_NAME` fallback pattern.

**Explicit arg + cwd resolver pattern** (from `src/lib/integrations/issue-utils.ts`):
```typescript
if (workspaceName) {
  if (!workspaceExists(workspaceName)) {
    console.error(`Workspace '${workspaceName}' not found.`)
    process.exit(1)
  }
  return workspaceName
}
const detection = detectWorkspaceFromCwd()
if (detection.ok) return detection.workspace.name
```

**Opt-in env fallback pattern** (from `src/commands/notes.ts`):
```typescript
const detected = detectWorkspaceFromCwd()
if (detected.ok) return detected.workspace.name
return process.env.GS_WORKSPACE_NAME ?? null
```

**Implementation guidance:** Export a helper such as `resolveOptionalWorkspace(...)` that validates explicit names, delegates cwd matching to `detectWorkspaceFromCwd()`, and reads `GS_WORKSPACE_NAME` only when the caller passes an explicit option for env fallback. Keep command-specific stderr/help text in thin command adapters.

---

### `src/lib/integrations/issue-utils.ts` (utility, request-response)

**Analog:** `src/lib/integrations/issue-utils.ts`

**Imports pattern** (lines 1-8):
```typescript
import { workspaceExists, readWorkspace, writeWorkspace, type Workspace } from "../config"
import { detectWorkspaceFromCwd } from "../workspace-status"
```

**Optional workspace resolver order pattern** (lines 99-121):
```typescript
export function resolveWorkspaceArg(workspaceName: string | undefined, tracker: string, action: string): string {
  if (workspaceName) {
    if (!workspaceExists(workspaceName)) {
      console.error(`Workspace '${workspaceName}' not found.`)
      process.exit(1)
    }
    return workspaceName
  }
  const detection = detectWorkspaceFromCwd()
  if (!detection.ok) {
    console.error(
      `Could not detect workspace from current directory. ` +
      `Run from inside a worktree or specify: ` +
      `git-stacks integration ${tracker} issue ${action} <workspace> ...`
    )
    process.exit(1)
  }
  return detection.workspace.name
}
```

---

### `src/commands/workspace.ts` (controller, request-response)

**Analog:** `src/commands/workspace.ts`

**Imports pattern** (lines 1-5, 37-39):
```typescript
import { Command, Option } from "commander"
import { formatError } from "../lib/errors"
import { getDirtyWorktrees, getWorkspaceStatus, getWorkspaceListInfo, detectWorkspaceFromCwd } from "../lib/workspace-status"
import { formatEnv, detectRepoFromCwd, type EnvFormat } from "../lib/env"
```

**Workspace optional-resolution + bounded guidance** (`paths`, lines 1063-1079):
```typescript
if (name) {
  if (!workspaceExists(name)) {
    console.error(formatError(`Workspace '${name}' not found`, "run: git-stacks list"))
    process.exit(1)
  }
  workspaceName = name
} else {
  const detection = detectWorkspaceFromCwd()
  if (!detection.ok) {
    console.error(formatError(
      "Could not detect workspace from current directory",
      "run from inside a worktree or specify: git-stacks paths <workspace>"
    ))
    process.exit(1)
  }
  workspaceName = detection.workspace.name
}
```

**Repo-aware follow-up after workspace detection** (`env`, lines 1156-1162):
```typescript
} else if (workspace === undefined) {
  const repoName = detectRepoFromCwd(ws)
  if (repoName) {
    const repo = ws.repos.find(r => r.name === repoName)
    if (repo) env = buildRepoEnv(env, repo)
  }
}
```

---

### `src/commands/files.ts` (controller, request-response)

**Analog:** `src/commands/files.ts`

**Resolver wrapper pattern** (lines 17-31):
```typescript
function resolveWorkspace(workspaceName: string | undefined): Workspace {
  if (workspaceName) {
    if (!workspaceExists(workspaceName)) {
      console.error(formatError(`Workspace '${workspaceName}' not found`, "run: git-stacks list"))
      process.exit(1)
    }
    return readWorkspace(workspaceName)
  }

  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace

  console.error(formatError("Missing workspace name", "usage: git-stacks files <verb> <workspace>"))
  process.exit(1)
}
```

**Action handler pattern** (lines 200-207, 226-234):
```typescript
filesCommand
  .command("status [workspace]")
  .action((workspaceName, opts) => {
    const workspace = resolveWorkspace(workspaceName)
    const rows = getFileEntryStatuses(workspace, workspaceRoot(workspace), {
      verbose: opts.verbose,
      pathLimit: DEFAULT_VERBOSE_PATH_LIMIT,
    })
  })
```

---

### `src/commands/command.ts` (controller, request-response)

**Analog:** `src/commands/command.ts`

**Resolver wrapper pattern** (lines 7-19):
```typescript
function resolveWorkspace(workspaceName: string | undefined): Workspace {
  if (workspaceName) {
    if (!workspaceExists(workspaceName)) {
      console.error(formatError(`Workspace '${workspaceName}' not found`, "run: git-stacks list"))
      process.exit(1)
    }
    return readWorkspace(workspaceName)
  }
  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace
  console.error(formatError("Missing workspace name", "usage: git-stacks command <verb> <workspace>"))
  process.exit(1)
}
```

---

### `src/commands/notes.ts` (controller, request-response)

**Analog:** `src/commands/notes.ts`

**Resolution order with env fallback pattern** (lines 12-17):
```typescript
function resolveWorkspace(explicitWorkspace?: string): string | null {
  if (explicitWorkspace) return explicitWorkspace
  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace.name
  return process.env.GS_WORKSPACE_NAME ?? null
}
```

**Validation + user guidance pattern** (lines 19-33):
```typescript
function requireExistingWorkspace(explicitWorkspace?: string): string {
  const workspace = resolveWorkspace(explicitWorkspace)
  if (!workspace) {
    throw new Error(
      formatError(
        "no workspace specified",
        "use [workspace], run inside a workspace task path, or set GS_WORKSPACE_NAME"
      )
    )
  }
  if (!workspaceExists(workspace)) {
    throw new Error(formatError(`workspace '${workspace}' not found`))
  }
  return workspace
}
```

---

### `tests/lib/detect-workspace-cwd.test.ts` (test, transform)

**Analog:** `tests/lib/detect-workspace-cwd.test.ts`

**Isolated fixture pattern** (lines 26-31, 121-125):
```typescript
const configDir = makeTmpDir("cwd-detect")
mkdirSync(join(configDir, "workspaces"), { recursive: true })

function clearWorkspaces() {
  rmSync(join(configDir, "workspaces"), { recursive: true, force: true })
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
}
```

**Resolver edge-case assertions** (lines 168-190, 209-215):
```typescript
test("deepest match wins when CWD matches multiple workspace paths", () => {
  const result = detectWorkspaceFromCwd("/tmp/tasks/a/repo/nested-subdir/src")
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.workspace.name).toBe("ws-nested")
})

test("path prefix collision guard ... does not match", () => {
  const result = detectWorkspaceFromCwd("/tmp/tasks/repo-name")
  expect(result.ok).toBe(false)
})
```

---

### `tests/commands/workspace-wrapper-edges.test.ts` (test, request-response)

**Analog:** `tests/commands/workspace-wrapper-edges.test.ts`

**Subprocess harness pattern** (lines 16-19, 34-47, 100-117):
```typescript
function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

const detected = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
expectSuccessful(detected)

const result = runCli(["paths"], { baseDir: tmpDir, configDir, cwd: tmpDir })
expect(result.exitCode).toBe(1)
expect(result.stderr).toContain("Could not detect workspace from current directory")
```

**Repo-aware env assertion pattern** (lines 122-133):
```typescript
const detected = runCli(["env", "--format", "json"], { baseDir: tmpDir, configDir, cwd: api.taskPath })
const detectedJson = JSON.parse(detected.stdout.trim())
expect(detectedJson.GS_WORKSPACE_NAME).toBe(wsName)
expect(detectedJson.GS_REPO_NAME).toBe("api")
```

---

### `tests/commands/files.test.ts` (test, request-response)

**Analog:** `tests/commands/files.test.ts`

**CLI fixture setup pattern** (lines 21-37, 84-94):
```typescript
function setupFilesWorkspace(tmpDir: string, cfgDir: string, wsName = "files-ws") {
  const wsRoot = join(tmpDir, "workspaces")
  const root = join(wsRoot, "tasks", wsName)
  const repoTask = join(root, "api")
  // ... write workspace YAML fixture ...
  return { wsName, wsRoot, root, repoTask, workspace }
}
```

**Omitted workspace resolution assertion** (lines 293-299):
```typescript
const { wsName, repoTask } = setupFilesWorkspace(tmpDir, cfgDir)
const result = runCli(["files", "status"], { baseDir: tmpDir, configDir: cfgDir, cwd: repoTask })
expectSuccessful(result)
expect(result.stdout).toContain(`Workspace: ${wsName}`)
```

---

### `tests/commands/command.test.ts` (test, request-response)

**Analog:** `tests/commands/command.test.ts`

**Resolver-from-cwd test pattern** (lines 77-86):
```typescript
test("command run resolves workspace from cwd when omitted", () => {
  const { repoTask } = setupWorkspace(tmpDir, cfgDir)
  const result = runCli(["command", "run", "verify", "--dry-run"], {
    baseDir: tmpDir,
    configDir: cfgDir,
    cwd: repoTask,
  })
  expectSuccess(result)
})
```

---

### `tests/commands/notes.test.ts` (test, request-response)

**Analog:** `tests/commands/notes.test.ts`

**Precedence contract pattern** (lines 76-95, 97-131):
```typescript
test("explicit workspace arg overrides cwd detection and GS_WORKSPACE_NAME", () => {
  const added = runCli(["notes", "add", "alpha", "from-explicit"], { cwd: join(betaTask, "app"), env: { GS_WORKSPACE_NAME: "beta" } })
  expectSuccess(added)
})

test("cwd detection takes precedence over GS_WORKSPACE_NAME ...", () => {
  const added = runCli(["notes", "add", "from-cwd"], { cwd: join(alphaTask, "app"), env: { GS_WORKSPACE_NAME: "beta" } })
  expectSuccess(added)
})

test("GS_WORKSPACE_NAME fallback is used when explicit arg and cwd detection are unavailable", () => {
  const added = runCli(["notes", "add", "from-env"], { cwd: cwdRoot, env: { GS_WORKSPACE_NAME: "beta" } })
  expectSuccess(added)
})
```

## Shared Patterns

### Optional Workspace Resolution Order
**Source:** `src/commands/notes.ts` lines 12-17, `src/lib/integrations/issue-utils.ts` lines 99-121
**Apply to:** All optional-workspace command surfaces touched in this phase
```typescript
if (explicitWorkspace) return explicitWorkspace
const detected = detectWorkspaceFromCwd()
if (detected.ok) return detected.workspace.name
return process.env.GS_WORKSPACE_NAME ?? null // only where already supported
```

### Workspace Detection Matcher Guarantees
**Source:** `src/lib/workspace-status.ts` lines 207-225
**Apply to:** Shared cwd resolver implementation
```typescript
if (currentDir === resolvedTaskPath || currentDir.startsWith(resolvedTaskPath + "/")) {
  if (resolvedTaskPath.length > bestPathLen) {
    bestMatch = ws
    bestPathLen = resolvedTaskPath.length
  }
}
```

### CLI Error Formatting and Exit Behavior
**Source:** `src/commands/files.ts` lines 19-31, `src/commands/workspace.ts` lines 1071-1077
**Apply to:** Command wrappers when autodetection fails
```typescript
console.error(formatError("Missing workspace name", "usage: git-stacks files <verb> <workspace>"))
process.exit(1)
```

### Subprocess Test Harness Pattern
**Source:** `tests/commands/workspace-wrapper-edges.test.ts` lines 16-19, 100-117
**Apply to:** Representative command-surface tests for workspace-root/subdir detection
```typescript
const result = runCli([...], { baseDir: tmpDir, configDir, cwd })
expect(result.stderr, formatCliFailure(result)).toBe("")
expect(result.exitCode, formatCliFailure(result)).toBe(0)
```

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| None | — | — | Existing resolver and command/test surfaces already provide direct analogs. |

## Metadata

**Analog search scope:** `src/lib`, `src/commands`, `tests/lib`, `tests/commands`
**Files scanned:** 13
**Pattern extraction date:** 2026-05-25
