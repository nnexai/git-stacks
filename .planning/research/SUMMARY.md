# Project Research Summary

**Project:** git-stacks v0.6.0 — Integration Orchestration & Niri Compositor Integration
**Domain:** CLI workspace manager — integration pipeline orchestration, Wayland/niri compositor integration
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

git-stacks v0.6.0 adds two tightly coupled capabilities to the existing integration system: an artifact-passing pipeline that allows integrations to share runtime state, and a niri compositor integration that consumes those artifacts to arrange all workspace windows onto a single named niri workspace. The current system runs integrations sequentially but discards their return values — each integration is isolated. The v0.6.0 goal is to turn that isolated sequence into a cooperative pipeline where later integrations (niri) can act on what earlier integrations produced (tmux session names, vscode window IDs).

The recommended approach is to add a typed `ArtifactBag` that flows through the sequential integration loop, introduce a consolidated `runner.ts` module to replace four duplicated inline loops, and build a new `niri.ts` integration plugin that creates a named niri workspace and moves all spawned windows onto it. The entire niri IPC surface is available via the `niri msg` CLI — no Wayland protocol libraries or socket-level IPC are needed. The niri compositor is already installed at version 25.11 and all required commands have been verified against the live binary.

The key risks are (1) breaking the `Integration.open()` signature atomically across all four existing integrations, (2) the inherent async gap between spawning a Wayland window and the compositor registering it, and (3) tmux environment variable contamination when `git-stacks open` is run from inside an existing tmux session. All three have clear mitigation strategies documented in the research.

## Key Findings

### Recommended Stack

No new npm dependencies are required. All niri IPC is handled via `Bun.$\`niri msg -j ...\`` shell calls — the same pattern used throughout the codebase for tmux and git operations. JSON output from `niri msg -j` is parsed with `JSON.parse()` and validated with the existing Zod setup. Two new source files are needed: `src/lib/niri.ts` (a shell wrapper library mirroring `tmux.ts`) and `src/lib/integrations/niri.ts` (the integration plugin). Six existing files require modification for the interface change and artifact returns.

**Core technologies:**
- `Bun.$` shell — niri IPC via `niri msg` CLI — the compositor's stable, versioned API surface; socket-level IPC is explicitly avoided
- `Zod` (already installed) — schema validation for parsed niri JSON responses
- `Bun.spawn()` (already used) — returns `.pid` directly for process tracking
- `niri msg -j windows` / `niri msg -j workspaces` — verified JSON output shapes on live niri 25.11
- `niri msg action move-window-to-workspace --window-id` — confirmed flag syntax on live binary

### Expected Features

**Must have (table stakes):**
- `IntegrationArtifact` discriminated union type and `open()` return type change — foundation; nothing else works without this
- Artifact accumulation bag (`ArtifactBag`) threaded through the integration loop — enables niri to read what tmux and vscode produced
- tmux integration returns `{ type: "tmux", sessionName }` — trivial change, high value
- cmux integration returns `{ type: "cmux", workspaceRef }` — trivial change
- Consolidated `runner.ts` replacing four duplicated inline loops
- Numeric `order` field on `Integration`; niri hardcoded to `Number.MAX_SAFE_INTEGER` (always last)
- Niri integration: `applies()` guards on `$NIRI_SOCKET`, creates/names workspace, focuses it
- Window identification via snapshot-diff (poll `niri msg -j windows` before and after spawn)
- `move-window-to-workspace --window-id` to arrange identified windows onto the niri workspace
- Graceful degradation: all window identification failures are warnings, not errors
- Cleanup: `unset-workspace-name` called from `runPreRemoveHooks()` when niri is running

**Should have (v0.6.x after validation):**
- Event-stream-based window detection replacing polling (more precise, avoids sleep loops)
- Artifact values exported as env vars (`WS_TMUX_SESSION`, `WS_CMUX_REF`) for `post_open` hooks
- `git-stacks config` TUI shows resolved integration execution order
- Terminal spawning in niri integration when no tmux artifact is present

**Defer (v0.7.0+):**
- Per-workspace niri layout configuration (column widths, split ratios)
- IntelliJ window arrangement (app startup timing problem unsolved)
- XWayland window identification via xdotool fallback
- Configurable per-workspace integration ordering in YAML
- `open-on-workspace` niri `config.kdl` snippet generation

### Architecture Approach

The central architectural change is introducing `src/lib/integrations/runner.ts` as the single authoritative place where the integration loop runs. This replaces four duplicated inline loops across `workspace-ops.ts`, `workspace-wizard.ts`, `workspace-clone.ts`, and `App.tsx`. The runner exposes two functions: `runIntegrationGenerate()` for the workspace-create flow (no `open()` calls needed) and `runIntegrations()` for the workspace-open flow (full pipeline with artifact accumulation). The `ArtifactBag` is created fresh per invocation inside the runner, preventing stale artifact bleed between calls.

**Major components:**
1. `src/lib/integrations/types.ts` — add `ArtifactBag`, per-integration artifact types, and update `open()` signature; this is the compile-time contract between all integrations
2. `src/lib/integrations/runner.ts` (new) — consolidated generate and open loops with bag threading; optional `integrationList` parameter for testability
3. `src/lib/niri.ts` (new) — `niri msg` shell wrappers (`listNiriWindows`, `focusNiriWorkspace`, `waitForWindowByPid`, `moveWindowToWorkspace`, etc.) mirroring the `tmux.ts` pattern
4. `src/lib/integrations/niri.ts` (new) — full integration plugin: applies-check on `$NIRI_SOCKET`, workspace create/focus, terminal spawn with tmux attach, window arrangement from bag
5. All four existing integration plugins — mechanical `open()` return type updates; tmux and cmux populate their artifact fields with actual values

### Critical Pitfalls

1. **Breaking the `Integration.open()` interface non-atomically** — use a transitional `Promise<IntegrationArtifact | null | void>` union type to keep the build green while updating integrations one-by-one; tighten to `Promise<IntegrationArtifact | null>` only after all four are updated.

2. **Niri window spawn is asynchronous with no guaranteed PID-to-window mapping** — use snapshot-diff (capture window IDs before spawn, poll after with exponential backoff up to 3s) rather than direct PID lookup; PID matching is unreliable for Xwayland apps and flatpak-sandboxed processes per official niri documentation and maintainer statements.

3. **Niri named workspaces are ephemeral — they disappear when empty** — always query `niri msg -j workspaces` at the start of `niriIntegration.open()` to check if the workspace already exists; never save niri workspace numeric IDs to YAML (they are session-scoped and change every session).

4. **tmux environment contamination when spawning from inside tmux** — use `env -u TMUX -u TMUX_PANE foot -e tmux new-session -A -s {name}` for all terminal spawn commands in the niri integration; `tmux new-session -A` is more robust than `tmux attach-session` (handles session not yet existing).

5. **Integration skip flags broken by orchestration refactor** — `skip.has(integration.id)` must remain the first guard in the new orchestration loop, before ordering and before `isEnabled`; add regression tests for `--no-ide` and `--no-cmux` before touching `workspace-ops.ts`.

## Implications for Roadmap

Based on research, the build order has strict dependencies that dictate phase structure. The interface change creates a TypeScript compile error cascade — it must be the first atomic step before any other work can proceed.

### Phase 1: Artifact Type Foundation
**Rationale:** Every other change in this milestone depends on the `ArtifactBag` and updated `Integration.open()` signature being defined and compiling. Doing this first keeps the build green throughout the rest of the work.
**Delivers:** `IntegrationArtifact` discriminated union, `ArtifactBag` type, updated `open()` signature using `void | T` transition union; all four existing integrations compile with mechanical `_bag` parameter and `return null` additions.
**Addresses:** Interface migration (table stakes), artifact type confusion pitfall (Pitfall 5), integration interface breaking change pitfall (Pitfall 1).
**Avoids:** Pitfall 1 (non-atomic interface break) via the `void | T` transitional signature.

### Phase 2: Integration Runner Consolidation
**Rationale:** The four duplicated loops must be replaced before the artifact accumulation logic is built — otherwise the new bag-threading code would be written in one loop and need to be duplicated to three others. This phase has no external dependencies and unblocks all subsequent phases.
**Delivers:** `src/lib/integrations/runner.ts` with `runIntegrationGenerate()` and `runIntegrations()`; all four call sites updated; existing behavior preserved; skip-flag regression tests written and passing.
**Uses:** Updated types from Phase 1.
**Avoids:** Pitfall 8 (skip flags broken) and Anti-Pattern 5 (new inline loops at new call sites).

### Phase 3: Artifact Population in Existing Integrations
**Rationale:** Niri needs real values from tmux and cmux to do its job. This phase makes the bag actually useful rather than always-empty. VSCode/IntelliJ window ID capture is included here but can produce `null` — niri gracefully degrades when these are absent.
**Delivers:** tmux returns `{ type: "tmux", sessionName }`; cmux returns `{ type: "cmux", workspaceRef }`; vscode returns `{ type: "vscode", pid, windowId }` (windowId via snapshot-diff if `WAYLAND_DISPLAY` set, else null); intellij same; `open()` return type tightened from `void | T` to `T | null`.
**Implements:** Artifact accumulation loop in runner producing a populated `ArtifactBag`.
**Addresses:** tmux artifact (P1), cmux artifact (P1), VSCode artifact (P2) from feature prioritization matrix.

### Phase 4: Niri Shell Wrapper Library
**Rationale:** Isolating all `niri msg` CLI calls into `src/lib/niri.ts` before writing the integration plugin keeps the plugin testable and follows the established `tmux.ts` / `git.ts` pattern. The wrapper functions can be unit-tested independently of the integration lifecycle.
**Delivers:** `src/lib/niri.ts` with `isNiriRunning()`, `listNiriWindows()`, `listNiriWorkspaces()`, `focusNiriWorkspace()`, `setNiriWorkspaceName()`, `moveWindowToWorkspace()`, `niriSpawn()`, `waitForWindowByPid()`, `snapshotWindowIds()`.
**Avoids:** Pitfall 7 (IPC state inconsistency) by building name-based action calls from the start; Pitfall 2 (async window spawn) by building the snapshot-diff poll in `waitForWindowByPid()` with exponential backoff.

### Phase 5: Niri Integration Plugin
**Rationale:** All dependencies are in place — types defined, runner consolidated, artifacts populated, shell wrappers available. This is the full niri integration implementation.
**Delivers:** `src/lib/integrations/niri.ts` with full open lifecycle (applies-check, workspace create/focus, terminal spawn with tmux attach, window arrangement from bag); registered last in `index.ts`; cleanup hook in `runPreRemoveHooks()`; Zod config schema with `terminal`, `terminal_flags`, `workspace_name_prefix`, `arrange_windows`.
**Addresses:** All niri integration table stakes features; Pitfall 3 (workspace lifecycle), Pitfall 6 (tmux env contamination).

### Phase Ordering Rationale

- Phases 1 and 2 are pure refactors that must precede feature work to avoid duplicate bug-fixing across multiple loop implementations.
- Phase 3 depends on Phase 1 (types) and Phase 2 (runner); it makes the pipeline useful without requiring niri.
- Phase 4 is independent of Phase 3 and can be built in parallel but must precede Phase 5.
- Phase 5 depends on all prior phases; it is the integration point where everything comes together.
- This order means the build stays green and existing tests pass after each phase — no phase creates a partial state where the system is broken.

### Research Flags

Phases with well-documented patterns (standard implementation, skip research-phase):
- **Phase 1:** TypeScript interface migration is a standard refactor pattern; no domain research needed.
- **Phase 2:** Loop consolidation is mechanical; the `runner.ts` pseudocode from ARCHITECTURE.md is implementation-ready.
- **Phase 3:** All four integration files have been read; artifact values (session names, refs) are trivially accessible from existing code paths.
- **Phase 4:** The `niri msg` API is fully documented in STACK.md with verified command signatures. The snapshot-diff pattern is specified precisely in ARCHITECTURE.md. No additional research needed.

Phases that warrant careful implementation attention (no research-phase needed, but execution risk present):
- **Phase 5:** The full `niriIntegration.open()` flow is specified step-by-step in ARCHITECTURE.md. The tmux env-contamination fix (Pitfall 6) and workspace existence check (Pitfall 3) must be built from the start, not retrofitted. The "looks done but isn't" checklist in PITFALLS.md is the verification guide.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All niri commands verified against live niri 25.11; no new dependencies; existing codebase patterns confirmed from installed source |
| Features | HIGH | Feature list derived from direct codebase analysis of existing integration system combined with verified niri IPC capabilities |
| Architecture | HIGH | All four inline loop sites verified in source; runner design matches established patterns; build order has no ambiguous dependencies |
| Pitfalls | HIGH (niri-specific: MEDIUM) | Codebase pitfalls are code-verified with file/line evidence; niri async/IPC pitfalls sourced from official niri docs and maintainer statements |

**Overall confidence:** HIGH

### Gaps to Address

- **VSCode window ID via snapshot-diff** — VSCode takes 2-5 seconds to open; the 5s polling timeout should be sufficient but is untested against actual VSCode startup time in this environment. If VSCode consistently exceeds the timeout, `windowId` will be `null` and window arrangement is silently skipped. Validate timing during Phase 3 implementation.
- **Multiple empty workspaces at open time** — when `niriIntegration.open()` calls `focus-workspace <name>` to create a workspace, niri may have multiple unnamed empty workspaces if the user scrolled past the last workspace. The `set-workspace-name` logic needs to handle this case. Explicit test required during Phase 5.
- **cmux `app_id` string for window identification** — the research notes cmux has a known Wayland `app_id` that could be used for direct window lookup rather than snapshot-diff. The exact string was not verified against a running cmux instance. Verify during Phase 5 if cmux window arrangement is desired.

## Sources

### Primary (HIGH confidence)
- `niri msg --help`, `niri msg -j windows`, `niri msg -j workspaces` (live niri 25.11) — all command signatures and JSON output shapes verified on running compositor
- `niri msg action move-window-to-workspace --help`, `niri msg action focus-workspace --help`, `niri msg action spawn --help` — flag syntax confirmed
- `src/lib/integrations/types.ts` (installed source) — current `open()` signature returns `Promise<void>`
- `src/lib/integrations/{tmux,cmux,vscode,intellij}.ts` (installed source) — existing artifact values and open() patterns
- `src/lib/workspace-ops.ts` lines 573-579 and 462-469 (installed source) — inline loop location and skip logic
- `src/tui/{workspace-wizard,workspace-clone}.ts` and `src/tui/dashboard/App.tsx` (installed source) — all three generate-only loop sites confirmed

### Secondary (MEDIUM confidence)
- Niri IPC wiki: https://github.com/YaLTeR/niri/wiki/IPC — IPC state inconsistency warning
- Niri maintainer statement: https://github.com/niri-wm/niri/discussions/3208 — "no way to reliably associate a new window with a spawn command"
- Niri ephemeral workspaces: https://github.com/niri-wm/niri/discussions/3198 — workspace lifecycle documentation
- Niri async timing: https://github.com/niri-wm/niri/discussions/2602 — "might take a few hundred ms sometimes due to system load"
- Niri Xwayland PID issue: https://github.com/YaLTeR/niri/issues/2563 — PID matching unreliable for Xwayland apps

### Tertiary (LOW confidence)
- cmux `app_id` for Wayland window identification — inferred from integration research; exact string not verified against a running cmux instance

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
