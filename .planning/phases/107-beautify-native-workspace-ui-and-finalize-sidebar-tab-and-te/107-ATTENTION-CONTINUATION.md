# Phase 107 Attention Continuation

## Completed boundary

- `0d1dcd18` binds pin/unpin directly to the exact owning workspace UUID and refreshes/persists immediately.
- `a9572ce5` adds provider-neutral zero-preparation command wrappers for ordinary `codex`, `copilot-cli`, `copilot`, `claude`, and `opencode` commands, plus OpenCode as a first-class attention provider.
- The follow-up commit removes automatic project-local hook writes. Opening a terminal must never dirty its repository.

## Required Supacode-style completion before Phase 107 closes

1. Every native PTY exports exact workspace, repository, tab/surface, and service transport identity.
2. Add a one-time user-level integration manager with versioned ownership metadata, health, opt-out, update, and uninstall:
   - Codex: enable hooks and atomically merge only owned hook handlers in user configuration.
   - Claude: atomically prune/append owned handlers while preserving user settings.
   - Copilot: own a dedicated user hook file rather than editing unrelated configuration.
   - OpenCode: own a dedicated plugin asset.
3. Owned hooks are inert unless the native surface identity environment is present.
4. Hooks emit a bounded, authenticated structured OSC event to their owning TTY. The native terminal validates the surface identity and normalizes the event into the existing attention domain. Service publication remains a fallback.
5. ACP is reported only when git-stacks actually launches and hosts the ACP process; it does not observe arbitrary PTY commands.
6. Add live tests that start ordinary provider commands with no flags in a newly provisioned native terminal and observe working/waiting/completed attention on the exact surface.

## Verification at boundary

- Focused agent/session and snapshot tests pass.
- `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates` pass.
- `bun run native:verify` was still running when this continuation was written; inspect its final status before continuing.
- Direct `bun test` is not the repository's isolated integration runner and showed unrelated fixture/module-mock interference; use the configured integration/gate scripts.

## Preserve

Do not commit runtime-generated `.codex/hooks.json`, `.github/hooks/`, `native/zig-out/`, or the phase `.gitkeep`.
