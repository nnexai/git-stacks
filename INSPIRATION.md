# Inspiration from workmux

Source: https://workmux.raine.dev/guide/

workmux is a single-repo git worktree + tmux window manager. `git-stacks` manages multi-repo
workspaces (stacks of repos). These ideas from workmux map naturally onto the `git-stacks` model.

---

## 1. Prompt injection / agent-aware workspace creation

workmux passes a task prompt when creating a worktree; the agent starts with it already loaded.

```bash
git-stacks new --prompt "Implement OAuth login for ticket PROJ-123"
git-stacks new -P task-spec.md        # from file
git-stacks new -e                     # open $EDITOR to write the prompt
```

The prompt is injected into the agent's pane (claude, codex, etc.) using the agent's native
flag format. The workspace/branch name can describe the ticket; the prompt provides context.

**Why useful for git-stacks**: `git-stacks new` already collects a branch name. Tacking on a prompt lets the
agent start working immediately in the right context.

---

## 2. Auto branch/workspace name generation from a prompt

workmux's `-A` flag uses an LLM to generate a kebab-case branch name from your prompt, so you
don't think of one:

```bash
git-stacks new -A                    # open editor, write task, LLM names it
git-stacks new -A -p "Fix race condition in payment handler"
```

Uses the configured agent CLI or `llm` tool fallback.

**Why useful for git-stacks**: good branch names are friction. One flag removes it entirely.

---

## 3. Parallel workspace creation

Create N workspaces in one command for parallel agent experiments:

```bash
git-stacks new my-feature -n 3 -p "Implement task #{{ num }} from TASKS.md"
# creates: my-feature-1, my-feature-2, my-feature-3

git-stacks new my-feature -a claude -a gemini -p "Solve it"
# creates: my-feature-claude, my-feature-gemini
```

**Why useful for git-stacks**: git-stacks' multi-repo stacks are already well-suited for running multiple
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

`git-stacks last-done` cycles through completed workspaces in reverse chronological order.

**Why useful for git-stacks**: the cmux integration already manages window names. Adding status icons
would make parallel-agent workflows much easier to monitor.

---

## 5. Inter-workspace communication commands

workmux provides low-level primitives for coordinator workflows:

```bash
git-stacks send <workspace> "run the tests"    # send keystrokes/command to agent pane
git-stacks capture <workspace>                 # read terminal output from agent
git-stacks wait <workspace> --status done      # block until agent reaches a status
```

`git-stacks run <workspace> -- <cmd>` is already implemented — the remaining primitives (send,
capture, wait) would enable a coordinator agent pattern.

Cross-project: if the workspace isn't local, search all active agents globally.

**Why useful for git-stacks**: enables a coordinator agent pattern — an agent on main that spawns
parallel worktree agents, waits for them to finish, reviews output, and merges results.

---

## 6. Skills / slash commands for agents

Pre-written SKILL.md files that agents can invoke:

- `/git-stacks-merge` — commit, rebase onto main, run `git-stacks clean`, notify when done
- `/git-stacks-worktree` — delegate a task to a new workspace with full context
- `/git-stacks-open-pr` — write PR description using conversation context, open browser

Install via `git-stacks setup --skills` (auto-detects agent CLI, copies to right directory).

**Why useful for git-stacks**: agents using git-stacks already need these patterns. Shipping them
as skills makes git-stacks a complete agentic workflow tool, not just a workspace manager.

---

## Summary: priority order

| # | Idea | Effort | Value |
|---|------|--------|-------|
| 1 | `--prompt` / `-P` / `-e` flags on `git-stacks new` | low | high |
| 2 | Skills for agents (`/git-stacks-merge`, `/git-stacks-worktree`) | medium | high |
| 3 | Auto branch name from prompt (`-A` flag) | medium | medium |
| 4 | Agent status icons in cmux window names | medium | medium |
| 5 | Parallel workspace creation (`-n`, `-a`) | medium | medium |
| 6 | Inter-workspace send/capture/wait commands | high | high |

> **Note:** `git-stacks run` (item 5 in workmux) is now implemented as a standalone command.
