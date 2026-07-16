---
phase: 124-user-shell-and-environment-authority
verified: 2026-07-16T14:06:47Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Actual zero-skip Linux and macOS hosted shell receipts are attached before tagging."
    addressed_in: "Phase 127"
    evidence: "Phase 127 success criteria require hosted gates and supported-host shell/SSH UAT before RC tagging; Phase 124 implements and architecture-tests the fail-on-skip jobs and receipt schema only."
---

# Phase 124: User Shell and Environment Authority Verification Report

**Phase Goal:** Make configured commands, hooks, and PTYs behave like the developer's initialized shell while keeping service and browser trust boundaries explicit.
**Verified:** 2026-07-16T14:06:47Z
**Status:** passed
**Re-verification:** No - initial goal verification after the final repair and code-review cycle
**Verified revision:** `5ffa69fadf3dfc17a190f8c65a623792675cc9e2`

## Goal Achievement

The five roadmap success criteria and the seven SHELL requirements were merged into twelve observable truths. Plan-specific truths add detail to these same contracts; none reduces the roadmap scope.

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | One Bash/zsh/fish authority plans configured commands, hooks, CLI runs, and PTYs without a user-command `/bin/sh` fallback. | VERIFIED | `packages/core/src/user-shell.ts:165-276` validates an absolute executable and emits family-specific command/PTY plans. Lifecycle, CLI, snapshot, and terminal-manager consumers import this authority. Focused adapter/lifecycle/workspace/service tests passed. |
| 2 | Normal initialized-shell aliases, functions, and nvm-style runtime paths execute without changing the configured command. | VERIFIED | The real-host fixture passed Bash and fish profile, alias, function, runtime-PATH, PTY, quoting, and exit cases; local zsh is an explicit capability skip. Required zsh execution is fail-closed in the hosted job and its actual receipt is a Phase 127 pre-tag gate. |
| 3 | One-shot configured commands preserve the original command as one argv item with no extra quoting layer; command PTYs preserve the unchanged parser batch while retaining input and resize. | VERIFIED | `packages/core/src/user-shell.ts:263-276` places `paths.command` in one argv slot. `tests/lib/user-shell-adapter.test.ts` verifies exact argv transport; real-host and web-terminal tests verify quoting, alias/function use, interactive input, resize, and exact exit status. |
| 4 | Trusted refresh, shell initialization, configured overlays/secrets, and reserved identities have deterministic authority, with later authoritative layers winning. | VERIFIED | `composeWorkspaceEnvironment` applies ordered layers, non-PTY bootstrap exports the serialized post-init overlay, and `resolveTerminalLaunch` rebuilds `currentEnvironment` with `skipSecrets: false` at launch (`packages/service/src/policy/snapshot.ts:429-484`). Overlay and launch-context tests passed. |
| 5 | Same-user local launchers replace bounded volatile `PATH`/`SSH_AUTH_SOCK`; browser/remote clients cannot submit or receive raw values. | VERIFIED | Strict protocol bounds, `createDynamicEnvironmentStore.replace`, router authorization at `packages/service/src/secure/router.ts:246-254`, and awaited CLI/TUI preparation are wired. Runtime security, projection, managed-service, launch-context, and TUI bootstrap tests passed. |
| 6 | New PTY and non-PTY launches see refreshed PATH/socket values while already-running processes retain their launch snapshot. | VERIFIED | The real two-agent host test passed: process A remained on agent A, the store rotated to B, new PTY/non-PTY launches used B and invoked `ssh-add`, then omission cleared the socket. |
| 7 | Invalid or failing shell discovery/initialization is typed, actionable, bounded to 10 seconds, and never silently falls back. | VERIFIED | `discoverUserShell` rejects unset, relative, missing, non-executable, and unsupported shells; initialization emits discovery/validation/initialization/execution/cancellation/cleanup context. Adapter and terminal tests cover timeout, early exit, and cleanup failures. |
| 8 | Pre/main/post/repository commands remain separate, stop at the exact failing step, and preserve cwd/environment. | VERIFIED | `planManualCommand` returns typed steps; lifecycle and terminal-manager loop over them independently. Workspace-command, lifecycle, launch-context, and web-terminal tests passed, including exit 23 stop behavior. |
| 9 | Cancellation and close own the complete process group, escalate TERM to KILL, and never fabricate completion when descendants survive. | VERIFIED | Core and PTY cleanup wait for both leader settlement and process-group disappearance (`packages/core/src/user-shell.ts:507-544`, `packages/service/src/web/terminal-manager.ts:713-787`). Real process-tree and deterministic surviving-group regressions passed. |
| 10 | Initialization diagnostics are separated from command output and private initialization assets are removed. | VERIFIED | Output is routed by readiness in `executeUserShellCommand`; PTY initialization uses mode-0700 roots and mode-0600 values with `finally` cleanup. Spawn/allocation failure, trace containment, output streaming, and cleanup tests passed. |
| 11 | The Bash non-PTY bootstrap cannot be intercepted by parent-exported functions. | VERIFIED | Commit `52f28c7d` added `sanitizeInheritedEnvironment`, removing every `BASH_FUNC_*` key before Bash spawn while retaining ordinary inherited variables (`packages/core/src/user-shell.ts:291-304,491-498`). Both the spawn-seam regression and real Bash fixture poison `command`, `read`, `export`, `rm`, `sleep`, `eval`, `exit`, and an unrelated function; focused verification passed with exit 23 and no interception marker. |
| 12 | Linux/macOS jobs are fail-on-skip and emit a validated machine-readable host receipt. | VERIFIED | `.github/workflows/node-runtime-matrix.yml:91-155` requires Bash/zsh/fish and SSH tools on Ubuntu 24.04/macOS 15, runs the acceptance fixture, validates every receipt field and `skip_count: 0`, and uploads even on failure. Architecture tests passed. Actual hosted receipts are explicitly deferred to Phase 127. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Deferred Item

| Item | Addressed In | Evidence |
|---|---|---|
| Actual green zero-skip Linux/macOS receipts | Phase 127 | Roadmap success criteria 4-5 require supported-host UAT and hosted gates before preparing the RC tag. Phase 124 validation explicitly makes these durable Phase 127 pre-tag blockers. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/core/src/user-shell.ts` | Validated discovery, shell-family plans, bootstrap, diagnostics, timeout, and process-group execution | VERIFIED | Substantive exports are used by core, CLI, snapshot, and terminal paths; focused behavioral suite passed. |
| `packages/core/src/workspace-env.ts` | Canonical ordered environment composition | VERIFIED | Layering and reserved `GS_*` protection are implemented and exercised. |
| `packages/service/src/policy/dynamic-environment.ts` | Atomic replacement snapshot for PATH/socket | VERIFIED | Strictly parsed immutable replace/clear semantics are wired into service startup and router. |
| `packages/service/src/policy/snapshot.ts` | Launch-time dynamic environment and secret resolution | VERIFIED | Rebuilds secrets at launch, composes current dynamic values, and produces typed terminal steps. |
| `packages/service/src/web/terminal-manager.ts` | Initialized PTY and sequential command-terminal ownership | VERIFIED | Handles post-init authority, input/resize, step sequencing, diagnostics, close, cancellation, and confirmed cleanup. |
| `packages/protocol/src/service.ts` | Bounded refresh and typed launch-step contracts | VERIFIED | Strict refresh allowlist and typed terminal specifications are consumed by clients/service. |
| `tests/commands/user-shell-host-fixture.test.ts` | Real shells, runtime profile, two agents, and process-tree acceptance | VERIFIED | Independently run locally: available cases pass; one explicit zsh capability skip. |
| `.github/workflows/node-runtime-matrix.yml` | Required-host fail-on-skip receipt jobs | VERIFIED | Architecture tests independently confirm both host cells, zero-skip enforcement, validation, and upload. |

All PLAN artifact queries passed (26/26). PLAN 04's automated key-link query reported a textual false-negative because `terminal-manager.ts` does not contain the word `secret`; the real link is deliberately upstream: `snapshot.ts` invokes `buildWorkspaceEnv(... skipSecrets: false)` immediately before launch resolution and passes the resulting environment in the typed launch spec consumed by terminal-manager.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Lifecycle/workspace/CLI | Core user-shell adapter | One invocation per separate command step | WIRED | Imports/usages and focused behavioral tests confirmed. |
| Local CLI/TUI | Secure router | Authenticated `environment.refresh` awaited before dependent requests | WIRED | Client, CLI/TUI source and runtime ordering tests confirmed. |
| Router | Dynamic environment store | Same-user local authorization, strict parse, atomic replace | WIRED | Runtime origin matrix proves denied calls never mutate state. |
| Snapshot resolver | Dynamic/secret authorities | Snapshot read plus `skipSecrets: false` launch-time resolution | WIRED | Launch-context and snapshot tests confirmed new-launch-only data flow. |
| Protocol launch steps | Terminal manager | Typed ordered step list, one initialized PTY per step | WIRED | Web-terminal tests confirm step order, stop-on-failure, input, resize, and exit propagation. |
| Host fixture | Hosted workflow | Required capability variables plus receipt | WIRED | Architecture probe passed. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Shell adapter, lifecycle, overlays, terminal PTY, host profiles/agents, and hosted architecture | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/user-shell-adapter.test.ts tests/lib/workspace-env.test.ts tests/lib/lifecycle.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/workspace-command.test.ts tests/lib/service/launch-context.test.ts tests/service/web-terminal.test.ts tests/commands/user-shell-host-fixture.test.ts tests/architecture/shell-hosted-matrix.test.mjs` | 8 files passed; 93 tests passed; 1 explicit local zsh skip | PASS |
| Secure runtime and hosted job contract | `node --test tests/architecture/shell-hosted-matrix.test.mjs tests/service-node/secure-contract-runtime.test.mjs` | 4/4 passed | PASS |
| TUI refresh barrier | `bun test --preload @opentui/solid/preload tests/tui/dashboard/managed-service-bootstrap.test.ts` | 3/3 passed | PASS |
| Snapshot, projection, managed-service, and protocol contract | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/contract.test.ts tests/lib/service/snapshot.test.ts tests/service/managed-service-process.test.ts tests/service/web-projection.test.ts tests/tui/dashboard/managed-service-bootstrap.test.ts` | 4 files, 38/38 passed | PASS |
| Source hygiene | `git diff --check` and changed-file debt-marker scan | Clean; no unreferenced TBD/FIXME/XXX markers | PASS |

### Probe Execution

No Phase 124 probe scripts are declared. The hosted workflow architecture test is the executable receipt/wiring probe and passed independently.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| SHELL-01 | 00, 01, 02, 04, 05, 06 | SATISFIED | Shared validated adapter and migrated core/CLI/service/PTY consumers; no user-command fallback. |
| SHELL-02 | 00, 01, 02, 04, 05, 06 | SATISFIED | Real Bash/fish profile aliases, functions, runtime PATH, PTY behavior; fail-closed hosted zsh job. |
| SHELL-03 | 00, 01, 02, 04, 05, 06 | SATISFIED | One-shot command is a single unchanged argv item; PTY delivery preserves raw parser semantics without a quoting layer. |
| SHELL-04 | 00, 01, 02, 03, 04, 05, 06 | SATISFIED | Post-init overlays, launch-time secrets, repository identity, and reserved-value tests pass. |
| SHELL-05 | 03, 04, 05, 06 | SATISFIED | Bounded volatile replace/clear, local-only auth, projection/log/persistence non-disclosure. |
| SHELL-06 | 02, 03, 04, 05, 06 | SATISFIED | Real two-agent rotation, `ssh-add`, PTY/non-PTY future launches, existing-process retention. |
| SHELL-07 | 00, 01, 02, 04, 05, 06 | SATISFIED | Fail-closed discovery/validation/init, 10-second init limit, diagnostic categories and cleanup behavior. |

No Phase 124 requirement is orphaned: REQUIREMENTS.md maps exactly SHELL-01 through SHELL-07, and every ID is claimed by multiple plans.

### Anti-Patterns and Disconfirmation Pass

| Check | Result | Severity |
|---|---|---|
| Unreferenced `TBD`, `FIXME`, or `XXX` in changed Phase 124 files | None | None |
| Independent `/bin/sh` usage in Phase 124 user-authored consumers | None; remaining repository matches are pre-existing deterministic internal integrations/runtime helpers outside the phase boundary | Info |
| Test that can look green without proving the claimed external behavior | The architecture test proves hosted workflow wiring, not that GitHub executed it; actual receipts remain the explicit Phase 127 blocker | Info / deferred |
| Partial local host coverage | zsh is unavailable locally and is not claimed; required hosted mode turns any missing shell/skip into failure | Info / deferred |
| Parent-exported Bash dispatch error path | Closed by `52f28c7d`; both spawn-seam and real-shell poisoned-function regressions pass | None |

No blocker or warning remains after the disconfirmation pass.

### Human Verification Required

None for Phase 124. Supported-host receipt collection and live shell/SSH UAT are intentionally part of the Phase 127 pre-tag handoff, not silently claimed by this local verification.

### Gaps Summary

No Phase 124 implementation gap found. The phase goal is achieved at the local implementation and test boundary. Actual Linux/macOS zero-skip receipts remain a visible, non-waived Phase 127 pre-tag requirement.

---

_Verified: 2026-07-16T14:06:47Z_
_Verifier: independent GSD goal verifier_
