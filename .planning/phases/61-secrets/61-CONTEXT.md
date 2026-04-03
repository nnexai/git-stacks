# Phase 61: Secrets - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Pluggable secret resolution for `${{ resolver:path }}` references in workspace/template env maps. Resolved values are used at runtime only — never written back to YAML. Three built-in resolvers: `keychain`, `env`, `cmd`. Integration point between `mergeEnv()` and `writeEnvFiles()` in openWorkspace.

</domain>

<decisions>
## Implementation Decisions

### Resolver scope
- **D-01:** v0.14.0 ships with 3 resolvers only: `keychain` (platform keychain), `env` (process.env), `cmd` (sh -c, opt-in). `op`, `doppler`, `pass` are deferred to v0.15+ (REQUIREMENTS.md SEC-F1/F2/F3).
- **D-02:** The `SecretResolver` interface is pluggable — future resolvers add a file and register, no breaking changes.
- **D-03:** `keychain` resolver auto-detects platform: macOS `security find-generic-password`, Linux `secret-tool lookup`. Fails with install hint if tool not found (e.g., "secret-tool not found. Install libsecret-tools.").
- **D-04:** `cmd` resolver requires explicit opt-in in `config.yml` `secrets.resolvers` — not enabled by default (STATE.md constraint).

### Error handling
- **D-05:** Fatal by default. If any secret fails to resolve, `openWorkspace` returns `{ ok: false, error: ... }`. Partial env is dangerous — all-or-nothing.
- **D-06:** `--skip-secrets` is CLI-only. TUI open always requires secrets to resolve. On failure from TUI, show error with hint to use CLI with `--skip-secrets`.
- **D-07:** External CLI resolvers (`keychain`, `cmd`) enforce 10-second subprocess timeout (SEC-10). On timeout: "Failed to resolve ${{ keychain:... }}: timeout after 10s".
- **D-08:** `--skip-secrets` substitutes empty strings for unresolved references and logs a warning per reference.

### Config surface
- **D-09:** Add "Secrets" section to `git-stacks config` wizard. Shows available resolvers, lets user toggle which are enabled. Default when unconfigured: `keychain` and `env` enabled, `cmd` disabled (opt-in).
- **D-10:** `secrets.resolvers` field in `GlobalConfigSchema`: `z.array(z.string()).optional()`. When present, only listed resolvers are available.

### Architecture (from FEATURES.md spec + STATE.md)
- **D-11:** `resolveSecrets(rawEnv: Record<string, string>, resolvers: SecretResolver[]): Promise<Record<string, string>>` — never accepts workspace object (STATE.md constraint). Prevents accidental plaintext write to YAML.
- **D-12:** Reference syntax: `${{ resolver:path }}` — regex: `/^\$\{\{\s*(\w+):(.+?)\s*\}\}$/`. Plain values pass through unchanged.
- **D-13:** Integration point: `openWorkspace` calls `resolveSecrets` after `mergeEnv()`, before `writeEnvFiles()` and hook execution.
- **D-14:** Resolved values never written back to workspace YAML. `writeWorkspace` always uses pre-resolution workspace object.

### Claude's Discretion
- Exact `keychain` command arguments for macOS `security` and Linux `secret-tool`
- Whether `resolveSecrets` resolves in parallel or sequential (parallel is fine — resolvers are independent)
- Error message formatting details
- Test approach: mock subprocess calls, test parsing/substitution logic separately
- Config wizard UX details (multi-select vs checkboxes)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature specification
- `FEATURES.md` §3 "Secrets / Env Var References" — Design spec: reference syntax, resolver interface, built-in resolvers, integration point, failure handling. **Note: resolver set in FEATURES.md is broader than v0.14.0 scope — only keychain/env/cmd ship now.**

### Requirements
- `.planning/REQUIREMENTS.md` §"Secrets" — SEC-01 through SEC-10 acceptance criteria (v0.14.0 scope)
- `.planning/REQUIREMENTS.md` §"Future Requirements" — SEC-F1/F2/F3: op, doppler, pass resolvers deferred to v0.15+

### Existing code
- `src/lib/workspace-ops.ts` — `mergeEnv()` (line 108), `writeEnvFiles()` (line 148), `openWorkspace()` integration point
- `src/lib/config.ts` — `GlobalConfigSchema` where `secrets` field will be added
- `src/commands/config.ts` — Config wizard where "Secrets" section will be added

### Prior decisions (STATE.md)
- `resolveSecrets` signature constraint — never accepts workspace object
- `cmd:` resolver opt-in requirement
- `op` CLI TTY behavior caveat (MEDIUM confidence, validate during impl)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mergeEnv()` — already collects raw env values; `resolveSecrets` processes its output
- `writeEnvFiles()` — already writes env to repos; receives resolved values
- `$\`...\`.quiet().nothrow()` pattern — for subprocess-based resolvers (keychain, cmd)
- Config wizard in `config.ts` — pattern for adding secrets section

### Established Patterns
- Workspace-ops functions return `{ ok: boolean, error?: string }` — same for secret resolution failures
- `GlobalConfigSchema` Zod validation — add `secrets` field
- `--skip-*` flag pattern — same as other escape hatches in the CLI

### Integration Points
- `openWorkspace()` — insert `resolveSecrets` call between `mergeEnv()` and `writeEnvFiles()`
- `GlobalConfigSchema` — add `secrets: z.object({ resolvers: z.array(z.string()).optional() }).optional()`
- `config.ts` wizard — add secrets configuration step
- `workspace.ts` / `index.ts` — `--skip-secrets` flag on `open` and `new` commands

</code_context>

<specifics>
## Specific Ideas

- Reference syntax `${{ resolver:path }}` borrowed from GitHub Actions — familiar to developers
- Keychain resolver should "just work" on macOS without config (security CLI always available)
- `cmd` resolver is the escape hatch — any secret tool works via `sh -c`, but opt-in because arbitrary command execution is risky

</specifics>

<deferred>
## Deferred Ideas

- 1Password (`op`) CLI resolver — SEC-F1, v0.15+
- Doppler CLI resolver — SEC-F2, v0.15+
- `pass` (Unix password store) resolver — SEC-F3, v0.15+

</deferred>

---

*Phase: 61-secrets*
*Context gathered: 2026-04-03*
