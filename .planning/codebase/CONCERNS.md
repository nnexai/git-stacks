# Technical Concerns

**Analysis Date:** 2026-03-17

## High Priority

### Hook Injection Risk
**Location:** `src/lib/lifecycle.ts:18`
**Issue:** Hook commands from stack/workspace YAML are passed directly to `sh -c`. User-defined hooks can execute arbitrary commands, but there is no input sanitization on environment variables injected into hook commands (`WS_WORKSPACE`, `WS_BRANCH`, etc.). If a workspace name contains shell metacharacters and the user has defined hooks that interpolate injected variables without quoting, this could produce unexpected behavior.
**Severity:** Low-medium (hooks come from user-authored YAML, not external input)
**Remediation:** Sanitize injected env variable values or document that env vars must be quoted in hook scripts.

### No Test Coverage for Core Logic
**Location:** `src/lib/workspace-ops.ts`, `src/lib/git.ts`, `src/commands/*`
**Issue:** The most critical code paths — workspace creation, worktree management, merge, sync — have zero test coverage. Breakage would only be caught manually.
**Severity:** High (any regression in `openWorkspace`, `cleanWorkspace`, `syncWorkspace` affects all users)
**Remediation:** Add integration tests using temporary git repos. `bun:test` supports async, so real git operations can be tested in temp directories.

## Medium Priority

### `process.env.HOME` Mutation in Tests
**Location:** `tests/lib/config.test.ts`
**Issue:** Tests modify `process.env.HOME` to redirect config paths, then dynamically re-import modules. This is fragile — if `bun test` parallelizes test files, shared environment mutations will cause race conditions. Currently only one test file does this, but it's a pattern that could spread.
**Severity:** Medium (currently safe; future parallelism would break it)
**Remediation:** Use dependency injection for config paths rather than relying on `HOME`.

### `@clack/prompts` Empty-String Quirk
**Location:** `src/tui/utils.ts`
**Issue:** `@clack/prompts` returns `undefined` (not `""`) when the user submits an empty text input. A `safeText()` wrapper exists, but any future TUI code that uses `p.text()` directly will silently receive `undefined`, causing subtle bugs.
**Severity:** Medium (footgun for contributors adding TUI code)
**Remediation:** Lint rule or ESLint custom rule banning direct `p.text()` usage; enforce `safeText()`.

### Legacy Artifact Generators in `src/lib/`
**Location:** `src/lib/vscode.ts`, `src/lib/intellij.ts`, `src/lib/cmux.ts`, `src/lib/tmux.ts`
**Issue:** Standalone artifact generator functions exist alongside the integration plugin system in `src/lib/integrations/`. The integrations call out to the standalone generators, but the standalone versions are also importable directly. This creates two entry points for the same logic and may lead to divergence.
**Severity:** Low-medium (works, but adds confusion about which layer to modify)
**Remediation:** Make standalone generators private helpers of their integration plugin, or document the boundary clearly.

### No Shell Completion for Dynamic Values at Runtime
**Location:** `src/lib/completion-generator.ts`
**Issue:** Shell completions for workspace/stack names query the filesystem directly at completion time. If `~/.config/git-stacks/` is on a slow filesystem or NFS, this adds latency to every Tab press.
**Severity:** Low (local filesystem is typical)

## Low Priority

### SolidJS Dashboard Dependency on Bun-Specific Plugin
**Location:** `src/tui/dashboard/run.tsx`
**Issue:** The dashboard uses SolidJS with JSX, requiring a Bun-specific transform plugin registered programmatically. This means the dashboard only works under Bun and cannot easily be extracted or tested outside of it.
**Severity:** Low (project already requires Bun; this is consistent)

### No Formatter Configured
**Location:** Project root
**Issue:** No Prettier, Biome, or other formatter is configured. Formatting consistency relies entirely on developer discipline. The existing codebase is internally consistent, but onboarding friction increases without a formatter.
**Severity:** Low (cosmetic; no functional impact)

### YAML Parse Errors Are Unhandled at Startup
**Location:** `src/lib/config.ts` (`listWorkspaces`, `listStacks`)
**Issue:** These functions use try-catch around individual file reads to skip corrupt YAML. Corrupt files are silently ignored. There is no warning to the user that a workspace/stack YAML failed to parse.
**Severity:** Low (silent failure is confusing during debugging)
**Remediation:** Log a warning to stderr for failed YAML parses rather than silently swallowing.

### `doctor.ts` Fix Suggestions Are Not Auto-Applied
**Location:** `src/commands/doctor.ts`
**Issue:** Doctor emits `fix` strings (e.g., `rm -rf tasks/name`) as text suggestions but does not offer to run them. Users must manually execute fixes.
**Severity:** Low (UX inconvenience, not a correctness issue)
**Remediation:** Add a `--fix` flag to auto-apply suggested remediation commands.

## Performance

### `git-stacks status` Runs Git Commands Serially
**Location:** `src/commands/workspace.ts` (status command)
**Issue:** Checking dirty status across multiple repos in a workspace runs git operations serially. For workspaces with many repos, this is noticeably slow.
**Severity:** Low-medium (user-facing latency)
**Remediation:** `Promise.all()` for parallel dirty checks.

### No Caching of Workspace/Stack Lists
**Location:** `src/lib/config.ts`
**Issue:** Every command that needs workspace or stack data re-reads and re-parses all YAML files from disk. For large workspaces with many stacks, startup cost grows linearly.
**Severity:** Low (typical installs have <20 workspaces; fast enough in practice)

## Security

### Hook Commands Have Full Shell Access
**Location:** `src/lib/lifecycle.ts`
**Issue:** By design, hooks run arbitrary shell commands with the full user environment. The injected `WS_*` env vars expand in hook scripts. This is intentional but means a malicious stack template could execute harmful commands when shared with other users.
**Severity:** Informational (by design; document in user-facing docs)

### No Validation of `env_file` Path
**Location:** `src/lib/workspace-ops.ts` (mergeEnv)
**Issue:** The `env_file` field in stack/workspace YAML is read without validation that the path is within the workspace directory. A crafted YAML could point to `/etc/passwd` or other sensitive files.
**Severity:** Low (requires user to create/accept a malicious stack YAML)
**Remediation:** Validate `env_file` is within the workspace root or explicitly documented as user-controlled.

## Fragile Areas

### Integration Open Logic
**Location:** `src/lib/integrations/vscode.ts`, `intellij.ts`, `cmux.ts`, `tmux.ts`
**Issue:** Integration `open()` functions spawn external processes (code, idea, tmux, cmux) by name. If these binaries are not on PATH, the error message is unclear.
**Remediation:** Check binary existence before spawning; provide actionable error messages.

### `syncWorkspace` Rebase Flow
**Location:** `src/lib/workspace-ops.ts`
**Issue:** `syncWorkspace` fetches origin, rebases each repo, and aborts on failure. If a rebase produces conflicts, `git rebase --abort` is called and an error is returned — but the user is left with partially synced repos. The error message does not indicate which repo failed.
**Severity:** Medium (confusing UX when sync partially completes)
**Remediation:** Include repo name in the error message; consider reporting partial success.
