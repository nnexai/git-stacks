# Phase 43: AeroSpace Shell Wrappers & Doctor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 43-AeroSpace Shell Wrappers & Doctor
**Areas discussed:** Output parsing, Wrapper scope, Running detection, Doctor check gating, Error handling, Test strategy, Exported interface

---

## Output Parsing

| Option | Description | Selected |
|--------|-------------|----------|
| Zod schemas on parsed fields | Match niri.ts pattern -- define Zod schemas, parse TSV, validate with z.array(schema).parse() | ✓ |
| Plain TypeScript types | Simpler, no runtime validation, types/interfaces only | |
| You decide | Claude picks approach | |

**User's choice:** Zod schemas on parsed fields
**Notes:** Consistency with niri.ts was the deciding factor.

### Format String Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded per function | Each wrapper knows its format string internally | |
| Configurable format | Pass format fields as parameter | |
| You decide | Claude picks best fit | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** Deferred to Claude -- hardcoded approach recommended per niri.ts precedent.

---

## Wrapper Scope

### snapshotWindowIds Inclusion

| Option | Description | Selected |
|--------|-------------|----------|
| Include in Phase 43 | Build alongside wrappers, matching niri.ts | ✓ |
| Defer to Phase 44 | Phase 43 only builds raw wrappers | |
| You decide | Claude picks | |

**User's choice:** Include in Phase 43
**Notes:** Keeps aerospace.ts self-contained like niri.ts.

### Additional Wrappers

| Option | Description | Selected |
|--------|-------------|----------|
| Just the listed 6 + snapshot | Stick to what's needed | |
| Add version check too | Include aerospace version/info wrapper | ✓ |
| You decide | Claude adds what makes sense | |

**User's choice:** Add version check too
**Notes:** Useful for doctor diagnostics and future compatibility.

---

## Running Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Platform + binary probe | Check platform then `which aerospace` | ✓ |
| Platform + process check | Check platform then `pgrep -x AeroSpace` or lightweight command | |
| Platform gate only | Just check process.platform === 'darwin' | |

**User's choice:** Platform + binary probe
**Notes:** Binary presence implies availability. Downstream callers handle runtime errors.

---

## Doctor Check Gating

| Option | Description | Selected |
|--------|-------------|----------|
| macOS-only visibility | Only show on macOS, Linux/Windows never see it | ✓ |
| Show everywhere, pass silently | Show on all platforms, auto-pass on non-macOS | |
| You decide | Claude picks | |

**User's choice:** macOS-only visibility
**Notes:** Keeps doctor output clean -- only relevant checks per platform.

---

## Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Match niri.ts exactly | Return empty arrays on failure, try/catch swallows | ✓ |
| Result union pattern | Return { ok, data } \| { ok: false, error } | |
| You decide | Claude picks | |

**User's choice:** Match niri.ts exactly
**Notes:** Consistency with existing wrapper pattern.

---

## Test Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror niri.test.ts pattern | _exec injection, TSV edge cases, Zod validation | ✓ |
| Minimal unit tests | Just public API surface with _exec mocks | |
| You decide | Claude designs tests | |

**User's choice:** Mirror niri.test.ts pattern
**Notes:** Includes multi-word app name edge cases per SC #4.

---

## Exported Interface

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, export interface | AerospaceCommands matching NiriCommands pattern | ✓ |
| Skip interface | Use typeof imports for Phase 44 tests | |

**User's choice:** Yes, export interface
**Notes:** Phase 44 consumer tests use it as mock completeness constraint.

---

## Claude's Discretion

- Format string selection per wrapper function (hardcoded internally)
- Exact Zod schema field definitions
- snapshotWindowIds timing parameters
- Internal helper structuring

## Deferred Ideas

None -- discussion stayed within phase scope.
