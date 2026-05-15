# Phase 87: Integration Contract and Source-Module Coverage - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** Auto-generated autonomous context

<domain>
## Phase Boundary

Integration-related behavior needs functional coverage through real source modules and injected executors. This phase covers issue/forge utility modules, forge command integrations, and session/IDE integrations without requiring real Niri, AeroSpace, cmux, VSCode, browser, forge CLI, desktop, or window-manager environments.

The goal is not full external-environment E2E. It is to ensure coverage reports reflect source behavior rather than tests that reimplement integration logic in mocks.

</domain>

<decisions>
## Implementation Decisions

### Real Source Contract
- Tests should import and exercise real `src/lib/integrations/**` modules and public helper APIs.
- Replace or supplement tests that currently mock by duplicating source logic so coverage reflects the implementation under test.
- Use module mocks only for true external boundaries such as subprocess execution, filesystem setup, browser open, or environment discovery.
- Follow the custom runner isolation model for `mock.module()` tests; do not run `bun test tests/` directly.

### Integration Boundary
- Forge and issue utility coverage should include workspace/repo resolution, linked issue persistence, link/unlink behavior, error formatting, enabled-forge detection, base branch selection, missing-tool cases, and no-remote cases.
- Forge command modules should use injected executors for command argument construction, JSON parse failures, missing PR/issue/repo cases, exit-code propagation, and safe browser-open behavior.
- Session/IDE integrations should use injected executors or fake detectors for config parsing, command construction, artifact-bag routing, skip behavior, and safe failure handling.
- Do not launch real external CLIs, browsers, desktop sessions, or window managers as part of this milestone.

### Scope Boundary
- In scope: GitHub/GitLab/Gitea/Jira forge command contracts where implemented, shared forge/issue utilities, and tmux/cmux/niri/AeroSpace/VSCode/IntelliJ integration contracts where applicable.
- Out of scope: live forge auth, real browser windows, real editor/IDE launches, real window-manager state, broad TUI rendering, CI workflows, and milestone finalization.
- Keep functional readiness classification and final release evidence for Phase 88.

### the agent's Discretion
Exact injected-executor helper shape, test file grouping, and which existing mock-heavy tests to replace versus supplement are at the agent's discretion as long as every Phase 87 success criterion is traceable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` Phase 87 — success criteria for integration contract and source-module coverage.
- `.planning/REQUIREMENTS.md` INTG-02 through INTG-04 and external integration exclusions.
- `.planning/STATE.md` Phase 85-88 decisions — use injected executor contracts, avoid real desktop/plugin environments, and execute real source modules.

### Prior phase decisions
- `.planning/phases/85-core-real-fixture-functional-hardening/85-CONTEXT.md` — real-source coverage and helper reuse boundary.
- `.planning/phases/86-workspace-command-workflow-edge-coverage/86-CONTEXT.md` — command-workflow scope boundary and no-brittle prompt/spinner assertions.
- `.planning/phases/81.1-repo-add-honors-enabled-forge-integrations/81.1-CONTEXT.md` — global forge enablement semantics that forge utility tests must preserve.
- `.planning/phases/82-template-repo-label-and-message-e2e-coverage/82-CONTEXT.md` — repo-add forge persistence and enabled-single-match behavior already covered at CLI level.

### Codebase maps
- `.planning/codebase/TESTING.md` — mock isolation, real-module capture patterns, and test runner commands.
- `.planning/codebase/INTEGRATIONS.md` — integration registry/module responsibilities if present.
- `.planning/codebase/STRUCTURE.md` — integration module and test layout.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/issue-utils.ts` and `src/lib/integrations/forge-utils.ts` are the shared source modules named by the roadmap.
- `src/lib/integrations/github.ts`, `gitlab.ts`, `gitea.ts`, and `jira.ts` are the likely forge command contract surfaces.
- `src/lib/integrations/tmux.ts`, `cmux.ts`, `niri.ts`, `aerospace.ts`, `vscode.ts`, and `intellij.ts` are the likely session/IDE contract surfaces.
- `tests/lib/integrations/**` is the natural home for source-module and injected-executor contract tests.
- `tests/helpers.ts` already contains mock, real-module, temp directory, and isolated config patterns that should be extended where useful.

### Established Patterns
- Integration tests use Bun's `mock.module()` and must respect file-level isolation.
- Existing `_exec`-style mutable executor seams are preferred for subprocess command assertions when available.
- Prior E2E phases use stub binaries and isolated config only when the contract requires command-level proof; Phase 87 should usually stay closer to source modules with injected executors.

### Integration Points
- Plan 87-01 should anchor in `issue-utils` and `forge-utils` real-source tests.
- Plan 87-02 should anchor in forge command module contract tests.
- Plan 87-03 should anchor in session/IDE integration contract tests.
- Plan 87-04 should audit source-bypassing mock patterns and verify coverage deltas.

</code_context>

<specifics>
## Specific Ideas

- Treat `INTG-01` as deferred external-environment coverage, not a hidden requirement for this phase.
- Preserve the Phase 81.1 rule that globally enabled forge integrations are the allowlist for detection/prompt eligibility.
- Favor small contract tests that prove command construction and failure handling over broad fixtures that try to simulate external tools.

</specifics>

<deferred>
## Deferred Ideas

- Full E2E coverage against real or containerized external integration environments remains deferred outside v0.17.1.

</deferred>
