# Phase 105: Shared Native Model and Terminal Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 105-shared-native-model-and-terminal-foundation
**Areas discussed:** Shared state semantics, Restored terminal truth, Terminal ownership and teardown, Terminal proof standard

---

## Shared State Semantics

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Event connection interrupted | Keep last valid data visible and mark it stale | Replace view with disconnected state; appear normal until reconnect fails |
| Newer authoritative revision detected | Freeze affected mutations; retain navigation | Permit all actions with warning; block the whole client |
| Reachable but incompatible protocol | Preserve presentation/session metadata only | Preserve stale service snapshot; clear everything |
| Unknown unnegotiated item | Keep inert and surface degraded compatibility | Ignore silently; make client fully incompatible |

**User's choices:** Selected the recommended option for all four questions.
**Notes:** Recovery preserves useful context but never presents uncertain service data or behavior as authoritative.

---

## Restored Terminal Truth

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Metadata restored after restart | Identity and presentation context only | Include command/launch details; restore only title and binding |
| Process cannot be proven alive | Show restored-but-ended with relaunch | Remove automatically; show ordinary disconnected tab |
| Relaunch identity | New identity linked to predecessor | Reuse identity with generation; replace old record |
| Partially corrupt session | Restore valid entries; quarantine invalid entries | Reject whole session; silently drop invalid entries |

**User's choices:** Selected the recommended option for all four questions.
**Notes:** Persistence never claims process continuity and never retains sensitive launch material merely for convenience.

---

## Terminal Ownership and Teardown

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| User closes live surface | Graceful request, bounded wait, process-group termination | Immediate termination; detach and leave running |
| Close confirmation | Only for meaningful foreground activity | Always confirm; never confirm |
| Cleanup cannot be proven | Visible failed state with retained diagnostics | Global warning after disposal; log silently |
| Native client crashes | Separate ownership guard terminates owned groups | Preserve for recovery; rely only on parent death |

**User's choices:** Selected the recommended option for all four questions.
**Notes:** Exclusive ownership includes structural crash cleanup and visible failure when the invariant cannot be proven.

---

## Terminal Proof Standard

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Required evidence | Automated lifecycle tests and documented real-session acceptance | Automated only; manual only |
| Stress-test result | Zero surviving ownership and bounded resource baseline | Exact byte equality; process-orphan check only |
| Dependency upgrades | Immutable pins and dedicated compatibility change | Routine paired updates; compatible version ranges |
| Accessibility acceptance | Verified semantics, documented gaps, core behavior gate | Complete parity blocker; documentation-only acceptance |

**User's choices:** Selected the recommended option for all four questions.
**Notes:** The proof combines deterministic automation with real interaction evidence and treats dependency changes as explicit compatibility work.

---

## the agent's Discretion

- Concrete representations, encodings, persistence layout, timeout values, activity detection, guard implementation, thresholds, and harness design remain planner discretion within the locked semantics.

## Deferred Ideas

- None.
