---
gsd_state_version: 1.0
milestone: v0.22.0
milestone_name: Workspace Productivity
status: planning
last_updated: "2026-07-16T07:48:42+02:00"
last_activity: 2026-07-16
last_activity_desc: Phase 123 planning complete — 8 plans ready in 7 waves
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 8
  completed_plans: 0
  percent: 0
current_phase: 123
current_phase_name: Archived Workspaces and Safe Removal
stopped_at: Phase 123 planned and verified; ready to execute 8 plans in 7 waves
---

# Project State

## Current Position

Phase: 123 of 127 (Archived Workspaces and Safe Removal)
Plan: 0 of 8
Status: Ready to execute
Last activity: 2026-07-16 — Phase 123 planning complete and independently verified

## Decisions

- Archived state lives in workspace YAML as `archived` plus `archived_at`; archived workspaces stay out of all normal projections, archive first stops and confirms every service-owned terminal before persisted mutation, and repositories/worktrees/files/notes/configuration/pin state remain intact without terminal recreation on unarchive.
- Web and TUI expose exact-name Force Remove only after a fresh typed dirty-worktree block with terminals already stopped; terminal, stale-revision, not-found, parse, hook, clean-target, and other non-dirty failures can never enable force.
- Remove is confirmed destruction and closes workspace terminals before the existing dirty-worktree guard and filesystem deletion.
- User-authored commands and hooks prefer the actual configured Bash/zsh/fish environment over `/bin/sh` portability; internal machine operations do not inherit this shell contract.
- Trusted launchers may refresh only allowlisted dynamic environment values into the helper; raw environment values never enter browser projections or workspace YAML.
- Web shortcuts use collision-audited platform app modifiers while xterm is focused; `Ctrl+K` remains an optional alias rather than stealing the shell's default kill-line binding.
- Fuzzy switchers and configured-command search execute the top-ranked partial match on Enter and use singleton overlays.
- Stale detection is explainable and suggestion-only; it never archives or removes automatically.
- The milestone prepares `v0.22.0-rc.1`; tag, push, publish, and release remain separately approved actions.
- Node 24 LTS is the default runtime target for core, CLI, service, and web distribution.
- TypeScript stays on 6.x for this migration.
- The existing CLI remains local-only and daemonless; ordinary commands invoke the core directly.
- The Node service owns persistent snapshots, operations, events, signals, authentication, and terminal sessions.
- Web and optional TUI clients remain thin service clients; Bun is isolated to the optional OpenTUI package.
- `node-pty` `1.2.0-beta.14` is accepted temporarily and must be exact-pinned, prebuild-only for supported installs, actual-host tested, and reviewed before each update.
- Files are authoritative. Watchers provide latency; aggregate content reconciliation provides correctness.
- No global lock is introduced. Only semantic per-target read-modify-write operations may coordinate across processes.
- Protocol and terminal policy remain carrier-neutral so future encrypted remote clients do not require another core rewrite.
- Classified product traffic has no HTTP, SSE, WebSocket, or plaintext fallback; browser sessions use pinned WebTransport and TUI sessions use directly trusted-leaf TLS 1.3 plus in-channel proof.
- Browser authority is one-use and memory-only. Browser storage and localhost origin are never identity or durable trust.
- Remote carriers are isolated per authenticated local principal. This intentionally avoids sharing one helper-authenticated carrier across principals without a separate delegated-session protocol.
- Carrier loss fails the affected authenticated session closed. A fresh launch reconnects with bounded retry and reattaches service-owned terminals; non-idempotent work is never silently replayed.
- Migration phases cut callers over and delete old implementations; temporary shims may forward but never own behavior.

## Validated Inputs

- Spike 016: node-pty behavior and four-platform prebuild shape; beta adoption explicitly accepted.
- Spike 017: Node HTTP, SSE, WebSocket, backpressure, auth, replay, and shutdown.
- Spike 018: Node-compatible core and enforceable package boundaries.
- Spike 019: filesystem-authoritative synchronization, plus required atomic-write and lost-update corrections.
- Spikes 011-015: future remote identity, reconnect, framing, backpressure, and encrypted-carrier constraints to preserve.
- Phases 116-121: secure framing, identities, pairing, signed pin rollover, encrypted carriers, remote routing, ephemeral browser grants, and local-default client cutover.

## Previous Milestone Release Evidence

- The hosted `Build and test` workflow completed successfully for shipped implementation commit `e878f964` on 2026-07-15: https://github.com/nnexai/git-stacks/actions/runs/29442095014
- `node-pty` `1.2.0-beta.14` remains exact-pinned; its temporary beta exception must be reviewed on every dependency update.
- No final `v0.21.0` tag, push, publish, or release was requested or performed during milestone closeout.

## Previous Milestone Boundary

The full implementation, secure transport cutover, hosted release gates, and package-version progression through `0.21.0-rc.6` are complete. Milestone closure is a planning operation only and does not imply a final `v0.21.0` release.

## Previous Milestone Verification Overrides

- Phases 116-122 were delivered and shipped through release candidates, but several phase directories lack the standard GSD `SUMMARY.md` and/or `VERIFICATION.md` artifacts.
- Duplicate historical directory names remain for Phases 118 and 120. They are preserved in the archive rather than rewritten after delivery.
- The successful hosted workflow above closes `TERM-03`, `DIST-01`, `DIST-03`, and `SEC-02`; the missing standard phase artifacts are accepted as planning debt by explicit user choice.

## Milestone-End Manual Verification

This is a durable, non-blocking handoff, not a deferred phase and not a Phase 123 completion gate. Phase 127 owns this checklist after all Phase 127 automated and hosted gates pass and before any tag, push, publish, or release. Automated contract, projection, and render-harness evidence must never be reported as human browser/OpenTUI approval. The autonomous milestone run stops before tagging so the user can perform and approve this verification.

1. From the repository root, build the exact local package outputs: `npm run build:packages && npm run web:build && npm run tui:build`.
2. In one shell, create an isolated fixture root, export the file-backed key-store mode before any service/CLI launch, and create the committed local source: `export PHASE123_UAT_ROOT="$(mktemp -d -t git-stacks-123-XXXXXX)"; export GIT_STACKS_CONFIG_DIR="$PHASE123_UAT_ROOT/config"; export GIT_STACKS_KEY_STORE=file; mkdir -p "$GIT_STACKS_CONFIG_DIR/workspaces" "$GIT_STACKS_CONFIG_DIR/templates" "$GIT_STACKS_CONFIG_DIR/notes" "$PHASE123_UAT_ROOT/workspaces"; test "$GIT_STACKS_CONFIG_DIR" = "$PHASE123_UAT_ROOT/config"; git init -b main "$PHASE123_UAT_ROOT/source"; git -C "$PHASE123_UAT_ROOT/source" config user.email phase123@example.invalid; git -C "$PHASE123_UAT_ROOT/source" config user.name "Phase 123 UAT"; printf 'fixture\n' > "$PHASE123_UAT_ROOT/source/README.md"; git -C "$PHASE123_UAT_ROOT/source" add README.md; git -C "$PHASE123_UAT_ROOT/source" commit -m fixture`. All file-backed key material must remain under this guarded config/root pair.
3. Write a valid isolated config, registry, and template using only fixture paths: `printf 'workspace_root: "%s"\n' "$PHASE123_UAT_ROOT/workspaces" > "$GIT_STACKS_CONFIG_DIR/config.yml"; printf '%s\n' '- name: phase123-source' '  schema_version: "1"' "  local_path: \"$PHASE123_UAT_ROOT/source\"" '  default_branch: main' '  type: other' '  is_dir: false' > "$GIT_STACKS_CONFIG_DIR/registry.yml"; printf '%s\n' 'name: phase123-uat' 'schema_version: "1"' 'repos:' '  - repo: phase123-source' '    mode: worktree' '    base_branch: main' > "$GIT_STACKS_CONFIG_DIR/templates/phase123-uat.yml"`.
4. Re-export file-backed key-store mode before the CLI launches, then provision nine independent disposable workspaces through the supported template-name form: `export GIT_STACKS_KEY_STORE=file; for name in uat-order-1 uat-order-2 uat-order-3 uat-order-4 uat-order-5 uat-clean-web uat-clean-tui uat-dirty-web uat-dirty-tui; do node packages/cli/dist/index.js new "$name" --from phase123-uat --branch "uat/$name" --non-interactive || exit 1; done; export GIT_STACKS_KEY_STORE=file; node packages/cli/dist/index.js list`. The list must show all nine names.
5. Set exact successor metadata before service launch: `node --input-type=module -e 'import { readFileSync, writeFileSync } from "node:fs"; import { join } from "node:path"; import { parse, stringify } from "yaml"; const values={"uat-order-1":{pinned:true,priority:300,last_opened:"2026-07-16T12:00:00.000Z"},"uat-order-2":{pinned:true,priority:200,last_opened:"2026-07-14T12:00:00.000Z"},"uat-order-3":{priority:100,last_opened:"2026-07-15T12:00:00.000Z"},"uat-order-4":{priority:100,last_opened:"2026-07-16T12:00:00.000Z"},"uat-order-5":{priority:90,last_opened:"2026-07-17T12:00:00.000Z"}}; for (const [name,metadata] of Object.entries(values)){const path=join(process.env.GIT_STACKS_CONFIG_DIR,"workspaces",name + ".yml"); const workspace=parse(readFileSync(path,"utf8")); Object.assign(workspace,metadata); writeFileSync(path,stringify(workspace));}'`. This makes `uat-order-2` the expected successor after archiving `uat-order-1` because pinned beats all unpinned priorities; after `uat-order-2` is also archived, `uat-order-4` must beat `uat-order-3` by newer activity at equal priority and beat newer `uat-order-5` because priority 100 beats 90.
6. Re-export file-backed key-store mode before each CLI launch, then dirty two independent managed worktrees: `export GIT_STACKS_KEY_STORE=file; export DIRTY_WEB_PATH="$(node packages/cli/dist/index.js paths uat-dirty-web | head -n 1)"; export GIT_STACKS_KEY_STORE=file; export DIRTY_TUI_PATH="$(node packages/cli/dist/index.js paths uat-dirty-tui | head -n 1)"; test -d "$DIRTY_WEB_PATH" && test -d "$DIRTY_TUI_PATH"; printf 'dirty web\n' > "$DIRTY_WEB_PATH/phase123-dirty-web.txt"; printf 'dirty tui\n' > "$DIRTY_TUI_PATH/phase123-dirty-tui.txt"; git -C "$DIRTY_WEB_PATH" status --short; git -C "$DIRTY_TUI_PATH" status --short`. Both status commands must show their untracked file.
7. Re-export file-backed key-store mode and launch web from that same shell with `export GIT_STACKS_KEY_STORE=file; node packages/cli/dist/index.js web`. In a second terminal, copy the non-empty values printed by `printf 'export PHASE123_UAT_ROOT=%q\nexport GIT_STACKS_CONFIG_DIR=%q\nexport GIT_STACKS_KEY_STORE=%q\n' "$PHASE123_UAT_ROOT" "$GIT_STACKS_CONFIG_DIR" "$GIT_STACKS_KEY_STORE"`, run all three exports, assert `test "$GIT_STACKS_KEY_STORE" = file`, then launch `bun packages/tui/dist/index.js`. Both clients must show the same nine-workspace catalog, and both launches must keep file-backed key material beneath `GIT_STACKS_CONFIG_DIR` inside the guarded fixture root.
8. In web, select `uat-order-1`, create a terminal, and Archive. Confirm one-step archive, confirmed terminal exit, and automatic selection of `uat-order-2`; Undo and confirm `uat-order-1` returns with its pin but not its stopped terminal. Archive `uat-order-1` again, then archive `uat-order-2`; selection must become `uat-order-4`, proving priority then activity tie-breaking against `uat-order-3` and `uat-order-5`. In Archived Workspaces verify newest-first identity/activity/Unarchive-only rows, then unarchive both ordering workspaces.
9. In web, Remove `uat-clean-web`: inventory must name workspace, terminals, managed worktrees, directory, and YAML; Escape/default cancel submits nothing; confirmation shows named progress and authoritative replacement. Normal Remove of `uat-dirty-web` must stop terminals first, list every blocker, and preserve its worktree/directory/YAML. Wrong, partial, and case-mismatched names stay disabled; exact `uat-dirty-web` enables a new Force Remove intent and deletes only that target.
10. In TUI, repeat archive/Undo/unarchive on an ordering workspace and default-cancel normal Remove on `uat-clean-tui`, then confirm its clean removal. Use `uat-dirty-tui` for the independent dirty-blocked flow and exact-name Force Remove. Confirm named progress, focus/input behavior, authoritative tabs/signals/counts/navigation replacement, and no archived detail/action drill-in.
11. During one Remove confirmation, mutate state from the other client (for example pin/unpin a different active workspace), then submit the stale confirmation. Confirm refresh occurs with no replay and a new destructive action plus confirmation is required. After the clean/dirty targets are gone, archive `uat-order-1` through `uat-order-5` one by one and verify the final transition has no active selection, tabs, signals, counts, or normal workspace rows while Archived Workspaces remains populated. Unarchive all five and verify the Archived Workspaces empty state, proving the independent active-empty and archive-empty transitions. Confirm no browser projection exposes paths, secrets, raw environment, another principal's terminal metadata, or archived repository details.
12. After approval or abandonment, clean up only from a shell that still has the fixture variables. Re-export file-backed key-store mode and require service stop to succeed before deletion: `export GIT_STACKS_KEY_STORE=file; if ! node packages/cli/dist/index.js service stop; then printf 'service stop failed; fixture retained at %s\nretry service stop with GIT_STACKS_CONFIG_DIR=%s and GIT_STACKS_KEY_STORE=file before guarded cleanup\n' "$PHASE123_UAT_ROOT" "$GIT_STACKS_CONFIG_DIR" >&2; exit 1; fi; test -n "$PHASE123_UAT_ROOT" && test -d "$PHASE123_UAT_ROOT" && test "$PHASE123_UAT_ROOT" != / && case "$(basename "$PHASE123_UAT_ROOT")" in git-stacks-123-*) rm -rf -- "$PHASE123_UAT_ROOT" ;; *) printf 'refusing unexpected fixture root: %s\n' "$PHASE123_UAT_ROOT" >&2; exit 1 ;; esac; unset GIT_STACKS_KEY_STORE GIT_STACKS_CONFIG_DIR PHASE123_UAT_ROOT DIRTY_WEB_PATH DIRTY_TUI_PATH`. If service stop fails, retain the fixture and use the printed environment/retry instructions; never delete a live or ambiguously owned fixture and never run cleanup with an empty or unexpected root.

## Deferred Items

The following pre-existing backlog items remain open for explicit triage; milestone closure does not claim they were delivered:

- `2026-05-15-add-manual-workspace-commands.md`
- `2026-05-15-add-workspace-notes.md`
- `2026-05-15-add-workspace-stale-view.md`
- `2026-05-15-create-workspace-from-forge-source.md`
- `2026-05-15-improve-template-composition-understanding.md`
- `2026-05-15-improve-tui-dashboard-experience.md`
- `2026-07-09-plan-broader-code-quality-improvement-run.md`

## Operator Next Steps

- Execute Phase 123 plans 01–08 in wave order, then verify the phase before advancing to Phase 124.
- Preserve the Milestone-End Manual Verification checklist for Phase 127; do not tag, push, publish, or release before the user completes it.
