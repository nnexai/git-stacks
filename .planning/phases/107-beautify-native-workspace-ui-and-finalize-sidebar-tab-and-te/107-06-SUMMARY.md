---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 06
subsystem: agent-hooks
tags: [codex, attention, hooks, service, sse]
requires: [107-01]
provides: [codex-hook-plugin, best-effort-attention-publication]
affects: [native-client-attention]
tech-stack:
  added: []
  patterns: [merge-preserving-json, atomic-hook-write, bounded-best-effort-transport]
key-files:
  created: [src/lib/agent-hooks/codex.ts, tests/service/codex-attention.test.ts]
  modified: [src/lib/agent-hooks/types.ts, src/lib/agent-hooks/index.ts, src/commands/install.ts, src/commands/service.ts, tests/lib/agent-hooks.test.ts, tests/lib/agent-hooks/structured-attention.test.ts, tests/commands/support-doctor-install.test.ts]
key-decisions:
  - "Codex hook mutation validates the complete hook collection and atomically replaces only after a safe merge."
  - "Hook-triggered publication uses a 1500ms abort deadline and suppresses every publication-path failure; manual publication stays strict."
metrics:
  duration: 12min
  completed: 2026-07-12
status: complete
---

# Phase 107 Plan 06: Codex Attention Provider Summary

Project-local Codex lifecycle hooks now publish identity-addressed attention through a silent bounded transport while preserving every unrelated hook and JSON key.

## Accomplishments

- Added the four truthful Codex lifecycle mappings with source, workspace, repository, and surface identity.
- Added merge-preserving, idempotent install/removal with malformed-file byte preservation and atomic replacement.
- Added `install --hooks --codex` plus the Codex review/trust reminder.
- Added strict and best-effort publication modes with abort propagation through identity lookup and authenticated POST.
- Proved real CLI publication, workspace-name identity fallback, durable journal storage, and authenticated SSE replay.

## Task Commits

- `c56bf59a` — RED: Codex hook contract tests
- `400eab57` — GREEN: merge-safe Codex hook plugin
- `2cfa8f3f` — RED: Codex install and publication tests
- `371c5a00` — GREEN: install flag and bounded best-effort publication
- `fc806a84` — SSE replay and fallback coverage

## Verification

- `bun test tests/lib/agent-hooks.test.ts` — 20 passed
- `bun test tests/lib/agent-hooks/structured-attention.test.ts` — 2 passed
- `bun test tests/commands/support-doctor-install.test.ts` — 5 passed
- `bun test tests/service/codex-attention.test.ts` — 2 passed
- `bun run typecheck` — passed
- `bun run test:deps` — no circular dependencies

## Deviations from Plan

None - plan executed as specified.

## Known Stubs

None.

## Self-Check: PASSED

All declared files and commits exist, and all focused verification gates pass.
