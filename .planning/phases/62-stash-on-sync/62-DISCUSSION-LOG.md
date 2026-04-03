# Phase 62: Stash on Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 62-stash-on-sync
**Areas discussed:** TUI stash support, Double-stash UX, Pop failure recovery

---

## TUI Stash Support

### Q1: Should TUI sync automatically use --stash when dirty repos detected?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-stash in TUI | Detects dirty repos, auto-stashes before syncing. No prompt. | ✓ |
| Prompt before stashing | Shows confirmation dialog. Gives control but adds friction. | |
| CLI-only, TUI refuses | TUI sync still fails on dirty repos. | |

**User's choice:** Auto-stash in TUI (Recommended)

---

## Double-stash UX

### Q2: When double-stash guard triggers?

| Option | Description | Selected |
|--------|-------------|----------|
| Abort sync with recovery hint | Message with recovery command. User must pop or drop old stash. | ✓ |
| Warn and skip stash | Skip stashing affected repo, continue. Repo stays dirty. | |
| Auto-drop and re-stash | Aggressive. Risk: drops uncommitted work from interrupted sync. | |

**User's choice:** Abort sync with recovery hint (Recommended)

---

## Pop Failure Recovery

### Q3: SyncResult when stash pop conflicts?

| Option | Description | Selected |
|--------|-------------|----------|
| ok:false | Any pop failure sets ok:false. Non-zero exit code. | ✓ |
| ok:true with warnings | Sync succeeded, pop is just a warning. Exit code 0. | |

**User's choice:** ok:false (Recommended)
**Notes:** Per STH-04. Workspace is in inconsistent state when pop fails.

---

## Claude's Discretion

- stashPush/stashPop return value details
- Conflict detection heuristic
- TUI progress view integration
- Test approach

## Deferred Ideas

- `--stash` on merge — STH-F1, v0.15+
