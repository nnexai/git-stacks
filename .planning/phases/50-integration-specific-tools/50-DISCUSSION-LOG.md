# Phase 50: Integration Specific Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 50-integration-specific-tools
**Areas discussed:** Config introspection architecture, Output format & scripting, Standalone open/focus behavior, Integration list scope

---

## Config Introspection Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Generic handler | Register `config` subcommand group once in integration.ts for ALL integrations. One implementation, zero per-integration code. | ✓ |
| Per-integration commands() | Each integration registers its own `config example` and `config show`. More flexible but duplicated boilerplate. | |
| Hybrid | Generic for `config show`, per-integration for `config example` only. | |

**User's choice:** Generic handler
**Notes:** None

### Follow-up: Missing configExample fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback message | Print "No example available" when configExample is undefined. Consistent. | ✓ |
| Skip silently | Don't register `config example` when configExample is not defined. | |

**User's choice:** Fallback message
**Notes:** None

---

## Output Format & Scripting

| Option | Description | Selected |
|--------|-------------|----------|
| --json on both | Matches existing pattern (doctor, status, list). Useful for agents. | ✓ |
| --json on list only | List is scripting target; config show stays plain text. | |
| No --json | Keep it simple, debugging/introspection only. | |

**User's choice:** --json on both
**Notes:** None

---

## Standalone Open/Focus Behavior

### VSCode open

| Option | Description | Selected |
|--------|-------------|----------|
| Generate + launch | Call generate() + open() with empty ArtifactBag. No hooks, no other integrations. | ✓ |
| Launch only | Assume .code-workspace exists. Fails if never opened. | |
| Generate only | Create file but don't launch VS Code. | |

**User's choice:** Generate + launch
**Notes:** None

### AeroSpace focus resolution

| Option | Description | Selected |
|--------|-------------|----------|
| focus:true entry, fallback to first | Find focus entry, else workspaces[0]. Mirrors runtime behavior. | ✓ |
| Require focus:true | Error if no focus entry. Stricter. | |
| Always first entry | Ignore focus:true, always target workspaces[0]. | |

**User's choice:** focus:true entry, fallback to first
**Notes:** None

---

## Integration List Scope

### Command placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level subcommand on integrationCommand | Register directly on parent command. Not per-integration. | ✓ |
| Separate command | Standalone `git-stacks integrations` (plural). | |

**User's choice:** Top-level subcommand on integrationCommand
**Notes:** None

### Table columns

| Option | Description | Selected |
|--------|-------------|----------|
| ID, label, enabled, configured | Compact and actionable. Workspace-aware when argument provided. | ✓ |
| Add tier and order | Also show execution tier and numeric order. More technical. | |
| Minimal: ID + enabled | Just ID and status. Less noise. | |

**User's choice:** ID, label, enabled, configured
**Notes:** None

---

## Claude's Discretion

- Table formatting approach
- `config show` output format (raw YAML vs formatted)
- Error messages for missing arguments
- Which integrations get `configExample` strings in this phase

## Deferred Ideas

None — discussion stayed within phase scope.
