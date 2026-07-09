---
created: 2026-07-09T18:11:15.083Z
title: Plan broader code quality improvement run
area: tooling
files:
  - src/lib/workspace-lifecycle.ts
  - src/lib/workspace-git.ts
  - src/lib/integrations/
  - src/commands/
  - src/tui/dashboard/
  - src/tui/workspace-clone.ts
  - src/tui/workspace-wizard.ts
  - tests/support/istanbul-smoke.ts
  - tests/helpers.ts
---

## Problem

A deep parallel review on 2026-07-09 found 38 actionable correctness, security, robustness, and maintainability issues. Five high-risk auto-fixable findings were fixed in commits `8d0a9ce`, `930a2de`, `3b5dc67`, `ee94379`, and `de530ed`. The 33 findings below remain and should be planned as a broader improvement run rather than handled as unrelated spot fixes.

The next planning pass should preserve current CLI/TUI behavior unless a finding explicitly requires a product decision. It should split work into bounded vertical phases, put destructive-operation safety first, and require focused regression coverage plus `bun run verify` before completion.

## Remaining Findings

### A. Lifecycle, Git, and core CLI safety

1. **CORE-02 — High, decision required:** `src/lib/git.ts:160-164`, `src/commands/workspace.ts:453-458,502-503`. `clean --gone` treats every failed `ls-remote` as a deleted branch and checks only the first worktree repo. Network/auth failures or mixed multi-repo state can remove a live workspace. Define the multi-repo policy and distinguish missing refs from operational failure.
2. **CORE-03 — High, design/API change:** `src/lib/git.ts:167-183`, `src/lib/workspace-lifecycle.ts:467-502`. Merge conflict preflight converts some Git failures into an empty conflict list, allowing cleanup before the real merge failure. Return structured preflight status and require success for all repos before mutation.
3. **CORE-04 — High, lifecycle ordering decision:** `src/lib/workspace-lifecycle.ts:130-208,390-414,496-518`. `pre_remove` and `pre_merge` run after clean has removed worktrees/folders, so hooks run from the wrong cwd and can fail after irreversible mutation. Move aborting hooks ahead of cleanup and define transactional ordering.
4. **CORE-07 — High, product decision:** `src/lib/workspace-git.ts:473-499`. Pull uses the configured branch without verifying the checked-out branch, so it can merge a base branch into an unrelated feature branch. Decide between fail-on-mismatch, checkout, or ref-only update.
5. **CORE-08 — High, recreate semantics:** `src/commands/workspace.ts:203-267`. `open --recreate` can orphan removed repo worktrees, retain deleted integration settings, and miss template mode/field changes. Plan a complete diff-and-apply transaction.
6. **CORE-09 — Medium, auto-fixable:** `src/lib/env.ts:29-38`, `src/lib/config.ts:249`, `src/commands/workspace.ts:1099-1154`. Arbitrary environment keys are interpolated into shell export output. Validate env/port keys against shell identifier syntax.
7. **CORE-10 — Medium, auto-fixable:** `src/lib/ports.ts:229-277`. Explicit ports are checked against other workspaces but not duplicated within the same workspace. Reject or reallocate duplicate resolved values.
8. **CORE-11 — Medium, behavior decision:** `src/commands/doctor.ts:79-91,227-269`, `src/lib/workspace-ops.ts:251-255,324-329`. Doctor name-drift fixes call rename with identical old/new names and always fail. Choose whether filename or YAML name is canonical, then carry both values in fix operations.
9. **CORE-12 — Medium, auto-fixable:** `src/commands/repo.ts:38-40,80-90,174-190`, `src/lib/config.ts:101-113,420-430`. Repo add/rename bypass `NameSchema` and can write a registry that later fails to parse. Validate inputs and schema-parse before atomic write.
10. **CORE-13 — Medium, auto-fixable:** `src/commands/workspace.ts:619-627`. `git-stacks cd <workspace> <repo>` writes `task_path` directly and mishandles trunk/dir repos. Use the shared active repo-path resolver.
11. **CORE-14 — Medium, auto-fixable:** `src/commands/doctor.ts:327-384`. Installed forge CLI pass checks are included in `allIssues`, so a healthy configured installation reports `healthy: false`. Separate checks from problems or calculate health from warning/failure entries only.

### B. Integration correctness and platform adapters

12. **INT-01 — High, contract decision:** `src/lib/integrations/aerospace.ts:218,336-346`. AeroSpace accepts `normalization: false` but discards it and follows the same path as `true`. Implement the promised alternative layout sequence or remove the option/documented claim.
13. **INT-02 — High, cross-cutting auto-fix:** `src/lib/tmux.ts:42-43`, `src/lib/niri.ts:136-161`, `src/lib/aerospace.ts:168-169`, `src/lib/cmux.ts:19-26`. Mutating platform helpers ignore nonzero exit codes and report failed setup as ready. Introduce a checked execution contract and test failure propagation.
14. **INT-04 — High, auto-fixable:** `src/lib/tmux.ts:64-68`. Failed/empty pane lookup fabricates `%0`, which may target an unrelated user pane. Return null/failure and abort layout.
15. **INT-05 — Medium, auto-fixable:** `src/lib/integrations/niri.ts:182-188`, `src/lib/integrations/aerospace.ts:205-212`. `GS_WORKSPACE_PATH` expands to the tasks root instead of the concrete workspace directory.
16. **INT-06 — Medium, config semantics:** `src/lib/integrations/vscode.ts:31-38`, `src/lib/integrations/jira.ts:109-117`. Workspace-specific `cmd`/`open_cmd` settings are displayed but ignored during execution. Centralize integration config precedence.
17. **INT-07 — Medium, auto-fixable:** `src/lib/integrations/niri.ts:90-120`, `src/lib/integrations/aerospace.ts:128-155`. Unavailable window detectors are represented as empty snapshots and then poll for about 11 seconds. Encode detector availability and cap sleeps to remaining time.
18. **INT-08 — Medium, auto-fixable:** `src/lib/integrations/runner.ts:26-34`. Skipped integrations still run their detector begin/resolve side effects. Filter detectors with the same skip set.
19. **INT-09 — Medium, auto-fixable:** `src/lib/integrations/niri.ts:52-80`. The built-in Niri config example does not satisfy its own schema. Nest example windows correctly and add schema tests for every integration example.
20. **INT-10 — Medium, auto-fixable:** `src/lib/integrations/forge-utils.ts:184-199`. Forge detection uses substring matching and accepts spoofed hosts such as `notgithub.com`. Parse exact SSH/HTTPS hostnames.
21. **INT-11 — Medium, parser/API decision:** `src/lib/integrations/forge-source.ts:116-143`. Self-hosted GitHub pull URLs are classified as Gitea. Match configured provider origins and reject ambiguous unconfigured hosts.

### C. TUI state, transactional behavior, and IPC

22. **TUI-02 — High, auto-fixable:** `src/tui/dashboard/run.tsx:11-26`. A second dashboard unconditionally unlinks the first dashboard's live socket. Probe ownership/liveness before binding and verify ownership before cleanup.
23. **TUI-03 — High, transactional design:** `src/tui/workspace-clone.ts:59-80,212-239`. Clone leaves earlier worktrees and branches behind when a later repo fails. Route through the shared operation runner or add explicit reverse-order rollback.
24. **TUI-04 — High, auto-fixable with UX choice:** `src/tui/dashboard/App.tsx:1017-1047`. Dashboard template creation silently skips missing registry repos and can create partial/empty workspaces. Resolve all repos and fail closed before side effects.
25. **TUI-05 — Medium, auto-fixable:** `src/tui/dashboard/App.tsx:555-579`. Batch operations always finish with success even when an operation returns failure. Aggregate status and render failed completion.
26. **TUI-06 — Medium, auto-fixable:** `src/tui/dashboard/App.tsx:1248-1274`. Tab keys can hide create progress while creation continues, allowing overlapping mutations. Guard create-progress before global tab switching.
27. **TUI-07 — Medium, auto-fixable:** `src/tui/dashboard/hooks/useWorkspaces.ts:13-123`. Overlapping reloads can publish stale status after newer state. Add a load generation/token.
28. **TUI-08 — Medium, auto-fixable:** `src/tui/dashboard/run.tsx:31-40`. IPC assumes each byte-stream callback is one complete JSON record. Buffer newline-delimited frames, retain partial tails, and bound frame size.
29. **TUI-09 — Medium, auto-fixable:** `src/tui/dashboard/App.tsx:399-419`. Streaming command output corrupts multibyte UTF-8 split across chunks. Use streaming decoder mode and final flush.
30. **TUI-10 — Medium, auto-fixable:** `src/tui/workspace-wizard.ts:577-583`. Interactive creation ignores branch patterns inherited from included templates; non-interactive behavior is correct. Use the composed template.
31. **TUI-11 — Medium, product decision:** `src/tui/dashboard/App.tsx:186,846-882,1356-1364,1680-1700`. Template multi-selection is visible but actions use only the focused template. Implement explicit batch semantics or remove the affordance.

### D. Test and verification infrastructure

32. **TOOL-01 — Medium, auto-fixable:** `tests/commands/workspace-source.test.ts:16-21`, `tests/commands/release-rc.test.ts:88-93`, `tests/helpers.ts:21-67`. Direct Git fixtures inherit global signing/hooks/config and fail on machines with commit signing enabled. Route every fixture command through the existing isolated Git environment helper.
33. **TOOL-02 — Medium, auto-fixable and currently red:** `tests/support/istanbul-smoke.ts:24-31,55-65`. The temporary instrumented runtime cannot resolve project dependencies, then masks child failure as missing coverage JSON. Provide dependency resolution from the fixture, check child exit/file existence first, and report stderr. This is the sole remaining failure when the full suite is run with isolated Git config.

## Suggested Planning Shape

1. **Destructive lifecycle safety:** CORE-02, CORE-03, CORE-04, CORE-07, CORE-08, TUI-03.
2. **Integration execution contracts:** INT-01, INT-02, INT-04 through INT-11.
3. **TUI concurrency and IPC:** TUI-02, TUI-04 through TUI-11.
4. **Core validation and diagnostics:** CORE-09 through CORE-14.
5. **Verification reliability:** TOOL-01 and TOOL-02, ideally first if a green full-suite baseline is required before the other phases.

## Completion Standard

- Every finding has a focused regression test that fails before its fix.
- Destructive operations prove failure-before-mutation or rollback behavior with real temporary repositories.
- Platform adapters prove nonzero subprocess results cannot produce success artifacts/messages.
- `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bun run test`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates` pass.
- Any intentional behavior/API changes are documented in README/help and release notes.
