# Phase 87: Integration Contract and Source-Module Coverage - Research

**Researched:** 2026-05-15
**Status:** Complete

## Research Question

What does Phase 87 need in order to plan integration coverage that exercises real source modules while avoiding real forge CLIs, browsers, IDEs, desktop sessions, and window managers?

## Findings

### Test Runner Constraint

The project uses `scripts/test-runner.ts` because Bun `mock.module()` is process-global. Files that contain `mock.module(` must run through `bun run test` / `bun run test:unit` / `bun run test:integ`, not `bun test tests/`. Phase 87 plans must keep focused commands file-specific, and full verification must use the custom runner.

### Real-Source Gap

`tests/lib/integrations/issue-utils.test.ts` and `tests/lib/integrations/forge-utils.test.ts` currently restore behavior by inlining copies of source logic inside `mock.module()` factories. That protects against stale cross-file mocks but does not prove coverage for `src/lib/integrations/issue-utils.ts` or `src/lib/integrations/forge-utils.ts`. Phase 87 should replace those inline implementations with cache-isolated real imports after dependency mocks are registered.

### Utility Module Contracts

`src/lib/integrations/issue-utils.ts` owns linked issue resolution, link/unlink persistence, error formatting, and workspace argument resolution via explicit name or `detectWorkspaceFromCwd()`.

`src/lib/integrations/forge-utils.ts` owns worktree-only repo resolution, any-mode repo resolution, base branch fallback, forge mismatch errors, executable/remote detection, enabled-forge detection, and error formatting. It already exposes `_detect` for injected detection commands.

### Forge Command Contracts

`src/lib/integrations/github.ts`, `gitlab.ts`, `gitea.ts`, and `jira.ts` expose command registrations and mutable executor seams (`_exec.run`, `_exec.runCapture`, `_exec.openUrl`, `_exec.gitRemoteUrl`, `_exec.runShell`). Existing tests mostly prove command construction through mocked utility modules. Phase 87 should supplement or adjust them to cover missing failure branches without invoking real CLIs or browser windows.

### Session And IDE Contracts

Session/IDE integration modules already isolate external behavior behind library modules and executor seams:

- `tmux.ts` uses `src/lib/tmux.ts` helpers for session/pane/cleanup behavior.
- `cmux.ts` uses `src/lib/cmux.ts` helpers and currently has less integration-plugin-level coverage than tmux.
- `niri.ts` and `aerospace.ts` use fake window-manager helpers and artifact bags to route windows.
- `vscode.ts` and `intellij.ts` expose `_exec.spawn` and generation/open behavior.

Phase 87 should add focused contract tests for config parsing, command construction, artifact-bag use, skip behavior, and safe failure handling, without requiring real desktop tools.

## Recommended Plan Shape

1. Real-source `issue-utils` and `forge-utils` test repair.
2. Forge command contract tests for GitHub/GitLab/Gitea/Jira.
3. Session and IDE integration contract tests for tmux/cmux/niri/AeroSpace/VSCode/IntelliJ.
4. Source-bypassing mock audit plus coverage verification for integration source modules.

## Validation Architecture

Use automated validation only:

- Focused utility source tests: `bun test tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/forge-utils.test.ts`
- Focused forge command tests: `bun test tests/lib/integrations/github.test.ts tests/lib/integrations/gitlab.test.ts tests/lib/integrations/gitea.test.ts tests/lib/integrations/jira.test.ts`
- Focused session/IDE tests: `bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/cmux.test.ts tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts tests/lib/integrations/vscode.test.ts tests/lib/integrations/intellij.test.ts`
- Full runner gate: `bun run test:unit`
- Type safety: `bun run typecheck`
- Coverage and local gates after source changes: `bun run coverage:unit` and `bun run verify:gates`

Do not run `bun test tests/` directly.

## Out Of Scope

- Live forge authentication.
- Real browser windows.
- Real IDE launches.
- Real Niri, AeroSpace, tmux, or cmux environments.
- CI workflow changes.
- Phase 88 functional readiness classification and release evidence.
