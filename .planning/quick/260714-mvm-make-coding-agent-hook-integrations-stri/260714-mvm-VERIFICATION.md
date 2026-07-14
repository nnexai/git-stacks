---
quick_id: 260714-mvm
status: passed
verified: 2026-07-14
---

# Quick Task 260714-mvm Verification

## Must-Haves

| Requirement | Result | Evidence |
|---|---|---|
| Normal startup never changes coding-agent configuration | PASS | Production snapshot dependencies no longer request installation; terminal preparation imports only read-only status and tests assert provider bytes remain unchanged |
| Install and uninstall are provider-selected | PASS | CLI and manager tests install/remove exact selections, reject unknown providers before mutation, and support the explicit `all` selector |
| Update never installs an absent provider | PASS | Unit and subprocess tests repair an owned Copilot integration while Codex, Claude, and OpenCode paths remain absent |
| Uninstall removes only owned state | PASS | Foreign shared JSON remains byte-identical; Codex feature settings are preserved/restored; unowned dedicated files are refused by the installer |
| Unconfigured terminals still emit basic signals | PASS | Terminal-session tests verify service-local process wrappers and mixed hook/wrapper mode |
| No parallel project-local hook lifecycle remains | PASS | Top-level install command, project-hook plugins, plugin behavior tests, inventory entries, and active codebase documentation removed; the remaining early hook test locks the new command boundary and shared-test preload order |

## Automated Checks

- Focused hook manager, CLI, terminal-session, and existing project-hook tests — PASS
- `bun run web:build` — PASS
- `bun run typecheck` — PASS
- `bun run web:typecheck` — PASS
- `bun run test:deps` — PASS, no circular dependency
- Full unit phase — PASS: 791 tests across 89 files
- Default 8-worker integration phase — 80/84 files passed; four subprocess-heavy files exceeded their 5-second per-test timeout under host load and each passed immediately in isolation
- `bun run scripts/test-runner.ts --integ --workers 4` — PASS: 84/84 isolated integration files
- `bun run verify:gates` — PASS
- `git diff --check` — PASS

## Notes

A raw monolithic `bun test` invocation reproduced existing cross-file mock contamination in unrelated config tests. The supported unit phase passed cleanly. On the loaded host, four 8-worker integration files exceeded fixed five-second test timeouts; every affected file passed alone and the complete integration phase passed at four workers. Existing `TerminalConsoleCache` listener warnings remain non-failing and unrelated to this change.
