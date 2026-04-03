# Phase 61: Secrets - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 61-secrets
**Areas discussed:** Resolver scope, Error handling UX, Config surface

---

## Resolver Scope

### Q1: Which resolver set should v0.14.0 ship?

| Option | Description | Selected |
|--------|-------------|----------|
| Requirements scope | keychain + env + cmd only. Pluggable interface allows future additions. | ✓ |
| Full FEATURES.md set | All 5: op, doppler, pass, env, cmd. Bigger scope. | |
| Requirements + op only | keychain + env + cmd + op. Most requested extra. | |

**User's choice:** Requirements scope (Recommended)
**Notes:** Ship clean v0.14.0 with core capability. op/doppler/pass deferred per REQUIREMENTS.md.

### Q2: Keychain resolver on Linux without secret-tool?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with install hint | Clear error: 'secret-tool not found. Install libsecret-tools.' | ✓ |
| Skip silently | Treat as unresolvable when tool missing. | |

**User's choice:** Fail with install hint (Recommended)

---

## Error Handling UX

### Q3: Secret resolution failure behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Abort entire open | Any failure = ok:false. All-or-nothing. | ✓ |
| Continue with warnings | Failed secrets get empty string, log warning. | |
| Per-secret choice | Each failure prompts: skip or abort. | |

**User's choice:** Abort entire open (Recommended)
**Notes:** Partial env is dangerous — app starts with missing credentials.

### Q4: --skip-secrets in TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| CLI-only | TUI always requires secrets. On failure, show hint to use CLI. | ✓ |
| Available in TUI | Offer 'Skip secrets?' prompt on failure. | |

**User's choice:** CLI-only (Recommended)

---

## Config Surface

### Q5: How should secrets config be managed?

| Option | Description | Selected |
|--------|-------------|----------|
| Config wizard step | Add 'Secrets' section to git-stacks config wizard. | ✓ |
| Manual YAML only | Edit config.yml directly. | |
| Doctor integration | Doctor checks + wizard together. | |

**User's choice:** Config wizard step (Recommended)

---

## Claude's Discretion

- Keychain command arguments for macOS/Linux
- Parallel vs sequential resolution
- Error message formatting
- Test approach (mock subprocesses)
- Config wizard UX details

## Deferred Ideas

- 1Password (`op`) CLI resolver — v0.15+
- Doppler CLI resolver — v0.15+
- `pass` resolver — v0.15+
