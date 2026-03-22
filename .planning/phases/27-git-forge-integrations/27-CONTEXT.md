# Phase 27: Git Forge Integrations - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add integrations for GitHub, GitLab, and Gitea using their respective CLI tools (gh, glab, tea) to create PR/MRs, open them, and check status. Forge type is a per-repo property stored in the registry. Each forge is an Integration plugin that registers its own subcommands. CLI-only (no TUI actions). Issue/task linking is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Forge Config Model
- **D-01:** Add optional `forge` field to `RepoRegistryEntrySchema` — values: `"github" | "gitlab" | "gitea"`. No forge = no PR commands available for that repo.
- **D-02:** No URL parsing or auto-detection at PR-creation time. The forge CLIs resolve project context automatically when run inside the repo's working directory. git-stacks only needs to know which CLI to invoke.
- **D-03:** Self-hosted instances (GitHub Enterprise, GitLab self-managed, Gitea) are handled entirely by the forge CLIs' own auth/config. git-stacks does not store host URLs or credentials.

### Forge Detection at Repo Registration
- **D-04:** Each forge integration exposes a detection hook that checks the repo's remote URL and whether the forge CLI tool is installed. Used by `repo add` and `repo scan` to suggest forge type.
- **D-05:** If exactly one forge integration claims a repo, suggest it as default. If multiple or none claim it, prompt the user to choose (same UX pattern as worktree-vs-trunk selection).

### Integration Architecture
- **D-06:** Each forge is a full `Integration` plugin — reuse the existing interface. `open()` returns null (no-op), no `generate()`, no `cleanup()`. Commands registered via `commands?(parent)`. Future phases may add session-oriented behavior.
- **D-07:** Forge integrations appear in `git-stacks config` (enable/disable), TUI detail pane integration cascade, and repo detail views.
- **D-08:** Forge integrations follow the injectable `_exec` pattern for shell commands (forge CLI calls), consistent with niri/tmux/cmux.

### Command Surface
- **D-09:** Per-forge subcommand tree registered under `git-stacks integration <forge>`:
  - `pr create <workspace> [repo]` — create PR/MR for a repo's workspace branch against its base branch
  - `pr open <workspace> [repo]` — output PR URL to stdout, open in browser if `--web` available
  - `pr status <workspace> [repo]` — pass through forge CLI status output
- **D-10:** `[repo]` is required when workspace has >1 worktree-mode repo. Auto-selected when exactly one worktree repo exists.
- **D-11:** GitLab uses `mr` terminology internally but the subcommand is still `pr` for consistency across forges. The integration translates to `glab mr create` etc.

### Execution Model
- **D-12:** All forge CLI invocations use `stdio: "inherit"` — the user interacts directly with the forge CLI (title, body, reviewer prompts). git-stacks passes base branch (`--base` / `--target-branch` / equivalent) from workspace YAML's `repo.base_branch` when possible.
- **D-13:** CLI-only — forge commands are not available from the TUI dashboard. Interactive stdio is incompatible with OpenTUI rendering. Future enhancement could add non-interactive mode (`gh pr create --fill`).
- **D-14:** If the forge CLI is not installed or the repo has no forge configured, the command errors immediately with a clear message.

### Claude's Discretion
- Detection hook implementation details (how to check remote URL for forge hints)
- Whether to add `--web` as a flag on `pr open` or always attempt browser open
- Exact flag mapping between git-stacks options and each forge CLI's flags
- Test strategy — likely unit tests with `_exec` injection mocking CLI calls

</decisions>

<specifics>
## Specific Ideas

- User wants issue/task linking (including Jira) as a separate phase — kept out of scope here
- "pass through" is the guiding principle: git-stacks orchestrates which CLI to call and where, the forge CLI handles all the interactive UX
- `pr open` should output the URL (useful for piping/scripting) AND open browser when possible

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Prior phase context
- `.planning/phases/25-dedicated-lifecycle-phases/25-CONTEXT.md` — Lifecycle cascade decisions that affect merge flow (phase 27 PR commands complement merge)

### Implementation references
- `src/lib/integrations/types.ts` — `Integration` interface that forge plugins will implement
- `src/lib/integrations/index.ts` — Integration registry where forge plugins are registered
- `src/lib/integrations/niri.ts` — Reference implementation for `_exec` injectable pattern and CLI wrapper functions
- `src/lib/config.ts` lines 40-51 — `RepoRegistryEntrySchema` where `forge` field will be added
- `src/commands/doctor.ts` lines 175-180 — External tool availability checking pattern (for `gh`/`glab`/`tea`)
- `src/tui/repo-wizard.ts` — `repo add`/`repo scan` prompts where forge detection suggestions will appear
- `src/lib/git.ts` — Existing git operations; `git remote get-url origin` will be needed for detection hooks

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Integration` interface in `types.ts` — `commands?(parent)` hook is the entry point for forge subcommands; `configurePrompt()` for config wizard; `isEnabled()` + `resolveEnabled()` for enable/disable cascade
- `_exec` pattern (niri.ts, tmux.ts, cmux.ts) — injectable shell command objects for test isolation; forge CLIs will follow the same pattern
- `doctor.ts` tool availability check — pattern for detecting `gh`, `glab`, `tea` binaries
- `expandBranchPattern()` in config.ts — workspace branch name is already resolved; available for `--base` flag construction

### Established Patterns
- Integration plugins: create `src/lib/integrations/<forge>.ts`, implement `Integration`, register in `index.ts`
- Config stored under `globalConfig.integrations[id]` as `Record<string, unknown>`, parsed internally with forge-specific Zod schema
- Per-workspace and per-template overrides via `settings.integrations.<id>`
- `enabledByDefault: false` for optional integrations (same as niri)

### Integration Points
- `src/lib/config.ts` — Add `forge` to `RepoRegistryEntrySchema`
- `src/lib/integrations/` — New files: `github.ts`, `gitlab.ts`, `gitea.ts`
- `src/lib/integrations/index.ts` — Register three new forge integrations
- `src/tui/repo-wizard.ts` — Add forge detection/suggestion to `repo add` and `repo scan` flows
- `src/tui/dashboard/App.tsx` — Repo detail pane: show forge field; integration cascade: show forge integrations
- `src/commands/doctor.ts` — Add `gh`, `glab`, `tea` to tool availability checks

</code_context>

<deferred>
## Deferred Ideas

- Issue/task linking (GitHub Issues, GitLab Issues, Gitea Issues, Jira) — user wants this as a separate phase with a broader scope including Jira integration
- TUI-based PR actions using non-interactive flags (`gh pr create --fill`) — requires designing a non-interactive flow
- PR status display formatted by git-stacks instead of raw CLI pass-through
- Cross-repo PR descriptions (workspace-level PR template applied to all repos)

</deferred>

---

*Phase: 27-git-forge-integrations*
*Context gathered: 2026-03-22*
