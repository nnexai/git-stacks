---
phase: 124
slug: user-shell-and-environment-authority
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
---

# Phase 124 — Validation Strategy

> Adversarial validation contract for user-shell fidelity, volatile environment refresh, process cleanup, and browser non-disclosure.

The acceptance boundary is observable behavior, not the presence of a shell abstraction. A green phase must prove that profile-only aliases/functions/runtime paths work unchanged, overlays win after initialization, exact command bytes survive as one argument, trusted refresh is volatile and new-process-only, and unsupported/broken initialization fails explicitly. Internal argv-based Git/filesystem/security execution is outside this contract and must remain deterministic.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.10 for core/service/protocol/CLI integration; Bun 1.3.14 for TUI bootstrap; Node test runner for built service/runtime conformance |
| **Config** | `vitest.config.ts`, `packages/tui/bunfig.toml`, `scripts/test-tui.mjs`, `.github/workflows/node-runtime-matrix.yml` |
| **Focused unit command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/user-shell-adapter.test.ts tests/lib/lifecycle.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/workspace-command.test.ts tests/lib/service/launch-context.test.ts tests/lib/service/snapshot.test.ts` |
| **Focused integration command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/commands/user-shell-host-fixture.test.ts tests/commands/run-parallel.test.ts tests/commands/workspace-execution-context.test.ts tests/service/managed-service-process.test.ts tests/service/web-terminal.test.ts tests/service/web-projection.test.ts` |
| **TUI command** | `bun test --preload @opentui/solid/preload tests/tui/dashboard/managed-service-bootstrap.test.ts` |
| **Hosted all-shell command** | `GIT_STACKS_REQUIRE_SHELLS=bash,zsh,fish GIT_STACKS_REQUIRE_SSH_AGENT=1 GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/commands/user-shell-host-fixture.test.ts tests/service/managed-service-process.test.ts tests/service/web-terminal.test.ts` |
| **Full gate** | `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` |
| **Watch mode** | Forbidden in all automated verification |

### Current Planning-Host Capability Probe

This probe is inventory only; it is not implementation evidence.

| Host | Bash | zsh | fish | Consequence |
|---|---|---|---|---|
| Fedora Linux `x86_64`, kernel `7.1.3-200.fc44.x86_64` | `/usr/bin/bash`, 5.3.9 | unavailable | `/usr/bin/fish`, 4.6.0 | Local RED/GREEN iteration may capability-skip zsh with an explicit skip reason. It may not claim zsh coverage. Hosted jobs must install/require all three. |

---

## Sampling Rate

- **After each adapter or contract task:** run the focused unit command and the affected package typecheck.
- **After each core/service integration task:** run the focused integration command plus `npm run test:deps`.
- **After local-launcher/TUI changes:** run the TUI command and `tests/service/managed-service-process.test.ts` together.
- **After each plan wave:** run every Phase 124 focused command; no three consecutive tasks may rely only on typecheck/static inspection.
- **Before phase verification:** the full gate and both hosted OS jobs must be green, with every supported shell executed rather than skipped.
- **Maximum focused feedback target:** 120 seconds; real SSH-agent/process-tree fixture may run separately but must remain under the test runner timeout.

---

## Requirement-to-Test Map

| Requirement | Required observable behavior | Primary automated test | Test type | RED condition | GREEN evidence |
|---|---|---|---|---|---|
| **SHELL-01** | Configured commands, lifecycle hooks, CLI command/shell paths, and service PTYs all select one validated Bash/zsh/fish adapter; no independent user-command `/bin/sh` rule remains. | `tests/lib/user-shell-adapter.test.ts`; extend `tests/lib/lifecycle.test.ts`, `tests/lib/workspace-lifecycle.test.ts`, `tests/lib/workspace-command.test.ts`, `tests/lib/service/snapshot.test.ts`, `tests/commands/workspace-execution-context.test.ts` | unit + integration | Any user-authored path emits `/bin/sh`, bypasses the adapter, or chooses a different adapter mode. | Injected launch capture proves every call site delegates to the same adapter and preserves distinct one-shot vs interactive-PTY modes. |
| **SHELL-02** | Normal interactive-login initialization exposes profile-only alias, function, nvm-style runtime path, and dynamic PATH for Bash, zsh, and fish. | New `tests/commands/user-shell-host-fixture.test.ts` with isolated per-shell homes/fixtures | hosted integration | Marker command succeeds from inherited test PATH, a generated wrapper, or only one shell; profile-only alias/function/runtime is unavailable. | Each required shell executes all three profile-only constructs from its normal startup files with an intentionally minimal inherited PATH. |
| **SHELL-03** | Original command is one unchanged shell command argument; quotes, dollars, backslashes, newlines, substitutions, and metacharacters gain no generated interpolation layer. | `tests/lib/user-shell-adapter.test.ts`; host fixture exact-command case | unit + hosted integration | Spawn capture shows concatenated/generated shell source, or sentinel output differs from the original command's direct shell semantics. | Adapter argv contains a fixed bootstrap plus exactly one command argument; byte-sensitive fixture output and exit status match a direct control invocation for each shell. |
| **SHELL-04** | Initialization runs first, then global/workspace/repository/port/secret overlays, then reserved `GS_*`; later authority wins. | Extend `tests/lib/lifecycle-files-env-config-real-fixture.test.ts`, `tests/lib/service/launch-context.test.ts`, `tests/lib/service/snapshot.test.ts`, host fixture overlay-conflict case | unit + integration | Profile values overwrite authoritative overlays, process inheritance wins, reserved values can be spoofed, or secrets resolve before launch. | Conflicting values in startup files/inherited env are replaced in the exact required order; launch-time secret and redaction assertions remain intact. |
| **SHELL-05** | Same-user local CLI/TUI launchers replace the entire volatile `PATH`/`SSH_AUTH_SOCK` allowlist; omission clears stale values; browser/remote cannot submit or receive raw values; values are absent from YAML, revisions, URLs, logs, and snapshots. | Extend `tests/lib/service/launch-context.test.ts`, `tests/service/managed-service-process.test.ts`, `tests/tui/dashboard/managed-service-bootstrap.test.ts`, `tests/service/web-projection.test.ts`, protocol conformance | contract + service integration + security | Refresh merges rather than replaces, stale omitted socket survives, browser request is accepted, or a unique raw sentinel appears in any serialized/persisted/browser surface. | Trusted local refresh changes only volatile launch context; omission deletes prior values; hostile browser/remote calls fail; encoded projections/store/log captures contain no sentinel. |
| **SHELL-06** | New PTY and non-PTY launches see rotated SSH agent/socket and nvm-style runtime without service restart; existing processes retain their original environment. | Host fixture using two real `ssh-agent` instances; extend `tests/service/managed-service-process.test.ts`, `tests/service/web-terminal.test.ts`, `tests/commands/workspace-execution-context.test.ts` | live service integration | Test only inspects launch plans, reuses one agent, restarts the service, mutates an existing process environment, or never invokes `ssh-add`. | A long-lived service launches before/after processes: old process reports agent A, refresh replaces with agent B, new PTY and non-PTY `ssh-add -l` report B, old process still reports A; profile-installed runtime executes without restart. |
| **SHELL-07** | Missing, relative/non-executable, unsupported, broken, or timed-out shell initialization fails without fallback and reports shell, invocation mode, initialization stage, category, and safe recovery. | `tests/lib/user-shell-adapter.test.ts`; host fixture failure cases; extend `tests/service/web-terminal.test.ts` | unit + integration | Any case launches `/bin/sh`, loses diagnostic fields, mixes initialization diagnostics into command output, or lets initialization exceed 10 seconds. | Typed assertions cover discovery, validation, initialization, execution, cancellation, and cleanup; 10-second init timeout is bounded with fake clock/unit seam and live smoke, while user command has no new runtime timeout. |

### Cross-Requirement Execution Fidelity

These are locked Context decisions and block sign-off even when a single requirement row appears green.

| Contract | Automated evidence | Failure that must be caught |
|---|---|---|
| Pre/main/post and repository steps execute separately with original cwd/env and stop at first failure. | Extend `tests/lib/workspace-command.test.ts`, `tests/lib/lifecycle.test.ts`, `tests/lib/workspace-lifecycle.test.ts`. | Concatenated generated source; later step runs after non-zero exit; cwd/env leaks between steps. |
| Non-PTY commands own a process group and cancel TERM → bounded grace → KILL. | Extend `tests/commands/run-parallel.test.ts` and add process-tree fixture to `user-shell-host-fixture.test.ts`. | Parent exits while child survives; KILL sent without TERM; cleanup reported before actual exit. |
| One-shot diagnostics are separate from stdout/stderr and suppress prompts/greetings/job-control/control sequences. | Host fixture captures three channels/records separately for each shell. | Startup banner or ANSI/control bytes pollute command stdout; diagnostic text is mistaken for user output. |
| Interactive PTYs retain normal shell startup presentation. | Extend `tests/service/web-terminal.test.ts` with a real shell-profile marker and terminal frame assertion. | One-shot suppression flags accidentally disable normal interactive profile output. |
| Agent wrapper PATH uses the effective refreshed PATH. | Extend `tests/lib/service/launch-context.test.ts` and PTY fixture. | Wrapper lookup uses service-start PATH while command env shows refreshed PATH. |
| Internal Git/filesystem/security/process-control commands remain argv-based/deterministic. | Architecture/static gate plus existing command/service tests. | Broad refactor routes `git`, cleanup, security, packaging, or kill helpers through user shell/profile initialization. |

---

## RED → GREEN Wave Order

Wave numbers are validation dependencies; the planner may split implementation plans further but must preserve this order.

| Validation Wave | RED first | GREEN implementation evidence | Exit gate |
|---:|---|---|---|
| **0 — Sentinels and fixtures** | Add `user-shell-adapter.test.ts`, `user-shell-host-fixture.test.ts`, protocol/refresh denial assertions, and explicit `PHASE124_RED` sentinels to affected suites. Confirm failures represent missing behavior, not fixture/import errors. | None; implementation remains unchanged. | Every requirement has at least one genuinely failing behavioral assertion and an executable command. |
| **1 — Adapter contract** | Discovery/validation, per-shell argv/mode, exact one-argument command, init timeout, typed diagnostic cases fail. | Shared core adapter makes unit cases green without touching call sites. | SHELL-01/03/07 adapter unit set green; no fallback accepted. |
| **2 — Core command/hook fidelity** | Lifecycle/workspace-command/CLI tests fail on hard-coded `/bin/sh`, concatenated steps, precedence, and process-tree cleanup. | User-authored call sites delegate; separate steps, cwd/env, non-zero stop, TERM/KILL cleanup pass. | Focused core/CLI suite green; static user-shell scan has only documented deterministic exceptions. |
| **3 — Volatile local refresh authority** | Local refresh replacement/clear, same-user scope, remote/browser denial, non-disclosure, and new-process-only cases fail. | Strict bounded protocol/router/client context and volatile service memory make cases green. | SHELL-04/05 contract and security tests green; raw sentinels absent from serialized/persisted outputs. |
| **4 — PTY and live service integration** | PTY shell mode, refreshed PATH/socket, wrapper PATH, existing-process retention, startup diagnostics, and cancellation fixtures fail. | Snapshot launch resolution and terminal manager consume shared adapter/effective launch context. | Service/PTY/managed-service/TUI bootstrap focused commands green. |
| **5 — Hosted shells and host parity** | Required-shell mode intentionally fails when any shell or fixture is skipped. | CI installs/verifies Bash/zsh/fish and runs real profile/SSH/process-tree fixtures on Linux and macOS. | Every shell × host required cell emits a green evidence record; zero skips. |
| **6 — Full regression and closure** | Run architecture/full gates to catch internal-process scope creep and package drift. | Repair tests/implementation within plan scope only. | `npm test`, typecheck, dependency, architecture, and verify gates green; validation receipt attached to phase summary. |

### Wave 0 Required Files

- [ ] `tests/lib/user-shell-adapter.test.ts` — discovery, validation, adapter argv, exact command argument, modes, diagnostics, 10-second initialization timeout.
- [ ] `tests/commands/user-shell-host-fixture.test.ts` — real Bash/zsh/fish startup, alias/function/nvm-style path, exact quoting, overlays, SSH rotation, cancellation/process tree, channel cleanliness.
- [ ] `tests/fixtures/user-shell/` — isolated startup templates and marker executables; no dependency on the developer's real home/profile.
- [ ] Extend `tests/lib/lifecycle.test.ts`, `tests/lib/workspace-lifecycle.test.ts`, `tests/lib/workspace-command.test.ts` — shared adapter delegation, separate steps, stop-first-failure, cwd/env, process ownership.
- [ ] Extend `tests/lib/lifecycle-files-env-config-real-fixture.test.ts` and `tests/lib/service/launch-context.test.ts` — post-init overlay precedence, refreshed PATH/socket replacement and clear, wrapper PATH, launch-time secrets.
- [ ] Extend `tests/lib/service/snapshot.test.ts` — PTY/command launch plan uses shared adapter and effective refreshed environment without exposing it in revision inputs.
- [ ] Extend `tests/service/managed-service-process.test.ts` and `tests/tui/dashboard/managed-service-bootstrap.test.ts` — trusted local pre-handoff refresh, volatile service behavior, no restart.
- [ ] Extend `tests/service/web-terminal.test.ts` — real interactive-login shell, refreshed SSH/PATH, init failure, actual process-group cleanup.
- [ ] Extend `tests/service/web-projection.test.ts` plus protocol conformance — browser cannot submit/receive refresh and raw sentinels are absent.
- [ ] Extend `tests/commands/run-parallel.test.ts` and `tests/commands/workspace-execution-context.test.ts` — TERM/KILL tree cleanup and CLI command/shell integration.
- [ ] Add/update hosted workflow coverage so `GIT_STACKS_REQUIRE_SHELLS=bash,zsh,fish` cannot capability-skip any supported shell.

No new JavaScript test framework is required.

---

## Shell / Host Matrix

### Invocation Modes Required Per Shell

| Shell | Discovery identity | One-shot configured command/hook mode | Interactive PTY mode | Fixture startup sources | Mandatory assertions |
|---|---|---|---|---|---|
| Bash | Valid absolute executable from `SHELL` | Adapter-defined interactive-login initialization with unchanged command as one argument | Interactive login shell | isolated `HOME` with `.bash_profile`/`.bashrc` arranged per adapter contract | alias, function, profile PATH runtime, exact quoting, clean one-shot channels, PTY startup marker |
| zsh | Valid absolute executable from `SHELL` | Same semantic contract through zsh adapter | Interactive login shell | isolated `ZDOTDIR`/`HOME` with `.zprofile`/`.zshrc` | same assertions; no inference from Bash behavior |
| fish | Valid absolute executable from `SHELL` | Same semantic contract through fish adapter | Interactive login shell | isolated `XDG_CONFIG_HOME`/`HOME` with `fish/config.fish` or adapter-selected normal source | same assertions; command remains one argument despite fish syntax differences |

The validation file deliberately does not prescribe the exact fixed bootstrap argv; that is implementation discretion. Tests must assert the externally locked initialization and command-integrity contract.

### Hosted Coverage

| Runner | Bash | zsh | fish | SSH agent | Policy |
|---|---:|---:|---:|---:|---|
| `ubuntu-24.04` | required | required (install if absent) | required (install if absent) | required | Any missing executable, `ssh-agent`, `ssh-add`, or `ssh-keygen` fails setup; no test skip. |
| `macos-15` | required | required | required (install if absent) | required | Same fail-closed policy; test both native macOS shell startup behavior and service process semantics. |
| Optional local developer host | capability-gated | capability-gated | capability-gated | capability-gated | Missing capability prints an explicit skip record. Local green is provisional until hosted required cells pass. |

The existing `.github/workflows/node-runtime-matrix.yml` already runs Linux/macOS package tests but does not guarantee Bash/zsh/fish fixture coverage. Phase 124 must add a required shell-host job or required steps that install/verify shells and execute the hosted all-shell command. Architecture/package-only jobs cannot satisfy this matrix.

### Matrix Evidence Receipt

Each hosted cell must publish or print a machine-readable summary containing:

```text
host_os=<linux|macos>
host_arch=<arch>
shell=<bash|zsh|fish>
shell_path=<absolute path>
shell_version=<version>
profile_alias=pass
profile_function=pass
profile_runtime_path=pass
exact_command_argument=pass
overlay_precedence=pass
ssh_agent_rotation=pass
process_tree_cleanup=pass
one_shot_channels_clean=pass
interactive_pty=pass
```

Missing fields, `skip`, or inferred values fail the hosted gate.

---

## Integration and Live Fixture Evidence

### Isolated Shell-Home Fixture

For every shell, create a temporary home/config root and a private `profile-bin` directory not present in the test runner's inherited PATH. Startup files must:

1. prepend `profile-bin` to PATH;
2. define an alias available only after initialization;
3. define a function available only after initialization;
4. define conflicting `PATH`, `SSH_AUTH_SOCK`, workspace/repository/port, and spoofed `GS_*` values;
5. emit a distinctive interactive-only PTY marker while keeping one-shot stdout/stderr clean.

The fixture command invokes alias/function/runtime markers by name, never by absolute path. A control assertion must prove the same command fails when initialization is disabled; otherwise the test could pass from inherited host state.

### Exact-Command Fixture

Use an unchanged command containing spaces, single/double quotes, literal dollar signs, command substitution text, backslashes, Unicode, newline separation, semicolons, and an explicit non-zero branch. Compare adapter output/exit code with a direct invocation using the same shell's accepted single-command argument. Do not compare against `/bin/sh` semantics across different shells.

### SSH-Agent Rotation Fixture

1. Start isolated agent A and add ephemeral key A.
2. Start the long-lived local service with an intentionally stale/empty launcher context.
3. Trusted local refresh A; launch one long-running non-PTY observer and one PTY; prove `ssh-add -l` sees key A.
4. Start agent B, add distinct key B, kill or invalidate A, and refresh with B without restarting the service.
5. Launch new PTY and non-PTY commands; both must see key B through `ssh-add -l`.
6. The already-running observer must retain its original environment; it must not appear to mutate to B.
7. Submit a refresh omitting `SSH_AUTH_SOCK`; the next launch must have the stale value cleared and return a typed discovery/execution failure rather than reuse B.
8. Stop agents and remove keys/sockets in fixture cleanup even after assertion failure.

### Process-Tree Fixture

The one-shot command starts a child/grandchild that writes PIDs to a private fixture file and ignores TERM in the escalation case. Cancellation must show TERM first, bounded grace, then KILL, wait for actual exits, and report cancellation/cleanup separately. After the command returns, all recorded PIDs must be absent. A second case exits during TERM grace and must prove KILL was not sent.

### Browser Non-Disclosure Fixture

Use unmistakable raw sentinels for refreshed PATH and socket. Exercise snapshot, operation, error, signal, event, browser protocol, service descriptor/URL, logs captured by the test harness, revision digest inputs, and workspace YAML. Assert neither raw sentinel nor a reversible embedding appears. Also submit the refresh shape from browser and remote modes and require strict rejection before mutation.

### Evidence Status

| Evidence | Status at planning | Blocking condition |
|---|---|---|
| Local Bash/fish capability inventory | observed, not a behavioral pass | Implementation and fixtures not yet executed. |
| Local zsh behavior | unverified | zsh unavailable on planning host; hosted required cell must close it. |
| Linux hosted all-shell fixture | pending | Required workflow/job and green receipt absent. |
| macOS hosted all-shell fixture | pending | Required workflow/job and green receipt absent. |
| Live SSH rotation through service + PTY + non-PTY | pending | Real two-agent fixture not yet run. |
| Browser non-disclosure | pending | Raw sentinel contract assertions not yet run. |

No pending item may be reported as green from unit launch-plan assertions alone.

---

## Anti-False-Positive Gates

| Gate | Guardrail | Required proof |
|---|---|---|
| **AF-124-01 Profile dependence** | Prevent inherited PATH/home from making the test pass. | Minimal inherited env; profile-bin absent before launch; control invocation without initialization fails. |
| **AF-124-02 Actual shell identity** | Prevent one adapter or `/bin/sh` from masquerading as all shells. | Command prints shell-specific identity/version and fixture receipt records the validated absolute executable. |
| **AF-124-03 One command argument** | Prevent generated/interpolated wrapper source. | Injected spawn captures argv boundaries; hostile quoting fixture matches direct same-shell control. |
| **AF-124-04 Separate steps** | Prevent pre/main/post concatenation. | Per-step spawn count/cwd/env captured; a failing middle step proves later step never starts. |
| **AF-124-05 Initialization vs execution timeout** | Prevent accidental runtime timeout. | Fake-clock init case stops at 10 seconds; a user command exceeding 10 seconds continues until explicit cancellation. |
| **AF-124-06 Overlay conflict** | Prevent a happy-path test with no competing values. | Startup and inherited env deliberately spoof every tested overlay and reserved key; authoritative post-init value wins. |
| **AF-124-07 Replace-and-clear refresh** | Prevent merge-only semantics. | Refresh A → refresh B omitting a field → next launch lacks A; volatile map inspection is not sufficient without process evidence. |
| **AF-124-08 New-process-only** | Prevent global mutable environment illusion. | Concurrent pre-refresh observer retains A while post-refresh PTY/non-PTY observe B. |
| **AF-124-09 Real SSH discovery** | Prevent checking only `SSH_AUTH_SOCK` text. | Real `ssh-add -l` reports distinct ephemeral fingerprints through PTY and non-PTY launches. |
| **AF-124-10 Actual PTY** | Prevent snapshot argv tests from claiming terminal behavior. | `node-pty` session emits profile marker, accepts input, and exits/cleans up under the selected shell. |
| **AF-124-11 Process-tree absence** | Prevent parent-only cancellation. | Recorded child/grandchild PIDs no longer exist after cleanup; TERM-only and TERM→KILL cases both covered. |
| **AF-124-12 Channel separation** | Prevent filtered string assertions hiding startup noise. | Capture raw stdout, stderr, and diagnostic record separately; reject prompts, greetings, job-control warnings, and control sequences in one-shot streams. |
| **AF-124-13 Browser/remote denial** | Prevent projection-only non-disclosure from overlooking mutation access. | Browser and remote refresh requests fail strict scope/schema checks and produce no volatile-state change. |
| **AF-124-14 Persistence/log scan** | Prevent raw values leaking outside the direct response. | Search captured YAML, operation/event stores, descriptor/URL, logs, snapshots, revisions, and encoded browser payloads for unique sentinels. |
| **AF-124-15 Required hosted shells** | Prevent capability skips from satisfying support claims. | Hosted env sets `GIT_STACKS_REQUIRE_SHELLS`; missing shell or any skip fails. |
| **AF-124-16 Internal process scope** | Prevent user-shell refactor from altering deterministic internals. | Static allowlist plus regression tests show Git/filesystem/security/package/process-control launches remain argv-based. |

---

## Failure Classification and Escalation

| Failure class | Expected behavior | Test oracle |
|---|---|---|
| Discovery | Missing/relative/empty `SHELL` | Typed failure names supplied value, mode, discovery stage, and safe recovery; no spawn. |
| Validation | Absolute path missing, non-executable, or unsupported executable identity | Typed validation failure; no `/bin/sh` fallback. |
| Initialization | Broken startup file or 10-second timeout | Initialization diagnostic separated from stdout/stderr, includes shell/mode/stage/recovery; command never runs. |
| Execution | User command non-zero or spawn failure after successful init | Original exit/failure preserved with shell/mode; later planned steps do not run. |
| Cancellation | Explicit cancellation during command | TERM then bounded grace; KILL only if needed; classified cancellation, not initialization failure. |
| Cleanup | Process group or temporary bootstrap cleanup cannot be confirmed | Typed cleanup failure retains shell/mode and surviving resource evidence. |

An assertion showing implementation behavior violates the locked contract is a **BLOCKER**, not a test expectation to weaken. Environment-only failures in the required hosted matrix are also blockers. Local capability skips are warnings until the hosted matrix resolves them.

---

## Validation Sign-Off

- [ ] Every SHELL-01..07 row has at least one RED behavioral test before implementation.
- [ ] RED failures are behavioral, not missing-import/fixture syntax failures.
- [ ] Every supported shell executes required fixtures on Linux and macOS with zero hosted skips.
- [ ] Real alias, function, nvm-style PATH, two-agent rotation, PTY, non-PTY, and process-tree cases are green.
- [ ] Exact command argument and separate-step assertions are green.
- [ ] Browser/remote denial and persistence/log non-disclosure sentinels are green.
- [ ] Initialization timeout is bounded while user commands have no new runtime timeout.
- [ ] Internal deterministic process paths remain outside user-shell initialization.
- [ ] Focused, TUI, Node/conformance, full, type, dependency, architecture, and verify gates are green.
- [ ] Hosted matrix receipts are attached to the phase summary before verification.
- [ ] No manual-only claim substitutes for an automatable shell/service behavior.

**Approval:** validation strategy is plan-ready; all behavioral evidence remains pending implementation and RED/GREEN execution.
