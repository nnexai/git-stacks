# Phase 47: Multi-Workspace Schema - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 47-multi-workspace-schema
**Areas discussed:** Validation behavior, Config cascade, beforeSet typing

---

## Validation Behavior

### Error surfacing approach

| Option | Description | Selected |
|--------|-------------|----------|
| Throw with message | Throw an Error with plain-English message. Prevents open() from running with invalid config. | ✓ |
| Warn and skip | Log warning and return null from open(). Non-blocking. | |
| Validate in helper | Dedicated validateAerospaceConfig() returning result union. | |

**User's choice:** Throw with message
**Notes:** None

### Validation placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in open() | Checks sit right after config parsing, before processing loop. | |
| Separate function | Extract validateAerospaceConfig() — exported and unit-testable in isolation. | ✓ |

**User's choice:** Separate function
**Notes:** User specified it could also be used as part of doctor validation.

---

## Config Cascade

| Option | Description | Selected |
|--------|-------------|----------|
| Full replace | Workspace-level workspaces array completely replaces global/template-level array. Simple, predictable. | ✓ |
| Merge by workspace name | Entries with matching names are merged. More flexible but complex. | |
| enabled-only at top level | Only enabled can be overridden. Workspaces array inherited from whichever level defines it. | |

**User's choice:** Full replace
**Notes:** User clarified that workspaces on global level should not be possible. Template could work (especially with auto-assign — deferred for now).

---

## beforeSet Typing

| Option | Description | Selected |
|--------|-------------|----------|
| Consumed internally | snapshotWindowIds() reads beforeSet and excludes those IDs from delta result. | ✓ |
| Type-only, caller manages | SnapshotOpts gets the field but snapshotWindowIds() ignores it. Phase 48 loop manages filtering. | |

**User's choice:** Consumed internally
**Notes:** None

---

## Claude's Discretion

- Exact Zod schema field types and validation rules for workspace entry type
- Internal organization of validateAerospaceConfig() function
- Test fixture shapes for schema validation tests
- Whether aerospaceCommandSchema changes (likely unchanged)

## Deferred Ideas

- **AUTO-ASSIGN:** Automatic assignment of AeroSpace workspace names — mentioned during config cascade discussion as future enhancement for template-level config.
