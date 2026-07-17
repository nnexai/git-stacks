---
phase: 126-web-workflow-and-forge-source-parity
plan: "08"
subsystem: conformance-security-verification
tags: [cross-client, architecture, authority, redaction, operations, forge-review, phase-127-handoff]

requires:
  - phase: 126-06
    provides: reviewed OpenTUI canonical actions, details, durable operations, and forge creation
  - phase: 126-07
    provides: reviewed web canonical actions, details, durable operations, and forge creation
provides:
  - executable hostile no-client-authority and browser-disclosure sentinels
  - real web/TUI adapter conformance over one canonical action label and descriptor contract
  - durable-operation, notes, file-status, and forge state-machine conformance
  - complete local gate evidence and an explicit Phase 127 live/hosted/manual stop boundary
affects: [127, release-readiness, architecture, web, tui]

tech-stack:
  added: []
  patterns: [hostile architecture fixtures, renderer-neutral test adapters, executable evidence table, deterministic-versus-live handoff]

key-files:
  created:
    - tests/architecture/phase126-client-authority.test.mjs
    - tests/service/phase126-cross-client-conformance.test.ts
    - .planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md
  modified:
    - packages/client/src/workspace-actions.ts
    - packages/tui/src/workspace-action-inventory.ts
    - packages/tui/src/ActionMenu.tsx

key-decisions:
  - "Approved action labels live in the shared client registry; the TUI adapter owns only key/group presentation and cannot drift its copy."
  - "The authority scanner uses explicit TUI presentation and handoff allowlists rather than banning legitimate trusted-client imports broadly."
  - "Every hostile architecture sentinel has a fixture that proves the rule fires, while the production web/TUI source and final browser bundle must pass."
  - "The Phase 127 handoff records deterministic local evidence separately from authenticated hosts, live reconnect/cancel, physical input, screenshots, hosted CI, and human approval."

patterns-established:
  - "Cross-client tests import the real shared registry plus real web and TUI row adapters instead of comparing duplicate expected tables."
  - "UI consideration coverage is an executable source-evidence table for empty/loading/error/populated/partial/overflow/zero-one-many/long/constrained states."
  - "Release readiness stops before tag-triggered workflows and all outward release actions until Phase 127 approval."

requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, SOURCE-01, SOURCE-02, SOURCE-03, SOURCE-04]

coverage:
  - id: D1
    description: "Architecture gates reject client mutation/runtime/provider/source authority and forbidden browser projection fields."
    requirement: PARITY-03
    verification:
      - kind: architecture
        ref: "tests/architecture/phase126-client-authority.test.mjs"
        status: pass
      - kind: architecture
        ref: "tests/architecture/package-boundaries.test.mjs and secure-browser-bundle.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Web and TUI consume one action label, descriptor, confirmation, disabled-reason, callback, and durable-operation contract."
    requirement: PARITY-05
    verification:
      - kind: integration
        ref: "tests/service/phase126-cross-client-conformance.test.ts"
        status: pass
      - kind: automated_ui
        ref: "web-workspace-actions, WorkspaceParity, and isolated OpenTUI suites"
        status: pass
    human_judgment: false
  - id: D3
    description: "Notes, file status, and reviewed forge creation remain authoritative, path-free, one-shot, and state-machine separated across both clients."
    requirement: SOURCE-03
    verification:
      - kind: integration
        ref: "tests/service/phase126-cross-client-conformance.test.ts"
        status: pass
      - kind: full_suite
        ref: "npm test, coverage, typecheck, builds, dependency and verify gates"
        status: pass
    human_judgment: false
  - id: D4
    description: "Authenticated GitHub/GitLab, hosted supported runners, live reconnect/cancel, physical browser/xterm input, screenshots, and interactive OpenTUI approval remain unverified."
    verification: []
    human_judgment: true
    rationale: "Phase 127 owns the consolidated pre-tag live/hosted/manual gate documented in 126-PHASE127-HANDOFF.md."

duration: 18min
completed: 2026-07-17
status: complete
---

# Phase 126 Plan 08: Cross-Client Conformance and Verification Handoff Summary

**Phase 126 now has executable authority/redaction sentinels, one real cross-client conformance matrix, complete green local gates, and an honest Phase 127 pre-tag continuation point.**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-07-17
- **Tasks:** 3
- **Files created:** 3
- **Production files modified:** 3

## Accomplishments

- Added 26 hostile and production authority/disclosure tests that reject client-side core/service mutation authority, runtime access outside explicit TUI handoffs, provider commands, synthetic/fetched provider refs, and path/credential-bearing browser fields.
- Moved TUI action labels onto the shared client registry and added a pure TUI key/group adapter, allowing the cross-client suite to compare actual web and TUI presentation over the same descriptors.
- Added 11 conformance tests covering action labels/groups/reasons/callback identity, confirmation rules, synchronous latching, fail-closed inventories, operation submit/reconnect/cancel/refresh, notes, file states/redaction, forge terminology, Resolve/Review/Create, and executable UI-state evidence.
- Ran the complete local package, test, coverage, type, dependency, architecture, web/TUI build, and verification gates.
- Wrote the Phase 127 handoff with exact local results and the remaining hosted, authenticated, live-service, physical-input, screenshot, interactive-TUI, and human parity checklist.

## Task Commits

1. **Tasks 1-2: Authority sentinels and cross-client conformance** — `8b3840bb`
2. **Task 3: Phase 127 verification handoff** — `7d48a491`

## Files Created/Modified

- `tests/architecture/phase126-client-authority.test.mjs` — Hostile fixtures plus production source scans for client authority, runtime/provider/source assumptions, and browser disclosure.
- `tests/service/phase126-cross-client-conformance.test.ts` — Shared registry and real web/TUI adapter matrix, operation state machines, notes/files/forge contracts, and UI-state evidence table.
- `packages/client/src/workspace-actions.ts` — Exports canonical approved action labels and aligns notes/file copy with the approved UI specification.
- `packages/tui/src/workspace-action-inventory.ts` — Pure TUI key/group presentation adapter over shared labels and authoritative descriptors.
- `packages/tui/src/ActionMenu.tsx` — Consumes the TUI adapter instead of maintaining a duplicate action-label table.
- `126-PHASE127-HANDOFF.md` — Exact deterministic evidence and complete remaining pre-tag verification checklist.

## Decisions Made

- The shared client registry is the sole action-label source. Renderers may own placement, grouping, and keys, but not divergent copy or callbacks.
- TUI architecture enforcement is allowlist-based because trusted presentation/types and explicit editor/terminal handoffs are legitimate; mutation, provider, filesystem, and process authority remain rejected outside those seams.
- A scanner rule is accepted only when a hostile fixture proves it fails and the actual source passes.
- The focused Vitest command intentionally collected only Node-project files; OpenTUI files were verified through the required isolated `npm run test:tui` runner, not misreported as Vitest coverage.
- The tag-only release-artifacts workflow is not a pre-tag gate and must not be triggered without explicit release authorization.

## Deviations from Plan

### Auto-fixed drift

**1. [Rule 1 - Conformance] Removed duplicate TUI action labels**
- **Found during:** Cross-client adapter design.
- **Issue:** Shared client/web labels used older `List workspace notes` / `Inspect workspace files` wording while the approved UI contract and TUI used `View notes` / `View file status`.
- **Fix:** Exported canonical shared labels, aligned them to the UI specification, and made TUI derive labels from that registry.
- **Verification:** Cross-client matrix, full Vitest, isolated TUI, all typechecks, and builds passed.
- **Committed in:** `8b3840bb`

**2. [Rule 1 - Verification honesty] Recorded the OpenTUI runner boundary explicitly**
- **Found during:** Focused Plan 08 command.
- **Issue:** The listed Vitest command accepts OpenTUI paths but the Node project does not collect those Bun-isolated files.
- **Fix:** Preserved the exact focused command result and separately recorded the required isolated TUI result from `npm test` rather than claiming five Vitest files ran.
- **Verification:** 37 isolated TUI files / 219 tests passed.
- **Committed in:** `7d48a491`

**Total deviations:** 2 auto-fixed conformance/evidence issues. Neither expands product scope.

## Verification

- Focused architecture: 34/34 Node tests passed plus dependency/cycle gate.
- Focused cross-client Vitest: 3 files / 24 tests passed; OpenTUI inputs verified separately by the isolated runner.
- Full Vitest: 160 files; 2,097 passed and 1 skipped.
- Native Node suite: 72/72 passed.
- OpenTUI: 37 files / 219 tests passed; existing non-failing listener warnings remain.
- Coverage: 54.63% statements, 49.67% branches, 52.68% functions, 57.93% lines.
- All seven workspace typechecks passed.
- `npm run test:deps`, `npm run test:architecture`, `npm run web:build`, `npm run tui:build`, `npm run verify:gates`, and `git diff --check` passed.
- Final rebuilt browser bundle passed the authority/package/secure-bundle sentinels.

## Known Stubs

None. The remaining items are explicit Phase 127 live/hosted/manual verification, not implementation placeholders.

## User Setup Required

None for deterministic local Phase 126 closure. Phase 127 requires authenticated disposable GitHub/GitLab fixtures and interactive browser/TUI environments as documented in `126-PHASE127-HANDOFF.md`.

## Next Phase Readiness

- Phase 126 implementation and local automated verification are complete.
- Phase 127 may consume `126-PHASE127-HANDOFF.md`; it was not started in this run.
- No tag, push, publish, package release, GitHub release, or RC approval claim was performed.

## Self-Check: PASSED

- All required Plan 08 artifacts exist.
- Commits `8b3840bb` and `7d48a491` exist on the integration branch.
- Full required local gates are green.
- Deterministic evidence is not described as hosted, live, screenshot, physical-device, or human approval.
- The Phase 127 handoff explicitly blocks tag/push/publish/release until manual approval.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-17*
