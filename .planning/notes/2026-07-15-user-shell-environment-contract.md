# User Shell and Dynamic Environment Contract

**Date:** 2026-07-15
**Milestone:** v0.22.0 Workspace Productivity
**Decision:** Prefer the user's actual configured shell and initialization over portable `/bin/sh` behavior for user-authored commands and hooks.

## Problem

Configured commands and lifecycle hooks currently reach hard-coded `/bin/sh` paths in `packages/core/src/lifecycle.ts`, `packages/core/src/workspace-lifecycle.ts`, and the service command-terminal projection. A long-lived helper also inherits `PATH` and `SSH_AUTH_SOCK` only from the environment that originally launched it.

That combination makes profile-installed runtimes such as nvm unavailable and leaves a replaced or late-created SSH agent socket invisible until the service restarts. Interactive terminal creation already consults `SHELL`, but it does not yet define consistent login initialization or environment refresh semantics.

## Scope boundary

The new contract applies to user-authored workspace/repository commands, lifecycle hooks, and interactive terminal shells. It does not turn internal Git, filesystem, security, packaging, or process-control calls into user-shell text. Internal commands should continue using argv-based process capabilities or a deliberately narrow deterministic shell boundary.

## Authority order

```text
trusted launcher environment
  -> allowlisted dynamic refresh (PATH, SSH_AUTH_SOCK)
    -> configured user shell initialization
      -> global/workspace/repository/port/GS_* overlays
        -> user-authored command or interactive prompt
```

Later layers win. Browser code can request an operation but never supplies or receives raw environment values.

## Shell discovery

1. Resolve the current user's configured shell from the trusted launch context, preferring a valid absolute `SHELL` and falling back to the account database where supported.
2. Resolve and validate the executable before planning a launch.
3. Select a named adapter by executable identity, initially Bash, zsh, and fish.
4. Unknown shells fail with a useful diagnostic until an explicit compatible adapter exists; they do not silently run as `/bin/sh`.

## Invocation contract

There is no universal flag sequence that loads equivalent startup state in every shell. Bash distinguishes login profiles from `.bashrc`; zsh has ordered login and interactive files; fish uses its own configuration rules. Phase 124 must implement and test adapters rather than concatenate guessed flags globally.

For one-shot user commands, each adapter must:

- initialize the same login/interactive configuration the supported shell normally uses for a developer session;
- avoid reading command text from stdin;
- pass the original command as one positional argument to a fixed adapter bootstrap, not interpolate it into generated shell source;
- apply authoritative environment overlays after initialization and before evaluating the command;
- preserve stdout, stderr, exit status, cancellation, process-group cleanup, and the existing pre/main/post step boundary;
- prevent prompts, greetings, job-control warnings, or terminal escape sequences from corrupting captured command output.

For interactive PTYs, each adapter must start the normal initialized interactive shell directly on the PTY, retain service-owned lifecycle semantics, and apply the same final workspace/repository environment contract without displaying bootstrap text.

## Dynamic environment refresh

- `git-stacks web`, `git-stacks manage`, and other trusted local CLI launch paths refresh an allowlist into the local helper before handing control to a thin client.
- The initial allowlist is `PATH` and `SSH_AUTH_SOCK`; additions require an explicit contract and security review.
- Refresh is helper-local, same-user authenticated, bounded in size, redacted from logs, and never included in browser projections, snapshots, URLs, or durable workspace YAML.
- A refresh affects new command and terminal launches. Existing terminal processes keep their process environment.
- Removing a value from the trusted launcher clears the corresponding refresh rather than retaining a stale socket or path indefinitely.

## Environment precedence

- Profile initialization may construct runtime-manager paths and shell functions.
- Refreshed `PATH`/`SSH_AUTH_SOCK` establish current launcher state, with adapter tests defining how profile additions compose rather than accidentally erase it.
- git-stacks-owned `GS_*`, workspace, repository, secret, and port values are applied last and cannot be overridden by profile defaults.
- Secret values remain redacted under the existing launch/projection rules.

## Verification matrix

Phase 124 must cover at least:

- Bash, zsh, and fish command execution plus interactive PTY launch on supported Linux/macOS hosts.
- An nvm-style runtime made available only by shell initialization.
- A shell function and alias defined by interactive configuration.
- A rotated `SSH_AUTH_SOCK` and successful agent discovery/`ssh-add` behavior without service restart.
- Workspace/repository/port precedence over conflicting profile values.
- Quoting, multiline commands, pipelines, command substitution, non-zero exit, cancellation, output capture, and process-tree cleanup.
- Missing executable, unsupported shell, noisy/broken startup file, and initialization timeout diagnostics.

## Research references

- [Bash startup files](https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html) and [Bash invocation](https://www.gnu.org/software/bash/manual/bash.html#Invoking-Bash)
- [zsh invocation](https://zsh.sourceforge.io/Doc/Release/Invocation.html) and [zsh startup files](https://zsh.sourceforge.io/Intro/intro_3.html)
- [fish invocation](https://fishshell.com/docs/current/cmds/fish.html) and [fish startup configuration](https://fishshell.com/docs/current/tutorial#startup-where-s-bashrc)

## Consequences

- User commands gain compatibility with the environment the developer actually uses.
- Behavior becomes intentionally shell-specific, so diagnostics and a host/shell test matrix replace the false portability of `/bin/sh`.
- Centralizing this adapter is mandatory; web, TUI, CLI, hooks, and command terminals must not grow separate shell-launch rules.
