# Phase 40: Template Composition - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 40-Template Composition
**Areas discussed:** Resolution timing, Wizard integration, Files & integrations merge

---

## Resolution timing

| Option | Description | Selected |
|--------|-------------|----------|
| At workspace creation | Resolve during `git-stacks new`, workspace stores merged result | ✓ |
| At template read time | Eagerly resolve on every readTemplate() call | |
| You decide | Claude picks based on architecture | |

**User's choice:** At workspace creation
**Notes:** Consistent with how templates already work -- workspace YAML is a snapshot.

---

## Wizard integration

| Option | Description | Selected |
|--------|-------------|----------|
| CLI-only, wizard single-select | Multi-template via --template flags, wizard stays as-is | ✓ |
| Add multi-select to wizard | Checkbox selection in wizard | |
| You decide | Claude picks based on scope | |

**User's choice:** CLI-only, wizard stays single-select
**Notes:** Matches REQUIREMENTS.md Out of Scope note about TUI multi-template wizard.

---

## Files merge

| Option | Description | Selected |
|--------|-------------|----------|
| Concatenate, last-wins on conflict | File ops from all templates in include order, later wins | ✓ |
| Union with error on conflict | Error if same destination targeted | |
| You decide | Claude picks based on practice | |

**User's choice:** Concatenate all, last-wins on conflict
**Notes:** Same ordering as hooks (include order, top-level last).

## Integrations merge

| Option | Description | Selected |
|--------|-------------|----------|
| Deep merge, top-level wins | Deep merge across templates, top-level overrides per key | ✓ |
| Shallow merge, top-level replaces | Wholesale replacement per integration | |
| You decide | Claude picks based on complexity | |

**User's choice:** Deep merge, top-level wins
**Notes:** Consistent with env merge semantics (COMP-05).

---

## Claude's Discretion

- resolveTemplate() placement and signature
- Error message format for circular includes
- --template flag parsing (repeatable vs comma-separated)
- branch_pattern conflict resolution

## Deferred Ideas

- Deep includes nesting -- future if demanded
- TUI multi-template wizard -- v0.11.0+
