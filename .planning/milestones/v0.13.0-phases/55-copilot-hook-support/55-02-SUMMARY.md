---
phase: 55-copilot-hook-support
plan: 02
subsystem: cli
tags: [commander, shell-completion, agent-hooks, copilot, claude-code]

# Dependency graph
requires:
  - phase: 55-01
    provides: copilot plugin registered in agentHookPlugins array with id="copilot"
provides:
  - --copilot flag on install command bypasses multi-select and installs Copilot hooks
  - --claude flag on install command bypasses multi-select and installs Claude Code hooks
  - resolvePlugins() helper for flag-to-plugin mapping
  - Boolean-only commands now emit flag completions in bash/zsh shell completion
affects: [shell-completion, install-command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - resolvePlugins() pattern: maps CLI boolean flags to plugin instances, returns empty for interactive fallback

key-files:
  created: []
  modified:
    - src/commands/install.ts
    - src/lib/completion-generator.ts

key-decisions:
  - "resolvePlugins returns empty array (not null) to signal interactive fallback — keeps install flow linear"
  - "Completion generator: bash/zsh both needed a fallback for boolean-only commands (no dynamic args, no enums) — added options.length>0 case to emit --flag completions"
  - "Fish completion already handled via per-command flags loop — no change needed"

patterns-established:
  - "Flag-to-plugin resolution: resolvePlugins(opts, allPlugins) — empty return signals interactive prompt, non-empty skips it"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04]

# Metrics
duration: 12min
completed: 2026-04-02
---

# Phase 55 Plan 02: Install Command --copilot and --claude Flags Summary

**--copilot/--claude flags on install --hooks bypass interactive multi-select and install named hook sets directly; completion generator fixed to emit boolean flags for commands without dynamic args**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-02T06:00:00Z
- **Completed:** 2026-04-02T06:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `--copilot` and `--claude` flags to `git-stacks install --hooks`
- `resolvePlugins()` helper maps flag combinations to plugin instances; empty return triggers interactive fallback
- Remove flow is now flag-aware: `--remove --copilot` removes only Copilot hooks
- Fixed completion generator to emit flag completions for boolean-only commands in bash and zsh
- All three shells (bash, zsh, fish) now complete `--copilot` and `--claude` for the install command

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --copilot and --claude options to install command** - `dd4f78c` (feat)
2. **Task 2: Add completion hints for new flags** - `88b4e9d` (fix)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `src/commands/install.ts` - Added `resolvePlugins()`, `--copilot`/`--claude` options, flag-aware install and remove flows
- `src/lib/completion-generator.ts` - Added boolean-flag fallback in `bashCaseBody()` and `zshCaseBody()` for commands without dynamic args or enum options

## Decisions Made
- `resolvePlugins` returns empty array (not null) to signal "use interactive prompt" — keeps the install flow linear with a single branch point
- Completion generator needed two fixes (bash + zsh), fish was already handled by the per-command flags loop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Completion generator skipped boolean-only commands in bash and zsh**
- **Found during:** Task 2 (completion hints verification)
- **Issue:** `bashCaseBody()` and `zshCaseBody()` both returned `""` for commands with only boolean flags (no dynamic args, no enum options), so `install` never appeared in the shell completion case statements
- **Fix:** Added `if (options.length > 0)` fallback in both functions to emit flag-list completions
- **Files modified:** `src/lib/completion-generator.ts`
- **Verification:** `bun run src/index.ts completion bash|zsh|fish` all show `--copilot` and `--claude` in the install section
- **Committed in:** `88b4e9d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in completion generator)
**Impact on plan:** Fix was necessary for the acceptance criteria — all three shell completions must include the new flags.

## Issues Encountered
None — the completion generator bug was discovered during planned verification and fixed immediately.

## Next Phase Readiness
- Copilot hook support is complete (HOOK-01 through HOOK-04 satisfied)
- Phase 55 is fully done; proceed to Phase 56 (doctor checks + tmux example)

---
*Phase: 55-copilot-hook-support*
*Completed: 2026-04-02*
