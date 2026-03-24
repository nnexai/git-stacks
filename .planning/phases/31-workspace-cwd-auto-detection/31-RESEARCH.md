# Phase 31: Workspace CWD Auto-Detection - Research

**Researched:** 2026-03-24
**Domain:** CLI argument parsing, filesystem path matching, Commander.js positional argument behavior
**Confidence:** HIGH

## Summary

This phase makes the `<workspace>` positional argument optional on all issue commands (link, unlink, open) across all 4 tracker integrations (Jira, GitHub, GitLab, Gitea) by auto-detecting the current workspace from the working directory. The detection function matches `process.cwd()` against stored `task_path` values in workspace YAML files.

The core implementation involves: (1) a new `detectWorkspaceFromCwd()` function in `workspace-ops.ts`, (2) changing Commander.js command signatures from `<workspace>` to optional, and (3) a disambiguation strategy for `link` commands where a single arg must be determined as either a workspace name or an issue ID.

**Primary recommendation:** Use variadic/custom parsing on the `link` command -- define it as `link <args...>` with manual disambiguation, or use `link [workspace] [issue-id]` where both are optional and disambiguate in the action handler based on whether the first arg matches a workspace name. All other issue commands (`unlink`, `open`) can simply change `<workspace>` to `[workspace]` since they only have one positional.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New `detectWorkspaceFromCwd()` function in `workspace-ops.ts` -- reads all workspace YAMLs, matches CWD against worktree `task_path` entries
- Match using `cwd.startsWith(resolve(expandHome(task_path)))` -- supports both worktree root and subdirectories within it
- If CWD matches multiple workspaces, return the deepest (most specific) match -- longest `task_path` wins
- Custom `workspace_root` paths from global config are honored via the resolved `task_path` values already stored in workspace YAML
- Change `<workspace>` to `[workspace]` (optional positional) on all issue commands across all 4 trackers
- If workspace is omitted, call `detectWorkspaceFromCwd()` as fallback
- Error message when detection fails: "Could not detect workspace from current directory. Run from inside a worktree or specify: git-stacks integration {tracker} issue {action} <workspace> ..."
- For `link` command: `git-stacks integration jira issue link PROJ-123` works (workspace from CWD, issue-id as first positional)
- Passing explicit `[workspace]` overrides CWD detection -- backward compatibility preserved

### Claude's Discretion
- How to disambiguate `link [workspace] <issue-id>` vs `link <issue-id>` when only one positional is given -- likely check if the single arg matches a workspace name
- Whether to cache workspace list during detection or read fresh each time

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WUX-02 | Jira integration auto-detects current workspace from working directory path | `detectWorkspaceFromCwd()` function matches CWD against workspace repo `task_path` values; Jira issue commands use optional `[workspace]` with CWD fallback |
| WUX-03 | Auto-detection extends to all tracker integrations (GitHub, GitLab, Gitea issue commands) | Same detection logic applied identically across all 4 trackers; all share the same issue command pattern |
</phase_requirements>

## Architecture Patterns

### Detection Function Design

```typescript
// src/lib/workspace-ops.ts

import { resolve } from "path"
import { expandHome } from "./paths"
import { listWorkspaces, type Workspace } from "./config"

export type CwdDetectionResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: "no_match" }

export function detectWorkspaceFromCwd(cwd?: string): CwdDetectionResult {
  const currentDir = cwd ?? process.cwd()
  const workspaces = listWorkspaces()

  let bestMatch: Workspace | null = null
  let bestPathLen = 0

  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      if (repo.mode !== "worktree") continue
      const resolvedTaskPath = resolve(expandHome(repo.task_path))
      // Match CWD exactly OR as a subdirectory (with trailing separator)
      if (
        currentDir === resolvedTaskPath ||
        currentDir.startsWith(resolvedTaskPath + "/")
      ) {
        if (resolvedTaskPath.length > bestPathLen) {
          bestMatch = ws
          bestPathLen = resolvedTaskPath.length
        }
      }
    }
  }

  if (!bestMatch) return { ok: false, error: "no_match" }
  return { ok: true, workspace: bestMatch }
}
```

**Key design decisions:**
1. Accept optional `cwd` parameter for testability (defaults to `process.cwd()`)
2. Only match worktree-mode repos -- trunk repos point to the main clone shared across workspaces
3. Use `startsWith(path + "/")` not just `startsWith(path)` to prevent `/home/user/tasks/my-ws/repo-name` from matching `/home/user/tasks/my-ws/repo-na`
4. Deepest match wins (longest `task_path`) for disambiguation when workspaces share path prefixes
5. Read fresh each call (no caching) -- workspace list is small, YAML reads are fast, and caching adds complexity for edge cases where workspaces are created/removed between calls

### Commander.js Positional Argument Disambiguation (CRITICAL)

**The problem:** Commander.js 12.1.0 assigns positional arguments strictly by index. For `link [workspace] <issue-id>`, if only one positional is given, Commander assigns it to position 0 (`[workspace]`) and throws `missingArgument` for position 1 (`<issue-id>`) since it's required.

**Verified behavior** (from Commander.js source `_checkNumberOfArguments()` at line 1301): Commander iterates `registeredArguments` by index, checking `if (arg.required && this.args[i] == null)`. The first positional always gets the first value. There is no "skip optional if required is missing" logic.

**Recommended approach -- make both positionals optional on `link`:**

```typescript
// Change: link <workspace> <issue-id>
// To:     link [workspace-or-issue] [issue-id]
issue.command("link [workspace-or-issue] [issue-id]")
  .description("Link a tracker issue to a workspace (e.g. PROJ-123)")
  .action(async (firstArg: string | undefined, secondArg: string | undefined) => {
    let workspaceName: string
    let issueId: string

    if (secondArg !== undefined) {
      // Two args: link <workspace> <issue-id> (backward compatible)
      workspaceName = firstArg!
      issueId = secondArg
    } else if (firstArg !== undefined) {
      // One arg: is it a workspace name or an issue ID?
      if (workspaceExists(firstArg)) {
        // It's a workspace name -- but then where's the issue ID?
        // This is an error: "Missing issue ID"
        console.error("Missing issue ID. Usage: git-stacks integration {tracker} issue link [workspace] <issue-id>")
        process.exit(1)
      }
      // It's an issue ID -- detect workspace from CWD
      issueId = firstArg
      const detection = detectWorkspaceFromCwd()
      if (!detection.ok) {
        console.error("Could not detect workspace from current directory. Run from inside a worktree or specify: git-stacks integration {tracker} issue link <workspace> <issue-id>")
        process.exit(1)
      }
      workspaceName = detection.workspace.name
    } else {
      // No args at all
      console.error("Missing issue ID. Usage: git-stacks integration {tracker} issue link [workspace] <issue-id>")
      process.exit(1)
    }
    // ... rest of action
  })
```

**Disambiguation logic:**
- Two args given: first is workspace, second is issue ID (backward compatible)
- One arg given: check if it matches a workspace name via `workspaceExists()`. If it does, it's ambiguous but likely an error (workspace name given without issue ID). If it does NOT match a workspace name, treat it as an issue ID and detect workspace from CWD.
- Zero args: error

**Why `workspaceExists()` check works for disambiguation:** Workspace names are kebab-case-style identifiers (e.g., `my-feature`, `fix-login-bug`). Issue IDs have distinctive formats: Jira uses `PROJ-123`, GitHub/GitLab/Gitea use numeric `42` or `#42`. The chance of collision between a workspace name and an issue ID is extremely low, and when it occurs, the `workspaceExists()` check gives the right answer.

**Edge case -- workspace name collides with issue ID:** If a workspace is named `42` and the user runs `link 42`, the function would treat `42` as a workspace name (it exists) and report "Missing issue ID." This is the correct behavior -- the user must use two arguments to disambiguate.

### `unlink` and `open` Commands -- Simpler

For `unlink` and `open`, the workspace is the ONLY positional argument. Simply change to `[workspace]`:

```typescript
// unlink: change <workspace> to [workspace]
issue.command("unlink [workspace]")
  .action(async (workspaceName: string | undefined) => {
    if (!workspaceName) {
      const detection = detectWorkspaceFromCwd()
      if (!detection.ok) {
        console.error("Could not detect workspace...")
        process.exit(1)
      }
      workspaceName = detection.workspace.name
    }
    // ... rest unchanged
  })
```

For `open <workspace> [repo]` on GitHub/GitLab/Gitea issue commands:

```typescript
// open: change <workspace> to [workspace]
issue.command("open [workspace] [repo]")
  .action(async (workspaceName: string | undefined, repoArg: string | undefined, ...) => {
    if (!workspaceName) {
      const detection = detectWorkspaceFromCwd()
      if (!detection.ok) {
        console.error("Could not detect workspace...")
        process.exit(1)
      }
      workspaceName = detection.workspace.name
    }
    // ... rest unchanged
  })
```

### Shared Helper Pattern

Since all 4 trackers need the same CWD fallback logic, extract a shared helper:

```typescript
// src/lib/integrations/issue-utils.ts (add to existing file)

import { detectWorkspaceFromCwd } from "../workspace-ops"
import { workspaceExists } from "../config"

/**
 * Resolve workspace name from explicit argument or CWD detection.
 * Returns workspace name on success, calls process.exit(1) on failure.
 */
export function resolveWorkspaceArg(
  workspaceName: string | undefined,
  tracker: string,
  action: string
): string {
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

### Anti-Patterns to Avoid

- **Matching CWD against `main_path` for trunk-mode repos:** Trunk repos point to the main clone shared by all workspaces. Matching CWD against `main_path` would produce ambiguous results. Only match worktree-mode repos.
- **Using `startsWith(path)` without trailing separator:** `/home/user/tasks/my-ws/repo-name` would incorrectly match `/home/user/tasks/my-ws/repo-na` as a prefix. Always use `startsWith(path + "/")` OR exact match.
- **Circular import:** `detectWorkspaceFromCwd()` lives in `workspace-ops.ts` and calls `listWorkspaces()` from `config.ts`. The integration files (jira.ts, etc.) import from `issue-utils.ts`. If the shared helper in `issue-utils.ts` imports from `workspace-ops.ts`, and `workspace-ops.ts` imports from `integrations/`, there could be a circular dependency. Check the import chain: `issue-utils.ts` currently imports only from `../config` -- adding an import from `../workspace-ops` should be safe since `workspace-ops.ts` does NOT import from `issue-utils.ts` or `integrations/issue-utils.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path normalization | Custom tilde expansion | `resolve(expandHome(path))` | Already in codebase, handles `~` and relative paths |
| Workspace listing | Manual YAML file scanning | `listWorkspaces()` from config.ts | Handles corrupt YAML, Zod validation, error reporting |
| Workspace existence check | `existsSync(workspacePath(name))` in each integration | `workspaceExists()` from config.ts | Already the standard pattern |

## Common Pitfalls

### Pitfall 1: Commander.js Positional Ordering Trap
**What goes wrong:** Defining `link [workspace] <issue-id>` causes Commander to throw "missing required argument 'issue-id'" when only one arg is given, because it assigns the single value to position 0 (workspace) leaving position 1 (issue-id) undefined.
**Why it happens:** Commander.js assigns positionals strictly by index, not by "skip optional to fill required."
**How to avoid:** Make both positionals optional: `link [workspace-or-issue] [issue-id]`. Disambiguate in the action handler.
**Warning signs:** Tests that pass two args succeed but tests with one arg throw a Commander error.

### Pitfall 2: Path Comparison Without Normalization
**What goes wrong:** CWD is always an absolute path from the OS. But `task_path` in workspace YAML might contain `~` if `workspace_root` was configured with a tilde (e.g., `~/workspaces`). Direct string comparison fails.
**Why it happens:** `task_path` is built at workspace creation time using `join(getTasksDir(config.workspace_root), name, repo.name)`. If `workspace_root` = `~/workspaces`, `task_path` = `~/workspaces/tasks/my-ws/repo`.
**How to avoid:** Always normalize with `resolve(expandHome(task_path))` before comparing.
**Warning signs:** Detection works with default config but fails for users with custom `workspace_root: ~/...`.

### Pitfall 3: Trunk-Mode False Positives
**What goes wrong:** Matching CWD against trunk-mode repo `task_path` (which equals `main_path` -- the main clone) produces false positives, since the same clone directory is referenced by all workspaces that include that repo in trunk mode.
**Why it happens:** Trunk repos share a single clone; the `task_path` is identical across workspaces.
**How to avoid:** Only iterate repos with `mode === "worktree"` in the detection function.
**Warning signs:** Detection returns wrong workspace name when the user has multiple workspaces with the same trunk repo.

### Pitfall 4: Test Module Cache Contamination
**What goes wrong:** Bun's module cache retains mock configurations across test files. If `workspace-ops.ts` is imported in a test with one mock setup, subsequent test files get the wrong implementation.
**Why it happens:** Bun caches module resolution. The codebase uses `?query-param` cache-busting to work around this.
**How to avoid:** Use `?cache-bust` query params on dynamic imports. Mock `@/lib/config` BEFORE importing modules that depend on it.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 5: `process.exit()` in Helper Functions
**What goes wrong:** Calling `process.exit(1)` inside a shared helper makes it untestable -- the test runner exits.
**Why it happens:** The existing pattern in integration commands calls `process.exit(1)` directly.
**How to avoid:** The shared `resolveWorkspaceArg()` helper can follow the existing pattern (all 4 tracker files already do this). Tests mock `process.exit` to throw instead, using the established `exitMock` pattern from existing test files.
**Warning signs:** Test runner crashes instead of reporting failure.

## Code Examples

### Current Issue Command Signatures (to be changed)

All 4 trackers follow identical patterns:

**Jira** (src/lib/integrations/jira.ts:59-80):
```typescript
issue.command("link <workspace> <issue-id>")   // --> link [workspace-or-issue] [issue-id]
issue.command("unlink <workspace>")             // --> unlink [workspace]
issue.command("open <workspace>")               // --> open [workspace]
```

**GitHub** (src/lib/integrations/github.ts:121-165):
```typescript
issue.command("link <workspace> <issue-id>")   // --> link [workspace-or-issue] [issue-id]
issue.command("unlink <workspace>")             // --> unlink [workspace]
issue.command("open <workspace> [repo]")        // --> open [workspace] [repo] (already has [repo] optional)
```

**GitLab** (src/lib/integrations/gitlab.ts:123-167):
```typescript
issue.command("link <workspace> <issue-id>")   // --> link [workspace-or-issue] [issue-id]
issue.command("unlink <workspace>")             // --> unlink [workspace]
issue.command("open <workspace> [repo]")        // --> open [workspace] [repo]
```

**Gitea** (src/lib/integrations/gitea.ts:194-261):
```typescript
issue.command("link <workspace> <issue-id>")   // --> link [workspace-or-issue] [issue-id]
issue.command("unlink <workspace>")             // --> unlink [workspace]
issue.command("open <workspace> [repo]")        // --> open [workspace] [repo]
```

### Existing CWD Detection Pattern (forge-utils.ts)

The forge `open [workspace]` commands already have a CWD fallback, but it detects the git repo root, NOT the workspace. Our detection is different -- it matches CWD against workspace YAML data.

```typescript
// forge-utils.ts:139-143 -- existing git-toplevel detection
export async function resolveRepoCwd(): Promise<string | null> {
  const result = await $`git rev-parse --show-toplevel`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  return result.text().trim()
}
```

### Test Pattern for Detection Function

```typescript
// tests/lib/workspace-ops.test.ts pattern -- use isolated config
import { useIsolatedConfig, makeTmpDir, cleanup, write } from "../helpers"

const isolated = useIsolatedConfig("cwd-detect")

const { writeWorkspace } = await import("@/lib/config?cwd-detect")
const { detectWorkspaceFromCwd } = await import("@/lib/workspace-ops?cwd-detect")

describe("detectWorkspaceFromCwd", () => {
  test("detects workspace when CWD is inside a worktree", () => {
    writeWorkspace({
      name: "my-ws",
      branch: "feat/test",
      created: "2026-01-01",
      repos: [{
        name: "repo-a",
        repo: "repo-a",
        type: "other",
        mode: "worktree",
        main_path: "/tmp/main/repo-a",
        task_path: "/tmp/tasks/my-ws/repo-a",
      }],
    })
    const result = detectWorkspaceFromCwd("/tmp/tasks/my-ws/repo-a/src/components")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe("my-ws")
  })
})
```

### Integration Command Test Pattern (existing jira.test.ts)

```typescript
// Tests create a Commander parent, register commands, then parseAsync with mock args
const parent = new Command()
jiraIntegration.commands!(parent)
await parent.parseAsync(["node", "x", "issue", "link", "my-ws", "PROJ-123"])
expect(linkIssueMock).toHaveBeenCalledWith("my-ws", "jira", "PROJ-123")
```

## Files Changed

| File | Change | Complexity |
|------|--------|------------|
| `src/lib/workspace-ops.ts` | Add `detectWorkspaceFromCwd()` function + types | Low |
| `src/lib/integrations/issue-utils.ts` | Add `resolveWorkspaceArg()` helper | Low |
| `src/lib/integrations/jira.ts` | Change command signatures, add CWD fallback | Medium |
| `src/lib/integrations/github.ts` | Change issue command signatures, add CWD fallback | Medium |
| `src/lib/integrations/gitlab.ts` | Change issue command signatures, add CWD fallback | Medium |
| `src/lib/integrations/gitea.ts` | Change issue command signatures, add CWD fallback | Medium |
| `tests/lib/workspace-ops.test.ts` or new test file | Tests for `detectWorkspaceFromCwd()` | Medium |
| `tests/lib/integrations/jira.test.ts` | Update test args, add CWD fallback tests | Medium |
| `tests/lib/integrations/github.test.ts` | Update test args, add CWD fallback tests | Low |
| `tests/lib/integrations/gitlab.test.ts` | Update test args, add CWD fallback tests | Low |
| `tests/lib/integrations/gitea.test.ts` | Update test args, add CWD fallback tests | Low |
| `tests/lib/integration-commands.test.ts` | Update command structure assertions | Low |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | bunfig.toml |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WUX-02 | detectWorkspaceFromCwd matches CWD to workspace | unit | `bun test tests/lib/workspace-ops.test.ts -t "detectWorkspaceFromCwd"` | Wave 0 |
| WUX-02 | Jira link with single arg (issue-id) uses CWD detection | unit | `bun test tests/lib/integrations/jira.test.ts -t "link.*CWD"` | Wave 0 |
| WUX-02 | Jira unlink with no args uses CWD detection | unit | `bun test tests/lib/integrations/jira.test.ts -t "unlink.*CWD"` | Wave 0 |
| WUX-02 | Jira open with no args uses CWD detection | unit | `bun test tests/lib/integrations/jira.test.ts -t "open.*CWD"` | Wave 0 |
| WUX-02 | Explicit workspace arg still works (backward compat) | unit | `bun test tests/lib/integrations/jira.test.ts -t "link.*explicit"` | Existing (updated) |
| WUX-03 | GitHub issue link CWD fallback | unit | `bun test tests/lib/integrations/github.test.ts -t "link.*CWD"` | Wave 0 |
| WUX-03 | GitLab issue link CWD fallback | unit | `bun test tests/lib/integrations/gitlab.test.ts -t "link.*CWD"` | Wave 0 |
| WUX-03 | Gitea issue link CWD fallback | unit | `bun test tests/lib/integrations/gitea.test.ts -t "link.*CWD"` | Wave 0 |
| WUX-02 | Outside-workspace CWD prints clear error | unit | `bun test tests/lib/workspace-ops.test.ts -t "no_match"` | Wave 0 |
| WUX-02 | Deepest match wins for overlapping paths | unit | `bun test tests/lib/workspace-ops.test.ts -t "deepest"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts tests/lib/integrations/jira.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/workspace-ops.test.ts` additions -- covers detectWorkspaceFromCwd (exact match, subdirectory, no match, deepest match, trunk-mode skip, tilde path normalization)
- [ ] `tests/lib/integrations/jira.test.ts` additions -- covers CWD fallback for link/unlink/open
- [ ] `tests/lib/integrations/github.test.ts` additions -- covers CWD fallback for link/unlink/open
- [ ] `tests/lib/integrations/gitlab.test.ts` additions -- covers CWD fallback for link/unlink/open
- [ ] `tests/lib/integrations/gitea.test.ts` additions -- covers CWD fallback for link/unlink/open
- [ ] Mock for `detectWorkspaceFromCwd` in integration test files

## Open Questions

1. **Error message for `link` with workspace name but no issue ID**
   - What we know: When `link my-ws` is run (one arg that matches a workspace name), the function detects it as a workspace name but has no issue ID.
   - What's unclear: Should the error say "Missing issue ID" or should it fall through to CWD detection and treat `my-ws` as a (likely invalid) issue ID?
   - Recommendation: Treat it as workspace name (since `workspaceExists()` returns true), print "Missing issue ID" error. This is the least surprising behavior.

2. **`formatIssueError` update for `no_issue_linked`**
   - What we know: Current `formatIssueError` for `no_issue_linked` suggests `Run: git-stacks integration ${tracker} issue link ${workspace} <issue-id>`. After this phase, the suggestion should also mention CWD detection as an option.
   - What's unclear: Whether to update this message or leave it as-is.
   - Recommendation: Update to include both forms: "Run: git-stacks integration {tracker} issue link <issue-id> (from inside a worktree) or: ... link <workspace> <issue-id>"

## Project Constraints (from CLAUDE.md)

- **Runtime:** Bun -- use Bun APIs freely
- **TypeScript strict mode** throughout
- **No breaking changes:** Existing workspace YAML files continue to work
- **Test patterns:** Use `bun:test`, mock with `mock.module()`, cache-busting query params on dynamic imports
- **Error handling:** Return discriminated unions for fallible operations where possible; `process.exit(1)` in command handlers is acceptable (existing pattern)
- **Import rules:** Production code in `src/` must use relative imports. `@/*` alias is test-only.
- **Path constants:** All path helpers in `src/lib/paths.ts`
- **Config I/O:** All YAML through `src/lib/config.ts`
- **Integration plugin system:** Register in `src/lib/integrations/index.ts`. Issue commands added inside `commands()` method on each integration.

## Sources

### Primary (HIGH confidence)
- Commander.js 12.1.0 source code (`node_modules/commander/lib/command.js`, lines 1301-1367) -- verified positional argument parsing behavior
- `src/lib/integrations/jira.ts` -- verified exact current command signatures (lines 59-101)
- `src/lib/integrations/github.ts` -- verified exact current command signatures (lines 118-165)
- `src/lib/integrations/gitlab.ts` -- verified exact current command signatures (lines 120-167)
- `src/lib/integrations/gitea.ts` -- verified exact current command signatures (lines 192-261)
- `src/lib/config.ts` -- verified `listWorkspaces()`, `workspaceExists()`, `WorkspaceRepoSchema.task_path`
- `src/lib/workspace-ops.ts` -- verified current exports and patterns
- `src/lib/paths.ts` -- verified `expandHome()` implementation
- `src/lib/integrations/forge-utils.ts` -- verified existing `resolveRepoCwd()` pattern
- `src/lib/integrations/issue-utils.ts` -- verified `resolveIssueRef()`, `linkIssue()`, `unlinkIssue()` APIs
- `tests/lib/integrations/jira.test.ts` -- verified test patterns
- `tests/lib/integrations/github.test.ts` -- verified test patterns
- `tests/lib/workspace-ops.test.ts` -- verified test infrastructure patterns

### Secondary (MEDIUM confidence)
- Commander.js positional argument ordering behavior -- verified via source code inspection, not via official documentation statement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing codebase patterns
- Architecture: HIGH -- detection function design verified against actual data structures and path formats
- Pitfalls: HIGH -- Commander.js behavior verified by reading source code; path normalization verified against existing `expandHome()` usage
- Disambiguation: HIGH -- workspace name vs issue ID formats are structurally distinct; `workspaceExists()` provides deterministic check

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no moving targets)
