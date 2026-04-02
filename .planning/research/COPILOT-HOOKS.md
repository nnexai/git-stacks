# Copilot Hooks Integration Research

**Project:** git-stacks — Extend `install --hooks` for GitHub Copilot
**Researched:** 2026-04-02
**Overall confidence:** MEDIUM-HIGH (official docs fetched and verified; some stdin schema details cross-referenced from community sources)

---

## 1. Directory Structure

Copilot hooks configuration files live in the `.github/hooks/` directory of the **repository** (not the workspace root). They must be committed to the **default branch** for the Copilot cloud agent to pick them up. For local CLI use (`gh copilot`), they are loaded from the current working directory.

```
.github/
└── hooks/
    ├── git-stacks.json        ← recommended name for git-stacks-generated config
    ├── notify.sh              ← hook scripts (executable, with shebang)
    └── audit.sh
```

**File naming:** Any `*.json` name is valid. A single repo can have multiple JSON files in `.github/hooks/` — Copilot merges them. Recommendation: use `git-stacks.json` as the generated filename (mirrors `claude-code.ts` using `.claude/settings.json`).

**Confidence:** HIGH — verified in official docs and community sources.

---

## 2. Configuration File Format

The hooks config file is **JSON** (not YAML). Root fields:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [...],
    "sessionEnd": [...],
    "userPromptSubmitted": [...],
    "preToolUse": [...],
    "postToolUse": [...],
    "errorOccurred": [...]
  }
}
```

`version: 1` is required. Each hook array entry has this shape:

```json
{
  "type": "command",
  "bash": "./scripts/notify.sh",
  "powershell": "./scripts/notify.ps1",
  "cwd": "scripts",
  "timeoutSec": 30,
  "env": {
    "MY_VAR": "value"
  },
  "comment": "Optional human-readable description"
}
```

**Required fields per entry:** `type` (always `"command"`) and at least one of `bash` or `powershell`.

**Optional fields:** `cwd` (working directory for script execution), `timeoutSec` (default 30s), `env` (key-value pairs merged into environment), `comment`.

**Confidence:** HIGH — matches both official reference docs and community guide.

---

## 3. Hook Types and Lifecycle

Six standard hook types (Copilot coding agent):

| Hook Type | Trigger Point | Can Block? | Output Processed? |
|---|---|---|---|
| `sessionStart` | Session begins or resumes | No | No |
| `sessionEnd` | Session completes or terminates | No | No |
| `userPromptSubmitted` | User submits a new prompt | No | No |
| `preToolUse` | Before any tool executes | Yes (deny) | Yes |
| `postToolUse` | After tool completes | No | No |
| `errorOccurred` | Error occurs during execution | No | No |

Community/DeepWiki sources note two additional events (`agentStop`, `subagentStop`) present in the awesome-copilot repo hooks schema. These are not confirmed in the official reference docs — treat as LOW confidence until verified.

**Only `preToolUse` produces actionable output.** All other hooks are fire-and-forget notification hooks.

**Confidence:** HIGH for the six standard types. LOW for `agentStop`/`subagentStop`.

---

## 4. Stdin JSON Passed to Hook Scripts

Each hook script receives JSON on **stdin**. Shapes by event:

### Common fields (all events)
```json
{
  "timestamp": 1704614400000,
  "cwd": "/path/to/project"
}
```

### `sessionStart`
```json
{
  "timestamp": 1704614400000,
  "cwd": "/path/to/project",
  "source": "new|resume|startup",
  "initialPrompt": "user's first prompt text"
}
```

### `userPromptSubmitted`
```json
{
  "timestamp": 1704614500000,
  "cwd": "/path/to/project",
  "prompt": "user prompt text"
}
```

### `preToolUse`
```json
{
  "timestamp": 1704614600000,
  "cwd": "/path/to/project",
  "toolName": "bash",
  "toolArgs": "{\"command\":\"rm -rf /\",\"description\":\"cleanup\"}"
}
```
`toolArgs` is a JSON-encoded string, not a nested object.

### `postToolUse`
```json
{
  "timestamp": 1704614700000,
  "cwd": "/path/to/project",
  "toolName": "bash",
  "toolResult": {
    "resultType": "success|failure|denied",
    "textResultForLlm": "output text"
  }
}
```

### `sessionEnd`
```json
{
  "timestamp": 1704614800000,
  "cwd": "/path/to/project",
  "reason": "complete|error|abort|timeout|user_exit"
}
```

### `errorOccurred`
```json
{
  "timestamp": 1704614900000,
  "cwd": "/path/to/project",
  "error": {
    "message": "Error message",
    "name": "ErrorType",
    "stack": "stack trace string"
  }
}
```

**Confidence:** MEDIUM — sourced from community guide + official reference, but the official reference docs do not publish a full stdin schema table. These shapes are consistent across multiple sources and the official partial examples.

---

## 5. `preToolUse` Output (Permission Control)

For `preToolUse`, the hook script can write JSON to **stdout** to control execution:

```json
{
  "permissionDecision": "allow|deny|ask",
  "permissionDecisionReason": "Reason shown to agent"
}
```

- `"allow"` — proceed (also the default if hook exits 0 with no output)
- `"deny"` — block tool execution; reason reported to agent
- `"ask"` — escalate to user for confirmation

**Multiple hooks:** If multiple `preToolUse` hooks run, `deny` wins over `ask` wins over `allow`. If a hook returns `deny`, subsequent hooks in the array are **skipped**.

**Note:** Unlike Claude Code, Copilot hooks **cannot modify tool input** (`updatedInput` is a VS Code–specific extension, not in the Copilot coding agent reference). Do not generate hooks that try to rewrite tool arguments.

**Confidence:** HIGH for `allow`/`deny`/`ask` values. MEDIUM for precedence rules.

---

## 6. Environment Variables

Copilot does **not** inject a documented set of built-in environment variables into hook scripts (unlike Claude Code which injects `GS_WORKSPACE_NAME` etc. via the `env` field in settings.json).

The `env` field in the hook entry object allows specifying custom environment variables:

```json
{
  "type": "command",
  "bash": "./notify.sh",
  "env": {
    "GS_WORKSPACE_NAME": "my-feature",
    "GS_WORKSPACE_BRANCH": "feat/my-feature"
  }
}
```

**Implication for git-stacks:** The generator must bake workspace name and branch into the `env` block of each generated hook entry. The hook script itself receives these as standard shell variables. GitHub Secrets can be injected via Actions environment (for cloud agent runs).

**Confidence:** HIGH — confirmed in official docs that `env` is the mechanism; no built-in vars listed anywhere.

---

## 7. Scope: Per-Repo (Not Global, Not Per-Workspace)

Hooks are scoped to the **git repository**. The `.github/hooks/` directory lives inside each repo's worktree. This aligns with how the existing `claude-code.ts` plugin works — `install()` receives a `repoWorktreePath` and writes into that directory.

For a workspace with N repos in worktree mode, the Copilot plugin would install hooks into each repo's worktree at `{repoWorktreePath}/.github/hooks/git-stacks.json`.

**Trunk-mode repos** point to the main clone path (shared across workspaces). Installing hooks there would affect other workspaces. The existing claude-code plugin faces the same constraint — the implementation decision (skip trunk repos or install anyway) should match whatever policy claude-code uses.

---

## 8. Constraints and Gotchas

### Script requirements
- Scripts must be **executable** (`chmod +x`) — git-stacks should `chmod 0o755` generated scripts or document this.
- Scripts must have a **shebang** (e.g., `#!/usr/bin/env bash`).
- Scripts must output **valid single-line JSON** for `preToolUse` (if providing a permission decision).

### Execution constraints (cloud agent)
- Default timeout: **30 seconds** — keep notification hooks fast.
- **Sandboxed network** — cloud agent runs in a restricted environment; outbound network calls (e.g., to `git-stacks message send` over HTTP) may fail. Local CLI runs do not have this restriction.
- Scripts run with the **repo as working directory** unless `cwd` overrides it.

### Idempotency
- Copilot merges all `*.json` files in `.github/hooks/` — there is no "replace" semantic. If git-stacks generates `git-stacks.json`, reinstalling must **overwrite** that specific file, not append to it. The existing claude-code plugin pattern (strip git-stacks entries then re-add) translates here as: overwrite the entire `git-stacks.json` file on each install.

### Default branch requirement
- For the **cloud coding agent**, hooks must be on the **default branch** (usually `main`). A worktree on a feature branch will have the `.github/hooks/` files on disk, but the cloud agent reads from the default branch. This is a documentation gap — the exact lookup behavior for worktrees vs main branch is not explicitly stated.
- For **CLI** and **VS Code** Copilot, hooks are read from the current working directory — worktree paths work fine.

**Confidence:** HIGH for timeout and script requirements. MEDIUM for sandbox constraints (not exhaustively documented). LOW for worktree vs default-branch behavior.

---

## 9. Comparison: Copilot Hooks vs Claude Code Hooks

| Dimension | Claude Code (`.claude/settings.json`) | Copilot (`.github/hooks/*.json`) |
|---|---|---|
| Config format | JSON, merged into `settings.json` | JSON, standalone file in `.github/hooks/` |
| Config location | `{repoPath}/.claude/settings.json` | `{repoPath}/.github/hooks/git-stacks.json` |
| Hook key names | `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit` | `preToolUse`, `postToolUse`, `sessionEnd`, `userPromptSubmitted`, `sessionStart`, `errorOccurred` |
| Script field | `command: "shell string"` | `bash: "path"` + optional `powershell: "path"` |
| Matcher/filter | `matcher: "ToolName"` field to scope to specific tools | No per-tool matcher — all `preToolUse` events trigger all hooks |
| Permission control | `permissionDecision` output (allow/deny/ask) + can modify input | `permissionDecision` output (allow/deny/ask) only |
| Env injection | Via `env` array on outer settings or hook config | Via `env` object on each hook entry |
| Idempotency pattern | Strip-and-replace by marker string in `command` | Overwrite `git-stacks.json` entirely |
| Scope | Per-repo worktree | Per-repo worktree |
| Multiple hooks | Entries merged into shared `settings.json.hooks` object | Each `*.json` file is independent; Copilot merges all |

---

## 10. Recommended Implementation Design

### New file: `src/lib/agent-hooks/copilot.ts`

Implement `AgentHookPlugin` interface (already defined in `types.ts`):

```typescript
export const copilotPlugin: AgentHookPlugin = {
  id: "copilot",
  label: "GitHub Copilot",
  generateHookEntries(workspaceName: string): HookEntry[] { ... },
  install(repoWorktreePath: string, workspaceName: string): void { ... },
  remove(repoWorktreePath: string): void { ... },
}
```

### Hook entries to generate

Mirror the claude-code plugin's notification intent:

| Claude Code event | Copilot equivalent | Purpose |
|---|---|---|
| `Stop` | `sessionEnd` | Agent finished, may need attention |
| `PreToolUse` matcher `AskUserQuestion` | `preToolUse` (no matcher available) | Agent asking question |
| `UserPromptSubmit` | `userPromptSubmitted` | Clear notifications on new prompt |

Since Copilot has no per-tool matcher, the `preToolUse` hook will fire on every tool use — the notification script must inspect `toolName` from stdin to decide whether to notify.

### Generated file structure

`install()` writes to `{repoWorktreePath}/.github/hooks/git-stacks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [
      {
        "type": "command",
        "bash": ".github/hooks/gs-notify.sh",
        "env": {
          "GS_WORKSPACE_NAME": "<workspace-name>",
          "GS_FROM": "copilot"
        },
        "timeoutSec": 10
      }
    ],
    "userPromptSubmitted": [
      {
        "type": "command",
        "bash": ".github/hooks/gs-clear.sh",
        "env": {
          "GS_WORKSPACE_NAME": "<workspace-name>",
          "GS_FROM": "copilot"
        },
        "timeoutSec": 10
      }
    ]
  }
}
```

The scripts themselves (`gs-notify.sh`, `gs-clear.sh`) must also be written to `.github/hooks/` with executable permissions. Alternatively, inline the commands as `bash` string values rather than paths to avoid a separate script file.

### Idempotency

Unlike claude-code (which merges into a shared settings.json), Copilot plugin **owns** `git-stacks.json` entirely. `install()` overwrites the file. `remove()` deletes it. No marker string scanning needed.

### Register in index.ts

```typescript
// src/lib/agent-hooks/index.ts
import { copilotPlugin } from "./copilot"
export const agentHookPlugins: AgentHookPlugin[] = [claudeCodePlugin, copilotPlugin]
```

---

## 11. Open Questions (Needs Validation During Implementation)

1. **Inline commands vs script files:** Can `bash` be a multi-line inline script, or must it be a file path? Official examples show file paths. Community examples show both. If inline works, the plugin can avoid writing separate `.sh` files.

2. **Worktree + default branch conflict:** For cloud agent use, hooks must be on the default branch. A worktree on a feature branch has hooks on disk but the cloud agent may read from `main`. Test by opening a GitHub issue with a Copilot cloud agent task on a branch to observe behavior.

3. **`agentStop` event:** DeepWiki docs mention this as the "agent finishes responding" event (more granular than `sessionEnd`). This may be more appropriate than `sessionEnd` for "agent has finished, check it out" notifications. Verify with official docs before using.

4. **Permissions on generated scripts:** `writeFileSync` does not set execute bit. May need `fs.chmodSync(path, 0o755)` after writing `.sh` files, or use `Bun.file` with permissions.

---

## Sources

- [Using hooks with GitHub Copilot coding agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks) — HIGH confidence
- [Hooks configuration reference](https://docs.github.com/en/copilot/reference/hooks-configuration) — HIGH confidence
- [About hooks (concepts)](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks) — HIGH confidence
- [Agent hooks in VS Code (Preview)](https://code.visualstudio.com/docs/copilot/customization/hooks) — MEDIUM confidence (VS Code–specific extensions may not apply to coding agent)
- [GitHub Copilot Hooks Complete Guide — SmartScope](https://smartscope.blog/en/generative-ai/github-copilot/github-copilot-hooks-guide/) — MEDIUM confidence (community, cross-referenced with official docs)
- [Hook Architecture and Events — DeepWiki awesome-copilot](https://deepwiki.com/github/awesome-copilot/7.1-hook-architecture-and-events) — LOW confidence (third-party wiki)
