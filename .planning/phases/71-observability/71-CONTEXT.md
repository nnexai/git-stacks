# Phase 71: Observability - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `GIT_STACKS_DEBUG=1` into the current runtime so domain modules emit labeled timing/debug lines to `stderr` without changing normal CLI/TUI behavior. This phase adds observability to the domain code that exists today, preserves clean stdout for human and JSON modes, and keeps debug effectively off when the env var is unset. It does not add new filtering features, structured progress payloads, or broader module-extraction scope beyond what earlier phases already defined.
</domain>

<decisions>
## Implementation Decisions

### Logger Bootstrap
- **D-01:** LogTape configuration is application-owned and happens lazily from `src/index.ts`, gated by `GIT_STACKS_DEBUG=1`; library/domain modules do not call `configure()` themselves.
- **D-02:** The logger remains effectively silent before `git-stacks manage` hands control to the alternate-screen TUI, so debug output never renders inside the dashboard surface.

### Domain Label Boundary
- **D-03:** Phase 71 instruments the domain code paths that exist in the current tree rather than waiting for additional extraction work to finish first.
- **D-04:** Debug labels reflect logical domain ownership, not necessarily the physical filename. In practice, env helpers emit `workspace-env`, lifecycle helpers emit `workspace-lifecycle`, status functions emit `workspace-status`, sync/push/pull flows emit `workspace-git`, and YAML editing flows emit `workspace-yaml` even where some of those paths still live in `src/lib/workspace-ops.ts`.

### Output Channel Contract
- **D-05:** All debug lines emit only to `stderr`; stdout output remains unchanged for normal command output and machine-readable modes such as `status --json`, `sync --json`, and similar command paths.
- **D-06:** Debug output stays out of user-facing progress callbacks and return payloads. Existing warnings and errors may continue using stderr, but debug lines must be a separate observability channel rather than a new stdout/progress mechanism.

### Debug Cost Model
- **D-07:** Disabled-mode observability uses a cheap guard or no-op wrapper so normal invocations avoid timing work, async value gathering, and string formatting when `GIT_STACKS_DEBUG` is unset.
- **D-08:** Timing output should focus on exported domain operations and a small number of meaningful substeps, using the success-criteria shape of lines like `[workspace-status] getWorkspaceListInfo: 12ms`, rather than verbose per-line tracing.

### the agent's Discretion
- Exact helper/module shape for the logging facade, as long as it preserves lazy bootstrap in `src/index.ts`, stderr-only output, and the low-overhead disabled path.
- Which internal substeps get additional timing beyond top-level exported operations, as long as they add signal without turning the feature into noisy trace logging.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 71 - Goal, stderr-only debug contract, JSON safety requirement, and expected labeled timing output.
- `.planning/REQUIREMENTS.md` - `OBSV-01` through `OBSV-05` define the debug env var, labels, timing, default silence, and TUI-safety constraints.
- `.planning/STATE.md` - Locked milestone decisions already choosing LogTape, lazy bootstrap from `src/index.ts`, and stderr-only behavior.

### Prior Decisions
- `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md` - Observability was explicitly deferred out of the first extraction phase.
- `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md` - Phase 70 deferred debug labeling to Phase 71 and established the intended logical domain split that Phase 71 labels should follow.

### Current Implementation
- `package.json` - Current dependency set; confirms no logging package is installed yet.
- `src/index.ts` - CLI entrypoint and correct bootstrap location for env-gated logger configuration before command dispatch.
- `src/lib/workspace-ops.ts` - Current home of status, sync/push/pull, YAML-edit, and CWD-detection flows that need logical domain labels.
- `src/lib/workspace-env.ts` - Extracted env module ready for direct instrumentation.
- `src/lib/workspace-lifecycle.ts` - Extracted lifecycle module ready for direct instrumentation.
- `src/commands/workspace.ts` - Existing stdout/stderr split and JSON output paths that must remain stable.
- `src/tui/dashboard/run.tsx` - TUI alternate-screen entrypoint whose screen output must remain clean under debug mode.
- `src/tui/dashboard/hooks/useWorkspaces.ts` - Repeated status-loading path that makes disabled-mode overhead important.

### Test Contracts
- `tests/commands/status-json.test.ts` - Existing guard that stdout remains valid JSON without mixed human/debug text.
- `tests/helpers.ts` - Shared mock/export seam likely to need observability-safe defaults in future tests.

### External Library Docs
- `https://logtape.org/manual/start` - Confirms LogTape should be configured in the application entrypoint, not inside libraries, and exposes category-based logger usage.
- `https://logtape.org/manual/sinks` - Confirms stream sinks can target standard error, includes Bun-specific stderr wiring, and documents optional non-blocking sink behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts`: Natural place to read `GIT_STACKS_DEBUG` once and configure/reset the logger before command execution or TUI startup.
- `src/lib/workspace-env.ts`: Small extracted module where env-resolution helpers can be instrumented directly without facade indirection.
- `src/lib/workspace-lifecycle.ts`: Extracted lifecycle module already encapsulating close/clean/remove flows and progress callbacks.
- `src/lib/workspace-ops.ts`: Central remaining runtime surface for status, git-sync, YAML edit, and CWD-detection flows that need logical labels immediately.
- `src/commands/workspace.ts`: Already preserves stdout for data and stderr for warnings/errors across multiple human and JSON command paths.
- `tests/commands/status-json.test.ts`: Existing regression contract for JSON purity that observability work must preserve.

### Established Patterns
- Runtime/business logic lives in `src/lib/`; commands are thin wrappers, so observability should be attached in domain modules instead of command handlers.
- The codebase already treats stdout as the user/data channel and stderr as the warning/error side channel; Phase 71 should extend that split instead of inventing a new output path.
- Long-running operations use progress callbacks for user-facing messages. Debug logging must remain separate from those callbacks so existing CLI/TUI output remains stable.
- The TUI uses an alternate-screen renderer and several subprocess launches with inherited stderr, so stderr safety matters more than plain CLI cases alone.

### Integration Points
- `src/index.ts` must bootstrap logging early enough to cover command execution while still avoiding library self-configuration.
- `src/lib/workspace-ops.ts` needs logical label mapping for current exports whose future extracted homes are implied but not yet fully reflected in the tree.
- `src/lib/workspace-env.ts` and `src/lib/workspace-lifecycle.ts` should use the same observability helper/pattern as the remaining logical domains.
- `src/tui/dashboard/hooks/useWorkspaces.ts` repeatedly calls status loaders, making the disabled fast path important.
- Future command and lib tests will likely need explicit assertions that debug stays on stderr and remains absent from stdout when unset.

</code_context>

<specifics>
## Specific Ideas

- The confirmed target shape is stderr timing output like `[workspace-status] getWorkspaceListInfo: 12ms`.
- No extra product-level preferences beyond current-code-path instrumentation, logical domain labels, stderr-only output, and near-zero disabled overhead.

</specifics>

<deferred>
## Deferred Ideas

- `GIT_STACKS_DEBUG=open,sync` namespace filtering remains future requirement `DBGF-01`, not part of Phase 71.
- Structured progress payloads (`PROG-01`, `PROG-02`) remain future work; Phase 71 should not redesign progress callbacks.
- Any additional module extraction needed to realize the ideal Phase 70 split remains separate scope; Phase 71 instruments current runtime paths as-is.

</deferred>

---

*Phase: 71-observability*
*Context gathered: 2026-04-05*
