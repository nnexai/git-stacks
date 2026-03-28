# Phase 44: Core Integration Plugin - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 44-Core Integration Plugin
**Areas discussed:** WindowDetector pattern, Config schema scope, Target workspace validation, Integration structure

---

## WindowDetector Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, implement WindowDetector | Match niri pattern. runner.ts captures AeroSpace window IDs from tier-1 spawns. | ✓ |
| No, inline detection only | Handle detection in open() only using snapshotWindowIds(). | |
| You decide | Claude picks based on runner.ts integration. | |

**User's choice:** Yes, implement WindowDetector
**Notes:** Needed for AeroSpace to move vscode/intellij windows without tight coupling.

---

## Config Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (workspace + enabled) | Only Phase 44 fields. Phase 45 extends later. | ✓ |
| Pre-include Phase 45 fields | Add layout, normalization, focus, commands now as optional. | |
| You decide | Claude picks. | |

**User's choice:** Minimal (workspace + enabled)
**Notes:** Schema grows with features. Phase 45 configuration is where the interesting decisions live.

---

## Target Workspace Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Warn and skip | Log warning, return null. Non-blocking. | ✓ |
| Error and abort | Throw/error, stop AeroSpace integration. | |
| You decide | Claude picks. | |

**User's choice:** Warn and skip
**Notes:** AeroSpace workspaces are user-defined in aerospace.toml, can't be created at runtime.

---

## Integration Structure

### cleanup() Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit no-op method | Empty async function, documents DETECT-05 intent. | ✓ |
| Omit cleanup entirely | Interface makes it optional. | |

**User's choice:** Explicit no-op method

### open() Scaffolding

| Option | Description | Selected |
|--------|-------------|----------|
| Purely minimal | Gate → validate → move → done. No Phase 45 scaffolding. | ✓ |
| Include extension hooks | Placeholder sections for Phase 45. | |
| You decide | Claude structures for extensibility. | |

**User's choice:** Purely minimal
**Notes:** Phase 45 extends open() when layout features are added.

---

## Claude's Discretion

- Spinner/logging behavior (follow niri pattern)
- WindowDetector timing parameters
- Internal structuring
- Whether to add commands() method

## Deferred Ideas

None — discussion stayed within phase scope.
