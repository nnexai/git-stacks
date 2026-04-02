# Phase 55: Copilot Hook Support - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Copilot `AgentHookPlugin` implementation so `git-stacks install --hooks` can generate `.github/hooks/git-stacks.json` for GitHub Copilot alongside Claude Code hooks. Add `--copilot` and `--claude` flags to bypass the interactive prompt.

</domain>

<decisions>
## Implementation Decisions

### Flag design (HOOK-01, HOOK-02, HOOK-03)
- **D-01:** `--copilot` flag selects the Copilot plugin; `--claude` flag selects the Claude Code plugin (existing behavior, now explicit)
- **D-02:** Flags are combinable: `--copilot --claude` installs both simultaneously (HOOK-04)
- **D-03:** `--hooks` alone (no `--copilot` or `--claude`) keeps the existing interactive multi-select prompt — user picks which plugins to install
- **D-04:** When either flag is given, skip the multi-select prompt and install the specified plugin(s) directly

### Hook script approach
- **D-05:** Use inline bash commands in the `bash` field of each hook entry — no separate `.sh` script files
- **D-06:** This avoids chmod issues and extra file management. E.g. `"bash": "git-stacks message send ..."`

### Notification parity
- **D-07:** Full parity with Claude Code hooks — generate equivalent events for all four Claude Code hook types
- **D-08:** Copilot event mapping: `Stop` → `sessionEnd`, `PreToolUse:AskUserQuestion` → `preToolUse` (with stdin toolName inspection), `UserPromptSubmit` → `userPromptSubmitted`, `PostToolUse:AskUserQuestion` → `postToolUse` (with stdin toolName inspection)
- **D-09:** Since Copilot has no per-tool matcher, the `preToolUse`/`postToolUse` hook scripts must parse stdin JSON and check `toolName` to filter for the equivalent of `AskUserQuestion`. Research needed during planning to find the exact tool name Copilot uses for user questions.
- **D-10:** Env vars (`GS_WORKSPACE_NAME`, `GS_FROM`) must be baked into each hook entry's `env` field since Copilot doesn't inject built-in env vars

### Types refactoring
- **D-11:** Generalize `types.ts` to be agent-agnostic — both plugins use the same abstract `HookEntry` interface
- **D-12:** Each plugin's `install()` converts from shared `HookEntry[]` to its own output format (Claude → settings.json hooks, Copilot → `.github/hooks/git-stacks.json`)
- **D-13:** Keep `AgentHookPlugin` interface unchanged — `generateHookEntries()` returns `HookEntry[]`, plugins handle serialization internally

### Claude's Discretion
- Exact Copilot JSON structure details
- How to handle the `version: 1` field in generated JSON
- Whether to include `timeoutSec` in generated entries (research suggests 10s for notification hooks)
- Stdin JSON parsing approach for toolName filtering in inline bash

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Copilot hooks research
- `.planning/research/COPILOT-HOOKS.md` — Full research on Copilot hooks spec, JSON format, event types, stdin schema, environment injection, constraints, and comparison with Claude Code hooks

### Existing agent hooks system
- `src/lib/agent-hooks/types.ts` — `AgentHookPlugin`, `HookEntry`, `HooksConfig`, `MatcherGroup` interfaces
- `src/lib/agent-hooks/claude-code.ts` — Reference implementation: `generateHookEntries()`, `install()`, `remove()`
- `src/lib/agent-hooks/index.ts` — Plugin registry

### Install command
- `src/commands/install.ts` — Current `install --hooks` command with multi-select UI and workspace detection

### Requirements
- HOOK-01: `--copilot` flag support
- HOOK-02: `--claude` flag (existing behavior, now explicit)
- HOOK-03: Interactive prompt when neither flag given
- HOOK-04: Both flags combinable

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentHookPlugin` interface — new plugin implements same contract as `claude-code.ts`
- `install.ts` multi-select prompt — extend with flag-based bypass logic
- `claude-code.ts` as template — Copilot plugin follows same structure: `generateHookEntries()`, `install()`, `remove()`

### Established Patterns
- Plugin registry in `index.ts` — add Copilot plugin to `agentHookPlugins` array
- Strip-and-replace idempotency — Claude uses marker scanning, Copilot owns entire `git-stacks.json` file (overwrite on install, delete on remove)
- Workspace name injection — Claude uses string interpolation in commands, Copilot uses `env` field in JSON entries

### Integration Points
- `src/lib/agent-hooks/index.ts` — register `copilotPlugin`
- `src/commands/install.ts` — add `--copilot` and `--claude` options, bypass multi-select when flags given
- `src/lib/agent-hooks/types.ts` — generalize shared types for both plugins

</code_context>

<specifics>
## Specific Ideas

- Copilot plugin owns `.github/hooks/git-stacks.json` entirely — overwrite on install, delete on remove (simpler than Claude's strip-and-replace)
- The `preToolUse` hook for question detection will need to parse stdin JSON inline in bash — something like `jq -r .toolName` or native bash JSON parsing
- Research doc notes the cloud coding agent reads hooks from the default branch — document this limitation but don't block on it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 55-copilot-hook-support*
*Context gathered: 2026-04-02*
