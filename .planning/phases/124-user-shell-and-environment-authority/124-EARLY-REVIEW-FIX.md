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
