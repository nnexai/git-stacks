# Phase 126 → Phase 127 Verification Handoff

**Phase 126 validated commit:** `8b3840bb6825dd82f96408028365737682d0ff54`

**Boundary:** Phase 126 provides deterministic local contract, service, browser-DOM, OpenTUI render/key, architecture, build, and coverage evidence. It does **not** provide authenticated-host, live-service, physical-device, screenshot, hosted-CI, or human approval. Phase 127 owns those checks before any tag, push, publish, release, or release-candidate approval claim.

## Deterministic local evidence

All commands below completed successfully on 2026-07-17 from the repository root at the validated commit.

| Command | Result |
|---|---|
| `node --test tests/architecture/phase126-client-authority.test.mjs tests/architecture/package-boundaries.test.mjs tests/architecture/secure-browser-bundle.test.mjs && npm run test:deps` | 34 Node tests passed; package cycle/dependency gate passed. Repeated after the final web production build. |
| `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/service/phase126-cross-client-conformance.test.ts tests/service/web-workspace-actions.test.ts tests/service/web-forge-review.test.ts tests/tui/dashboard/WorkspaceParity.test.tsx tests/tui/dashboard/ForgeSourceReview.test.tsx` | The Vitest Node project collected 3 files and passed 24 tests. OpenTUI files are intentionally isolated from Vitest and were exercised by `npm run test:tui` inside `npm test`. |
| `npm test` | Package builds passed; Vitest: 160 files passed, 2,097 passed and 1 skipped of 2,098 tests; native Node: 72 passed; isolated OpenTUI: 37 files and 219 tests passed. |
| `npm run coverage` | 160 files passed; 2,097 passed and 1 skipped. V8 totals: 54.63% statements, 49.67% branches, 52.68% functions, 57.93% lines. |
| `npm run typecheck` | All seven workspaces passed: protocol, client, core, CLI, service, web, and TUI. |
| `npm run test:deps` | Passed: package architecture and cycle graph are valid. |
| `npm run test:architecture` | Passed: package/import boundaries are valid. |
| `npm run web:build` | Production browser bundle built successfully. |
| `npm run tui:build` | Production OpenTUI package built successfully with Bun 1.3.14. |
| `npm run verify:gates` | Passed: inventory, mapped tests, and coverage artifacts are aligned. |
| `git diff --check` | Passed before the validated implementation commit. |

The OpenTUI runner emitted existing non-failing `TerminalConsoleCache` EventTarget listener warnings in several files. No TUI test failed.

## What the automated evidence proves

- Web and TUI action presentation consumes the same canonical labels, descriptors, availability, disabled reasons, confirmation policy, and execution callback inventory.
- Service-owned unavailability cannot be weakened locally, and a synchronous latch prevents duplicate confirmation or transport.
- Missing, malformed, empty, and wrong-subject action inventories fail closed.
- Durable operations submit once, retain the returned operation ID, reconnect by ID without replay, expose cancellation only from authoritative state, and stay locked after terminal refresh failure until a successful authoritative retry.
- Notes remain revision-bound, bounded, authoritative, and newest-first; file status covers the shared semantic states while rejecting paths and raw errors.
- Forge Resolve, Review, and explicit Create remain distinct; Enter at Resolve cannot create; provider terminology remains GitHub pull/head/base and GitLab merge/source/target.
- Hostile architecture fixtures reject browser/TUI core or service authority, non-allowlisted TUI core imports, runtime authority outside explicit handoffs, provider commands, synthetic/fetched provider refs, and forbidden browser projection fields.
- Existing executable browser and TUI suites remain cross-referenced for empty, loading, error, populated, partial, overflow, zero/one/many, long-text, and constrained-size states.

## Not yet verified

The following remain explicitly unverified until Phase 127 performs them. Local mocks, source assertions, test DOMs, OpenTUI render buffers, and production builds are not substitutes.

### 1. Hosted supported-runtime receipts

- Run the `Build and test` workflow for the exact Phase 127 candidate commit and retain the workflow URL and commit SHA.
- Require green Node 24 cells on Ubuntu 24.04 x64/ARM and macOS 15 Intel/Apple Silicon.
- Require green package/policy and optional Bun TUI cells.
- Record any unavailable hosted runner as missing evidence, not a pass.
- Do **not** trigger `.github/workflows/release-artifacts.yml` as a pre-tag check: it is tag-triggered. A tag requires separate explicit authorization after all manual checks.

### 2. Authenticated GitHub and GitLab receipts

Exercise full URLs through Resolve → Review → Create against disposable repositories/workspaces and retain safe receipts without credentials, provider output, local paths, or environment values.

- GitHub.com pull request: same-repository branch and fork branch.
- GitLab.com merge request: same-project branch and fork branch.
- Every supported configured self-hosted GitHub/GitLab host required for the release claim.
- Confirm immutable host/repository/change/head/base/source identity and editable workspace name/template/repository/branch plan.
- Confirm creation uses the reviewed real head SHA and normal Git/worktree machinery; no provider checkout command appears.
- Confirm successful resolution says `Source resolved`, not `Workspace created`, and requires an explicit Create action.

Exercise and record safe recovery for:

- provider CLI unavailable and authentication required;
- unsupported or unconfigured host;
- malformed, inaccessible, closed, or missing change;
- rate limiting and provider unavailability;
- no repository match and ambiguous repository match;
- template repository mismatch or non-worktree mode;
- unreachable fork/source repository;
- source/head movement, stale catalog revision, and expired review token;
- branch conflict, cancellation, request timeout, creation failure, and rollback cleanup.

Every rejected flow must leave no unintended workspace YAML, worktree, private ref, browser-local draft, or replayable create intent.

### 3. Live service operation, reconnect, and cancellation

Using disposable workspaces in both clients:

- Start each canonical action from pointer/menu/key where available and compare label, disabled reason, confirmation, progress, terminal result, and authoritative selection refresh.
- Disconnect while an accepted/running operation is visible; reconnect and verify observation resumes by the same operation ID without resubmission.
- Cancel while service state reports available; verify one request and an honest final outcome.
- Attempt cancellation after commit/finish; verify the too-late/non-cancellable result without a rollback claim.
- Interrupt authoritative refresh after a terminal outcome; verify both clients remain locked until Retry refresh succeeds.
- Verify simultaneous clients observe the same operation/revision changes without stale confirmation replay.

### 4. Physical browser input, xterm, pointer, and focus

Against the live production browser bundle:

- Exercise direct controls and context menus with a pointer.
- Exercise ArrowUp/ArrowDown, Home/End, Enter/Space, Escape, optional configured shortcuts, repeated keys, and held-key behavior with a physical keyboard.
- With xterm focused, verify matched app shortcuts invoke once and every unmatched, AltGraph, IME/composition, and non-US-layout event reaches the PTY unchanged.
- Open and close actions, confirmations, notes, files, operations, and forge review from workspace rows, duplicate-label placements, and terminals.
- Verify singleton replacement, in-place Retry, and close/cancel/success restore the exact valid invoker or nested terminal input rather than document body.
- Verify safe cancel receives initial focus for destructive confirmations and the first unresolved field receives focus in forms.

### 5. Browser screenshots and responsive review

Capture and review the production browser at desktop, 375px, and 320px in both light and dark themes for:

- canonical action groups and written disabled reasons;
- Remove, exact-name Force Remove, Merge, and Clear notes confirmations;
- running/reconnecting/failed/cancelled operations and overflow dialog;
- notes empty/one/many/loading/error/add/clear states;
- file empty/loading/error/healthy/attention and long logical targets;
- forge Resolve and Review with long repository/branch identities, validation, sticky footer, and failure recovery.

Confirm no horizontal page/modal scroll at 320px, no clipped primary/destructive action, no hover-only required action, visible focus, readable contrast, stable light/dark semantics, and no path/credential/raw-error disclosure.

### 6. Interactive OpenTUI review

Run the production TUI interactively at wide desktop dimensions, below 80 columns, below 56 columns, short heights, and the documented too-small boundary.

- Verify grouped actions, inline disabled reasons, first available selection, action letters, Enter, Escape, and no input leakage.
- Verify Pull, Pin/Unpin, Notes, File status, Cancel, and adapted existing actions.
- Verify operation heading/stage/repository rows, cancel-once, reconnect, refresh-failed lock, omitted-row count, and retained terminal result.
- Verify notes zero/one/many, long wrapped text, add validation, confirmed clear, and failure retention.
- Verify file groups/states/counts/severity/reasons, loading/error Retry, scrolling, and no host path canary.
- Verify forge Resolve and Review field order, picker return focus, long safe identities, narrow stacking/truncation, explicit `c` Create, and no blind Create in too-small terminals.

### 7. Cross-client human parity pass

For the same authoritative fixtures, compare web and TUI side by side:

- action IDs and user-facing labels;
- disabled reason text and visibility;
- destructive safe defaults and exact-name eligibility;
- confirmation consequences and CTA copy;
- operation stages, cancellation availability/outcomes, failures, refresh, and final results;
- notes order/count/mutation results;
- file state/count/severity/reason projection;
- GitHub/GitLab terminology and Resolve/Review/Create transitions;
- authoritative selection, counts, signals, and terminal state after completion.

Any difference must be resolved or explicitly accepted before release approval.

## Release stop

Stop after recording the Phase 127 hosted and human evidence. Do not tag, push, publish packages, create a release, trigger the tag-only release-artifacts workflow, or claim `v0.22.0-rc.1` approval without explicit user authorization after the checklist above is complete.
