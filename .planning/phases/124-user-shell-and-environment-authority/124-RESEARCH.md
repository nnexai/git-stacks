# Phase 124: User Shell and Environment Authority - Research

**Researched:** 2026-07-16
**Domain:** Initialized user-shell launch planning, volatile service environment authority, and process lifecycle fidelity
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Shell discovery and initialization
- Treat a valid absolute `SHELL` executable as authoritative and initially support Bash, zsh, and fish through named adapters.
- Missing, non-executable, or unsupported shell values fail explicitly; do not silently fall back to `/bin/sh` or a semantically different shell.
- Configured commands and hooks use the selected shell's interactive-login initialization, with the unchanged user command passed as the single command argument.
- Interactive PTYs start the same validated shell as an interactive login shell.
- A startup failure names the shell, invocation mode, initialization stage, and safe recovery path.

#### Environment authority and refresh
- Apply authority in this order: trusted launcher refresh, shell initialization, global/workspace/repository/port/secret overlays, then reserved `GS_*` values. Later layers win.
- A trusted refresh replaces the complete initial allowlist of `PATH` and `SSH_AUTH_SOCK`; omitted values explicitly clear stale service state.
- Refresh affects only new commands and terminals. Existing processes retain their environment.
- Only same-user local CLI/TUI launcher paths may refresh before client handoff. Browser and remote clients can neither submit nor receive raw values.
- Keep refreshed values in volatile service memory and exclude them from snapshots, revisions, logs, URLs, workspace YAML, and browser projections.
- Resolve secret-backed launch values only at launch time and keep the existing redaction boundary.

#### Execution fidelity and diagnostics
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

### Deferred Ideas (OUT OF SCOPE)
- Additional shells beyond Bash, zsh, and fish require their own explicit adapter and compatibility contract.
- Remote dynamic-environment delegation requires a separate trust and transport design; local socket/path refresh is not relayed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHELL-01 | Configured commands and lifecycle hooks execute through the actual configured shell with a documented per-shell strategy. | Central core discovery plus named Bash/zsh/fish adapters replaces five independent user-shell call sites. |
| SHELL-02 | Supported shells load interactive/login initialization so runtime managers, functions, aliases, and dynamic `PATH` values work. | Official startup rules require adapter-specific command and PTY plans; a universal flag sequence is not correct. |
| SHELL-03 | The original command is one shell argument and is not interpolated into generated wrapper source. | A fixed bootstrap consumes the command from positional arguments; the current `commandSequence()` source generator must be deleted. |
| SHELL-04 | Global, workspace, repository, port, secret, and reserved `GS_*` overlays apply after initialization. | Introduce a typed post-init overlay and correct `workspace-env.ts` precedence so reserved values are last. |
| SHELL-05 | Trusted local launchers refresh only `PATH` and `SSH_AUTH_SOCK`; browser code never sees raw values. | Add a local-administration request restricted by authenticated client mode and store a replace-all volatile snapshot outside catalog/revision state. |
| SHELL-06 | New PTY and non-PTY launches use refreshed SSH-agent state and profile-installed runtimes without service restart. | Resolve effective dynamic values at launch time and feed the same adapter from core operations and terminal launch resolution. |
| SHELL-07 | Discovery and startup failures identify shell, mode, stage, and recovery without fallback. | Use a discriminated diagnostic model and an initialization readiness boundary with a 10-second timer. |
</phase_requirements>

## Summary

Phase 124 is a consolidation and authority-order correction, not a new shell runtime. The repository already has the correct owners for command sequencing (`workspace-command.ts`), environment construction (`workspace-env.ts`), service-side launch resolution (`snapshot.ts`), PTY lifecycle (`terminal-manager.ts`), and browser redaction (`web/projection.ts`). The missing piece is one core-owned shell launch planner used by all of them. [VERIFIED: `packages/core/src/workspace-command.ts`, `packages/core/src/workspace-env.ts`, `packages/service/src/policy/snapshot.ts`, `packages/service/src/web/terminal-manager.ts`, `packages/service/src/web/projection.ts`]

The present implementation has four incompatible user-shell rules: lifecycle/manual commands use `/bin/sh -c`, CLI `run` uses `sh -c`, interactive CLI uses an unvalidated `SHELL`, and service command terminals use `/bin/sh -lc` while interactive PTYs use an independently selected `SHELL`. Multi-step web commands additionally concatenate cwd, environment, and commands into generated source. These seams explain the missing aliases/functions/runtime-manager paths, stale `SSH_AUTH_SOCK`, inconsistent quoting, and inability to report initialization separately. [VERIFIED: `packages/core/src/lifecycle.ts`, `packages/core/src/workspace-lifecycle.ts`, `packages/cli/src/commands/workspace.ts`, `packages/service/src/policy/snapshot.ts`]

The primary implementation recommendation is to add a pure, typed core planner that discovers and validates `SHELL`, selects a Bash/zsh/fish adapter, and emits either a one-shot initialized-command plan or an interactive-login PTY plan. Pair it with an in-memory replace-all `PATH`/`SSH_AUTH_SOCK` refresh store owned by the local service. Keep execution, cancellation, PTY allocation, transport authentication, and browser projection in their current owners. No new dependency is needed. [VERIFIED: repository package manifests and current package boundaries]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shell discovery, adapter selection, launch-plan construction | Core domain | CLI/service adapters | Every local execution surface needs identical semantics; core is already shared by CLI and service. [VERIFIED: package dependency graph] |
| Workspace/repository/port/secret/`GS_*` overlay construction | Core domain | Service launch resolver | Core owns config and secret resolution; service requests a launch-time result. [VERIFIED: `workspace-env.ts`] |
| Dynamic refresh authentication and volatile storage | Local service policy | CLI/TUI launcher | The long-lived process needs new values, but only a same-user local launcher may supply them. [VERIFIED: CONTEXT.md] |
| Non-PTY spawn, cancellation, process-group cleanup | Core Node runtime | Core lifecycle runner | `node-runtime.ts` is the Node process capability boundary and must grow the necessary lifecycle handle. [VERIFIED: `node-runtime.ts`] |
| PTY allocation and terminal termination | Service | Core launch planner | `WebTerminalManager` already owns node-pty, admission, TERM/KILL, exit confirmation, and session cleanup. [VERIFIED: `terminal-manager.ts`] |
| Browser/TUI interaction | Thin clients | Secure router | Clients select a command/terminal; they do not construct shell argv or environment. [VERIFIED: `web/src/app.ts`, `tui/src/App.tsx`] |
| Browser non-disclosure | Service projection | Protocol schemas | The existing strict projection omits command source, paths, environment, ports, and secret references. [VERIFIED: `web/projection.ts`, `web-projection.test.ts`] |

## Current Runtime Map

| Surface | Current route | Current shell/environment behavior | Required change |
|---------|---------------|------------------------------------|-----------------|
| Lifecycle hooks | `workspace-ops.ts` / `workspace-lifecycle.ts` -> lifecycle runners | Merges `process.env` with overlay, then `/bin/sh -c`. | Route every hook through the core adapter and post-init overlay. |
| CLI `command run` | `command.ts` -> `runManualCommand()` -> `runShellSequence*()` | Separate pre/main/post steps, but each uses `/bin/sh -c`. | Preserve sequencing and replace only launch/execution capability. |
| Service/TUI command operation | `operations.ts` -> `runManualCommand()` | Same core `/bin/sh` path, captured output batched into operation progress. | Preserve operation progress; adapter diagnostics must remain separate from command lines. |
| CLI `run --parallel`, `--all-repos`, and one repo | `workspace.ts` | Independent `sh -c`; no workspace environment build in the shown path. | Build effective launch context per repo and use the shared adapter. |
| CLI interactive shell / TUI handoff | `workspace.ts`; TUI spawns `git-stacks run` | Uses unvalidated `process.env.SHELL || "sh"`. | Plan an initialized interactive-login shell; TUI remains a handoff. |
| Web configured-command terminal | browser command ID -> `snapshot.resolveTerminalLaunch()` -> PTY manager | Single step `/bin/sh -lc`; multi-step source generation with nested `/bin/sh`. | Resolve and spawn one adapter-planned step at a time; do not use `commandSequence()`. |
| Web/TUI interactive PTY | `snapshot.resolveTerminalLaunch()` -> PTY manager | Uses service-start `SHELL`, no validation/startup contract. | Resolve validated shell and interactive-login argv through core planner. |
| Service start/discovery | `ensureManagedServiceProcess()` | Detached service inherits the first launcher's environment; an existing service is returned unchanged. | After authenticated discovery, trusted launchers replace the volatile dynamic allowlist. |

All entries above are verified from current source. [VERIFIED: code paths named in the table]

## Standard Stack

### Core

| Library/capability | Version | Purpose | Why Standard Here |
|--------------------|---------|---------|-------------------|
| Node.js built-ins: `node:child_process`, `node:fs`, `node:path` | Project target Node >=24 | Executable validation, argv spawn, process groups, bounded bootstrap lifecycle | Already canonical in `@git-stacks/core`; supports direct argv without introducing a shell helper package. [VERIFIED: root `package.json`, `node-runtime.ts`] |
| `node:os.userInfo()` | Node built-in | Diagnostic context only if useful; not a shell fallback under the locked decision | POSIX returns account shell information, but Phase 124 deliberately treats valid absolute `SHELL` as authoritative and fails otherwise. [CITED: https://nodejs.org/api/os.html#osuserinfooptions] |
| Existing core workspace environment and secret resolvers | In-repo | Build global/workspace/repository/port/secret/`GS_*` layers | Preserves current config and redaction contracts. [VERIFIED: `workspace-env.ts`, `secrets.ts`] |
| Existing `node-pty` adapter | 1.2.0-beta.14 exact | Service-owned interactive PTYs | Already accepted, exact-pinned, and covered by lifecycle tests; Phase 124 changes launch plans, not PTY technology. [VERIFIED: `packages/service/package.json`] |
| Zod protocol schemas | 4.3.6 range | Strict refresh request and typed diagnostic validation | Existing protocol convention for bounded cross-package messages. [VERIFIED: `packages/protocol/package.json`] |

### Supporting

| Existing asset | Purpose | Use |
|----------------|---------|-----|
| `workspace-command.ts` | Ordered pre/main/post and workspace/repository steps | Keep as the sole step planner; execute steps independently. |
| `workspace-lifecycle-admission.ts` | Prevent terminal/lifecycle races | Retain unchanged around PTY creation. |
| `web/projection.ts` | Browser allowlist | Add negative refresh assertions; do not add refresh fields. |
| Secure local carrier context | Same-user authenticated launcher authority | Admit refresh only for local TUI/administration mode, never browser or remote mode. |

### Alternatives Rejected

| Rejected approach | Reason |
|-------------------|--------|
| `child_process.spawn(..., { shell: true })` | Selects `/bin/sh` by default on Unix and loses the required named-adapter and exact startup contract. Node also warns against unsanitized input through this option. [CITED: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options] |
| One universal `-lic` rule | Bash, zsh, and fish load different startup files and expose command arguments differently. [CITED: official shell manuals in Sources] |
| Account-database fallback | Contradicts the accepted valid-absolute-`SHELL` authority decision. |
| Persist refresh in YAML/descriptor/snapshot | Violates volatility, revision independence, and browser non-disclosure. |
| Relay refresh to a paired target | Explicitly deferred; a local socket path is not remote authority. |
| Add a shell parsing/quoting dependency | Command text is already user-authored shell source; the adapter must pass it unchanged, not parse or reconstruct it. |

**Installation:** None. Phase 124 should add no external package.

## Architecture Patterns

### System Architecture Diagram

```text
trusted local CLI / TUI launcher
        |
        | authenticated replace-all { PATH?, SSH_AUTH_SOCK? }
        v
local service volatile refresh store --------------------------+
        |                                                       |
        | read snapshot for each NEW launch                     |
        v                                                       |
core effective environment builder                              |
  refresh -> initialized shell -> global/workspace/repo/port/secret -> GS_*
        |                                                       |
        v                                                       |
core shell discovery + named adapter                            |
  validate absolute executable                                  |
  -> Bash | zsh | fish                                          |
  -> command plan OR interactive-login PTY plan                 |
        |                                                       |
        +-----------------------+-------------------------------+
                                |
                 +--------------+---------------+
                 |                              |
                 v                              v
        core Node non-PTY runner        service WebTerminalManager
        process group + TERM/KILL        node-pty + session lifecycle
                 |                              |
                 v                              v
        CLI/service operation output      browser/TUI terminal stream
                                               |
                                               v
                                  strict web projection (no raw env)
```

### Recommended Project Structure

```text
packages/core/src/
├── user-shell.ts                 # discovery, validation, adapter registry, typed plans/diagnostics
├── user-shell-bootstrap.ts       # fixed adapter-owned bootstrap definitions and readiness contract
├── user-shell-process.ts         # non-PTY spawn, initialization timer, cancellation, cleanup
├── workspace-env.ts              # corrected typed authority layers
├── workspace-command.ts          # unchanged step planning; delegates each execution
└── lifecycle.ts                  # thin hook/sequence facade over user-shell process capability

packages/protocol/src/
└── service.ts                    # bounded local environment refresh request/result schema

packages/service/src/policy/
├── dynamic-environment.ts        # volatile replace-all store; never projected or persisted
├── snapshot.ts                   # launch-time secrets/effective environment; adapter plan request
└── client.ts                     # trusted local refresh helper

packages/service/src/secure/
└── router.ts                     # rejects browser and remote refresh contexts
```

Names are recommendations; keeping the discovery, bootstrap, and process concerns in one file is acceptable if the exported contracts stay narrow. [ASSUMED]

### Pattern 1: Pure Launch Planning, Impure Execution

Discovery and adapter planning should be deterministic and directly unit-testable. Execution receives an already validated plan and owns the child lifecycle. [VERIFIED: established project adapter pattern in core/service]

```ts
type UserShellMode = "command" | "pty"
type SupportedUserShell = "bash" | "zsh" | "fish"

type UserShellLaunchPlan = {
  shell: SupportedUserShell
  executable: string
  mode: UserShellMode
  argv: readonly string[]
  cwd: string
  environment: Record<string, string>
  initialization: { timeoutMs: 10_000; readiness: "private-control-channel" }
}
```

The command plan contains a fixed adapter bootstrap as the shell's command string and carries the unchanged user command in one positional argument. For Bash, arguments after `-c` assign the first to `$0` and later arguments to positional parameters; zsh uses the same `$0` distinction; fish places additional arguments in `$argv`. [CITED: https://www.gnu.org/software/bash/manual/html_node/Invoking-Bash.html] [CITED: https://zsh.sourceforge.io/Doc/Release/Invocation.html] [CITED: https://fishshell.com/docs/current/cmds/fish.html]

### Pattern 2: Adapter-Specific Interactive-Login Plans

| Adapter | One-shot initialized command | Interactive PTY | Startup facts the adapter must preserve |
|---------|------------------------------|-----------------|-----------------------------------------|
| Bash | Interactive-login invocation with fixed bootstrap and original command as a positional argument. | Validated Bash as interactive login shell. | Login Bash reads `/etc/profile` then the first readable user profile; `.bashrc` is automatic for interactive non-login shells and is commonly sourced by the login profile. [CITED: https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html] |
| zsh | Interactive-login invocation with fixed bootstrap and original command after the `-c` command argument. | Validated zsh as interactive login shell. | zsh reads `.zshenv`, login `.zprofile`, interactive `.zshrc`, then login `.zlogin` in order. [CITED: https://zsh.sourceforge.io/Doc/Release/Files.html] |
| fish | Interactive-login invocation using fixed command/init-command support and original command in `$argv`. | Validated fish with login mode on the PTY. | fish reads configuration for every shell; `-C` runs after configuration and before `-c` or interactive input. [CITED: https://fishshell.com/docs/current/language.html#configuration-files] [CITED: https://fishshell.com/docs/current/cmds/fish.html] |

The fixed bootstrap may use a private mode-0600 temporary asset or a fixed inline constant. It must contain no interpolated command, raw secret value, or refresh value; it applies a typed environment payload after startup, signals readiness on a private control channel, then evaluates exactly the positional command. Temporary artifacts must be removed after readiness, exit, timeout, cancellation, and startup error. [VERIFIED: CONTEXT.md; representation at the agent's discretion]

### Pattern 3: Separate Initialization from Runtime

The 10-second timer ends when the bootstrap emits an authenticated/private readiness marker after startup files and final overlays. From that point onward there is no runtime timeout. Command stdout/stderr begin only after readiness; startup diagnostics use a separate pipe or bounded diagnostic buffer. Cancellation remains active across both phases. [VERIFIED: CONTEXT.md]

For non-PTY launches, spawn a new process group on Linux/macOS. Cancellation sends TERM to the group, waits a bounded grace period, sends KILL, and confirms exit. A failed cleanup is not reported as a normal command failure. Node documents that a detached POSIX child becomes a new process-group/session leader; this is the primitive already partially used by `node-runtime.ts` for timeout cleanup. [CITED: https://nodejs.org/api/child_process.html#optionsdetached]

### Pattern 4: Replace-All Volatile Refresh

```ts
const DynamicEnvironmentRefreshSchema = z.strictObject({
  PATH: z.string().max(PATH_LIMIT).optional(),
  SSH_AUTH_SOCK: z.string().max(SOCKET_LIMIT).optional(),
})

// Missing keys clear prior values; the store swaps one immutable snapshot.
store.replace(parsedRequest)
```

Choose conservative limits (recommended starting points: 16 KiB for `PATH`, 4 KiB for `SSH_AUTH_SOCK`) and reject NUL/control characters. Limits are implementation discretion and should be constants covered by boundary tests. [ASSUMED]

The store must not participate in workspace snapshot fingerprints or revisions. Reads occur only while resolving a new command or PTY. Existing child environments are immutable by operating-system process semantics. [VERIFIED: CONTEXT.md]

### Pattern 5: Launch-Time Secret Resolution and Final Reserved Layer

Correct the environment APIs so they return explicit layers rather than repeatedly spreading the same workspace map:

```ts
const effective = {
  ...refreshedDynamic,
  ...initializedGlobal,
  ...workspaceValues,
  ...repositoryValues,
  ...portValues,
  ...resolvedSecrets,
  ...reservedGitStacksValues,
}
```

The actual application occurs inside the initialized bootstrap, not merely in `spawn({ env })`, because startup files can overwrite inherited values. `GS_*` names should be reserved or overwritten last even if workspace YAML contains the same identifier. [VERIFIED: CONTEXT.md; current precedence defect in `workspace-env.ts`]

### Anti-Patterns to Avoid

- **Source generation for multi-step commands:** Delete `commandSequence()`; it adds quoting and nested-shell semantics and prevents per-step cwd/environment/failure fidelity. [VERIFIED: `snapshot.ts`]
- **Refreshing in `ensureManagedServiceProcess()` before authentication:** Service discovery alone is not authorization. Perform the refresh through the authenticated local client before handoff. [VERIFIED: secure local carrier architecture]
- **Giving browsers the refresh method and relying only on UI absence:** Router policy must reject browser and remote client modes even if they know the method name. [VERIFIED: CONTEXT.md]
- **Putting readiness markers in stdout/stderr:** This corrupts captured output and terminal replay. Use a separate control channel. [VERIFIED: CONTEXT.md]
- **Killing only the immediate shell PID:** Pipelines and command substitutions can leave descendants alive. Own and signal the process group. [CITED: Node detached-process documentation]
- **Treating shell startup output as command output:** Capture initialization diagnostics separately and release command streams only after readiness. [VERIFIED: CONTEXT.md]
- **Using a different shell after validation fails:** Failure must retain selected shell identity and safe recovery guidance. [VERIFIED: CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shell parser or quoting rewriter | Tokenizer that translates Bash/zsh/fish command text | Pass the original command as one argv value to the selected shell | The command is authored for that shell; translation changes semantics. |
| PTY/session manager | New PTY ownership layer | Existing `WebTerminalManager` and exact-pinned `node-pty` | Existing code already handles replay, admission, close escalation, and exit confirmation. |
| Browser environment filtering | Ad hoc deletion in web code | Existing strict `projectWebSnapshot()` allowlist | Positive projection is safer than subtractive filtering. |
| Secret resolver | New env interpolation logic | Existing core secret resolvers at launch time | Preserves resolver policy and redaction. |
| Cross-shell universal startup flags | One array used for every shell | Named adapter table | Official startup and argument rules differ materially. |
| Remote env transport | Reuse local refresh RPC across relay | Deferred explicit delegation design | Local socket paths and host `PATH` have no valid remote meaning. |

## Concrete File Seams

| File | Planning action | Verification focus |
|------|-----------------|--------------------|
| `packages/core/src/lifecycle.ts` | Replace `/bin/sh` runners with the shared initialized-shell executor while retaining captured/inherited output APIs. | Output ordering, first failure, diagnostic separation. |
| `packages/core/src/workspace-lifecycle.ts` | Remove duplicated hook subprocess implementation; delegate to the same lifecycle executor while retaining its injectable seam. | Create/open/close/clean/merge/remove hook parity. |
| `packages/core/src/workspace-command.ts` | Preserve step planner; pass each step and effective repo env independently to executor. | pre/main/post ordering, cwd, stop-on-failure. |
| `packages/core/src/workspace-env.ts` | Expose/correct layer ordering; reserve `GS_*`; separate inherited/dynamic values from workspace persistence. | Conflicting profile/workspace/port/secret/GS names. |
| `packages/core/src/node-runtime.ts` | Add signal/process-group lifecycle needed by non-PTY commands without changing deterministic argv users. | TERM/grace/KILL and confirmed cleanup. |
| `packages/cli/src/commands/workspace.ts` | Replace all user-authored `sh -c` and interactive `SHELL` branches with core plans; apply environment per repo. | parallel JSON cleanliness, all-repo fail-fast, interactive exit. |
| `packages/service/src/policy/snapshot.ts` | Remove `shellQuote()`/`commandSequence()` and independent shell selection; resolve launch-time secret/effective env. | one step per launch/execution, no source concatenation. |
| `packages/service/src/web/terminal-manager.ts` | Consume adapter PTY plans and surface typed initialization failures; retain node-pty lifecycle. | startup timeout, PTY normal presentation, close semantics. |
| `packages/protocol/src/service.ts` | Add bounded refresh request/result and typed shell diagnostic schemas where transport-visible. | strict unknown-key rejection and byte/string limits. |
| `packages/service/src/secure/router.ts` | Add local-only refresh authorization; explicitly reject browser and relayed/remote contexts. | mode matrix and no retry/replay. |
| `packages/service/src/policy/client.ts` | Add trusted local refresh helper used before client handoff. | replace/clear semantics and reconnect behavior. |
| `packages/cli/src/commands/web.ts` | Refresh after authenticated service discovery and before browser grant/open. | browser launch works while raw values remain absent from URL/hash. |
| `packages/cli/src/lib/cli-program.ts` | Refresh from the Node launcher before spawning the optional TUI. | direct manage path, target selection, cleared values. |
| `packages/tui/src/run.tsx` / bootstrap tests | Ensure direct trusted local TUI launch refreshes before normal service use, if direct TUI remains supported. | Bun launcher current env reaches local helper only. |
| `packages/service/src/web/projection.ts` | No feature fields; add negative regression assertions. | raw `PATH`, socket, command, secret, diagnostics absent. |

## Common Pitfalls

### Pitfall 1: Bash login does not guarantee `.bashrc`

**What goes wrong:** An alias/function placed only in `.bashrc` is missing even though Bash was started as a login shell.  
**Why:** Bash login startup reads a user profile; `.bashrc` is automatic for interactive non-login shells. The documented common pattern is for `.bash_profile` to source `.bashrc`. [CITED: https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html]  
**Avoidance:** Fixtures must model normal recommended login configuration, and diagnostics/docs must explain the loaded mode rather than silently sourcing arbitrary extra files twice.  
**Warning sign:** nvm works from a login profile but an alias in `.bashrc` does not.

### Pitfall 2: `-c` positional arguments differ at the command boundary

**What goes wrong:** The user command becomes `$0`, is dropped, or is split into multiple shell arguments.  
**Why:** Bash/zsh reserve the first argument after the command string for `$0`; fish exposes additional arguments in `$argv`. [CITED: official invocation docs]  
**Avoidance:** Unit-test the exact argv for all three adapters with whitespace, newlines, quotes, substitutions, and leading dashes.

### Pitfall 3: Applying overlays only in `spawn.env`

**What goes wrong:** Startup files replace `PATH`, `SSH_AUTH_SOCK`, ports, or reserved values.  
**Why:** The shell reads initialization after inheriting the child environment.  
**Avoidance:** Re-apply typed authoritative layers in the fixed post-init bootstrap immediately before evaluation/prompt readiness. [VERIFIED: CONTEXT.md]

### Pitfall 4: Initialization timeout accidentally becomes command timeout

**What goes wrong:** A legitimate long-running command is killed after ten seconds.  
**Why:** One timer wraps the entire child instead of a readiness phase.  
**Avoidance:** Clear the initialization timer on the private ready signal; retain cancellation but no runtime deadline afterward.

### Pitfall 5: Interactive flags corrupt captured output

**What goes wrong:** Greetings, prompts, job-control warnings, or escape sequences enter operation progress/JSON.  
**Why:** One-shot commands need interactive initialization but do not own a presentation PTY.  
**Avoidance:** Adapter bootstrap and stdio policy must separate initialization diagnostics and suppress presentation-only output for command mode; test hostile/noisy startup files. [VERIFIED: CONTEXT.md]

### Pitfall 6: Refresh omission retains a stale SSH socket

**What goes wrong:** Removing or rotating the agent leaves the old `SSH_AUTH_SOCK` active in the helper.  
**Why:** Patch semantics update only provided keys.  
**Avoidance:** Parse every request as a complete allowlist snapshot and atomically replace it; absence clears.

### Pitfall 7: Local refresh leaks through remote target selection

**What goes wrong:** A local filesystem socket/path is sent to a paired remote authority.  
**Why:** The client reuses the same operation after switching targets.  
**Avoidance:** Refresh only the local helper before target handoff and reject relayed contexts. Remote delegation is deferred.

### Pitfall 8: Tests preserve the old implementation accidentally

**What goes wrong:** Tests stay green because they duplicate `/bin/sh` logic rather than importing production code.  
**Why:** `tests/lib/lifecycle.test.ts` contains local runner implementations and a mock-module seam. [VERIFIED: current test file]  
**Avoidance:** Move adapter tests to real exported planner/executor contracts and keep only focused dependency injection around spawn.

### Pitfall 9: macOS Bash compatibility

**What goes wrong:** Adapter bootstrap uses modern Bash-only syntax and fails on the supported macOS host.  
**Why:** Hosted platforms can provide different system Bash versions.  
**Avoidance:** Keep bootstrap syntax conservative and make the macOS Bash hosted fixture mandatory. [ASSUMED: exact hosted Bash version varies]

### Pitfall 10: Service snapshot becomes a secret cache

**What goes wrong:** Resolving secrets while building catalog state persists sensitive launch material in long-lived memory/projections.  
**Why:** Launch planning is currently embedded in snapshot construction.  
**Avoidance:** Keep public command identity/step metadata separate from private launch-time effective environment and secret resolution.

## Code Examples

### Strict discovery result

```ts
type ShellDiagnostic = {
  category: "discovery" | "validation" | "initialization" | "execution" | "cancellation" | "cleanup"
  shell: string
  mode: "command" | "pty"
  stage: string
  message: string
  recovery: string
}

function discoverUserShell(environment: NodeJS.ProcessEnv): Result<ValidatedShell, ShellDiagnostic> {
  const requested = environment.SHELL
  // Require absolute path, regular executable, and a recognized canonical basename.
  // Never substitute /bin/sh.
}
```

This reflects the accepted contract rather than Node's default shell behavior. Node's generic shell option otherwise defaults to `/bin/sh` on Unix. [CITED: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options]

### Independent command steps

```ts
for (const step of planManualCommand(workspace, commandName, config)) {
  const overlay = await buildLaunchEnvironment(workspace, step.repo, { triggeredBy, refresh })
  const result = await runInitializedUserCommand({
    command: step.shell,
    cwd: step.cwd,
    overlay,
    signal,
  })
  if (result.exitCode !== 0) return failure(step, result)
}
```

The command remains `step.shell` exactly; no multi-step wrapper is generated. [VERIFIED: CONTEXT.md]

### Local-only refresh authorization

```ts
if (method === "environment.refresh") {
  if (context.mode !== "tui" || context.relayed === true) {
    throw forbidden("Dynamic environment refresh requires a same-user local launcher")
  }
  return dynamicEnvironment.replace(DynamicEnvironmentRefreshSchema.parse(body))
}
```

The actual context fields should follow existing secure-router types; the important invariant is positive local-mode admission and explicit browser/remote rejection. [VERIFIED: CONTEXT.md]

## State of the Art

| Old approach in this repo | Phase 124 approach | Impact |
|---------------------------|--------------------|--------|
| POSIX `/bin/sh` for user-authored text | Validated Bash/zsh/fish named adapter | Shell-specific developer environment becomes intentional and diagnosable. |
| Service-start environment frozen indefinitely | Authenticated volatile allowlist replacement | New launches see rotated agents/runtime paths without restart. |
| Environment inherited before startup | Typed authority layers applied after startup | Workspace/repo/port/secret/`GS_*` values win deterministically. |
| Generated multi-step shell source | Independent adapter execution for each step | Preserves exact command, cwd, failure, and cancellation boundaries. |
| Generic spawn/PTY errors | Category + shell + mode + stage + recovery | Missing/unsupported/broken shells become actionable. |

## Environment Availability

| Dependency | Required By | Available Locally | Version | Fallback |
|------------|-------------|-------------------|---------|----------|
| Node.js | Core/service execution | Yes | v26.5.0 | Project gate also targets Node 24 LTS. |
| npm | Builds/tests | Yes | 11.17.0 | None needed. |
| Bash | Local adapter fixture | Yes | 5.3.9 | Hosted macOS Bash remains mandatory. |
| fish | Local adapter fixture | Yes | 4.6.0 | Hosted matrix covers supported hosts. |
| zsh | Local adapter fixture | No | — | Capability-gate locally; hosted Linux/macOS matrix must cover it. |
| `ssh-add` | SSH-agent discovery fixture | Yes | OpenSSH client present; `--version` is unsupported | Use behavior/exit-status probes against an isolated fixture agent. |
| Git | Existing full gates | Yes | 2.55.0 | None needed. |

Local availability was probed on 2026-07-16. [VERIFIED: `command -v` and version probes]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, Node built-in test runner, existing TUI harness |
| Config | Existing root workspace scripts and test aliases |
| Quick run | `npx vitest run tests/lib/user-shell.test.ts tests/lib/workspace-env.test.ts tests/lib/workspace-command.test.ts tests/lib/service/launch-context.test.ts tests/service/managed-service-process.test.ts tests/service/web-projection.test.ts` |
| Full phase gate | `npm run typecheck && npm run test:deps && npm run tui:build && npm test` |

### Requirements to Test Map

| Req | Behavior | Test type | Automated command/file | Exists? |
|-----|----------|-----------|------------------------|---------|
| SHELL-01 | One discovery/adapter contract drives hook, CLI, service command, and PTY plans | Unit + architecture | New `tests/lib/user-shell.test.ts`; architecture scan forbids scoped `/bin/sh` seams | Wave 0 gap |
| SHELL-02 | Bash/zsh/fish interactive-login startup exposes runtime, alias, function | Real subprocess fixture | New `tests/lib/user-shell-fixture.test.ts`; capability-aware per shell | Wave 0 gap |
| SHELL-03 | Exact multiline/quoted command is one argv argument; no `commandSequence()` | Unit + integration | New adapter argv assertions; update `launch-context.test.ts` and `snapshot.test.ts` | Partial existing |
| SHELL-04 | Post-init global/workspace/repo/port/secret/GS precedence | Unit + real fixture | Extend `workspace-env.test.ts`, `lifecycle-files-env-config-real-fixture.test.ts` | Partial existing |
| SHELL-05 | Replace/clear refresh; local only; non-disclosure | Service policy/router/projection | Extend `managed-service-process.test.ts`, secure runtime tests, `web-projection.test.ts` | Wave 0 gap |
| SHELL-06 | Rotated socket and nvm-style executable work for new PTY/non-PTY only | Integration | New service shell environment fixture plus PTY factory/actual-host coverage | Wave 0 gap |
| SHELL-07 | Typed discovery/validation/init timeout diagnostics and TERM/KILL cleanup | Unit + real subprocess | New diagnostic/process-group tests; extend `web-terminal.test.ts` | Wave 0 gap |

### Existing Tests to Preserve or Rewrite

- Rewrite exact `/bin/sh` assertions in `tests/lib/workspace-lifecycle.test.ts`, `tests/lib/service/launch-context.test.ts`, and `tests/lib/service/snapshot.test.ts`. [VERIFIED: current tests]
- Replace the local duplicate lifecycle implementations in `tests/lib/lifecycle.test.ts` with tests of production exports. [VERIFIED: current test]
- Extend `tests/commands/run-parallel.test.ts` and `tests/commands/workspace-execution-context.test.ts` for adapter parity and clean JSON output. [VERIFIED: current test inventory]
- Preserve PTY admission, TERM/KILL, exit-confirmation, retry, and reconnect assertions in `tests/service/web-terminal.test.ts`. [VERIFIED: current test]
- Preserve and strengthen the positive browser allowlist in `tests/service/web-projection.test.ts`. [VERIFIED: current test]
- Extend `tests/tui/dashboard/managed-service-bootstrap.test.ts` for trusted refresh before handoff. [VERIFIED: current test inventory]
- Add hosted Linux/macOS matrix jobs that install/probe all supported shells and fail if any adapter is uncovered. [VERIFIED: CONTEXT.md]

### Sampling Rate

- **Per task commit:** focused adapter/environment/service tests under 30 seconds where possible.
- **Per wave merge:** all package typechecks, `test:deps`, relevant Vitest/Node/TUI suites.
- **Phase gate:** `npm test`, `npm run typecheck`, `npm run test:deps`, `npm run web:build`, `npm run tui:build`, plus hosted Linux/macOS shell matrix.

### Wave 0 Gaps

- [ ] `tests/lib/user-shell.test.ts` — discovery, validation, argv plans, diagnostics.
- [ ] `tests/lib/user-shell-fixture.test.ts` — isolated HOME Bash/zsh/fish startup and command fidelity.
- [ ] `tests/service/dynamic-environment.test.ts` — refresh replace/clear, authorization, limits, redaction.
- [ ] `tests/service/user-shell-launch.test.ts` — launch-time secret/dynamic environment and PTY/non-PTY parity.
- [ ] Hosted shell matrix setup for Linux/macOS with all three supported shells.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes | Reuse authenticated same-user local carrier; discovery alone cannot refresh. |
| V3 Session Management | Yes | Refresh applies to the authenticated local helper instance and is never replayed automatically across carrier loss. |
| V4 Access Control | Yes | Positive client-mode check: local launcher allowed; browser and remote/relayed clients denied. |
| V5 Input Validation | Yes | Strict Zod allowlist, bounded strings, control/NUL rejection, absolute executable validation. |
| V6 Cryptography | No new primitive | Reuse current pinned TLS/local authentication; do not add crypto. |

### Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Browser submits or reads raw host environment | Information Disclosure / Elevation | No browser schema/scope; explicit router rejection; positive web projection; negative encoded-payload tests. |
| Remote target receives local `SSH_AUTH_SOCK` | Information Disclosure / Tampering | Refresh terminates at local helper and is rejected after relay/target switch. |
| Oversized/malformed `PATH` exhausts service or changes parsing | Denial of Service / Tampering | Strict maximum byte/string bounds and NUL/control rejection. |
| Startup asset exposes secrets/command | Information Disclosure | Fixed bootstrap contains no values; private control channel; mode-0600 temporary assets; cleanup on every exit path. |
| Workspace env spoofs reserved `GS_*` identity | Spoofing | Reserve or overwrite `GS_*` as the final layer. |
| Cancellation leaves descendants running | Denial of Service | Dedicated process group, TERM/grace/KILL, confirmed cleanup diagnostic. |
| Unsupported executable masquerades by basename | Spoofing / Execution | Resolve/canonicalize executable and select a named adapter only after validation; test symlink policy explicitly. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Suggested file split and refresh size limits are suitable starting points. | Project structure / refresh pattern | Planner may choose different names/limits while preserving contracts. |
| A2 | Exact system Bash versions differ across hosted macOS images. | Pitfalls | Hosted probe must establish the actual version and keep bootstrap syntax compatible. |

No product decision depends on these assumptions; both are explicitly within implementation discretion.

## Open Questions

1. **Which private initialization-readiness mechanism best fits both child-process and node-pty launchers?**
   - What is locked: 10-second initialization-only timeout, separate diagnostics, no command/value interpolation, and cleanup on every path.
   - What remains discretionary: extra file descriptor, protected temporary marker, or an adapter-specific private control mechanism.
   - Recommendation: prototype the mechanism in Wave 0 against real Bash and fish locally, then zsh in hosted CI, before migrating lifecycle call sites.

2. **How should canonical executable identity treat symlinks?**
   - What is locked: absolute, executable, supported Bash/zsh/fish only.
   - Recommendation: allow an absolute symlink only when its resolved executable identifies a supported shell; retain both requested and resolved paths in diagnostics.

Neither question requires user input; both are engineering choices inside the accepted discretion boundary.

## Sources

### Primary (HIGH confidence)

- [GNU Bash startup files](https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html) — login, interactive, noninteractive, and `sh` startup behavior.
- [GNU Bash invocation](https://www.gnu.org/software/bash/manual/html_node/Invoking-Bash.html) — `-c`, `-i`, `-l`, argument assignment, and shell modes.
- [zsh startup/shutdown files](https://zsh.sourceforge.io/Doc/Release/Files.html) — `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin` order.
- [zsh invocation](https://zsh.sourceforge.io/Doc/Release/Invocation.html) — `-c`, `-i`, remaining arguments, and compatibility mode.
- [fish invocation](https://fishshell.com/docs/current/cmds/fish.html) — `-c`, `-C`, `-i`, `-l`, and `$argv` behavior.
- [fish configuration files](https://fishshell.com/docs/current/language.html#configuration-files) — configuration order and interactive/login conditionals.
- [Node child process documentation](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) — argv spawn, environment defaults, shell default, AbortSignal, and process lifecycle.
- [Node detached process groups](https://nodejs.org/api/child_process.html#optionsdetached) — POSIX process group/session behavior.
- [Node OS user information](https://nodejs.org/api/os.html#osuserinfooptions) — POSIX account shell data; consulted but not selected as fallback due to locked context.
- Current repository source and tests named throughout this document.

### Secondary

- None required. All platform semantics were checked against official manuals and all repository claims against current source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing dependencies and Node built-ins only.
- Architecture: HIGH — follows locked context and current package ownership.
- Shell semantics: HIGH — official Bash/zsh/fish manuals.
- Pitfalls: HIGH for current code/startup behavior; MEDIUM for the exact readiness implementation until Wave 0 prototype.

**Research date:** 2026-07-16  
**Valid until:** 2026-08-15 for implementation planning; re-check hosted shell and Node versions during release-candidate validation.
