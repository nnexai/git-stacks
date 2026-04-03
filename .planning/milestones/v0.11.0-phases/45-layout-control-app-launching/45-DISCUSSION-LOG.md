# Phase 45: Layout Control & App Launching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 45-Layout Control & App Launching
**Areas discussed:** Config schema design, Commands array structure, Execution sequencing, Normalization behavior

---

## Config Schema Design

| Option | Description | Selected |
|--------|-------------|----------|
| Flat fields | All fields at top level alongside workspace/enabled | |
| Nested behavior object | Group under behavior: sub-key | |
| Match niri's shape | windows array like niri's columns | |
| (Other) | Workspace on top, window schema nested, follow AeroSpace model | ✓ |

**User's choice:** Other — workspace on top, window schema nested, follow AeroSpace's node graph model
**Notes:** User directed to research AeroSpace's actual layout model. AeroSpace uses tree/container model with auto-tiling — no explicit column positioning needed. Config ended up as flat workspace-level fields + commands array, reflecting AeroSpace's simpler model vs niri's column layout. User confirmed the preview config shape.

### Research Conducted
- Fetched AeroSpace guide: tree structure, container model, normalization, layout types
- Fetched AeroSpace commands reference: layout, flatten-workspace-tree, split, join-with, --json support
- Key finding: `split` disabled when normalization flatten is enabled (default). `join-with` preferred.
- Key finding: `--json` flag available on list commands as alternative to `--format` TSV

---

## Commands Array Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Shell strings only | Each entry is a plain shell command string | |
| Structured with app+command | Two modes: app and command, plus cwd/repo | |
| Full niri parity | All fields: app, command, source, repo, cwd, args, focus | ✓ |

**User's choice:** Full niri parity
**Notes:** Maximum flexibility. Reuse niri's schema shape for consistency.

---

## Execution Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Flatten → Move bag → Commands → Layout → Focus | Layout AFTER windows ensures correct tiling | ✓ |
| Flatten → Layout → Move bag → Commands → Focus | Layout BEFORE windows | |
| You decide | Claude determines optimal order | |

**User's choice:** Flatten → Move bag → Commands → Layout → Focus
**Notes:** Layout applied after all windows placed so they tile correctly into the desired configuration.

---

## Normalization Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Support both paths | True: flatten+layout. False: split-based. Both tested. | ✓ |
| True-only, warn on false | Only normalize path, warn if false | |
| You decide | Claude picks | |

**User's choice:** Support both paths
**Notes:** Both normalization: true and false code paths implemented and tested.

---

## Claude's Discretion

- Zod schema field types and validation
- Layout command targeting (--workspace flag)
- Sequential vs parallel command launches
- Error handling for failed commands
- Spinner messaging
- --json vs --format TSV preference

## Deferred Ideas

- MULTI-01: Multi-monitor window routing
- TOML-01: Auto-detect normalization from aerospace.toml
