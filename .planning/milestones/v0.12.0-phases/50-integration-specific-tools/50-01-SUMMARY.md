---
phase: 50-integration-specific-tools
plan: 01
subsystem: cli
tags: [commander, integration, yaml, config-introspection]

requires: []
provides:
  - Integration interface extended with configExample optional property
  - configExample strings for aerospace, vscode, niri, and tmux integrations
  - Generic 'integration list' command with table and --json output for all 10 integrations
  - Generic 'integration <id> config example' subcommand for all 10 integrations
  - Generic 'integration <id> config show [workspace]' subcommand with --json for all 10 integrations
affects: [future integration additions, integration CLI surface, config documentation]

tech-stack:
  added: []
  patterns:
    - configExample on Integration interface for static YAML documentation strings
    - Generic config subcommands registered uniformly across all integrations
    - D-02 fallback message for integrations without configExample

key-files:
  created:
    - src/commands/integration.ts (rewritten from 13 to 104 lines)
  modified:
    - src/lib/integrations/types.ts
    - src/lib/integrations/aerospace.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/niri.ts
    - src/lib/integrations/tmux.ts

key-decisions:
  - "list command registered before the per-integration loop to avoid name collision with integration IDs like 'list'"
  - "configExample omitted from intellij, cmux, github, gitlab, gitea, jira — D-02 fallback message used instead"
  - "resolveEnabled imported directly from types.ts (not re-exported from index.ts) for clarity"

patterns-established:
  - "configExample?: string on Integration interface for static YAML config documentation"
  - "Generic config subcommands (example + show) applied uniformly to all integrations"
  - "D-02 fallback: No configuration example available for <id>. See: git-stacks integration <id> config show"

requirements-completed: []

duration: 3min
completed: 2026-04-01
---

# Phase 50 Plan 01: Integration Config Introspection Summary

**`configExample` property added to Integration interface, populated for 4 integrations, and generic `config example`/`config show`/`list` commands registered for all 10 integrations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T18:34:31Z
- **Completed:** 2026-04-01T18:37:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended `Integration` interface in `types.ts` with optional `configExample?: string` property
- Populated `configExample` for aerospace (with workspaces array), vscode (with cmd field), niri (with columns array), and tmux (enabled: true)
- Rewrote `src/commands/integration.ts` from 13 lines to 104 lines with generic `list`, `config example`, and `config show` subcommands for all 10 integrations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add configExample to Integration interface and 4 integrations** - `c64bcb8` (feat)
2. **Task 2: Rewrite integration.ts with generic config subgroup and list command** - `f832d61` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/lib/integrations/types.ts` - Added `configExample?: string` to Integration interface
- `src/lib/integrations/aerospace.ts` - Added `configExample` with multi-workspace YAML snippet
- `src/lib/integrations/vscode.ts` - Added `configExample` with cmd field YAML snippet
- `src/lib/integrations/niri.ts` - Added `configExample` with columns array YAML snippet
- `src/lib/integrations/tmux.ts` - Added `configExample` with enabled: true YAML snippet
- `src/commands/integration.ts` - Rewritten with list, config example, config show for all 10 integrations

## Decisions Made

- `list` command registered before the per-integration loop to avoid name collision with integration IDs
- `configExample` omitted from intellij, cmux, github, gitlab, gitea, jira — these 6 display the D-02 fallback message pointing users to `config show`
- `resolveEnabled` imported directly from `../lib/integrations/types` for explicit dependency clarity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 10 integrations now have uniform `config example` and `config show` subcommands
- `integration list` gives overview table or JSON array for scripting
- Ready for Plan 02 which builds on this CLI surface

---
*Phase: 50-integration-specific-tools*
*Completed: 2026-04-01*
