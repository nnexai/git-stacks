# Phase 76: Integration Plugin Capability Contracts - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Every integration plugin declares its capabilities explicitly via a typed `capabilities` field on the Integration interface, the runner uses those declarations instead of duck-typing (optional chaining) to gate `generate()`, `open()`, and `cleanup()` calls, and `git-stacks integration list` exposes capabilities per plugin. This phase does not add new capabilities, change integration execution order, or modify the plugin registration pattern.

</domain>

<decisions>
## Implementation Decisions

### Capability taxonomy
- **D-01:** Capabilities are represented as a `ReadonlySet<Capability>` where `Capability` is a string union type: `'generate' | 'cleanup' | 'commands' | 'configExample' | 'windowDetection' | 'applies'`.
- **D-02:** The set covers only optional behaviors. Required methods (`open`, `isEnabled`, `configurePrompt`) are not represented in the capability set since they are always present.

### Runner gating strategy
- **D-03:** The runner checks `integration.capabilities.has('generate')` (and equivalent for cleanup, windowDetection, applies) before calling the method, replacing current optional chaining patterns.
- **D-04:** Methods remain optional on the interface (`generate?`, `cleanup?`, etc.). The runner uses non-null assertion (`!`) after the capability check.
- **D-05:** No runtime validation that capabilities match actual method presence. TypeScript types and `bun run typecheck` are the enforcement mechanism. Trusted declaration model.

### integration list display
- **D-06:** Human-readable table output gets a "Capabilities" column with abbreviated tags: `gen`, `cmd`, `clean`, `win`, `cfg`, `apl`.
- **D-07:** JSON output (`--json`) includes `"capabilities": ["generate", "commands", ...]` with full capability names in an array.

### Migration path
- **D-08:** `capabilities` is a required (non-optional) field on the Integration interface. TypeScript compiler forces all 10 plugins to declare it. No gradual migration or fallback.
- **D-09:** No third-party plugin concerns. All 10 plugins are first-party, co-located in `src/lib/integrations/`. No runtime compat shim or deprecation notice needed.
- **D-10:** No additional runtime assertion test beyond the TS compiler. Success criteria #1 (typecheck passes with all 10 plugins updated) is sufficient.

### Claude's Discretion
- Exact abbreviated tag labels for the capabilities column (gen/cmd/clean/win/cfg/apl are suggestions, can adjust for readability)
- Whether the Capability type lives in `types.ts` or a separate `capabilities.ts` file
- Test structure and file placement for runner capability-gating tests
- Order of capability tags in list output

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone requirements
- `.planning/ROADMAP.md` -- Phase 76 goal, success criteria, dependency on Phase 75
- `.planning/REQUIREMENTS.md` -- ENGN-07, ENGN-08, ENGN-09 acceptance criteria

### Integration system
- `src/lib/integrations/types.ts` -- Current Integration interface, IntegrationContext, resolveEnabled helpers
- `src/lib/integrations/runner.ts` -- Current runner with duck-typed optional chaining to replace
- `src/lib/integrations/index.ts` -- Plugin registry array (all 10 integrations)

### Individual plugins (all need capabilities field added)
- `src/lib/integrations/vscode.ts`
- `src/lib/integrations/intellij.ts`
- `src/lib/integrations/cmux.ts`
- `src/lib/integrations/tmux.ts`
- `src/lib/integrations/niri.ts`
- `src/lib/integrations/aerospace.ts`
- `src/lib/integrations/github.ts`
- `src/lib/integrations/gitlab.ts`
- `src/lib/integrations/gitea.ts`
- `src/lib/integrations/jira.ts`

### Integration list command
- `src/commands/integration.ts` -- CLI command that renders integration list output

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/types.ts`: Integration interface already has all optional methods defined; adding `capabilities` field is a single-line addition plus the Capability type
- `src/lib/integrations/runner.ts`: Three functions (`runIntegrationGenerate`, `runIntegrations`, `runIntegrationCleanup`) use optional chaining patterns that map directly to capability checks
- `src/commands/integration.ts`: Existing `integration list` command already renders a table; adding a column is straightforward

### Established Patterns
- String union types with Zod validation used throughout the codebase (e.g., repo types, workspace modes)
- `ReadonlySet` not yet used in the codebase but `Set` is standard; `ReadonlySet` is idiomatic TypeScript for immutable declarations
- Integration runner already sorts by `order` and gates on `isEnabled`/`applies` -- capability checks slot in naturally

### Integration Points
- `src/lib/integrations/types.ts`: Add `Capability` type and `capabilities` field to `Integration` interface
- `src/lib/integrations/runner.ts`: Replace `integration.generate?.(ctx)` with capability-gated calls in all three runner functions
- `src/commands/integration.ts`: Add capabilities column to table output and capabilities array to JSON output
- All 10 plugin files: Add `capabilities: new Set([...])` to each integration object

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 76-integration-plugin-capability-contracts*
*Context gathered: 2026-04-06*
