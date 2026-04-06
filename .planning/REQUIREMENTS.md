# Requirements: git-stacks

**Defined:** 2026-04-05
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.17.0 Requirements

Requirements for v0.17.0 Engine Hardening & Template Labels. Each maps to roadmap phases.

### Template Labels

- [x] **TLBL-01**: User can add labels to a template via `git-stacks template label add <template> <label...>`
- [x] **TLBL-02**: User can remove labels from a template via `git-stacks template label remove <template> <label...>`
- [x] **TLBL-03**: User can list labels on a template via `git-stacks template label list <template>`
- [x] **TLBL-04**: User can clear all labels from a template via `git-stacks template label clear <template>`
- [x] **TLBL-05**: User can filter templates by label via `git-stacks template list --label <label>`
- [x] **TLBL-06**: Template labels propagate to workspace on creation (union merge with user-provided labels)
- [x] **TLBL-07**: Workspace clone copies labels from source workspace

### Engine Hardening

- [ ] **ENGN-01**: Multi-step workspace operations use a compensation stack that rolls back completed steps on failure
- [ ] **ENGN-02**: Rollback progress is visible to user via the existing onProgress callback
- [ ] **ENGN-03**: Rollback is best-effort — individual undo failures are logged but do not abort remaining undo steps
- [ ] **ENGN-04**: Workspace/template lookups use an in-memory index instead of scanning all YAML files
- [ ] **ENGN-05**: Index is invalidated automatically on every write operation
- [ ] **ENGN-06**: Index miss falls back to YAML scan (cache, not source of truth)
- [x] **ENGN-07**: Each integration plugin declares its capabilities via a typed `capabilities` field
- [x] **ENGN-08**: Integration runner uses capability declarations instead of optional chaining to gate calls
- [x] **ENGN-09**: `integration list` displays plugin capabilities

### Observability

- [x] **OBSV-01**: `workspace-lifecycle.ts` has injectable `_exec` seam for subprocess testing
- [x] **OBSV-02**: `workspace-git.ts` has injectable `_exec` seam for subprocess testing
- [x] **OBSV-03**: Debug output uses structured fields `{ op, module, repo?, ms?, msg }` on stderr
- [x] **OBSV-04**: `GS_DEBUG=lifecycle,git` filters debug output to named modules only
- [x] **OBSV-05**: `GS_DEBUG=1` or `GS_DEBUG=true` continues to show all module output

## Future Requirements

### TUI Label Management

- **TLBL-08**: User can add/remove labels from workspace detail pane in TUI dashboard
- **TLBL-09**: User can add/remove labels from template detail pane in TUI dashboard

### Advanced Index

- **ENGN-10**: On-disk index file at `~/.config/git-stacks/index.yml` for startup speed
- **ENGN-11**: Index stores metadata (name, labels, branch) for fast filtering without YAML parse

### Label Completion

- **TLBL-10**: Shell completions offer existing label values for `--label` and `label add/remove` arguments

## Out of Scope

| Feature | Reason |
|---------|--------|
| Label inheritance via template `includes` | Label provenance becomes opaque; labels should be explicit per template |
| On-disk index as primary config store | YAML-per-entity is user-editable; index is cache only |
| Rollback via snapshot + restore | Snapshots don't cover filesystem state; compensation stack is correct approach |
| Plugin versioning / semver contracts | Single-process tool; TypeScript compile-time enforcement is sufficient |
| Global label taxonomy / registry | Kills low-friction labeling; freeform strings with format validation is correct |
| Async saga engine for rollback | CLI ops are synchronous and short-lived; saga adds framework dependency with zero benefit |
| Third-party plugin loading | Just the interface contracts this milestone; dynamic loading deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TLBL-01 | Phase 74 | Complete |
| TLBL-02 | Phase 74 | Complete |
| TLBL-03 | Phase 74 | Complete |
| TLBL-04 | Phase 74 | Complete |
| TLBL-05 | Phase 74 | Complete |
| TLBL-06 | Phase 74 | Complete |
| TLBL-07 | Phase 74 | Complete |
| ENGN-01 | Phase 78 | Pending |
| ENGN-02 | Phase 78 | Pending |
| ENGN-03 | Phase 78 | Pending |
| ENGN-04 | Phase 77 | Pending |
| ENGN-05 | Phase 77 | Pending |
| ENGN-06 | Phase 77 | Pending |
| ENGN-07 | Phase 76 | Complete |
| ENGN-08 | Phase 76 | Complete |
| ENGN-09 | Phase 76 | Complete |
| OBSV-01 | Phase 75 | Complete |
| OBSV-02 | Phase 75 | Complete |
| OBSV-03 | Phase 75 | Complete |
| OBSV-04 | Phase 75 | Complete |
| OBSV-05 | Phase 75 | Complete |

**Coverage:**
- v0.17.0 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after roadmap creation*
