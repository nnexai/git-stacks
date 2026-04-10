# Phase 82: Template, Repo, Label, and Message E2E Coverage - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the non-workspace CLI command families through real CLI subprocess tests: template commands and template-backed workspace consumption, repo registry commands, workspace label commands, and message commands.

This phase is about deterministic success-path and contract coverage, not prompt-driving for excluded wizard flows, not representative failure matrices (those belong in Phase 82.1), and not live TUI/dashboard socket behavior. New prerequisite phases 81.1 and 81.1.1 are assumed to land first so repo-add forge behavior and non-interactive template-backed create/clone behavior are available for E2E.

</domain>

<decisions>
## Implementation Decisions

### Repo registry scope
- **D-01:** Phase 82 should exclude `repo scan` and bring roadmap/scope into line with `REQUIREMENTS.md`; the Phase 80 inventory should keep `repo scan` as an explicit excluded item with rationale.
- **D-02:** Repo registry E2E should use separate git-repo and dir-repo scenario groups, with shared rename/list/show/remove assertions where behavior overlaps.
- **D-03:** `repo add` E2E should prove both the no-enabled-forge path and one enabled-single-match auto-detect path.
- **D-04:** The enabled-single-match repo path should use a stub `gh`/`glab` binary plus a matching remote URL and real isolated `config.yml` integration enablement; avoid `tea` and real forge auth in Phase 82 E2E.
- **D-05:** Representative repo failure cases like missing paths and duplicate names stay in Phase 82.1; Phase 82 stays focused on success paths and output contracts.
- **D-06:** Because `repo list`/`repo show` do not expose forge metadata, Phase 82 should prove forge persistence via `repo add` stdout plus persisted registry YAML while keeping `list`/`show` assertions on their current user-facing contracts.
- **D-07:** Dir-repo coverage should explicitly prove that dir repos skip forge detection and default to `main`, in addition to normal add/list/show/rename/remove behavior.
- **D-08:** Repo removal should use `--force` in Phase 82; prompt interaction stays out of scope here.
- **D-09:** Git-repo coverage should prove both auto-detected current branch and explicit `--branch` override behavior.

### Template coverage boundary
- **D-10:** Template label propagation should be proven through the new non-interactive create and clone paths from Phase 81.1.1.
- **D-11:** Template “create” coverage in Phase 82 means using `new --non-interactive` with pre-provided template data; it does not mean testing `template new` directly.
- **D-12:** Structure template coverage as separate template-command scenarios and template-consumption scenarios.
- **D-13:** Template composition should be proven through `new --non-interactive` with repeatable `--template`, asserting the resulting workspace snapshot and propagated labels/config.

### Workspace labels and messages
- **D-14:** Keep workspace labels and messages as separate focused contract suites.
- **D-15:** For workspace labels, extend the existing subprocess coverage only enough to close roadmap gaps and map it into the Phase 80 inventory source.
- **D-16:** Message coverage should be one focused contract suite covering `send`/`list`/`clear`, workspace resolution, sender metadata, JSONL persistence, and missing-workspace behavior.
- **D-17:** Ignore live socket delivery in Phase 82 and assert the durable CLI/file contract only.
- **D-18:** Add an explicit test/automation opt-out for socket push and use it in the message E2E suite so tests cannot touch a real local dashboard.

### Inventory mapping
- **D-19:** Keep flow-level inventory items and map them to one or more focused test files as needed.
- **D-20:** Record exclusions and partial-coverage rationale inline with the inventory item metadata, not in separate prose.
- **D-21:** Update inventory mappings incrementally as each suite lands or is extended.

### the agent's Discretion
- Exact test file boundaries, as long as the suite grouping stays aligned with the decisions above.
- Exact names and shape of the message socket opt-out seam, as long as it is explicit, automation-safe, and not a silent hidden test hook.
- Exact inventory metadata field names for mappings/exclusions, as long as the source stays machine-parseable and flow-level.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and milestone constraints
- `.planning/ROADMAP.md` §Phase 82 — current goal and success criteria to reconcile with the discussed scope decisions.
- `.planning/REQUIREMENTS.md` `E2E-09`, `E2E-10`, `E2E-11` — actual required template/repo/label/message outcomes and the exclusion of wizard-driven `repo scan`.
- `.planning/STATE.md` — milestone-wide E2E constraints, non-TUI boundary, and roadmap evolution notes.
- `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md` — shared harness and inventory-model decisions that this phase must extend.
- `.planning/phases/81-workspace-and-git-operation-e2e-coverage/81-CONTEXT.md` — risk-focused E2E slicing model to carry into non-workspace command families.
- `.planning/phases/81.1-repo-add-honors-enabled-forge-integrations/81.1-CONTEXT.md` — repo-add behavior assumptions this phase now relies on.
- `.planning/phases/81.1.1-minimal-non-interactive-workspace-create-and-clone-variants/81.1.1-CONTEXT.md` — non-interactive create/clone assumptions this phase now relies on for template propagation and composition.

### Existing command surfaces under test
- `src/commands/template.ts` — template list/show/clone/rename/remove/label behavior and `template list --label`.
- `src/commands/repo.ts` — repo add/list/show/rename/remove behavior and forge/default-branch persistence.
- `src/commands/label.ts` — workspace label add/remove/list/clear behavior.
- `src/commands/message.ts` — message send/list/clear CLI contract and workspace resolution behavior.
- `src/lib/messages.ts` — persisted JSONL storage and best-effort socket push behavior that Phase 82 must keep automation-safe.

### Existing test assets to extend
- `tests/helpers.ts` — shared CLI subprocess and isolated-config primitives from Phase 80.
- `tests/commands/template-list.test.ts` — existing template list subprocess pattern.
- `tests/commands/template-label.test.ts` — existing template label subprocess pattern.
- `tests/commands/label.test.ts` — existing workspace label subprocess coverage to extend rather than rewrite.
- `tests/lib/messages.test.ts` — current lower-level message persistence coverage that the new CLI suite should complement.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing command tests already cover `template list --label`, template label CRUD, and workspace label CRUD using real CLI subprocesses and isolated config dirs.
- Phase 81.1 provides a deterministic repo-add behavior surface for forge enablement, which lets repo E2E avoid flaky real forge setup.
- Phase 81.1.1 provides deterministic non-interactive create/clone paths so template propagation and composition can be exercised without driving TUI prompts.
- `tests/lib/messages.test.ts` already proves JSONL persistence at the library level, so the new CLI coverage can stay focused on command contracts and end-user observability.

### Established Patterns
- Command-level E2E suites should stay focused by behavior domain rather than becoming one giant multi-command scenario.
- Success-path subprocess coverage belongs in Phase 82; representative failure matrices are intentionally deferred to Phase 82.1.
- Hidden side effects that are part of the user contract but not printed directly (such as registry YAML or message JSONL) should be asserted through the persisted artifact, not by expanding the CLI surface just for tests.

### Integration Points
- `tests/commands/` is the main landing zone for all new Phase 82 coverage and inventory mappings.
- `src/commands/message.ts` and `src/lib/messages.ts` likely need a small automation-safe seam so `message send` cannot touch a real local socket during tests.
- `src/commands/template.ts`, `repo.ts`, `label.ts`, and the new non-interactive workspace create/clone paths are the key entrypoints for Phase 82 subprocess scenarios.

</code_context>

<specifics>
## Specific Ideas

- Use the new non-interactive create/clone surface to prove template label propagation and composed-template behavior rather than re-litigating wizard exclusions.
- Treat GitHub/GitLab detection in repo tests as a cheap, stubbed binary + remote-URL contract instead of a real integration setup problem.
- Keep the inventory source stable and expressive by attaching mappings/exclusions directly to flow-level items as suites evolve.
- Make message E2E explicitly safe on a developer machine by disabling socket push during tests instead of hoping no dashboard is running.

</specifics>

<deferred>
## Deferred Ideas

- Direct `repo scan` E2E coverage — excluded from this milestone scope and should remain explicitly documented as such in the inventory.
- Direct `template new` / other wizard-driven template UX coverage.
- Prompt-driven success/failure variants for repo removal and other representative error paths — Phase 82.1.
- Live dashboard socket delivery behavior for messages — TUI/integration-adjacent concern, not part of this phase’s durable CLI contract.

</deferred>

---

*Phase: 82-template-repo-label-and-message-e2e-coverage*
*Context gathered: 2026-04-10*
