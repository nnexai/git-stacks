# Inspiration from workmux

Source: <https://workmux.raine.dev/guide/>

workmux is a single-repository Git worktree and tmux window manager. `git-stacks` manages multi-repository workspaces. This document records ideas inspired by that comparison and, as of the `0.21.0` release line, distinguishes shipped equivalents from ideas that remain exploratory.

This is not a roadmap. Current product behavior is documented in [README.md](./README.md) and [FEATURES.md](./FEATURES.md).

## Status Summary

| Idea | Status in git-stacks | Notes |
|------|----------------------|-------|
| Prompt injection during creation | Not implemented | Workspace creation does not start an agent with a supplied prompt. |
| Automatic workspace/branch naming from a prompt | Not implemented | Names remain explicit user input or derive from existing source flows. |
| Parallel workspace creation for agent experiments | Not implemented | Multiple workspaces can run concurrently, but creation is one workspace per invocation. |
| Agent lifecycle visibility | Implemented differently | Provider-neutral service signals drive TUI and browser attention; no `last-done` command or tmux-name contract exists. |
| Inter-workspace `send` / `capture` / `wait` | Not implemented | Explicit workspace commands and browser terminals exist, but no coordinator control API is public. |
| Shipped agent skills/slash commands | Not implemented | Opt-in provider signal hooks are a separate feature and do not install skills. |

## 1. Prompt-Aware Workspace Creation

The inspirational flow combines workspace creation with an agent prompt:

```bash
git-stacks new --prompt "Implement OAuth login for ticket PROJ-123"
git-stacks new -P task-spec.md
git-stacks new -e
```

This remains unimplemented. `git-stacks new` creates and configures the workspace, but it does not inject task text into an agent or select an agent CLI. If pursued later, prompt data should be explicit, avoid accidental persistence of sensitive task context, and reuse service-owned workspace creation rather than adding a client-only flow.

## 2. Automatic Naming from a Prompt

The inspirational `-A` flow asks an LLM to derive a kebab-case branch or workspace name from task text.

This remains unimplemented. It would require an explicit provider selection and clear handling for collisions, invalid branch characters, privacy, failed model calls, and reproducibility. It should not make an agent dependency part of ordinary workspace creation.

## 3. Parallel Workspace Creation

The idea is to create several isolated workspaces for parallel experiments or different agents from one invocation.

This remains unimplemented as a batch command. Existing creation is race-safe and the runtime supports concurrent workspaces, so any future batch interface should compose the existing creation operation and report independent outcomes instead of introducing a second creation engine.

## 4. Agent Lifecycle Visibility

The original inspiration used agent hooks to decorate tmux window names with working, waiting, and completed state.

`git-stacks` now implements the underlying need through its shared signal system:

- Providers publish one versioned activity/notification contract to the authenticated local service.
- Lifecycle state is scoped to the exact terminal surface and reduced to one current lane per provider.
- TUI rows, browser workspace rows, terminal tabs, and signal views render the same service state.
- Opening the exact terminal acknowledges attention, and activity for a removed terminal is cleaned up.
- Sidebar provider icons are deduplicated to the active provider set.
- User-level Codex, Claude Code, GitHub Copilot, and OpenCode adapters are opt-in through `git-stacks hooks`.

The proposed tmux window-name behavior and `git-stacks last-done` command are not implemented.

## 5. Inter-Workspace Communication

The inspirational coordinator primitives are:

```bash
git-stacks send <workspace> "run the tests"
git-stacks capture <workspace>
git-stacks wait <workspace> --status done
```

These commands are not implemented. Related shipped pieces are narrower:

- `git-stacks run <workspace> [repo]` runs an explicit shell command or interactive shell.
- `git-stacks command run` executes a configured manual command.
- Browser terminal sessions are service-owned and reconnectable while the service remains alive.
- Signals expose provider lifecycle and attention but are not a general orchestration or remote-control API.

Any future coordinator API must define authorization, terminal ownership, input safety, bounded capture, cancellation, and the distinction between observed agent state and guaranteed task completion.

## 6. Agent Skills and Slash Commands

The inspiration proposed installing packaged skills such as merge, delegation, and pull-request helpers into agent-specific directories.

This remains unimplemented. `git-stacks hooks` must not be confused with skill installation: it manages only user-selected, ownership-marked signal integrations. Normal startup never installs either hooks or skills.

If skills are added later, installation should be separately opt-in, provider-selective, ownership-safe, inspectable, and reversible. The skill content should call stable public commands rather than internal service endpoints.

## Design Lessons Retained

The most valuable ideas from the comparison are broader than individual flags:

- Agent awareness should be visible without making an agent mandatory.
- Parallel work needs exact workspace, repository, terminal, and provider identity.
- Automation should compose stable workspace operations rather than bypassing them.
- Machine-side processes and state belong in the shared service; clients should remain presentation layers.
- Any change to user-level agent configuration must be explicit and reversible.
