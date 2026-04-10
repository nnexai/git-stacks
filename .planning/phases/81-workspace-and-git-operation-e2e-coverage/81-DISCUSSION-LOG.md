# Phase 81: Workspace and Git Operation E2E Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 81-Workspace and Git Operation E2E Coverage
**Areas discussed:** Create/clone proof strategy, Scenario granularity, Git topology realism, Env/hooks/cwd proof style

---

## Create/clone proof strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-built fixtures plus real side-effect verification | Bypass excluded wizard UX but verify the real resulting workspace YAML, branch start points, task/main paths, and worktree layout. | ✓ |
| Try to brute-force the interactive wizard flows | Treat wizard driving itself as the main E2E target. | |
| Rely mostly on lower-level mocks for create/clone proof | Avoid real CLI-side effect verification. | |

**User's choice:** Pre-built fixtures plus real side-effect verification.
**Notes:** Create/clone behavior still needs proof, but the interactive wizard UX itself is not the target of this phase.

---

## Scenario granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Smaller risk-focused scenarios | Slice coverage by behavior/risk domain instead of chaining everything into a huge journey. | ✓ |
| A few large end-to-end journeys | Favor broad narrative scenarios over targeted proof. | |
| Mix both evenly without a clear default | No strong structural bias. | |

**User's choice:** Smaller risk-focused scenarios.
**Notes:** The suite should stay easy to map back to flow-level inventory items and easy to debug when one assumption breaks.

---

## Git topology realism

| Option | Description | Selected |
|--------|-------------|----------|
| Disposable local bare remotes plus real clones/worktrees | Use real remote-backed git state to prove upstream, dirty, and remote guard behavior. | ✓ |
| Simpler single-repo local fixtures | Reduce setup realism in exchange for simpler tests. | |
| Lean on mocks for remote behavior | Avoid real remote topology in this phase. | |

**User's choice:** Disposable local bare remotes plus real clones/worktrees.
**Notes:** Remote-backed behavior should be proven against real git state, not approximated.

---

## Env/hooks/cwd proof style

| Option | Description | Selected |
|--------|-------------|----------|
| Probe scripts/hooks that write verifiable artifacts | Make hidden execution context observable via files/artifacts created during the command. | ✓ |
| Mostly stdout/stderr matching | Infer execution context from console output alone. | |
| Final YAML/state only | Infer execution context from end state without direct probes. | |

**User's choice:** Probe scripts/hooks that write verifiable artifacts.
**Notes:** Artifact-based proof is preferred for cwd/path/env assumptions because those are otherwise hard to assert robustly.

---

## Claude's Discretion

- Exact probe file formats and helper names.
- Exact test file grouping, as long as the suite remains risk-focused.
- Exact extension points between `tests/helpers.ts` and any nearby test-support modules.

## Deferred Ideas

- Driving wizard UX directly in subprocess E2E tests.
- A giant full-workspace journey suite as the default structure.
- Mocking away remote-backed git behavior instead of proving it with real repo topology.
