# Phase 124 Early Review Fix

The six early-review findings are repaired before host-fixture verification:

- Bash interactive launches use the valid `-i` flag in both PTY and command plans.
- Interactive Bash, zsh, and fish launches carry an explicit post-init environment handshake. The service writes the overlay to a mode-0600 private asset and injects a fixed shell-family bootstrap only after the real interactive shell has completed profile startup.
- Configured command steps run in active real PTYs. The logical terminal proxies input and resize to the current step, preserves the latest dimensions across steps, and stops at the exact failing step.
- Cancellation and terminal close verify process-group disappearance after the leader exits; surviving descendants receive `SIGKILL` and cleanup fails honestly if the group remains.
- Terminal launch environment validation accepts `PATH` through the authoritative 16 KiB boundary and rejects the first byte beyond it.
- Adapter output uses one streaming `TextDecoder`, preserving UTF-8 code points split across chunks.

Focused verification:

- `bun test tests/lib/user-shell-adapter.test.ts tests/lib/service/contract.test.ts`
- `bun test tests/service/web-terminal.test.ts -t "keeps an active real PTY|decodes split multi-byte|SIGKILLs descendants"`
- `bun test tests/lib/service/snapshot.test.ts -t "reuses the delivered aggregate"`
- `bunx tsc --noEmit -p packages/service/tsconfig.json`
- `bunx tsc --noEmit -p packages/protocol/tsconfig.json`

The complete host fixture and full repository gates remain the next verification layer after rebasing this repair chain.

## Second adversarial repair pass

Three follow-up blockers are now repaired:

- PTY post-initialization uses shell-family builtin dispatch for environment parsing, export, readiness creation, command sourcing, status capture, and exit. Hostile Bash, zsh, and fish profile fixtures that shadow those command names cannot intercept the authoritative overlay or command source boundary; readiness is created only after every overlay entry succeeds.
- Command PTY initialization timeout and failure now perform `SIGTERM`, wait for both leader settlement and process-group disappearance, escalate to `SIGKILL`, and confirm the group is gone before the logical terminal reports its ended state.
- Core command cancellation and service terminal closure poll for process-group disappearance after `SIGKILL`, independently of leader exit notification. A real Linux fixture with a TERM-resistant shell and descendant verifies cancellation returns only after the owned group is absent.

Second-pass focused verification:

- `bun test tests/service/web-terminal.test.ts -t "hostile profile|SIGKILLs descendants|command PTY group"`
- `bun test tests/lib/user-shell-adapter.test.ts`
- `bun test tests/service/web-terminal.test.ts -t "keeps an active real PTY|captures agent lifecycle|resets to retained"`
- `bunx tsc --noEmit -p packages/core/tsconfig.json`
- `bunx tsc --noEmit -p packages/service/tsconfig.json`

The two timing-sensitive real-PTY streaming tests passed independently; in one long aggregate run they timed out after earlier real-PTY cases. No failure involved the new initialization or process-group assertions, and the milestone host fixture/full gates remain the authoritative aggregate check.

## Third adversarial repair pass

The final two reviewer blockers are repaired:

- Bash and zsh no longer depend on the profile-visible `builtin` dispatcher for post-init overlay application, readiness, or command sourcing. The service writes a mode-0600 private source containing grammar-level assignments and nested `case` verification, and the final readiness redirection is reachable only when every authoritative value matches. Command sourcing uses the shell's direct dot form. The spawn environment pre-seeds every authoritative value so reassignment preserves its exported attribute. Fish continues through its reserved `builtin` dispatcher, which cannot be replaced by a profile function and reaches the real `set` and `source` builtins even when their ordinary names are shadowed.
- The Bash adversarial fixture now defines the exact reviewer poison `function builtin { return 91; }`; the Bash/zsh/fish fixtures retain their family-specific export/source/printf poisoning. A separate readonly-value fixture proves that a failed authoritative assignment cannot create readiness merely through a later redirection.
- If command-PTY initialization fails and TERM/KILL cannot prove both leader settlement and process-group disappearance, the logical terminal no longer emits `onExit`. It retains the active child and stays retryable until an explicit close projects `cleanup_failed`. The permanent-group fixture proves that no `ended` state or exit code is fabricated after the leader alone exits.
- The PTY test factory now supports multiple exit subscribers like node-pty, keeping leader-exit and process-group-disappearance assertions independent.

Third-pass focused verification:

- `bun test tests/service/web-terminal.test.ts -t "hostile profile|readiness only|command PTY group|does not logically finish|retries TERM"` — pass.
- `bun test tests/lib/user-shell-adapter.test.ts tests/architecture/shell-hosted-matrix.test.mjs` — 14 pass.
- `bunx tsc --noEmit -p packages/core/tsconfig.json` — pass.
- `bunx tsc --noEmit -p packages/service/tsconfig.json` — pass.
- `bun run test:deps` — package architecture pass.

Local host notes:

- The complete `web-terminal.test.ts` run passed 21 tests; its two already-documented late real-PTY streaming cases timed out after the preceding PTY cases and each passed when rerun independently.
- The host fixture's direct node-pty helper returned empty PTY output for local Bash/fish/SSH PTY assertions, while its non-PTY shell and real process-tree cancellation assertions passed. The isolated Bash case reproduces unchanged on the pre-repair `main` worktree, so this is not introduced by either repair. Local zsh remains capability-skipped.

## Fourth adversarial repair pass

The final POSIX dot-dispatch finding supersedes the third-pass source boundary:

- Bash and zsh PTY initialization no longer invoke `.` or any other post-profile command dispatcher. Random per-launch shadow environment names carry authoritative values without placing raw values in the echoed bootstrap; grammar-level assignments and `case` checks create readiness only after the effective overlay matches.
- Command steps are delivered directly inside one parser-complete brace/begin batch. This preserves initialized aliases and functions while ensuring interactive commands such as `read` cannot consume a separately queued status command. A grammar-level private status-file sentinel records ordinary completion; the service then performs its existing TERM/KILL process-group cleanup. Commands that exit the shell directly retain their actual PTY exit code.
- The hostile fixtures now poison `.`, `builtin`, `source`, `printf`, and `export`. They prove the command still runs, readiness reflects the resulting authoritative value, and the echoed bootstrap contains no raw overlay sentinel. The readonly-overlay fixture still proves readiness cannot be faked.
- The full web-terminal suite revalidates the permanent-group case: failure to prove descendant cleanup retains the active process and never fabricates terminal completion; explicit close remains retryable and honest.

Fourth-pass focused verification:

- `npx vitest run tests/service/web-terminal.test.ts tests/lib/user-shell-adapter.test.ts tests/commands/user-shell-host-fixture.test.ts` — 38 passed, 1 explicit local zsh capability skip.
- `npm run typecheck -w @git-stacks/service` — pass.
- `npm run test:deps` — package architecture pass.
- `git diff --check` — pass.

## Fifth adversarial repair pass

The profile-tracing disclosure is contained without suppressing profile startup or configured-command output:

- Bash and zsh execute every authoritative expansion, equality check, and readiness write inside a grammar-level block whose stdout and stderr are redirected. Bash first moves `BASH_XTRACEFD` to fd 2 and verifies the assignment before entering that block, so a profile-selected alternate trace descriptor cannot bypass the boundary; the original trace target is restored before the configured command runs. A readonly trace descriptor fails closed because readiness is never created.
- Fish trace output bypasses ordinary block redirections. Fish therefore reads each authoritative value from a mode-0600, NUL-terminated file with the reserved `builtin read` dispatcher. Its trace contains only the builtin invocation and private filename, never the file content. Fish no longer receives duplicate random shadow variables in its spawn environment.
- The silent boundary also contains profile DEBUG hooks or helper functions that write ordinary stdout/stderr during initialization. Profile startup output remains outside the boundary, and configured-command output, aliases, functions, input, resize, status capture, and process-group cleanup are unchanged.
- Captured stdout-plus-stderr fixtures enable Bash xtrace on a dedicated fd and fish tracing while retaining the hostile dispatcher functions. They assert that command output and readiness survive while the raw authoritative sentinel is absent. The same regression runs for zsh when the executable is installed; local zsh remains the single explicit capability skip.

Fifth-pass focused verification:

- `npx vitest run tests/service/web-terminal.test.ts tests/lib/user-shell-adapter.test.ts tests/commands/user-shell-host-fixture.test.ts` — 39 passed, 1 explicit local zsh capability skip.
- `npm run typecheck -w @git-stacks/service` — pass.
- `npm run test:deps` — package architecture pass.
- `git diff --check` — pass.
