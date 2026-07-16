---
gsd_state_version: 1.0
milestone: v0.22.0
milestone_name: Workspace Productivity
current_phase: 125
current_phase_name: Terminal-Safe Keyboard Navigation
status: planning
stopped_at: Phase 124 verified and complete; ready for Phase 125 discussion
last_updated: "2026-07-16T14:08:32.514Z"
last_activity: 2026-07-16
last_activity_desc: Phase 124 complete, transitioned to Phase 125
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 15
  completed_plans: 15
  percent: 40
---

# Project State

## Current Position

Phase: 125 — Terminal-Safe Keyboard Navigation
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-16 — Phase 124 complete, transitioned to Phase 125

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
- [Phase 123]: Archive state is canonical only when archived true and archived_at are both present; active state omits both fields.
- [Phase 123]: Removal inspection always performs the dirty check and returns an opaque resolved plan; allow_dirty bypasses only blockers captured by that inspection.
- [Phase 123]: Workspace definition updates and deletion resolve the authoritative backing YAML path so filename drift cannot redirect or strand lifecycle mutation.
- [Phase 123]: Catalog revision digests both active projections and minimal archived summaries, including all-archived state.
- [Phase 123]: Force eligibility is schema-valid only for workspace_dirty after terminals are confirmed stopped; confirmation_name exists only on workspace.force-remove.
- [Phase 123]: workspacePriorityOrder delegates to workspaceSuccessorOrder with neutral activity and ID defaults instead of retaining a divergent algorithm.
- [Phase 123]: A queued same-workspace lifecycle lease keeps admission continuously blocked while unrelated workspace leases remain independent. — Prevents an allocation gap between sequential lifecycle mutations without a global lock.
- [Phase 123]: SIGTERM and SIGKILL are attempts only; the shared PTY exit promise is the sole successful close signal. — Signal delivery cannot prove process exit or authorize filesystem mutation.
- [Phase 123]: Internal workspace shutdown returns only status and counts, never cross-principal session metadata. — Lifecycle cleanup needs cross-principal authority without client-visible enumeration authority.
- [Phase 123]: The stable workspace lease begins before execution-time catalog validation and is released only after authoritative reconciliation or failure cleanup. — This prevents target-local TOCTOU without introducing a global workspace lock.
- [Phase 123]: Force Remove derives allow_dirty only from its own fresh workspace_dirty inspection and checks the exact current authoritative name before commit. — A stale client or clean/non-dirty failure cannot manufacture destructive force authority.
- [Phase 123]: Typed lifecycle details live on durable failed operations instead of being reconstructed from error text. — Thin clients need blocker and force eligibility data without owning or parsing lifecycle policy.
- [Phase 123]: Lifecycle schemas stay separate from legacy name-based core mutations; service clients carry stable-ID/revision intent while daemonless CLI authority remains unchanged. — Prevents a second destructive transport shape from owning lifecycle policy.
- [Phase 123]: Trusted operation.submit is single-attempt; reconnection resumes observation only after a durable operation ID is received. — A transport retry must never replay destructive intent.
- [Phase 123]: The router constructs the sole terminal manager with shared admission, then the composition factory creates the coordinator from that exact manager and aggregate snapshot. — Preserves terminal idle accounting and one lifecycle authority.
- [Phase 123]: Browser lifecycle submission is attempted once; only the returned durable operation ID is observed afterward. — Prevents destructive intent from being replayed after reconnect or stale state.
- [Phase 123]: Every lifecycle terminal state refreshes authoritative catalog, terminal, and signal replacement sets before presentation settles. — Service-side terminal state may change even when persisted workspace mutation fails.
- [Phase 123]: The browser web.snapshot route consumes the aggregate catalog. — Archive-only and all-archived revisions must not fall back to zero.
- [Phase 123]: TUI lifecycle intent uses stable projection ID plus the current authoritative core revision. — Authoritative reload settles signals and selection before completion.
- [Phase 123]: Force Remove exists only for typed dirty state with stopped terminals and exact current-name confirmation. — Prevents message parsing and client-side privilege elevation.
- [Phase 123]: TUI active ordering consumes the shared workspaceSuccessorOrder seam. — Web and TUI use the same pin priority activity name and stable-ID ordering.
- [Phase 123]: Date-only workspace `created` fallbacks normalize to UTC midnight at the service projection boundary while offset-aware timestamps remain unchanged; executor-operable evidence closes Phase 123 while live browser/OpenTUI approval remains Phase 127's milestone-end human gate. — Keeps YAML compatible and strict datetimes intact without impersonating human verification.

## Validated Inputs

- Spikes 016-017: node-pty/prebuild acceptance plus Node service transport, backpressure, auth, replay, and shutdown behavior.
- Spikes 018-019: Node-compatible package boundaries plus filesystem-authoritative synchronization, atomic writes, and lost-update corrections.
- Spikes 011-015 and Phases 116-121: remote identity/reconnect/framing constraints plus the delivered secure transport, pairing, rollover, routing, browser grants, and local-default cutover.

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

- Verify completed Phase 123 evidence, advance to Phase 124, and preserve the Phase 127 milestone-end checklist before any tag, push, publish, or release.

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 123 P01 | 11 min | 2 tasks | 10 files |
| Phase 123 P02 | 10 min | 2 tasks | 12 files |
| Phase 123 P03 | 7 min | 2 tasks | 3 files |
| Phase 123 P04 | 7 min | 2 tasks | 5 files |
| Phase 123 P05 | 10 min | 2 tasks | 6 files |
| Phase 123 P06 | 9 min | 3 tasks | 6 files |
| Phase 123 P07 | 25 min | 3 tasks | 9 files |
| Phase 123 P08 | 22 min | 2 tasks | 5 files |

## Session

**Last session:** 2026-07-16T08:07:26.963Z
**Stopped at:** Completed 123-08-PLAN.md
**Resume file:** None
