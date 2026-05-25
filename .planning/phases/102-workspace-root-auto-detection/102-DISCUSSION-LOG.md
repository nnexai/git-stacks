# Phase 102: Workspace Root Auto-detection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 102-Workspace Root Auto-detection
**Areas discussed:** Todo fold-in, Workspace-root match semantics, Command surface coverage, Resolver consolidation, Edge-case proof depth

---

## Todo Fold-in

| Option | Description | Selected |
|--------|-------------|----------|
| Fold Improve TUI dashboard experience | Dashboard UI context only; not directly workspace-root detection. | |
| Fold Add manual workspace commands | Related because `git-stacks command` uses workspace detection. | |
| Fold Add workspace notes | Related because `git-stacks notes` uses workspace detection. | |
| Fold Add workspace stale view | Future advisory workflow. | |
| Fold Create workspace from forge source | Already resolved by Phase 92. | |
| Fold Improve template composition understanding | Not related to workspace-root detection. | |
| None / review only | Keep matched todos reviewed but not folded. | ✓ |

**User's choice:** 7
**Notes:** All six matched todos are reviewed-only deferred context. Phase 102 stays focused on shared cwd workspace resolution.

---

## Workspace-root Match Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Exact root only | Match `tasks/<workspace>` but not arbitrary non-repo subdirectories. | |
| Root plus every subdirectory | Treat the workspace root and all descendants as the workspace; repo identity is secondary. | ✓ |
| You decide | Planner chooses after code inspection. | |

**User's choice:** Every subdirectory as well.
**Notes:** User clarified: "so always workspace, and repo is a secondary part to the autodetection. commands that only require a workspace should take that and if they require repo than take it."

---

## Command Surface Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Exhaustive optional-workspace CLI matrix | Prove every optional-workspace command through subprocess coverage. | |
| Representative set | Pick enough command surfaces to prove shared behavior and distinct resolver shapes. | ✓ |
| You decide | Planner chooses exact breadth. | ✓ |

**User's choice:** "just pick"
**Notes:** Context locks representative coverage rather than exhaustive subprocess coverage. The implementor should choose at least three surfaces covering different resolver shapes.

---

## Resolver Consolidation

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helper/resolver | Follow the earlier repo/workspace helper pattern. | ✓ |
| Command-local wrappers | Allow each command to resolve independently if documented and tested. | |
| You decide | Planner chooses after inspection. | |

**User's choice:** "the same as repo / workspace was done - i assume helper?"
**Notes:** Context expects a shared helper/resolver, with thin command adapters only where command-specific validation or error text is useful.

---

## Edge-case Proof Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Large edge-case matrix | Exhaustive coverage across dir repos, trunk repos, missing worktrees, prefixes, and subprocess flows. | |
| Pragmatic implementor-led proof | Preserve known fragile cases without expanding into a large matrix. | ✓ |
| You decide | Planner/implementor chooses exact depth. | ✓ |

**User's choice:** "not a lot needed leave it to implementor"
**Notes:** Context leaves exact edge-case depth to planning and implementation judgment while requiring the known fragile resolver cases to remain protected.

---

## the agent's Discretion

- Choose the exact representative command surfaces for subprocess coverage.
- Choose the shared helper API and module placement.
- Choose the minimum edge-case test matrix after inspecting current tests.

## Deferred Ideas

- Improve TUI dashboard experience — reviewed-only.
- Add manual workspace commands — reviewed-only; shipped surface may be tested, but no new command behavior.
- Add workspace notes — reviewed-only; shipped surface may be tested, but no new notes behavior.
- Add workspace stale view — future advisory workflow.
- Create workspace from forge source — already resolved by Phase 92.
- Improve template composition understanding — future ergonomics/support idea.
