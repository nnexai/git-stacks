# Phase 71: Observability - Context

**Gathered:** 2026-04-05 (assumptions mode, updated)
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `GIT_STACKS_DEBUG=1` into the current runtime so domain modules emit labeled timing/debug lines to `stderr` without changing normal CLI/TUI behavior. This phase adds observability to the domain code that exists today, preserves clean stdout for human and JSON modes, and keeps debug effectively off when the env var is unset. It does not add new filtering features, structured progress payloads, or broader module-extraction scope beyond what earlier phases already defined.
</domain>

<decisions>
## Implementation Decisions

### Logger Bootstrap
- **D-01:** LogTape (`@logtape/logtape`) is installed and configured lazily in `src/index.ts` before `program.parse()`, gated by `process.env.GIT_STACKS_DEBUG === "1"`.
- **D-02:** Both enabled and disabled paths call `configure()` explicitly. The disabled path uses `lowestLevel: null` on all categories to achieve true zero-cost short-circuit (LogTape's unconfigured default still allocates objects and parses templates per call).

### Disabled-Mode Cost Model
- **D-03:** When `GIT_STACKS_DEBUG` is unset, `configure()` is called with `lowestLevel: null` for all log categories. This makes `getSinks()` return immediately before any object allocation, `Date.now()` call, or template parsing — satisfying OBSV-04's zero-overhead requirement.
- **D-04:** No project-level boolean guards around individual `logger.debug()` call sites. The `lowestLevel: null` configuration handles the fast path at the framework level.

### Bun stderr Sink Wiring
- **D-05:** The stderr sink uses `getStreamSink()` with a `WritableStream` wrapping `Bun.stderr.writer()`. LogTape's `getStreamSink()` requires a Web `WritableStream`, not Node's `process.stderr` directly.

### Output Channel Contract
- **D-06:** All debug lines emit only to `stderr`; stdout output remains unchanged for normal command output and machine-readable modes such as `status --json`, `sync --json`, and similar command paths.
- **D-07:** Debug output stays out of user-facing progress callbacks and return payloads. Existing warnings and errors may continue using stderr, but debug lines are a separate observability channel.

### Domain Label Scope
- **D-08:** Phase 71 instruments the domain code paths that exist in the current tree rather than waiting for additional extraction work to finish first.
- **D-09:** Debug labels reflect logical domain ownership, not the physical filename. Functions still in `workspace-ops.ts` get their intended domain label: env helpers emit `workspace-env`, lifecycle helpers emit `workspace-lifecycle`, status functions emit `workspace-status`, sync/push/pull flows emit `workspace-git`, and YAML editing flows emit `workspace-yaml`.
- **D-10:** Timing output focuses on exported domain operations and meaningful substeps, using the shape `[workspace-status] getWorkspaceListInfo: 12ms`, rather than verbose per-line tracing.

### TUI Safety
- **D-11:** The logger is reconfigured with `lowestLevel: null` (fully silent) before the TUI dashboard launches via `git-stacks manage`, regardless of `GIT_STACKS_DEBUG`. Debug output for the manage command path is suppressed entirely to prevent stderr writes from corrupting the OpenTUI alternate-screen surface.

### Claude's Discretion
- Exact helper/module shape for the logging facade, as long as it preserves lazy bootstrap in `src/index.ts`, stderr-only output, and the `lowestLevel: null` disabled path.
- Which internal substeps get additional timing beyond top-level exported operations, as long as they add signal without turning the feature into noisy trace logging.
- Whether to use a single `configureLogging()` helper or inline the configure calls at each trigger point (index.ts bootstrap, pre-TUI reset).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 71 — Goal, stderr-only debug contract, JSON safety requirement, and expected labeled timing output.
- `.planning/REQUIREMENTS.md` — `OBSV-01` through `OBSV-05` define the debug env var, labels, timing, default silence, and TUI-safety constraints.
- `.planning/STATE.md` — Locked milestone decisions already choosing LogTape, lazy bootstrap from `src/index.ts`, and stderr-only behavior.

### Prior Decisions
- `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md` — Observability was explicitly deferred out of the first extraction phase.
- `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md` — Phase 70 deferred debug labeling to Phase 71 and established the intended logical domain split that Phase 71 labels should follow.

### Current Implementation
- `package.json` — Current dependency set; confirms no logging package is installed yet.
- `src/index.ts` — CLI entrypoint and correct bootstrap location for env-gated logger configuration before command dispatch.
- `src/lib/workspace-ops.ts` (~1699 lines) — Current home of status, sync/push/pull, YAML-edit, and CWD-detection flows that need logical domain labels. Phase 70 may or may not have extracted these by the time Phase 71 executes.
- `src/lib/workspace-env.ts` — Extracted env module ready for direct instrumentation.
- `src/lib/workspace-lifecycle.ts` — Extracted lifecycle module ready for direct instrumentation.
- `src/commands/workspace.ts` — Existing stdout/stderr split and JSON output paths that must remain stable.
- `src/tui/dashboard/run.tsx` — TUI alternate-screen entrypoint whose screen output must remain clean under debug mode.
- `src/tui/dashboard/hooks/useWorkspaces.ts` — Repeated status-loading path that makes disabled-mode overhead important.

### Test Contracts
- `tests/commands/status-json.test.ts` — Existing guard that stdout remains valid JSON without mixed human/debug text.

### External Library Documentation
- LogTape sinks docs (logtape.org/manual/sinks) — Confirms `getStreamSink()` requires Web `WritableStream`; Bun needs `Bun.stderr.writer()` wrapped in a `WritableStream`.
- LogTape source v2.0.5 (logger.js) — `lowestLevel: null` short-circuits `getSinks()`/`emit()` before any allocation. Default unconfigured path (`lowestLevel: "trace"`) still allocates objects, calls `Date.now()`, and parses message templates per call.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts`: Natural place to read `GIT_STACKS_DEBUG` once and configure/reset the logger before command execution or TUI startup.
- `src/lib/workspace-env.ts`: Extracted module where env-resolution helpers can be instrumented directly.
- `src/lib/workspace-lifecycle.ts`: Extracted lifecycle module already encapsulating close/clean/remove flows and progress callbacks.
- `src/lib/workspace-ops.ts`: Central remaining runtime surface for status, git-sync, YAML edit, and CWD-detection flows that need logical labels.
- `tests/commands/status-json.test.ts`: Existing regression contract for JSON purity.

### Established Patterns
- Runtime/business logic lives in `src/lib/`; commands are thin wrappers, so observability should be attached in domain modules.
- The codebase already treats stdout as the user/data channel and stderr as the warning/error side channel.
- Long-running operations use progress callbacks for user-facing messages. Debug logging must remain separate from those callbacks.
- The TUI uses an alternate-screen renderer; stderr safety matters more than plain CLI cases alone.
- `_exec` injectable pattern is used for subprocess testing; observability should not break this pattern.

### Integration Points
- `src/index.ts` must bootstrap logging early enough to cover command execution while still avoiding library self-configuration.
- `src/lib/workspace-ops.ts` needs logical label mapping for current exports whose future extracted homes are implied but not yet reflected in the tree.
- `src/tui/dashboard/run.tsx` or the `manage` command handler must reset LogTape to `lowestLevel: null` before alternate-screen rendering.
- Future tests will need to verify debug stays on stderr and is absent from stdout when unset.

</code_context>

<specifics>
## Specific Ideas

- The confirmed target shape is stderr timing output like `[workspace-status] getWorkspaceListInfo: 12ms`.
- The disabled path MUST use `configure({ ..., lowestLevel: null })` rather than relying on LogTape's unconfigured default, which is not zero-cost.
- Bun stderr sink: `getStreamSink(new WritableStream({ start() { this.writer = Bun.stderr.writer() }, write(chunk) { this.writer.write(chunk) } }))`.

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
