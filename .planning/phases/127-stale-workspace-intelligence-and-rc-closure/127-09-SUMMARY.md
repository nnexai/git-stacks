---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "09"
subsystem: deterministic-verification-security
tags: [stale-workspaces, cross-client, asvs-l1, architecture, vitest, node-test, opentui, coverage]

requires:
  - phase: 127-03
    provides: strict path-free stale schemas and bounded read-only GitHub/GitLab status observation
  - phase: 127-04
    provides: service-owned qualification, transparent ranking, revision-first evaluation, bounded fan-out, and volatile generation-safe cache
  - phase: 127-05
    provides: revision-first secure route, explicit browser allowlist projection, and one evaluator per service lifetime
  - phase: 127-06
    provides: shared presentation, generation/retry coordination, shortcut boundaries, and official TUI service adapter
  - phase: 127-07
    provides: singleton responsive web stale-workspace overlay and canonical lifecycle integration
  - phase: 127-08
    provides: dedicated responsive OpenTUI stale-workspace view and canonical lifecycle integration
provides:
  - green deterministic cross-client parity receipt for shared order, labels, reasons, timestamps, counts, disabled explanations, and lifecycle reconciliation
  - green hostile ASVS L1 authority, disclosure, import, package, build, type, and dependency receipt
  - green Bun-free Node Vitest, native Node, and V8 coverage receipt before RC metadata changes
  - deterministic closure of A-EDGE-STALE-03 through runtime mutation sentinels and hostile read-only capability proofs
  - explicit separation of local deterministic evidence from hosted, authenticated, physical, visual, interactive, human, and release-authority evidence

affects: [127-10, 127-11, 127-12, 127-13, 127-14, release-candidate, stale-workspace-verification]

tech-stack:
  added: []
  patterns:
    - verification-only tasks use atomic empty commits as command receipts when no repository file should change
    - Node production and conformance gates run with Bun removed from PATH while OpenTUI runs only through the isolated repository launcher
    - deterministic evidence closes code behavior only and never promotes external or human receipt classes

key-files:
  created:
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-09-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "A-EDGE-STALE-03 is deterministically closed because both runtime mutation sentinels and hostile architecture capability tests pass; this does not claim live or human no-mutation approval."
  - "The pre-metadata Node gate runs with Bun absent from PATH; the optional TUI remains isolated behind npm run test:tui."
  - "npm test and npm run release:check remain deferred to Plan 127-11 after RC manifests and documentation exist."
  - "REL-01 remains globally pending because package metadata, documentation, hosted runtime/provider evidence, screenshots, interactive TUI, and human parity are owned by later plans."

patterns-established:
  - "Verification receipt commits contain no product diff and retain normal commit hooks."
  - "A green deterministic renderer or architecture harness is never described as hosted, authenticated, physical, screenshot, interactive, human-approved, or release-authorized evidence."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-04, STALE-05]
requirements-advanced: [REL-01]

coverage:
  - id: D1
    description: "One strict fixture passes through the shared client and real web/TUI renderer adapters with identical order, labels, evidence groups, timestamps, counts, disabled explanations, and canonical lifecycle behavior."
    requirement: STALE-02
    verification:
      - kind: integration
        ref: "GIT_STACKS_KEY_STORE=file npx vitest run [six Phase 127 focused files] — 157/157 tests passed"
        status: pass
      - kind: automated_ui
        ref: "npm run test:tui — all isolated OpenTUI files passed, including StaleWorkspaces.test.tsx 18/18"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stale evaluation and refresh are suggestion-only and cannot archive, remove, stop terminals, discard worktrees, write YAML, mutate providers, or submit operations."
    requirement: STALE-03
    verification:
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — runtime mutation sentinels remain zero for evaluate and forced refresh"
        status: pass
      - kind: integration
        ref: "node --test tests/architecture/phase127-stale-authority.test.mjs — 44/44 hostile authority, disclosure, package, and evidence-spoofing tests passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown evidence remains distinct from confirmed absence, repository scope is preserved, and browser/TUI surfaces expose no machine path, credential, environment, bearer, argv, stdout, stderr, raw error, score, or local authority."
    requirement: STALE-05
    verification:
      - kind: integration
        ref: "focused schema/provider/remote/policy/web/conformance matrix — 157/157 tests passed"
        status: pass
      - kind: other
        ref: "npm run build:packages && npm run typecheck && npm run test:architecture && npm run test:deps && npm run web:build && npm run tui:build"
        status: pass
    human_judgment: false
  - id: D4
    description: "The pre-metadata local Node regression and coverage boundary is green without aggregate release validation or outward release actions."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "npm run test:vitest — 168 files passed, 2263 tests passed, one conditional zsh host fixture skipped because zsh is absent"
        status: pass
      - kind: integration
        ref: "npm run test:node — 119/119 native Node architecture, conformance, core, CLI, and service tests passed with Bun absent from PATH"
        status: pass
      - kind: other
        ref: "npm run coverage — 56.24% statements, 51.54% branches, 54.44% functions, 59.61% lines"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hosted runtimes, authenticated GitHub/GitLab status, physical browser/xterm input, responsive screenshots, interactive OpenTUI, human parity, and release authorization remain unclaimed."
    requirement: REL-01
    verification: []
    human_judgment: true
    rationale: "These evidence classes require exact-candidate-SHA hosted or human receipts in Plans 127-12 through 127-14 and cannot be inferred from local deterministic commands."

# Metrics
duration: 7min
completed: 2026-07-17
status: complete
---

# Phase 127 Plan 09: Deterministic Stale Workspace and Pre-Metadata RC Verification Summary

**Cross-client stale intelligence, hostile ASVS authority boundaries, all package builds, and Bun-free Node regressions are deterministically green without changing product code or claiming external evidence.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-17T13:51:57Z
- **Completed:** 2026-07-17T13:59:24Z
- **Tasks:** 3
- **Files modified:** 4 planning artifacts; 0 product files

## Accomplishments

- Passed the complete focused stale schema, provider, remote-branch, service policy/evaluator, web, shared-client, and real-adapter conformance matrix: 6 files and 157 tests with no required skip, only, or TODO marker.
- Passed the official isolated OpenTUI launcher, including all 18 dedicated stale-workspace renderer tests and the repository's wider TUI regressions.
- Passed 44 hostile stale-authority tests proving browser/TUI dependency direction, strict disclosure allowlists, no client classification/ranking/probes, no evaluator mutation capability, no stale CLI command, and no deterministic evidence spoofing.
- Built all default packages and both clients, typechecked all seven workspaces, and passed repository architecture and dependency-cycle gates.
- Passed the full Bun-free Node boundary: 168 Vitest files, 2,263 passing Vitest tests, 119 native Node tests, and V8 coverage at 56.24% statements / 59.61% lines.
- Closed A-EDGE-STALE-03 deterministically through both runtime no-mutation sentinels and static hostile capability proofs while leaving every hosted/manual receipt class unclaimed.

## Task Commits

Each verification task was committed atomically with normal hooks. The tasks intentionally changed no files, so their commits are empty command receipts.

1. **Task 1: Run the focused evidence, renderer, and cross-client matrix** - `eb927bae` (test)
2. **Task 2: Enforce architecture, ASVS, package, build, and type boundaries** - `38856d8d` (test)
3. **Task 3: Run the pre-metadata Node regression and coverage boundary** - `f8f3daa7` (test)

## Files Created/Modified

- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-09-SUMMARY.md` - Canonical deterministic command receipt, threat closure, evidence boundary, and next-plan handoff.
- `.planning/STATE.md` - Advanced execution position to Plan 127-10 and recorded Plan 127-09 metrics/decisions.
- `.planning/ROADMAP.md` - Marked Plan 127-09 complete and updated Phase 127 execution count.
- `.planning/REQUIREMENTS.md` - Closed STALE-03 from the green no-mutation evidence while preserving REL-01/REL-02 as pending.

No protocol, core, service, shared client, web, TUI, package manifest, lockfile, release metadata, or documentation source file changed.

## Decisions Made

- Treated A-EDGE-STALE-03 as deterministically closed only because both independent proof classes are green: runtime mutation sentinels and hostile architecture/capability scans.
- Removed every directory containing a `bun` executable from `PATH` for `npm run test:vitest`, `npm run test:node`, and `npm run coverage`; Bun was used only by the official isolated TUI launcher.
- Kept `npm test` and `npm run release:check` out of this plan exactly as specified. They require the Plan 127-10 manifests/lockfile and Plan 127-11 changelog/documentation first.
- Preserved REL-01 as globally incomplete. This plan proves its deterministic pre-metadata slice but does not provide version metadata, supported-host receipts, authenticated provider evidence, screenshots, interactive TUI evidence, or human parity.

## Verification Receipts

### Task 1: Focused policy, renderer, and cross-client matrix

- `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces-schema.test.ts tests/lib/core/forge-change-status.test.ts tests/lib/core/remote-branch-status.test.ts tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts tests/service/phase127-cross-client-conformance.test.ts`
  - 6 test files passed.
  - 157 tests passed.
  - The required Phase 127 files contain no `skip`, `only`, or `todo` marker.
  - Covered strict schemas, all five confirmed reasons, provider/branch/worktree/activity unknown modes, fixed labels, reason ordering, exact/relative timestamps, candidate/incomplete split, revision/cache races, disclosure canaries, one-shot actions, and non-replaying reconciliation.
- `npm run test:tui`
  - The official launcher ran every OpenTUI file in an isolated Bun process.
  - All files passed; `tests/tui/dashboard/StaleWorkspaces.test.tsx` passed 18/18.
  - No direct combined Bun suite was used.

### Task 2: Architecture, ASVS L1, packages, builds, and types

- `node --test tests/architecture/phase127-stale-authority.test.mjs`
  - 44 tests passed; 0 failed, skipped, or TODO.
  - Hostile fixtures proved web/TUI cannot import or execute stale policy, provider, Git, filesystem, process, lifecycle mutation, or release authority.
  - The evaluator capability graph remained read-only.
  - Browser schemas and visible source remained path-, secret-, environment-, process-output-, score-, and mutation-field-free.
  - The daemonless CLI exposed no stale command; the default install graph excluded TUI, Bun, and OpenTUI.
- `npm run build:packages`
  - Protocol, client, core, CLI, service, and web package builds passed.
- `npm run typecheck`
  - Protocol, client, core, CLI, service, web, and TUI workspace typechecks passed.
- `npm run test:architecture`
  - `Package architecture: OK`.
- `npm run test:deps`
  - `Package architecture: OK`; dependency-cycle gate passed.
- `npm run web:build`
  - Passed.
- `npm run tui:build`
  - Passed with Bun 1.3.14.

### Task 3: Bun-free Node regressions and coverage

The Node commands ran after verifying `bun` was absent from `PATH`.

- `npm run test:vitest`
  - 168 test files passed.
  - 2,263 tests passed; one pre-existing conditional zsh host fixture skipped because zsh is not installed.
  - The skip is outside the required stale-workspace matrix and does not promote hosted shell evidence.
- `npm run test:node`
  - 119 tests passed; 0 failed or skipped.
  - Included package architecture, disclosure, stale authority, release-side-effect fences, default-package graph, CLI-without-Bun, secure transport, persistence, service, and terminal conformance.
- `npm run coverage`
  - 168 files passed and 2,263 tests passed with the same conditional zsh skip.
  - Statements: 56.24% (10,605/18,854).
  - Branches: 51.54% (6,111/11,856).
  - Functions: 54.44% (1,947/3,576).
  - Lines: 59.61% (9,401/15,769).

### Final source and repository inspection

- Fixed-string source inspection confirmed the web and TUI stale surfaces import shared `@git-stacks/client` and `@git-stacks/protocol` contracts. The pre-wave invalid-regex report was verifier-tool noise, not a source or architecture failure.
- Renderer source inspection found no stale policy, probe, classification, ranking, lifecycle mutation, YAML, terminal, worktree-discard, or provider authority.
- The working tree remained free of generated or product changes after builds and coverage.
- No tag points at any Plan 127-09 commit, and no tag, push, publish, GitHub Release creation, or release-only workflow command was run.
- Every existing phase-planning directory remained present; no planning directory was deleted.

## ASVS L1 Threat Closure

| Threat | Result | Deterministic proof |
|---|---|---|
| T-127-09-01 cross-client spoofing | PASS | One strict fixture through the shared client plus real web/TUI adapters; identical order, labels, reasons, timestamps, counts, and action explanations. |
| T-127-09-02 client/package privilege elevation | PASS | 44 hostile authority tests plus repository architecture/dependency gates reject client probes, classification, Git/provider execution, and mutation authority. |
| T-127-09-03 browser/TUI information disclosure | PASS | Strict nested schema/canary tests, source scans, package boundaries, and builds exclude paths, credentials, environment, bearer data, argv, stdout/stderr, raw errors, and unapproved launch context. |
| T-127-09-04 weakened/skipped tests | PASS | Every required Phase 127 focused row ran; the focused files contain no skip/only/TODO marker. The sole full-suite skip is the unrelated conditional zsh host fixture. |
| T-127-09-05 deterministic evidence repudiation | PASS | This summary labels every receipt local/deterministic and lists all external/manual classes as not performed. |
| T-127-09-06 validation-side privilege elevation | PASS | Only local test/build/type/coverage commands ran; no release or outward-facing command ran. |

No high-severity threat remains open or accepted for this deterministic plan boundary.

## A-EDGE-STALE-03 Result

**Deterministic status: CLOSED.**

- `tests/lib/service/stale-workspaces.test.ts` injected archive, remove, terminal-stop, worktree-discard, YAML-write, and provider-mutation sentinels into both ordinary evaluation and forced refresh; every call count remained zero.
- `tests/architecture/phase127-stale-authority.test.mjs` rejected hostile evaluator mutation dependencies and confirmed the real evaluator exposes no archive, remove, terminal, worktree, YAML, provider, operation-submit, filesystem-mutation, or direct process-mutation capability.

This closes the unclassified suggestion-only edge as deterministic product evidence. It does not claim a live browser/TUI session, physical interaction, or human approval.

## External and Human Evidence Not Claimed

The following were **not performed** and remain owned by Plans 127-12 through 127-14 against an immutable candidate SHA:

- Node 24 supported-host Linux/macOS x64/ARM hosted receipts.
- Hosted CI approval and artifact/checksum receipts.
- Authenticated GitHub and GitLab merged/closed/open status checks.
- Real same-repository/project and fork forge creation/recovery matrices.
- Physical browser/xterm pointer, keyboard, AltGraph, IME, dead-key, repeat, and non-US interaction.
- Responsive light/dark screenshots at desktop, 375px, and 320px.
- Interactive OpenTUI sessions at every required width/height tier.
- Live archive/remove/force/stale/action/notes/file-status/lifecycle reconciliation.
- Human side-by-side web/TUI parity approval.
- Tag, push, publish, GitHub Release, release workflow, or any release authorization.

The local run used Node 26.5.0, which satisfies the repository's `>=24` engine, but it is not represented as the required exact Node 24 hosted-runtime receipt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled unsupported planning-state handlers**
- **Found during:** Plan metadata update after Task 3.
- **Issue:** `state.update-progress` could not find this repository's structured progress field, `requirements.mark-complete` did not recognize the bold-colon requirement syntax, and `state.add-decision` emitted `[Phase ?]` prefixes.
- **Fix:** Preserved the successful SDK updates, then reconciled the structured progress percentage, Plan 09 activity text, STALE-03 checkbox, and Phase 127 decision labels directly. REL-01 and REL-02 remain pending.
- **Files modified:** `.planning/STATE.md`, `.planning/REQUIREMENTS.md`
- **Verification:** STATE reports Plan 10 of 14 with 37/42 plans (88%); ROADMAP reports 9/14; STALE-03 is checked while REL-01/REL-02 remain unchecked.
- **Committed in:** Plan metadata commit.

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking tooling issue)
**Impact on plan:** Tracking metadata now matches the green deterministic evidence. No product, release metadata, external evidence, or release authority changed.

## Issues Encountered

- The official TUI runner emitted pre-existing `TerminalConsoleCache` EventTarget listener warnings in several isolated files. All tests passed, the warning was already tracked in the phase `deferred-items.md`, and Plan 127-09 made no listener/cache changes.
- The full Vitest suite conditionally skipped the zsh host fixture because `/usr/bin/zsh` is absent. Bash, fish, `ssh-agent`, and `ssh-add` were present. Hosted/configured-shell evidence remains explicitly unclaimed.

## Known Stubs

None. Plan 127-09 introduced no production code, mock data path, placeholder UI, TODO, or incomplete implementation.

## User Setup Required

None for this deterministic plan. Later hosted/authenticated/manual plans require separately authorized environments and human evidence.

## Next Phase Readiness

- Plan 127-10 may now add immediate manifest/lock RED assertions and move all package manifests, exact internal ranges, and the lockfile to `0.22.0-rc.1`.
- Plan 127-11 remains responsible for changelog/documentation and the first complete `npm test` plus validation-only `npm run release:check`.
- No deterministic stale-workspace, security, architecture, build, type, Node regression, or coverage blocker remains.
- Release actions remain unauthorized.

## Self-Check: PASSED

- Summary exists with `status: complete` and valid coverage metadata.
- Task receipts `eb927bae`, `38856d8d`, and `f8f3daa7` exist.
- STATE reports Plan 10 of 14 and 37/42 plans (88%).
- ROADMAP reports 9/14 plans executed with Plan 127-09 checked.
- STALE-03 is complete; REL-01 and REL-02 remain pending.
- Diff hygiene passed with only the four intended planning artifacts changed and no deletions.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
