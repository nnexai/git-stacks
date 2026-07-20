---
status: investigating
trigger: "macOS web zsh terminal fails or becomes non-functional after the v0.21.0-rc.6 release; later RC fixes did not restore the real browser path"
created: 2026-07-20
updated: 2026-07-20
---

# Debug Session: macOS Web zsh Regression

## Symptoms

- expected: After both an initial launch and an explicit service stop/start, the macOS web terminal opens the user's interactive login zsh, shows a working prompt, echoes input, and displays program output.
- actual: `0.22.0-rc.1` fails initialization after 10 seconds. `0.22.0-rc.5` eventually opens a frozen/non-functional terminal. `0.22.0-rc.6` still does not produce a working terminal.
- errors: `PTY allocation failed: Shell exited before PTY initialization completed`; earlier attempts also produced a blank cursor at `(0,0)` with writable but invisible/non-functional input.
- timeline: `0.21.0-rc.6` works on the same Mac. `0.21.0-rc.1` has a separate `too_big` issue and is not the useful good boundary. The regression is present by `0.22.0-rc.1`.
- reproduction: Install the candidate, launch the packaged browser client on macOS with zsh, then explicitly stop and restart the service and reopen the browser terminal.

## Current Focus

- hypothesis: Commit `b20ed830` introduced the first-bad mechanism: interactive PTY creation now writes a readiness bootstrap to zsh input and blocks browser attachment until that input creates a private ready file. Real zsh startup can require or consume terminal traffic before it accepts the bootstrap, creating a circular pre-attachment dependency.
- test: Build a diagnostic canary that bypasses only the interactive post-init handshake and otherwise retains the v0.22 terminal lifecycle. Compare it on the same Mac against rc.6 before designing the final authority-preserving mechanism.
- expecting: The bypass canary restores the prompt and command roundtrip across an explicit service restart, proving the handshake rather than unrelated v0.22 lifecycle work is causal.
- next_action: Add redacted phase diagnostics and the narrow interactive-handshake bypass canary without changing configured-command execution.
- reasoning_checkpoint: Real same-host version testing supersedes the synthetic hosted fixture as the authoritative evidence.
- tdd_checkpoint: false

## Evidence

- timestamp: 2026-07-20T00:00:00+02:00
  observation: On the same macOS environment, `0.21.0-rc.6` works while `0.22.0-rc.1` times out during initialization after 10 seconds.
  implication: The first useful regression interval is `v0.21.0-rc.6..v0.22.0-rc.1`.
- timestamp: 2026-07-20T00:00:01+02:00
  observation: `0.22.0-rc.5` eventually creates a broken or frozen terminal instead of timing out cleanly.
  implication: Later startup settling and bootstrap retry changes alter the visible failure mode but do not repair the original regression.
- timestamp: 2026-07-20T00:00:02+02:00
  observation: `0.21.0-rc.1` has a separate `too_big` failure while `0.21.0-rc.6` works.
  implication: Use rc.6, not rc.1, as the good endpoint so the unrelated historical transport limit does not contaminate the PTY bisect.
- timestamp: 2026-07-20T00:00:03+02:00
  observation: The boundary diff identifies `b20ed830` as the commit that added `createPtyInitialization`, immediately wrote `initialization.bootstrap` to the PTY, and waited up to 10 seconds for a private ready file before assigning the child to a browser-visible session.
  implication: The browser cannot attach and participate in terminal negotiation until the shell consumes bootstrap input, while the shell may not consume that input until terminal negotiation completes.
- timestamp: 2026-07-20T00:00:04+02:00
  observation: The known-good implementation directly spawned the same login-interactive shell with the resolved environment and immediately created the browser-visible session. The v0.22 snapshot already includes the complete effective environment in the initial spawn environment before the post-init handshake reapplies it.
  implication: A narrow handshake bypass is a valid causal probe and does not remove the effective environment from the spawned process; it only relaxes the Phase 124 post-profile precedence guarantee for the diagnostic canary.

## Eliminated

- hypothesis: The regression was introduced only by the rc.6 temporary `ZDOTDIR` startup wrappers.
  evidence: The real failure is already present in `0.22.0-rc.1`, before those wrappers existed.
- hypothesis: Increasing the initialization timeout or retrying the injected bootstrap is sufficient.
  evidence: rc.5 changes the timeout into a delayed frozen terminal on the real Mac.

## Resolution

- root_cause:
- fix:
- verification:
- files_changed:
