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

- hypothesis: The `.zlogin` readiness marker is too early: zsh has applied the overlay but has not entered its first prompt/ZLE loop. The attempted Ctrl-L therefore becomes literal queued input (`^L`). Readiness must be emitted by a one-shot native `precmd` hook with no server-generated keystroke.
- test: Apply and verify the overlay in `.zlogin`, install a one-shot `precmd_functions` callback that writes readiness immediately before the first prompt, and require real-zsh prompt output plus browser input roundtrip without any injected bootstrap or redraw input.
- expecting: The real trace reaches `initialized`, then genuine prompt `first_output`, then user-driven `first_input`; no `activation_redraw` phase or visible `^L` appears.
- next_action: Push the precmd-readiness canary after local real-zsh and hosted cross-platform verification.
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

## Eliminated

- hypothesis: The regression was introduced only by the rc.6 temporary `ZDOTDIR` startup wrappers.
  evidence: The real failure is already present in `0.22.0-rc.1`, before those wrappers existed.
- hypothesis: Increasing the initialization timeout or retrying the injected bootstrap is sufficient.
  evidence: rc.5 changes the timeout into a delayed frozen terminal on the real Mac.

## Resolution

- root_cause: Login-zsh initialization waited for a private ready marker before creating a browser-visible session, but complex profiles can wait for terminal capability responses that only the attached xterm can provide.
- fix: Create and expose the login-zsh session before asynchronously waiting; apply the overlay in `.zlogin`, but delay readiness to a self-removing zsh `precmd_functions` hook so no terminal input is injected before ZLE.
- verification: Bypass canary passed three same-Mac launches including service restart. Attach-first and redraw variants isolated the early-readiness boundary. Local real-zsh 5.9 login and full terminal suites pass with precmd readiness; hosted and affected-Mac verification remain pending.
- files_changed: `packages/service/src/web/terminal-manager.ts`, `tests/service/web-terminal.test.ts`, `docs/canary-macos-pty.md`
