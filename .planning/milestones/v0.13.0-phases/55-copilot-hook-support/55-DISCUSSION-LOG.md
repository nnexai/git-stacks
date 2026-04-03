# Phase 55: Copilot Hook Support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 55-Copilot Hook Support
**Areas discussed:** Flag design, Hook script approach, Notification parity, Types refactoring

---

## Flag design

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive prompt (current) | Keep existing multi-select when no flags given | ✓ |
| Install all plugins | Auto-install both when no flags given | |
| You decide | Claude picks based on HOOK-03 | |

**User's choice:** Interactive prompt (current)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Combinable (both allowed) | --copilot --claude installs both | ✓ |
| Mutually exclusive | Only one at a time | |

**User's choice:** Combinable (both allowed)
**Notes:** None

---

## Hook script approach

| Option | Description | Selected |
|--------|-------------|----------|
| Inline bash commands | Put commands directly in 'bash' field | ✓ |
| Separate .sh script files | Write executable scripts, reference by path | |
| You decide | Claude picks based on research | |

**User's choice:** Inline bash commands
**Notes:** None

---

## Notification parity

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: sessionEnd + userPromptSubmitted | Skip preToolUse | |
| Full parity: add preToolUse | Include preToolUse with stdin filtering | |
| You decide | Claude picks practical set | |

**User's choice:** (Free text) "should be full parity - requires research to find what the askquestions tool is called exactly"
**Notes:** Research needed during planning to find Copilot's equivalent of AskUserQuestion tool name for stdin toolName filtering.

---

## Types refactoring

| Option | Description | Selected |
|--------|-------------|----------|
| Internal types in copilot.ts | Keep shared types Claude-specific | |
| Generalize shared types | Refactor types.ts to be agent-agnostic | ✓ |
| You decide | Minimize churn | |

**User's choice:** Generalize shared types
**Notes:** None

---

## Claude's Discretion

- Copilot JSON structure details (version field, timeoutSec defaults)
- Stdin JSON parsing approach for inline bash
- Whether to document cloud agent default-branch limitation

## Deferred Ideas

None — discussion stayed within phase scope.
