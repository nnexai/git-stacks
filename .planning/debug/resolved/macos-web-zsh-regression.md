---
status: resolved
trigger: "macOS web zsh terminal fails or becomes non-functional after the v0.21.0-rc.6 release; later RC fixes did not restore the real browser path"
created: 2026-07-20
updated: 2026-07-21
---

# Debug Session: macOS Web zsh Regression

## Symptoms

- expected: After both an initial launch and an explicit service stop/start, the macOS web terminal opens the user's interactive login zsh, shows a working prompt, echoes input, and displays program output.
- actual: `0.22.0-rc.1` fails initialization after 10 seconds. `0.22.0-rc.5` eventually opens a frozen/non-functional terminal. `0.22.0-rc.6` still does not produce a working terminal.
- errors: `PTY allocation failed: Shell exited before PTY initialization completed`; earlier attempts also produced a blank cursor at `(0,0)` with writable but invisible/non-functional input.
- timeline: `0.21.0-rc.6` works on the same Mac. `0.21.0-rc.1` has a separate `too_big` issue and is not the useful good boundary. The regression is present by `0.22.0-rc.1`.
- reproduction: Install the candidate, launch the packaged browser client on macOS with zsh, then explicitly stop and restart the service and reopen the browser terminal.

## Current Focus

- hypothesis: Confirmed: the temporary login-zsh `ZDOTDIR` wrapper prevented the affected complex prompt setup from entering a working ZLE command loop.
- test: Complete: restore direct login-zsh launch, verify locally and across hosted macOS/Linux runners, then verify prompt rendering and command execution on the affected Mac.
- expecting: Met: the real prompt appears after normal profile startup and entered commands execute successfully.
- next_action: Release the verified fix as the next `v0.22.0` release candidate.
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
- timestamp: 2026-07-20T00:00:05+02:00
  observation: Hosted run 29744016446 reproduced `Shell PTY initialization exceeded 30000ms` on the default handshake path in the Node 24 Apple Silicon macOS job. The Node 24 macOS Intel job and required macOS shell-host job passed. The separate optional Bun TUI Intel failure was an existing dashboard-output assertion and did not exercise the canary switch.
  implication: Hosted macOS independently confirms that the retained default handshake remains capable of timing out. This does not invalidate the diagnostic bypass; the bypass must be explicitly enabled and still requires same-host verification on the affected Mac.
- timestamp: 2026-07-20T00:00:06+02:00
  observation: Canary branch `canary/macos-pty-handshake-bypass` at `fec4edea` passes the complete 34-test web-terminal suite locally, all workspace typechecks, architecture/dependency checks, package builds, runtime audit, and the redacted diagnostic assertions.
  implication: The canary is ready for the decisive real-Mac test without being promoted as a release candidate.
- timestamp: 2026-07-21T09:33:32+02:00
  observation: The affected Mac successfully launched three bypassed login-zsh sessions. Session publication and browser attachment took 34–63ms; first shell output followed after 5.9s on the first launch and about 2.5s on both subsequent launches, including after explicit service restart. Input roundtrip succeeded and no exit or failure event occurred.
  implication: The PTY and browser transport are healthy. The visible delay is real shell-profile work, while the pre-attachment handshake is the causal regression.
- timestamp: 2026-07-21T09:33:33+02:00
  observation: A deterministic regression now models a login-zsh profile emitting a cursor-position query and refusing to finish until xterm responds. Session creation returns before readiness, attachment exposes the query, the browser response completes initialization, and no bootstrap is written to shell input.
  implication: Attach-first initialization breaks the circular dependency while retaining the post-profile environment authority contract.
- timestamp: 2026-07-21T10:33:16+02:00
  observation: The affected Mac's no-bypass trace reaches `session_ready` and `attached` within 66ms and reaches `initialized` after 2.51s, but records neither `first_output` nor `first_input`; the browser remains blank at `(0,0)`.
  implication: The circular startup wait is fixed and the authoritative wrapper completes. The remaining failure is activation after readiness: no prompt is rendered and the browser never reaches a usable input roundtrip.
- timestamp: 2026-07-21T10:47:57+02:00
  observation: Two redraw-canary launches attach within 62ms, reach `initialized` after 2.54–2.68s, then immediately record `activation_redraw` and `first_output`; the only visible output is literal `^L`. Neither records `first_input`, and both remain non-responsive until service teardown.
  implication: `first_output` was a false positive caused by echoing the injected control byte. `.zlogin` completion is not a safe terminal-input boundary, so timed or readiness-adjacent keystroke injection must be eliminated.
- timestamp: 2026-07-21T10:54:10+02:00
  observation: An isolated real zsh 5.9 run passes both the login-zsh startup regression and the full 35-test web-terminal suite with readiness moved to a one-shot `precmd_functions` hook and no redraw write.
  implication: The shell-native first-prompt boundary is syntactically valid and preserves prompt output plus post-init input roundtrip on a real zsh host before hosted macOS verification.
- timestamp: 2026-07-21T12:21:30+02:00
  observation: Two affected-Mac launches with one-shot `precmd` readiness both attached immediately, produced shell output, reached `initialized` after 2.43-2.81 seconds, and received browser input. Nevertheless no prompt appeared and entered commands did not execute; only tty echo was visible.
  implication: Readiness timing, browser attachment, output transport, and input transport are all functioning. The temporary `ZDOTDIR` startup-file chain leaves the real shell outside a working ZLE command loop even after `precmd`; wrapper-based login-zsh initialization must be removed rather than retimed.
- timestamp: 2026-07-21T12:09:19Z
  observation: The direct-launch canary on the affected Mac created a browser-visible zsh session in 78 ms, produced its first real output after 2.65 seconds of normal profile work, accepted browser input, rendered the command line, and executed entered commands successfully.
  implication: Restoring direct login-zsh ownership fixes both startup and command execution in the exact environment where every wrapper-based candidate froze.
- timestamp: 2026-07-21T12:34:10Z
  observation: Hosted run 29822508278 passed the required real-shell acceptance jobs on macOS and Linux plus Node matrices on macOS Apple Silicon, macOS Intel, Linux x64, and Linux ARM. The first Apple Silicon attempt hit the inherited bash bootstrap-echo race and its isolated rerun passed.
  implication: The zsh fix is cross-platform safe, and the separate bash diagnostic-output race is not a failure of the direct-zsh launch path.

## Eliminated

- hypothesis: The regression was introduced only by the rc.6 temporary `ZDOTDIR` startup wrappers.
  evidence: The real failure is already present in `0.22.0-rc.1`, before those wrappers existed.
- hypothesis: Increasing the initialization timeout or retrying the injected bootstrap is sufficient.
  evidence: rc.5 changes the timeout into a delayed frozen terminal on the real Mac.

## Resolution

- root_cause: The post-profile login-zsh wrapper introduced after `v0.21.0-rc.6` replaces `ZDOTDIR` and mediates the complete startup sequence. On the affected complex macOS configuration it can reach `.zlogin` and `precmd` while never entering a usable ZLE command loop.
- fix: Normal login zsh now launches directly with the already-resolved spawn environment, matching `v0.21.0-rc.6` and the successful bypass probe. No bootstrap or redraw input is injected; configured-command and bash/fish paths are unchanged.
- verification: Passed locally with real zsh 5.9 and all 35 web-terminal tests; passed hosted run 29822508278 across macOS and Linux architectures; passed on the affected Mac with a visible prompt and working command execution.
- files_changed: `packages/service/src/web/terminal-manager.ts`, `tests/service/web-terminal.test.ts`, `docs/canary-macos-pty.md`
