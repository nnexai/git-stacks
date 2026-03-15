# Inspiration from workmux

Source: https://workmux.raine.dev/guide/

workmux is a single-repo git worktree + tmux window manager. ws manages multi-repo workspaces
(stacks of repos). These ideas from workmux map naturally onto ws's model.

---

## 1. Prompt injection / agent-aware workspace creation

workmux passes a task prompt when creating a worktree; the agent starts with it already loaded.

```
ws new --prompt "Implement OAuth login for ticket PROJ-123"
ws new -P task-spec.md        # from file
ws new -e                     # open $EDITOR to write the prompt
```

The prompt is injected into the agent's pane (claude, codex, etc.) using the agent's native
flag format. The workspace/branch name can describe the ticket; the prompt provides context.

**Why useful for ws**: `ws new` already collects a branch name. Tacking on a prompt lets the
agent start working immediately in the right context.

---

## 2. Auto branch/workspace name generation from a prompt

workmux's `-A` flag uses an LLM to generate a kebab-case branch name from your prompt, so you
don't think of one:

```
ws new -A                    # open editor, write task, LLM names it
ws new -A -p "Fix race condition in payment handler"
```

Uses the configured agent CLI or `llm` tool fallback.

**Why useful for ws**: good branch names are friction. One flag removes it entirely.

---

## 3. Parallel workspace creation

Create N workspaces in one command for parallel agent experiments:

```
ws new my-feature -n 3 -p "Implement task #{{ num }} from TASKS.md"
# creates: my-feature-1, my-feature-2, my-feature-3

ws new my-feature -a claude -a gemini -p "Solve it"
# creates: my-feature-claude, my-feature-gemini
```

**Why useful for ws**: ws's multi-repo stacks are already well-suited for running multiple
agents simultaneously. Parallel creation removes the manual repetition.

---

## 4. Agent status tracking in window/tab names

workmux hooks into agent CLIs (Claude Code, OpenCode, Copilot) to reflect status in the
tmux window name:

```
🤖 feature-auth    (agent is working)
💬 feature-auth    (agent waiting for input — auto-clears on focus)
✅ feature-auth    (agent finished — auto-clears on focus)
```

`ws last-done` cycles through completed workspaces in reverse chronological order.

**Why useful for ws**: the cmux integration already manages window names. Adding status icons
would make parallel-agent workflows much easier to monitor.

---

## 5. Inter-workspace communication commands

workmux provides low-level primitives for coordinator workflows:

```
ws send <workspace> "run the tests"    # send keystrokes/command to agent pane
ws capture <workspace>                 # read terminal output from agent
ws wait <workspace> --status done      # block until agent reaches a status
```

`ws run <workspace> -- <cmd>` is already implemented — the remaining primitives (send,
capture, wait) would enable a coordinator agent pattern.

Cross-project: if the workspace isn't local, search all active agents globally.

**Why useful for ws**: enables a coordinator agent pattern — an agent on main that spawns
parallel worktree agents, waits for them to finish, reviews output, and merges results.

---

## 6. Skills / slash commands for agents

Pre-written SKILL.md files that agents can invoke:

- `/ws-merge` — commit, rebase onto main, run `ws clean`, notify when done
- `/ws-worktree` — delegate a task to a new workspace with full context
- `/ws-open-pr` — write PR description using conversation context, open browser

Install via `ws setup --skills` (auto-detects agent CLI, copies to right directory).

**Why useful for ws**: agents using ws already need these patterns. Shipping them as skills
makes ws a complete agentic workflow tool, not just a workspace manager.

---

## Summary: priority order

| # | Idea | Effort | Value |
|---|------|--------|-------|
| 1 | `--prompt` / `-P` / `-e` flags on `ws new` | low | high |
| 2 | Skills for agents (`/ws-merge`, `/ws-worktree`) | medium | high |
| 3 | Auto branch name from prompt (`-A` flag) | medium | medium |
| 4 | Agent status icons in cmux window names | medium | medium |
| 5 | Parallel workspace creation (`-n`, `-a`) | medium | medium |
| 6 | Inter-workspace send/capture/wait commands | high | high |

> **Note:** `ws run` (item 5 in workmux) is now implemented as a standalone command.
