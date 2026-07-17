---
phase: 127
slug: stale-workspace-intelligence-and-rc-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 127 — Validation Strategy

> Adversarial validation contract for explainable stale-workspace evidence, revision/cache safety, canonical lifecycle reuse, cross-client parity, and release-candidate closure without release side effects.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 for Node unit/integration/browser-support; native `node:test` for architecture/conformance/runtime; Bun 1.3.14 isolated OpenTUI tests |
| **Config file** | `vitest.config.ts`; TUI isolation through `scripts/test-tui.mjs` |
| **Quick run command** | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts` |
| **TUI command** | `npm run test:tui` — never run one combined Bun suite directly |
| **Full suite command** | `npm test && npm run coverage && npm run typecheck && npm run test:architecture && npm run test:deps && npm run web:build && npm run tui:build` |
| **RC validation** | `npm run release:check` without `--tag` |
| **Estimated quick runtime** | ~120 seconds after focused files exist |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest or `node --test` file plus the affected package typecheck; TUI tasks run `npm run test:tui`.
- **After every plan wave:** Run all landed Phase 127 focused suites plus `npm run build:packages`, `npm run typecheck`, `npm run test:architecture`, and `npm run test:deps`.
- **After service/router work:** Run revision-before-probe, cache-generation, sanitization, and no-mutation cases together.
- **After either UI surface:** Run the matching DOM/render/key suite, package build, and cross-client conformance fixture.
- **Before canonical verification:** Full local suite and `npm run release:check` without `--tag` must be green on the candidate commit.
- **Max focused feedback latency:** 180 seconds; split focused commands rather than using watch mode.

---

## Per-Task Verification Map

The IDs below are the required validation slices. The planner may refine task boundaries but must preserve every row and automated command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 127-01-01 | 01 | 1 | STALE-01, STALE-05 | T-127-01, T-127-02 | Strict bounded schemas and provider probes map failures to fixed unknown codes with no raw output | unit | `npx vitest run tests/lib/core/forge-change-status.test.ts` | ❌ W0 | ⬜ pending |
| 127-02-01 | 02 | 2 | STALE-01, STALE-02, STALE-03, STALE-05 | T-127-03, T-127-04, T-127-05 | Revision is checked before probes; local evidence is recomputed; network cache is race-safe and read-only | unit/integration | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` | ❌ W0 | ⬜ pending |
| 127-03-01 | 03 | 3 | STALE-02, STALE-04 | T-127-06 | Shared adapters preserve service order, generation checks, safe labels, and canonical action authority | unit/conformance | `npx vitest run tests/service/phase127-cross-client-conformance.test.ts tests/lib/service/workspace-action-authority.test.ts` | ❌ W0 / ✅ existing authority | ⬜ pending |
| 127-04-01 | 04 | 4 | STALE-02, STALE-04, STALE-05 | T-127-02, T-127-03 | Browser overlay is path-free, focus-safe, revision-safe, and never reconstructs mutation authority | browser-support/service | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts` | ❌ W0 | ⬜ pending |
| 127-05-01 | 05 | 4 | STALE-02, STALE-04, STALE-05 | T-127-03, T-127-06 | Dedicated TUI view owns keys, rejects late responses, and reuses canonical lifecycle descriptors | OpenTUI render/key | `npm run test:tui` | ❌ W0 focused file | ⬜ pending |
| 127-06-01 | 06 | 5 | STALE-03, STALE-04, STALE-05 | T-127-02, T-127-06, T-127-07 | Architecture rejects client probes/mutations/disclosures and proves identical cross-client policy | architecture/conformance | `node --test tests/architecture/phase127-stale-authority.test.mjs && npx vitest run tests/service/phase127-cross-client-conformance.test.ts` | ❌ W0 | ⬜ pending |
| 127-07-01 | 07 | 6 | REL-01, REL-02 | T-127-08 | RC metadata is lockstep and validation performs no tag, push, publish, or release action | script/package | `node --test tests/architecture/release-publish.test.mjs tests/commands/release-rc.test.ts && npm run check:packages` | ✅ update required | ⬜ pending |
| 127-08-01 | 08 | 7 | REL-01, REL-02 | T-127-08 | Candidate evidence is indexed by exact SHA and missing hosted/manual evidence remains explicit | local gate + receipt audit | `npm run release:check` | ✅ command / ❌ receipt index | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Required Deterministic Matrix

| Domain | RED assertions required before implementation is accepted |
|--------|----------------------------------------------------------|
| Protocol | Extra-key rejection; finite reason/unknown/caution enums; array bounds; revision/timestamp parsing; no path/raw-error fields |
| Forge status | GitHub/GitLab merged, closed, open; Gitea unsupported; invalid provenance; missing tool; auth; rate limit; timeout; abort; malformed/oversized JSON; safe argv and sanitization |
| Branch/worktree/activity | Present/missing/error distinction; repository-scoped reasons; managed missing only; inaccessible remains unknown; `last_opened` precedence; strict 30-day cutoff boundary |
| Classification/ranking | One confirmed reason qualifies; reason+unknown remains candidate; unknown-only is incomplete; no evidence omits; cautions do not qualify; lexicographic ordering is stable |
| Cache/revision | Five-minute fresh/expired behavior; force bypass; ordinary singleflight; cached unknown; newest generation wins; new service clears cache; revision mismatch causes zero probes and one client retry |
| Lifecycle | Open success/failure; Archive/Remove descriptors unchanged; Force Remove absent initially and gated by fresh typed dirty blocker; terminal result reconciles without replay |
| Web | Singleton/refocus; loading/populated/incomplete/empty/errors; retained refresh data; focus restoration; native action callbacks; 320/375 overflow contract; disclosure canaries |
| TUI | Dedicated `UIView`; wide/stacked/narrow/too-small layouts; navigation; repeated refresh ignored; late response rejected; incomplete action denial; Escape origin restore; no key leakage |
| Architecture | Web/TUI cannot import core probes or execute provider/Git commands; evaluator has no mutation path; browser schema excludes secrets, paths, argv, stdout, stderr, and raw environment |
| Release | Eight manifests and internal ranges in lockstep; changelog/docs match RC; package dry-runs pass; default graph excludes TUI; release check does not tag by default |

---

## Wave 0 Requirements

- [ ] `tests/lib/core/forge-change-status.test.ts` — provider status unions, argv, timeout/abort, parse bounds, and sanitization for STALE-01/05.
- [ ] `tests/lib/service/stale-workspaces.test.ts` — qualification, timestamps, unknown separation, ranking, TTL, singleflight, force refresh, cache races, revisions, and no mutation for STALE-01/02/03/05.
- [ ] `tests/service/web-stale-workspaces.test.ts` — secure route, browser projection, overlay state, focus, action inventory, responsive contract, and disclosure canaries for STALE-02/04/05.
- [ ] `tests/service/phase127-cross-client-conformance.test.ts` — identical order, labels, reasons, timestamps, actions, and reconciliation for STALE-02/04.
- [ ] `tests/tui/dashboard/StaleWorkspaces.test.tsx` — dedicated view layouts, navigation, generation safety, Open/actions, and input isolation for STALE-02/04/05.
- [ ] `tests/architecture/phase127-stale-authority.test.mjs` — reject client-owned provider/Git/mutation policy and browser disclosure for STALE-03/05.
- [ ] Update `tests/commands/release-rc.test.ts` and release architecture expectations for `0.22.0-rc.1` and no default release side effect.
- [ ] Add safe fixture factories for core state, injected provider outcomes, clock advancement, cache generations, and bounded stale response rows.

Existing frameworks cover all phase requirements; Wave 0 adds focused files and fixtures only.

---

## Threat References

| Threat | Risk | Required proof |
|--------|------|----------------|
| T-127-01 | Provider command injection | Validated provenance and argv-only execution; encoded GitLab project path; no shell invocation |
| T-127-02 | Credential/path/raw-output disclosure | Fixed safe error enums, allowlist projection, and browser/TUI canary scans |
| T-127-03 | Stale revision or late response accepted | Revision-before-probe plus one reload/retry and monotonic service/client generations |
| T-127-04 | Probe exhaustion or cache race | Bounded concurrency, time/output limits, abort, TTL, singleflight, duplicate-refresh suppression, newest-write wins |
| T-127-05 | False stale verdict from unknown evidence | Closed three-state unions; at least one confirmed reason required; unknown-only rows separated |
| T-127-06 | Stale evidence becomes lifecycle authority | Evaluator has no mutation capability; current canonical descriptors and typed Force Remove sequence remain mandatory |
| T-127-07 | Cross-repository evidence confusion | Repository identity remains attached to branch/worktree evidence and cache keys; no workspace-wide safety claim |
| T-127-08 | Validation triggers release side effects | No `--tag`, `git tag`, push, publish, `gh release create`, or release-only workflow dispatch in plans or commands |

---

## Manual-Only and Hosted Verifications

| Behavior | Requirement | Why Manual/Hosted | Test Instructions |
|----------|-------------|-------------------|-------------------|
| Exact-SHA supported-host matrix | REL-01 | Local Node 26 cannot prove the Node 24 Linux/macOS x64/ARM and shell matrix | Dispatch only `.github/workflows/node-runtime-matrix.yml` for the exact candidate SHA; record run URL, SHA, required job conclusions, safe artifact names, and checksums |
| Authenticated GitHub.com/GitLab.com status | STALE-01, STALE-05, REL-01 | Fixtures cannot prove real auth, rate limiting, fork/same-repo behavior, or provider recovery | Exercise merged/closed/open and safe failure recovery on authorized disposable changes; install/authenticate `glab` or use another authorized environment; record sanitized receipts only |
| Live reconnect/cancellation and two-client convergence | STALE-02, STALE-04 | Mocked transports do not prove real operation/session behavior | Disconnect/reconnect by durable operation ID, cancel once/too late, force refresh failure, and simultaneous web/TUI mutation; verify no replay and authoritative convergence |
| Physical browser/xterm input | STALE-02, STALE-04 | Synthetic DOM keys do not prove physical key, AltGraph, IME, non-US, pointer, or terminal focus behavior | Exercise stale-entry shortcut with xterm focused, contained refresh key, Tab/Shift+Tab, Escape, repeated/held keys, pointer actions, and exact focus restoration |
| Responsive light/dark screenshots | STALE-02, STALE-05 | Source/CSS assertions cannot prove visual overflow or contrast | Capture desktop, 375px, and 320px states for loading, populated, reason+unknown/caution, incomplete-only, empty, retained-data failure, first-load failure, and Remove return |
| Interactive OpenTUI | STALE-02, STALE-04, STALE-05 | Render buffers cannot prove terminal input/focus across real dimensions | Exercise wide, stacked, single-column, short-height, too-small, refresh, Open, lifecycle, incomplete-only rejection, and Escape restoration |
| Human cross-client parity | STALE-01, STALE-02, STALE-04, REL-01 | Final wording, order, timestamps, and interaction parity require side-by-side approval | Use the same fixture in web and TUI; compare order, every reason/timestamp, unknown/caution split, counts, disabled reasons, Open, confirmations, and reconciliation |
| Release authorization | REL-02 | Publishing and tagging are outward-facing, irreversible operations | Stop after RC preparation and evidence. Obtain separate explicit approval before considering tag, push, publish, GitHub Release, or release-only workflow actions |

Self-hosted provider hosts are not part of the release claim unless the operator supplies an explicit supported-host list. Missing `glab`, unavailable hosted runners, missing screenshots, or absent human approval must remain recorded as missing evidence rather than converted into a pass.

---

## Validation Sign-Off

- [ ] Every STALE-01..05 and REL-01..02 requirement has automated or explicit hosted/manual evidence.
- [ ] No three consecutive implementation tasks lack an automated verification command.
- [ ] Wave 0 creates every missing focused test and fixture before dependent implementation seals.
- [ ] Revision mismatch proves zero probe calls; cache and client generations prove newest-result wins.
- [ ] Unknown evidence cannot qualify a candidate and raw provider/path/credential data cannot cross projections.
- [ ] Archive/Remove/Force Remove remain canonical and no evaluation/refresh path mutates state.
- [ ] Web and TUI consume identical service order, labels, reasons, timestamps, and action authority.
- [ ] `npm run release:check` is run without `--tag`; no release side effect appears in Phase 127 plans or execution.
- [ ] Hosted, authenticated, physical, screenshot, interactive, and human evidence is recorded honestly against the exact candidate SHA.
- [ ] `nyquist_compliant: true` is set only after all executable validation rows are green or explicitly routed to human verification.

**Approval:** pending
