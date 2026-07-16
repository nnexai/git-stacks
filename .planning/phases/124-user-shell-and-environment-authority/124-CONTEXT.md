# Phase 124: User Shell and Environment Authority - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralize Bash, zsh, and fish launch planning for user-authored configured commands, lifecycle hooks, CLI command/shell execution, and service-owned PTYs. Refresh only allowlisted dynamic launcher values into the local service, apply git-stacks environment authority after shell initialization, and preserve explicit diagnostics, cancellation, cleanup, and browser non-disclosure. Internal Git, filesystem, security, packaging, and process-control execution remains deterministic and outside the user-shell contract.

</domain>

<decisions>
## Implementation Decisions

### Shell discovery and initialization
- Treat a valid absolute `SHELL` executable as authoritative and initially support Bash, zsh, and fish through named adapters.
- Missing, non-executable, or unsupported shell values fail explicitly; do not silently fall back to `/bin/sh` or a semantically different shell.
- Configured commands and hooks use the selected shell's interactive-login initialization, with the unchanged user command passed as the single command argument.
- Interactive PTYs start the same validated shell as an interactive login shell.
- A startup failure names the shell, invocation mode, initialization stage, and safe recovery path.

### Environment authority and refresh
- Apply authority in this order: trusted launcher refresh, shell initialization, global/workspace/repository/port/secret overlays, then reserved `GS_*` values. Later layers win.
- A trusted refresh replaces the complete initial allowlist of `PATH` and `SSH_AUTH_SOCK`; omitted values explicitly clear stale service state.
- Refresh affects only new commands and terminals. Existing processes retain their environment.
- Only same-user local CLI/TUI launcher paths may refresh before client handoff. Browser and remote clients can neither submit nor receive raw values.
- Keep refreshed values in volatile service memory and exclude them from snapshots, revisions, logs, URLs, workspace YAML, and browser projections.
- Resolve secret-backed launch values only at launch time and keep the existing redaction boundary.

### Execution fidelity and diagnostics
- Execute each pre/main/post and repository step separately through the shared adapter, preserving cwd and environment and stopping at the first failure; never concatenate steps into generated shell source.
- Preserve the original command as one argument to a fixed adapter bootstrap rather than interpolating it into a generated wrapper.
- Own non-PTY command process groups and cancel with TERM, a bounded grace period, then KILL.
- Enforce a 10-second shell initialization timeout without adding a new runtime timeout to the user command itself.
- Keep initialization diagnostics separate from command stdout/stderr. Suppress prompts, greetings, job-control warnings, and control sequences for one-shot commands, while interactive PTYs retain normal shell startup presentation.
- Classify failures by discovery, validation, initialization, execution, cancellation, or cleanup and retain shell and invocation-mode context.
- Require Bash/zsh/fish fixtures plus Linux/macOS hosted gates. Capability-gate shells unavailable on a local host, but require the hosted matrix to cover every supported shell.
- Cover aliases, functions, nvm-style runtime paths, SSH agent/socket rotation, exact command quoting, non-zero exits, cancellation, process-tree cleanup, overlay conflicts, and browser non-disclosure.

### the agent's Discretion
- The exact internal bootstrap representation, temporary-file lifecycle, typed diagnostic shape, and bounded refresh payload limits are at the agent's discretion so long as the accepted authority, command-integrity, and non-disclosure contracts hold.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/workspace-env.ts` already builds workspace, port, secret, repository, and `GS_*` values, but its precedence must be corrected and separated from process inheritance.
- `packages/core/src/workspace-command.ts` already owns pre/main/post and workspace/repository step planning.
- `packages/service/src/web/terminal-manager.ts` already owns PTY allocation, process-group termination, exit confirmation, and lifecycle admission.
- `packages/service/src/web/projection.ts` already provides a strict browser allowlist that excludes command text, paths, environment, ports, and secret references.
- Managed-service and trusted-client discovery/authentication provide local launcher seams for bounded environment refresh.

### Established Patterns
- Core lifecycle runners currently merge process environment with authoritative overlays but hard-code `/bin/sh`; service command terminals independently use `/bin/sh -lc`.
- Service snapshots plan terminal launches, while the web and TUI remain thin service clients.
- Operations use strict protocol schemas, same-user local authority, bounded payloads, typed failures, and no automatic replay.
- Internal process operations remain argv-based and must not be swept into this user-shell refactor.

### Integration Points
- Replace user-shell rules in `packages/core/src/lifecycle.ts`, `packages/core/src/workspace-lifecycle.ts`, `packages/core/src/workspace-command.ts`, `packages/cli/src/commands/workspace.ts`, and `packages/service/src/policy/snapshot.ts` with one core adapter.
- Add a strict local-administration refresh contract through protocol, service policy/router, managed-service launchers, CLI web/manage paths, and TUI bootstrap.
- Inject volatile refreshed values only during launch resolution; agent wrapper PATH construction must use the effective refreshed path.
- Update lifecycle, command, snapshot, launch-context, managed-service, TUI bootstrap, terminal, projection, and CLI parallel-run coverage.

</code_context>

<specifics>
## Specific Ideas

- Preserve compatibility with normal developer startup files so an nvm-style executable, alias, and shell function work without editing command text or restarting the helper.
- A rotated `SSH_AUTH_SOCK` must work for both new PTYs and new non-PTY commands, including `ssh-add` discovery.
- Do not claim zsh coverage from this local host when zsh is unavailable; rely on capability-aware local evidence and mandatory hosted coverage.

</specifics>

<deferred>
## Deferred Ideas

- Additional shells beyond Bash, zsh, and fish require their own explicit adapter and compatibility contract.
- Remote dynamic-environment delegation requires a separate trust and transport design; local socket/path refresh is not relayed.

</deferred>
