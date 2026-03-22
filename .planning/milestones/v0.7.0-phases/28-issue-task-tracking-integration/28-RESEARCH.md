# Phase 28: Issue & Task Tracking Integration - Research

**Researched:** 2026-03-22
**Domain:** Issue tracker CLI integrations (gh issue, glab issue, tea issues, jira-cli), workspace issue linking, Integration plugin pattern extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md — not yet created)

The following are locked decisions from the brainstorm session captured in `.planning/todos/pending/2026-03-22-issue-and-task-tracking-integration-jira-github-gitlab-gitea.md`. These are the primary design constraints for Phase 28.

### Locked Decisions

**Architecture**
- D-01: Issue trackers are integrations — same `Integration` interface as forges. GitHub/GitLab/Gitea forge integrations gain issue subcommands added alongside their existing PR subcommands. Jira is a standalone integration (no forge, just issues).
- D-02: Issue references stored under `workspace.settings.integrations.<tracker-id>` (e.g., `{ github: { issue: 42 } }`, `{ jira: { issue: "PROJ-123" } }`). No new top-level WorkspaceSchema field needed.

**Command Surface**
- D-03: Shared command syntax across all trackers:
  - `git-stacks integration <tracker> issue link <workspace> <issue-id>`
  - `git-stacks integration <tracker> issue unlink <workspace>`
  - `git-stacks integration <tracker> issue open <workspace>` — URL to stdout + `--web` flag

**Linking Model**
- D-04: Linking is retroactive only — via `issue link` subcommand. No `--issue` flag on `git-stacks new` for now.

**Jira**
- D-05: Assumes `jira-cli` (ankitpokhrel/jira-cli) is installed. Uses `jira open <ISSUE-KEY>` for browser open.
- D-06: Configurable command template with `$ISSUE_ID` env var placeholder — tool-agnostic so users can wire up any CLI or browser URL. This is a discretion area for the design, but the configurable template approach is confirmed.

**Forge Trackers**
- D-07: Use native CLIs (`gh issue view`, `glab issue view`, `tea issues ls --output json` for URL extraction) with `--web` flag where available.

### Claude's Discretion
- Exact Jira config schema (command template format, env var names)
- Whether issue ID is stored as `number` (for GitHub/GitLab/Gitea) or `string` (Jira keys like "PROJ-123"), or always `string` (simpler, handles both)
- Whether `issue open` without a linked issue produces an error or opens the tracker's project page
- Test strategy details

### Deferred Ideas (OUT OF SCOPE)
- `--issue` flag on `git-stacks new` (automatic linking at workspace creation)
- Cross-workspace issue search
- Displaying issue title/status in `git-stacks list`
- TUI-based issue management
</user_constraints>

## Summary

Phase 28 extends the three forge integration plugins created in Phase 27 with `issue` subcommands and adds a standalone Jira integration. The design is deliberately minimal: git-stacks stores a single issue ID per workspace per tracker, and delegates all display/interaction to the respective CLI tool.

The `issue link` / `issue unlink` / `issue open` command set is consistent across all four trackers (GitHub, GitLab, Gitea, Jira). The link is stored under `workspace.settings.integrations.<tracker-id>.issue` — the same location as other integration settings — meaning no schema changes are needed beyond what Phase 27 already establishes.

The critical difference between trackers is how `issue open` works: `gh issue view <id> --web` and `glab issue view <id> --web` both have native `--web` flags. For Gitea (tea), there is no `tea issues view` command, so git-stacks must extract the URL from `tea issues ls --output json --fields url` filtered by issue index. For Jira, `jira open <ISSUE-KEY>` opens directly in the browser (no additional URL extraction needed).

**Primary recommendation:** Add an `issue` subcommand group to the existing forge plugins (github.ts, gitlab.ts, gitea.ts) and create a new `src/lib/integrations/jira.ts` standalone plugin. All four use a shared `resolveIssueRef(workspaceName, trackerId)` helper that reads `workspace.settings.integrations.<id>.issue` and formats error messages. Persistence of link/unlink is done via `readWorkspace` + modify + `writeWorkspace`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gh (GitHub CLI) | system-installed | `gh issue view <id> --web` | Native `--web` flag, auto-resolves repo from CWD |
| glab (GitLab CLI) | system-installed | `glab issue view <id> --web` | Native `--web` flag, auto-resolves project from CWD |
| tea (Gitea CLI) | system-installed | `tea issues ls --output json --fields url,index` for URL extraction | No issue view command; JSON listing is the only way to get the URL |
| jira-cli (ankitpokhrel/jira-cli) | system-installed | `jira open <ISSUE-KEY>` | Purpose-built browser-open command with issue key as arg |
| Bun `spawn` | existing | Fork CLI subprocesses | Already used in forge integrations via `_exec` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| xdg-open (Linux) / open (macOS) | system | Fallback browser opener for Gitea if URL extracted manually | tea has no --web equivalent on issue commands |
| Zod | existing | Config schema for per-tracker issue config | Already used throughout |

### No New Package Installs Required
All tracker CLIs are system-installed external tools. No npm dependencies are added. The integration pattern is purely CLI invocation plus workspace YAML read/write.

### Version Verification

Package versions verified against system installs:
- `gh`: system-managed (confirm with `gh --version`)
- `glab`: system-managed (confirm with `glab --version`)
- `tea@development`: verified in Phase 27 research as installed
- `jira-cli`: system-managed (confirm with `jira version`)

No npm packages to verify.

## Architecture Patterns

### Recommended Project Structure

```
src/
  lib/
    integrations/
      github.ts         # EXTEND: add issue subcommands to existing commands() method
      gitlab.ts         # EXTEND: add issue subcommands to existing commands() method
      gitea.ts          # EXTEND: add issue subcommands to existing commands() method
      jira.ts           # NEW: standalone Jira integration plugin
      issue-utils.ts    # NEW: shared issue ref helpers (resolveIssueRef, formatIssueError, linkIssue, unlinkIssue)
      forge-utils.ts    # EXISTING: no changes needed for issue commands
      index.ts          # EXTEND: add jiraIntegration to array
tests/
  lib/
    integrations/
      issue-utils.test.ts   # NEW: resolveIssueRef, linkIssue, unlinkIssue unit tests
      jira.test.ts           # NEW: Jira integration command tests
      github.test.ts         # EXTEND: add issue command tests
      gitlab.test.ts         # EXTEND: add issue command tests
      gitea.test.ts          # EXTEND: add issue command tests
```

### Pattern 1: Issue Reference Storage in Workspace YAML

Issue references live under `workspace.settings.integrations.<tracker-id>`. The `WorkspaceSettingsSchema` already accepts `integrations: z.record(z.unknown())` — no schema change required.

Example workspace YAML after linking:
```yaml
settings:
  integrations:
    github:
      issue: 42
    jira:
      issue: "MYPROJECT-123"
```

`WorkspaceSchema.settings.integrations` is `Record<string, unknown>`, so adding `.issue` to any tracker's config object requires only reading/writing workspace YAML — no schema migration. This is the critical architectural advantage of the existing schema design.

**Issue ID type decision:** Store as `string` for all trackers. GitHub/GitLab/Gitea use integer issue numbers; Jira uses alphanumeric keys like "PROJ-123". Storing as `string` unifies the type (integer `42` becomes `"42"` — still valid input for `gh issue view 42`).

### Pattern 2: Shared Issue Utilities (`issue-utils.ts`)

```typescript
// Source: pattern derived from forge-utils.ts + config.ts writeWorkspace

import { readWorkspace, writeWorkspace, workspaceExists } from "../config"

export type IssueRefResolution =
  | { ok: true; issueId: string; workspace: Workspace }
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "no_issue_linked"; tracker: string; workspace: string }

export function resolveIssueRef(
  workspaceName: string,
  trackerId: string
): IssueRefResolution {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }
  const workspace = readWorkspace(workspaceName)
  const trackerConfig = workspace.settings?.integrations?.[trackerId] as Record<string, unknown> | undefined
  const issueId = trackerConfig?.issue
  if (!issueId) {
    return { ok: false, error: "no_issue_linked", tracker: trackerId, workspace: workspaceName }
  }
  return { ok: true, issueId: String(issueId), workspace }
}

export function linkIssue(workspaceName: string, trackerId: string, issueId: string): void {
  const workspace = readWorkspace(workspaceName)
  const integrations = (workspace.settings?.integrations ?? {}) as Record<string, unknown>
  const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
  integrations[trackerId] = { ...existing, issue: issueId }
  const updated: Workspace = {
    ...workspace,
    settings: { ...workspace.settings, integrations },
  }
  writeWorkspace(updated)
}

export function unlinkIssue(workspaceName: string, trackerId: string): void {
  const workspace = readWorkspace(workspaceName)
  const integrations = (workspace.settings?.integrations ?? {}) as Record<string, unknown>
  const existing = (integrations[trackerId] ?? {}) as Record<string, unknown>
  const { issue: _, ...rest } = existing
  integrations[trackerId] = rest
  const updated: Workspace = {
    ...workspace,
    settings: { ...workspace.settings, integrations },
  }
  writeWorkspace(updated)
}
```

### Pattern 3: Issue Subcommands Added to Existing Forge Plugins

Each forge plugin's `commands(parent: Command)` method already creates a `pr` parent command. Add a parallel `issue` command group:

```typescript
// Source: pattern mirrored from pr subcommand in github.ts (Phase 27)
commands(parent: Command): void {
  // --- existing pr commands (Phase 27) ---
  const pr = parent.command("pr").description("Manage GitHub pull requests")
  // ... existing pr subcommands ...

  // --- issue commands (Phase 28 addition) ---
  const issue = parent.command("issue").description("Link and open GitHub issues")

  issue.command("link <workspace> <issue-id>")
    .description("Link a GitHub issue to a workspace")
    .action(async (workspaceName: string, issueId: string) => {
      if (!workspaceExists(workspaceName)) {
        console.error(`Workspace '${workspaceName}' not found.`)
        process.exit(1)
      }
      linkIssue(workspaceName, "github", issueId)
      console.log(`Linked issue #${issueId} to workspace '${workspaceName}'.`)
    })

  issue.command("unlink <workspace>")
    .description("Remove issue link from a workspace")
    .action(async (workspaceName: string) => {
      if (!workspaceExists(workspaceName)) {
        console.error(`Workspace '${workspaceName}' not found.`)
        process.exit(1)
      }
      unlinkIssue(workspaceName, "github")
      console.log(`Unlinked issue from workspace '${workspaceName}'.`)
    })

  issue.command("open <workspace>")
    .description("Open linked issue in browser (--web) or print URL")
    .option("--web", "Open in browser")
    .action(async (workspaceName: string, opts: { web?: boolean }) => {
      const resolution = resolveIssueRef(workspaceName, "github")
      if (!resolution.ok) {
        console.error(formatIssueError(resolution))
        process.exit(1)
      }
      const { issueId, workspace: ws } = resolution
      // resolveForgeRepo still needed for CWD (gh needs to run in a repo's task_path)
      const forgeRes = resolveForgeRepo(workspaceName, undefined, "github")
      if (!forgeRes.ok) {
        console.error(formatForgeError(forgeRes))
        process.exit(1)
      }
      if (opts.web) {
        const result = await _exec.run(["issue", "view", issueId, "--web"], forgeRes.repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      } else {
        const result = await _exec.run(["issue", "view", issueId, "--json", "url", "--jq", ".url"], forgeRes.repoPath)
        if (result.exitCode !== 0) process.exit(result.exitCode)
      }
    })
}
```

**Key insight for `issue open`:** Unlike `pr` commands, `issue open` only needs the workspace name (not the workspace+repo pair) because issues are repo-level but the issue ID alone is sufficient for the forge CLI. However `gh issue view` and `glab issue view` must still run from within a git repo context (so the CLI can resolve the project). The solution: use the same `resolveForgeRepo` to get the `repoPath` CWD, but the `[repo]` arg is optional with auto-selection behavior from Phase 27.

### Pattern 4: Gitea Issue Open (No --web Flag on Issues)

Like `tea pulls`, tea has no `--web` flag on issue commands. The `issue open` command for gitea must:

1. Call `_exec.runCapture(["issues", "ls", "--output", "json", "--fields", "index,url", "--state", "all"], repoPath)`
2. Parse JSON array, find entry where `index` matches the stored issue ID
3. Print the URL to stdout
4. If `--web`: use `_exec.openUrl(url)` (same method as gitea PR open)

The `url` field is available in `tea issues ls --fields url` (confirmed from the `--fields` help output which lists `url` as an available field).

```typescript
// Gitea issue open action
const result = await _exec.runCapture(
  ["issues", "ls", "--output", "json", "--fields", "index,url,state", "--state", "all"],
  forgeRes.repoPath
)
if (result.exitCode !== 0) process.exit(result.exitCode)
const issues = JSON.parse(result.stdout)
const found = issues.find((i: any) => String(i.index) === issueId)
if (!found) {
  console.error(`Issue #${issueId} not found in Gitea repo.`)
  process.exit(1)
}
console.log(found.url)
if (opts.web) {
  await _exec.openUrl(found.url)
}
```

### Pattern 5: Jira Standalone Integration

Jira is not a forge — it has no `commands()` tied to a forge plugin. It registers directly as a standalone `Integration` plugin:

```typescript
// src/lib/integrations/jira.ts

const jiraConfigSchema = z.object({
  enabled: z.boolean().optional(),
  open_cmd: z.string().optional(), // configurable command template, default: "jira open $ISSUE_ID"
})

export const jiraIntegration: Integration = {
  id: "jira",
  label: "Jira",
  hint: "link and open Jira issues via jira-cli",
  enabledByDefault: false,
  order: 51, // tier 5 — alongside forge integrations

  isEnabled: (ctx) => resolveEnabled("jira", false, ctx),

  open: async () => null, // no session artifact

  configurePrompt: async (current) => {
    const parsed = jiraConfigSchema.parse(current)
    // Prompt for open_cmd template; default: "jira open $ISSUE_ID"
    const openCmd = await p.text({
      message: "Jira issue open command (use $ISSUE_ID as placeholder)",
      initialValue: parsed.open_cmd ?? "jira open $ISSUE_ID",
    })
    if (p.isCancel(openCmd)) return null
    return { ...current, open_cmd: openCmd }
  },

  commands(parent: Command): void {
    const issue = parent.command("issue").description("Link and open Jira issues")

    issue.command("link <workspace> <issue-id>")
      .description("Link a Jira issue to a workspace (e.g. PROJ-123)")
      .action(async (workspaceName: string, issueId: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        linkIssue(workspaceName, "jira", issueId)
        console.log(`Linked Jira issue ${issueId} to workspace '${workspaceName}'.`)
      })

    issue.command("unlink <workspace>")
      .description("Remove Jira issue link from a workspace")
      .action(async (workspaceName: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        unlinkIssue(workspaceName, "jira")
        console.log(`Unlinked Jira issue from workspace '${workspaceName}'.`)
      })

    issue.command("open <workspace>")
      .description("Open linked Jira issue in browser")
      .action(async (workspaceName: string) => {
        const resolution = resolveIssueRef(workspaceName, "jira")
        if (!resolution.ok) {
          console.error(formatIssueError(resolution))
          process.exit(1)
        }
        const { issueId } = resolution
        // Get configured open command (or default)
        const config = readGlobalConfig()
        const jiraConfig = jiraConfigSchema.safeParse(config.integrations["jira"])
        const openCmdTemplate = jiraConfig.success && jiraConfig.data.open_cmd
          ? jiraConfig.data.open_cmd
          : "jira open $ISSUE_ID"

        const result = await _exec.runWithEnv(openCmdTemplate, { ISSUE_ID: issueId })
        if (result.exitCode !== 0) process.exit(result.exitCode)
      })
  },
}
```

**Jira `issue open` implementation note:** The configurable `open_cmd` template with `$ISSUE_ID` substitution needs a `_exec.runWithEnv` method that spawns a shell with the substituted env var. The simplest implementation: split the command string by spaces and inject `ISSUE_ID` as an environment variable, or use `Bun.spawn(["sh", "-c", openCmdTemplate], { env: { ...process.env, ISSUE_ID: issueId } })`.

**Important:** Jira's `issue open` command does NOT need `--web` flag — `jira open ISSUE-KEY` already opens in browser by default. The configurable template approach (D-06) lets users replace this with any command (e.g., `xdg-open https://mycompany.atlassian.net/browse/$ISSUE_ID` for teams not using jira-cli).

### Pattern 6: `issue open` Without Linked Issue

When `issue open` is called but no issue is linked:

- Return a clear error: "No issue linked to workspace 'NAME'. Run: `git-stacks integration github issue link NAME <issue-id>`"
- Do NOT silently open the project root page
- `formatIssueError` handles the `no_issue_linked` variant

### Anti-Patterns to Avoid

- **Storing issue ID as number**: GitHub/GitLab/Gitea use integers, Jira uses strings like "PROJ-123". Store as `string` always — avoids a split type and `String(issueId)` is always valid input for CLIs that accept numbers.
- **New top-level WorkspaceSchema field**: The brainstorm explicitly chose `workspace.settings.integrations.<tracker-id>.issue` — no schema migration needed.
- **Copying issue commands into each forge plugin independently**: Extract `linkIssue`, `unlinkIssue`, `resolveIssueRef` into `issue-utils.ts` — the four forge plugins and Jira all use the same storage pattern.
- **Requiring `[repo]` for `issue link` and `issue unlink`**: These commands don't need forge CLI invocation (they only write YAML). They need only workspace validation.
- **Running `gh issue view` without a repo context**: `gh issue view` must run from within a worktree path so gh can resolve the GitHub repo. Use `resolveForgeRepo` to get the CWD even for issue commands.
- **Direct env var interpolation in open_cmd**: Don't interpolate `$ISSUE_ID` with string replace. Pass as env var to `sh -c` so special characters in issue IDs don't cause command injection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser URL opening for GitHub issues | Custom API call to get issue URL | `gh issue view <id> --web` | gh handles auth, project resolution, SSH vs HTTPS |
| Browser URL opening for GitLab issues | Custom API call | `glab issue view <id> --web` | glab handles auth, self-hosted GitLab, project resolution |
| Issue URL for Gitea | Direct Gitea API call | `tea issues ls --output json --fields url,index` then filter | tea manages login/auth context matching |
| Jira browser open | Custom HTTP client | `jira open <issue-key>` (or configurable template) | jira-cli manages Jira API auth, Cloud vs Server URLs |
| Issue ID validation | Issue number regex | Let the CLI fail with its own error message | forge CLIs already produce clear errors for invalid IDs |

**Key insight:** issue link/unlink are pure YAML operations — they need no CLI invocation. Only `issue open` needs the forge CLI. This separation makes link/unlink testable without mocking any external binaries.

## Runtime State Inventory

> Phase 28 is a new-feature phase. No rename/refactor involved. This section is included only to confirm no runtime state concerns apply.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — issue refs stored in workspace YAML (git-tracked) | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — Jira/forge auth managed entirely by their CLIs | None |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: `gh issue view` Requires Git Repo CWD
**What goes wrong:** `gh issue view 42 --web` run outside of a git repository fails with "no git repository found" or resolves to the wrong GitHub project.
**Why it happens:** Like `gh pr`, gh resolves project context from the remote URL in the CWD.
**How to avoid:** Always use `resolveForgeRepo` to obtain `repoPath` and pass it as CWD to `_exec.run`. For `issue link` and `issue unlink` (pure YAML operations), no CWD is needed. For `issue open`, the CWD is required.
**Warning signs:** `gh issue view` reports "no GitHub remote" or opens the wrong repo's issue.

### Pitfall 2: `workspace.settings.integrations` is `Record<string, unknown>` — Requires Type Assertion
**What goes wrong:** TypeScript reports `unknown` type when reading `workspace.settings.integrations["github"]`.
**Why it happens:** `WorkspaceSettingsSchema.integrations` is deliberately typed as `z.record(z.unknown())` to accept any per-integration config shape.
**How to avoid:** Always cast with `as Record<string, unknown> | undefined` before accessing `.issue`. The `resolveIssueRef` function in `issue-utils.ts` encapsulates this pattern.
**Warning signs:** TypeScript errors on `workspace.settings?.integrations?.[trackerId]?.issue`.

### Pitfall 3: `unlinkIssue` Must Preserve Other Integration Config Fields
**What goes wrong:** Unlinking removes not just `issue` but also `enabled` and other config from the tracker's integrations object.
**Why it happens:** Naive implementation replaces the entire tracker config with an empty object.
**How to avoid:** Use destructuring: `const { issue: _, ...rest } = existing` — keep all other fields, delete only `issue`.
**Warning signs:** After `issue unlink`, `git-stacks config` shows the forge integration as if it was never configured.

### Pitfall 4: tea JSON `url` Field for Issues
**What goes wrong:** `tea issues ls --output json` returns a different field name for the issue URL than expected.
**Why it happens:** The available fields listed in `tea issues ls --help` include `url` but the JSON key name may not match.
**How to avoid:** Test `tea issues ls --output json --fields index,url` against a real Gitea repo before finalizing the URL extraction. Based on Phase 27 research on `tea pulls ls`, the field is `html_url` in the JSON output even though `url` is the field name in `--fields`. Implement with fallback: `found.html_url ?? found.url`.
**Warning signs:** `JSON.parse` succeeds but the URL field is undefined.

### Pitfall 5: Jira `open_cmd` Shell Injection via Issue Key
**What goes wrong:** If `open_cmd` is `"jira open $ISSUE_ID"` and ISSUE_ID contains shell metacharacters, command injection is possible.
**Why it happens:** Direct string interpolation of user-provided issue IDs into shell commands is unsafe.
**How to avoid:** Pass `ISSUE_ID` as an environment variable to `sh -c <open_cmd>`, NOT via string interpolation. `Bun.spawn(["sh", "-c", template], { env: { ...process.env, ISSUE_ID: issueId } })` — the shell substitutes `$ISSUE_ID` from the env, not from an untrusted string.
**Warning signs:** Issue keys with spaces or special characters cause unexpected shell behavior.

### Pitfall 6: `jira open` vs `jira issue open`
**What goes wrong:** Implementing Jira `issue open` as `jira issue open ISSUE-KEY` when the actual command is `jira open ISSUE-KEY`.
**Why it happens:** Confusing the git-stacks subcommand structure (`issue open`) with the jira-cli command (`jira open`).
**How to avoid:** The jira-cli command to open in browser is `jira open <issue-key>` (not `jira issue open`). The configurable template default should be `"jira open $ISSUE_ID"`. This is confirmed via https://docs.jiracli.com/.

### Pitfall 7: Workspace YAML Write Race on link/unlink
**What goes wrong:** Read-modify-write of workspace YAML is not atomic. If two processes run `issue link` on the same workspace concurrently, one write overwrites the other.
**Why it happens:** `linkIssue` does `readWorkspace` → modify → `writeWorkspace` without a lock.
**How to avoid:** This is an existing pattern throughout workspace-ops.ts — git-stacks does not implement file locking anywhere. Accept this limitation (it's a CLI tool used by one user). No change needed.
**Warning signs:** N/A for single-user CLI usage.

## Code Examples

### `issue link` Action (GitHub)
```typescript
// Source: pattern from github.ts pr create action (Phase 27)
issue.command("link <workspace> <issue-id>")
  .description("Link a GitHub issue to a workspace")
  .action(async (workspaceName: string, issueId: string) => {
    if (!workspaceExists(workspaceName)) {
      console.error(`Workspace '${workspaceName}' not found.`)
      process.exit(1)
    }
    linkIssue(workspaceName, "github", issueId)
    console.log(`Linked issue #${issueId} to workspace '${workspaceName}'.`)
  })
```

### `issue open` Action (GitHub — requires CWD from resolveForgeRepo)
```typescript
// Source: pattern from github.ts pr open action (Phase 27)
issue.command("open <workspace>")
  .description("Open linked GitHub issue (--web opens in browser)")
  .option("--web", "Open in browser")
  .action(async (workspaceName: string, opts: { web?: boolean }) => {
    const issueRes = resolveIssueRef(workspaceName, "github")
    if (!issueRes.ok) {
      console.error(formatIssueError(issueRes))
      process.exit(1)
    }
    const forgeRes = resolveForgeRepo(workspaceName, undefined, "github")
    if (!forgeRes.ok) {
      console.error(formatForgeError(forgeRes))
      process.exit(1)
    }
    const args = opts.web
      ? ["issue", "view", issueRes.issueId, "--web"]
      : ["issue", "view", issueRes.issueId, "--json", "url", "--jq", ".url"]
    const result = await _exec.run(args, forgeRes.repoPath)
    if (result.exitCode !== 0) process.exit(result.exitCode)
  })
```

### `resolveIssueRef` (issue-utils.ts)
```typescript
// Source: pattern derived from forge-utils.ts resolveForgeRepo
export function resolveIssueRef(
  workspaceName: string,
  trackerId: string
): IssueRefResolution {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }
  const workspace = readWorkspace(workspaceName)
  const integrations = workspace.settings?.integrations as Record<string, unknown> | undefined
  const trackerConfig = integrations?.[trackerId] as Record<string, unknown> | undefined
  const issueId = trackerConfig?.issue
  if (!issueId) {
    return { ok: false, error: "no_issue_linked", tracker: trackerId, workspace: workspaceName }
  }
  return { ok: true, issueId: String(issueId), workspace }
}
```

### Jira `issue open` (configurable command template)
```typescript
// Source: design per D-05/D-06; Bun.spawn env injection for safety
issue.command("open <workspace>")
  .description("Open linked Jira issue in browser")
  .action(async (workspaceName: string) => {
    const resolution = resolveIssueRef(workspaceName, "jira")
    if (!resolution.ok) {
      console.error(formatIssueError(resolution))
      process.exit(1)
    }
    const { issueId } = resolution
    const config = readGlobalConfig()
    const jiraConfig = jiraConfigSchema.safeParse(config.integrations["jira"])
    const openCmdTemplate = (jiraConfig.success && jiraConfig.data.open_cmd)
      ? jiraConfig.data.open_cmd
      : "jira open $ISSUE_ID"

    const result = await _exec.runShell(openCmdTemplate, { ISSUE_ID: issueId })
    if (result.exitCode !== 0) process.exit(result.exitCode)
  })
```

`_exec.runShell` for Jira integration:
```typescript
export const _exec = {
  runShell: async (cmd: string, env: Record<string, string>): Promise<{ exitCode: number }> => {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      env: { ...process.env, ...env } as Record<string, string>,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
}
```

### Gitea `issue open` (JSON URL extraction)
```typescript
// Source: adapted from gitea.ts pr open pattern (Phase 27)
const result = await _exec.runCapture(
  ["issues", "ls", "--output", "json", "--fields", "index,url", "--state", "all"],
  forgeRes.repoPath
)
if (result.exitCode !== 0) process.exit(result.exitCode)
const issues = JSON.parse(result.stdout) as Array<Record<string, unknown>>
const found = issues.find((i) => String(i.index) === issueRes.issueId)
if (!found) {
  console.error(`Issue #${issueRes.issueId} not found in Gitea repo.`)
  process.exit(1)
}
const url = String(found.html_url ?? found.url)
console.log(url)
if (opts.web) {
  await _exec.openUrl(url)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No issue tracking integration | Issue ref stored in workspace YAML settings | Phase 28 (new feature) | Users can link workspace to issue, open with one command |
| forge plugins had only `pr` commands | forge plugins gain `issue` sibling command group | Phase 28 | Each forge's `commands()` grows by 3 subcommands |

**Deprecated/outdated:**
- None for this phase — all patterns are new additions.

## Open Questions

1. **Does `issue open` for GitHub/GitLab require `resolveForgeRepo` or just a workspace path?**
   - What we know: `gh issue view` and `glab issue view` require running inside a git repo so the CLI can resolve project context
   - What's unclear: Whether they resolve project from any git repo in the workspace or specifically a worktree task_path
   - Recommendation: Use `resolveForgeRepo(workspaceName, undefined, "github")` for auto-selection of the single worktree repo; if workspace has no worktree repos (only trunk), fail with a clear error. Issue open requires a forge repo context just like PR commands.

2. **Should `issue link` validate that the issue ID exists on the forge?**
   - What we know: The brainstorm says linking is purely retroactive YAML storage; no CLI invocation at link time
   - What's unclear: Whether users want validation (e.g., "issue 9999 doesn't exist") at link time
   - Recommendation: No validation at link time — keep it simple. `issue open` will fail at open time if the ID is invalid (the forge CLI will report the error). This matches the brainstorm's intent.

3. **What happens when `issue open` is called on a workspace with multiple worktree repos?**
   - What we know: `resolveForgeRepo` requires either one auto-selected repo or an explicit `[repo]` arg; `issue open` takes only `<workspace>`
   - What's unclear: Should `issue open` also accept `[repo]` arg, or use different resolution logic?
   - Recommendation: Add optional `[repo]` arg to `issue open` for forge trackers (same as `pr` commands). Jira `issue open` does not need repo context (jira-cli is not repo-bound).

4. **tea issues JSON `url` vs `html_url` field name**
   - What we know: `tea issues ls --help` lists `url` as an available `--fields` value; `tea pulls ls --output json` (from Phase 27) returns `html_url` in JSON
   - What's unclear: Whether `tea issues ls --output json` uses `url` or `html_url` as the JSON key
   - Recommendation: Implement with fallback `found.html_url ?? found.url` and test against a real Gitea instance before finalizing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible API) |
| Config file | none — Bun auto-discovers `*.test.ts` |
| Quick run command | `bun test tests/lib/integrations/issue-utils.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

Phase 28 requirements are not yet formally assigned IDs. Based on the brainstorm decisions:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `linkIssue` stores issue ID in workspace.settings.integrations.<id>.issue | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ Wave 0 |
| `unlinkIssue` removes issue key from workspace settings, preserves other fields | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ Wave 0 |
| `resolveIssueRef` returns issueId when linked | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ Wave 0 |
| `resolveIssueRef` returns no_issue_linked when not linked | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ Wave 0 |
| `resolveIssueRef` returns workspace_not_found for missing workspace | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ Wave 0 |
| GitHub `issue link` stores issue ID via linkIssue | unit | `bun test tests/lib/integrations/github.test.ts` | ✅ exists — add cases |
| GitHub `issue open --web` invokes `gh issue view <id> --web` in repo task_path | unit | `bun test tests/lib/integrations/github.test.ts` | ✅ exists — add cases |
| GitLab `issue open --web` invokes `glab issue view <id> --web` | unit | `bun test tests/lib/integrations/gitlab.test.ts` | ✅ exists — add cases |
| Gitea `issue open` calls `_exec.runCapture` for `tea issues ls --output json` | unit | `bun test tests/lib/integrations/gitea.test.ts` | ✅ exists — add cases |
| Jira `issue link` stores PROJ-123 style key in workspace YAML | unit | `bun test tests/lib/integrations/jira.test.ts` | ❌ Wave 0 |
| Jira `issue open` calls `_exec.runShell` with template substituted with ISSUE_ID | unit | `bun test tests/lib/integrations/jira.test.ts` | ❌ Wave 0 |
| Jira `issue open` uses default "jira open $ISSUE_ID" when no open_cmd configured | unit | `bun test tests/lib/integrations/jira.test.ts` | ❌ Wave 0 |
| `integrationCommand` has "jira" subcommand | unit | `bun test tests/lib/integration-commands.test.ts` | ✅ exists — add assertion |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/jira.test.ts`
- **Per wave merge:** `bun test tests/lib/integrations/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/integrations/issue-utils.test.ts` — `resolveIssueRef`, `linkIssue`, `unlinkIssue` unit tests
- [ ] `tests/lib/integrations/jira.test.ts` — Jira integration command tests with `_exec` injection

## Sources

### Primary (HIGH confidence)
- `src/lib/integrations/types.ts` — Integration interface; `commands?(parent)` hook (verified via Read tool)
- `src/lib/config.ts` — `WorkspaceSettingsSchema`, `WorkspaceSchema`; `workspace.settings.integrations` is `z.record(z.unknown())` (verified via Read tool)
- `src/lib/config.ts` — `readWorkspace`, `writeWorkspace` API (verified via Read tool)
- `src/lib/integrations/forge-utils.ts` — `resolveForgeRepo`, `ForgeRepoResolution`, `formatForgeError` (verified via Read tool — Phase 27 Plan 1 complete)
- `.planning/todos/pending/2026-03-22-issue-and-task-tracking-integration-jira-github-gitlab-gitea.md` — Primary design decisions (verified via Read tool)
- `https://cli.github.com/manual/gh_issue_view` — `gh issue view <id> --web` flag (verified via WebFetch)
- `https://docs.gitlab.com/cli/issue/view/` — `glab issue view <id> --web` flag (verified via WebFetch)
- `https://docs.jiracli.com/` — `jira open <issue-key>` command (verified via WebFetch)
- tea CLI direct invocation — `tea issues ls --fields` confirms `url` available; no `--web` on issue commands (verified via Bash tool)

### Secondary (MEDIUM confidence)
- `.planning/phases/27-git-forge-integrations/27-RESEARCH.md` — Phase 27 patterns re-used; gitea `_exec.runCapture` and `_exec.openUrl` pattern confirmed (verified via Read tool)
- `.planning/phases/27-git-forge-integrations/27-02-PLAN.md` — Gitea `_exec` object structure with `run`, `runCapture`, `openUrl` (verified via Read tool)
- WebSearch: jira-cli `jira open` command (cross-verified with docs.jiracli.com)

### Tertiary (LOW confidence)
- tea issues JSON field name `url` vs `html_url`: `--fields` lists `url` but JSON key format not confirmed against live Gitea PR — implement with fallback

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — forge CLIs verified; jira-cli `jira open` verified via docs.jiracli.com
- Architecture: HIGH — patterns directly derived from Phase 27 research and existing integration code
- Issue storage model: HIGH — `WorkspaceSettingsSchema` verified in config.ts; `z.record(z.unknown())` confirmed
- Pitfalls: HIGH for most; MEDIUM for tea JSON field name (unverified against live instance)
- Jira template approach: MEDIUM — design is from brainstorm; `$ISSUE_ID` env var injection via `sh -c` is sound security practice

**Research date:** 2026-03-22
**Valid until:** 2026-09-22 (stable CLI flags; tea@development monitor for API changes)
