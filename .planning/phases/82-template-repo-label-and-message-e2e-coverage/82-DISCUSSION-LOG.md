# Phase 82: Template, Repo, Label, and Message E2E Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10T21:25:00Z
**Phase:** 82-template-repo-label-and-message-e2e-coverage
**Areas discussed:** Repo registry scope, Template coverage boundary, Labels + messages proof style, Inventory mapping granularity

---

## Repo registry scope

### Scope alignment

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude `repo scan` and align roadmap to requirements | Treat scan as out of scope for Phase 82. | ✓ |
| Keep `repo scan` as a documented exclusion only | Leave roadmap text unchanged but note the exclusion elsewhere. | |
| Actually test `repo scan` | Pull wizard-driven repo scan into Phase 82 anyway. | |

**User's choice:** Exclude `repo scan` from Phase 82 scope and update the roadmap/scope to match requirements.

---

### Repo suite shape

| Option | Description | Selected |
|--------|-------------|----------|
| Separate git-repo and dir-repo scenario groups | Keep assertions focused while sharing overlapping command coverage. | ✓ |
| One mixed-registry scenario | Cover everything in one blended flow. | |
| Mostly git-focused with minimal dir smoke | Bias strongly toward git paths. | |

**User's choice:** Separate git-repo and dir-repo scenario groups.

---

### Repo add behavior to prove

| Option | Description | Selected |
|--------|-------------|----------|
| Prove no-enabled-forge and enabled-single-match paths | Cover both the default forge-unset case and one deterministic auto-detect case. | ✓ |
| Prove only no-enabled-forge | Leave enabled-match behavior to lower-level coverage. | |
| Cover full no/single/multi matrix | Expand Phase 82 into a larger behavior matrix. | |

**User's choice:** Prove both the no-enabled-forge path and one enabled-single-match auto-detect path.

---

### Forge-dependent test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Stub `gh`/`glab` + matching remote URL; avoid `tea`/real auth | Keep the enabled-match case deterministic and non-integration in spirit. | ✓ |
| Drop enabled-single-match E2E | Avoid forge-dependent proof at E2E level. | |
| Build heavier real/fake auth setup | Pull real forge setup into the suite. | |

**User's choice:** Use a stub `gh`/`glab` binary plus matching remote URL, and avoid `tea`/real forge auth in E2E.

---

### Failure-path placement

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Phase 82 on success/output contracts; failures in 82.1 | Preserve the milestone split. | ✓ |
| Include a small repo-specific failure subset now | Pull some failures into Phase 82. | |
| Pull the full repo failure matrix into Phase 82 | Collapse the phase boundary. | |

**User's choice:** Keep representative repo failures in Phase 82.1.

---

### Forge persistence proof

| Option | Description | Selected |
|--------|-------------|----------|
| Assert `repo add` stdout + registry YAML | Prove hidden forge persistence without changing `list/show`. | ✓ |
| Change `repo show` to expose forge | Add new CLI output just for proof. | |
| Ignore forge persistence at E2E level | Leave it to lower-level tests. | |

**User's choice:** Assert `repo add` stdout plus persisted registry YAML for the forge field.

---

### Enablement fixture and dir/default behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Real isolated `config.yml`, explicit dir-repo assertions, `--force` remove, and branch auto+override proof | Keep the suite realistic and deterministic. | ✓ |
| Lighter or narrower variants | Prove less of the repo contract at E2E level. | |

**User's choice:** Use real `config.yml` enablement, prove dir repos skip forge detection and default to `main`, use `--force` for remove, and cover both branch autodetect and `--branch`.

---

### Inventory treatment for `repo scan`

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `repo scan` as an explicit excluded inventory item with rationale | Make the exclusion visible in the machine-parseable source. | ✓ |
| Remove it entirely from inventory | Hide it from milestone accounting. | |
| Leave it as unmapped in-scope work | Treat it as pending rather than excluded. | |

**User's choice:** Keep `repo scan` as an explicit excluded item with rationale.

---

## Template coverage boundary

### Propagation route

| Option | Description | Selected |
|--------|-------------|----------|
| Prove propagation through new non-interactive create and clone paths | Use the new deterministic create/clone entrypoints from Phase 81.1.1. | ✓ |
| Prove propagation only through create | Skip clone propagation. | |
| Keep propagation out of Phase 82 | Leave the gap unresolved. | |

**User's choice:** Prove propagation through the new non-interactive create and clone paths.

---

### Meaning of template “create”

| Option | Description | Selected |
|--------|-------------|----------|
| Use `new --non-interactive` with pre-provided template data | Treat template-backed workspace creation as the practical create proof. | ✓ |
| Count fixture-seeded templates + list/show as sufficient | Avoid create-path proof entirely. | |
| Cover `template new` directly | Pull wizard behavior back into scope. | |

**User's choice:** Use `new --non-interactive` with pre-provided template data; do not test `template new` itself.

---

### Template suite shape

| Option | Description | Selected |
|--------|-------------|----------|
| Separate template-command and template-consumption scenarios | Keep template management and workspace-consumption proof distinct. | ✓ |
| One lifecycle scenario | Cover everything in one end-to-end path. | |
| Many tiny per-subcommand tests | Fragment the suite into minimal slices. | |

**User's choice:** Separate template-command scenarios from template-consumption scenarios.

---

### Composition proof

| Option | Description | Selected |
|--------|-------------|----------|
| Prove via `new --non-interactive --template ...` and resulting workspace snapshot | Keep composition tied to real consumption behavior. | ✓ |
| Prove only through template-command fixtures | Avoid workspace creation in composition proof. | |
| Broad matrix across commands and creation | Expand composition into a much wider matrix. | |

**User's choice:** Prove composition through `new --non-interactive` with repeatable `--template`.

---

## Labels + messages proof style

### Suite grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Keep separate focused contract suites | Match the different command contracts and storage behaviors. | ✓ |
| Combine into one workspace-metadata suite | Blend labels and messages together. | |
| Defer messages | Avoid covering messages now. | |

**User's choice:** Keep labels and messages as separate focused contract suites.

---

### Existing label subprocess coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Extend only to close gaps and map inventory | Reuse what already exists instead of rewriting it. | ✓ |
| Rewrite from scratch | Replace the current label suite entirely. | |
| Leave untouched | Treat current label tests as fully sufficient. | |

**User's choice:** Extend existing label subprocess coverage only to close roadmap gaps and fold it into the inventory.

---

### Message suite shape

| Option | Description | Selected |
|--------|-------------|----------|
| One focused message-contract suite | Cover send/list/clear, workspace resolution, sender metadata, JSONL, and missing-workspace behavior together. | ✓ |
| Tiny per-subcommand tests only | Split the message behavior apart. | |
| Persisted JSONL only | Leave CLI-level message contract mostly to unit tests. | |

**User's choice:** One focused message-contract suite.

---

### Socket behavior in tests

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore live socket delivery and assert durable file/CLI contract only | Keep TUI/socket behavior out of Phase 82. | ✓ |
| Assert fake socket delivery too | Pull socket behavior into the suite. | |
| Treat socket delivery as required coverage | Expand the phase boundary into live dashboard behavior. | |

**User's choice:** Ignore live socket delivery and assert the durable contract only.

---

### Automation-safe socket seam

| Option | Description | Selected |
|--------|-------------|----------|
| Add explicit test/automation opt-out for socket push | Prevent the suite from touching a real local dashboard session. | ✓ |
| Redirect socket path | Add an isolated test socket instead. | |
| Avoid `message send` E2E | Give up on CLI-level message send coverage. | |

**User's choice:** Add an explicit test/automation opt-out for socket push and use it in the E2E suite.

---

## Inventory mapping granularity

### Mapping model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep flow-level inventory items mapped to one or more focused test files | Preserve the Phase 80 inventory model. | ✓ |
| Split toward per-subcommand items | Refine inventory granularity during Phase 82. | |
| Force one item ↔ one file | Shape the suite around the inventory rather than the behavior. | |

**User's choice:** Keep flow-level inventory items and map them to one or more focused test files as needed.

---

### Exclusions/partials recording

| Option | Description | Selected |
|--------|-------------|----------|
| Store inline with inventory item metadata | Keep rationale and mapping in the same machine-parseable source. | ✓ |
| Track in separate prose docs | Split rationale from inventory. | |
| Leave undocumented until Phase 84 | Delay decisions until later. | |

**User's choice:** Store exclusions and partial-coverage rationale inline in the inventory item.

---

### Mapping timing

| Option | Description | Selected |
|--------|-------------|----------|
| Update incrementally as suites land or are extended | Keep the inventory current during the phase. | ✓ |
| Final sweep only | Leave mappings stale until the end. | |
| Defer until later gate/reporting work | Separate mapping from implementation entirely. | |

**User's choice:** Update inventory mappings incrementally.

---

## the agent's Discretion

- Exact file grouping and naming across the repo, template, label, and message suites
- Exact shape of the message socket opt-out seam
- Exact inventory metadata field names for mappings and exclusions

## Deferred Ideas

- Direct `repo scan` E2E coverage
- Direct `template new` wizard coverage
- Prompt-driven repo removal and broader failure matrices
- Live dashboard socket delivery behavior for messages
