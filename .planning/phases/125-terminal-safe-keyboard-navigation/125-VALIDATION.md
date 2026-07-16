---
phase: 125
slug: terminal-safe-keyboard-navigation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
---

# Phase 125 — Validation Strategy

> Adversarial validation contract for authoritative shortcut configuration, terminal-safe event routing, fuzzy overlays, focus containment, terminal traversal, and Next Attention.

The acceptance boundary is observable behavior. A green phase must prove that handled chords execute once from both document and xterm focus, every rejected/unmatched/AltGraph/composition/non-US event remains available to the PTY, bindings and aliases persist through authoritative global config, overlay keys never leak into xterm, and attention traversal never selects stale or archived state.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.10 for core/protocol/client/service/web modules; production web build for browser bundle integration |
| **Focused authority command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/service/web-shortcut-contract.test.ts tests/lib/web-shortcut-config.test.ts tests/service/web-shortcut-authority.test.ts` |
| **Focused semantics command** | `./node_modules/.bin/vitest run tests/lib/client-shortcuts.test.ts tests/lib/client-fuzzy.test.ts tests/lib/client-attention.test.ts` |
| **Focused web command** | `./node_modules/.bin/vitest run tests/service/web-keyboard-navigation.test.ts tests/service/web-keyboard-overlays.test.ts tests/service/web-presentation.test.ts` |
| **Build/type command** | `npm run web:build && npm run typecheck && npm run test:deps` |
| **Full gate** | `npm test && npm run coverage && npm run typecheck && npm run test:deps && npm run verify:gates` |
| **Watch mode** | Forbidden in automated verification |

## Sampling Rate

- After each schema/authority task: run the authority command and affected package typecheck.
- After each pure-client task: run its focused suite plus the complete semantics command before merging Wave 2.
- After each xterm/action task: run `web-keyboard-navigation.test.ts` and `web:build`; never accept typecheck alone.
- After each overlay/settings task: run the overlay and authority suites together so UI state cannot drift from authoritative mutation semantics.
- After every plan wave: run all Phase 125 focused commands and `test:deps`.
- Before phase verification: full test, coverage, type, dependency, build, and verify gates must pass. Live physical-keyboard/xterm/browser UAT remains the Phase 127 pre-tag human gate.

---

## Requirement-to-Test Map

| Requirement | Required observable behavior | Primary automated evidence | RED condition |
|---|---|---|---|
| **KEY-01** | One registry, durable rebind/alias/unbind/reset, conflict rejection, current help. | `web-shortcut-contract`, `web-shortcut-config`, `web-shortcut-authority`, `web-keyboard-overlays` | Duplicate action inventory, browser-local storage, stale/conflicting write mutation, or help differs from effective response. |
| **KEY-02** | Exact macOS/Linux K/P/N/T/W/J/L/A safe primaries. | `client-shortcuts`, `web-shortcut-contract` | Any modifier/action mismatch or default collision. |
| **KEY-03** | xterm preprocessing dispatches handled chord once; unmatched reaches PTY. | `web-keyboard-navigation` | Handler returns wrong boolean, callback runs twice, or unmatched event is stopped. |
| **KEY-04** | Physical code, AltGraph, composition, dead/process, and non-US safety. | `client-shortcuts`, `web-keyboard-navigation` | Produced glyph is matched instead of code or any guarded event dispatches. |
| **KEY-05** | No browser-hard/legacy default and no Keyboard Lock dependency. | `client-shortcuts`, `web-keyboard-navigation`, `tests/architecture/secure-browser-bundle.test.mjs` after `web:build` | Familiar/legacy chord dispatches under defaults, xterm consumes it, or bundle contains `navigator.keyboard.lock/unlock`. |
| **KEY-06** | Familiar aliases are optional and coexist with safe primary. | `web-shortcut-config`, `client-shortcuts`, `web-keyboard-navigation`, `web-keyboard-overlays` | Alias begins enabled, replaces primary, conflicts silently, or reset/unbind are conflated. |
| **KEY-07** | Active workspace/repository fuzzy ranking, top partial Enter, archived exclusion. | `client-fuzzy`, `web-keyboard-overlays` | Substring-only/exact-only behavior, recency outranks score, or archived row appears. |
| **KEY-08** | Commands use same fuzzy/top contract and remain selected-scope commands only. | `client-fuzzy`, `web-keyboard-overlays` | App actions enter commands or out-of-scope command runs. |
| **KEY-09** | Same overlay refocuses; replacement uses one backdrop/listener; repeat cannot stack. | `web-keyboard-navigation`, `web-keyboard-overlays` | Second layer/listener or repeated service/UI action occurs. |
| **KEY-10** | Overlay navigation/focus is contained and close restores correct terminal/fallback. | `web-keyboard-overlays`, `web-keyboard-navigation` | Arrow/Enter/Escape/Tab reaches PTY, focus escapes, or replacement loses original return target. |
| **ATTN-01** | Current actionable targets follow shared order, start after current, and wrap. | `client-attention`, `web-keyboard-navigation` | Different client ordering, no wrap, or current target repeats incorrectly. |
| **ATTN-02** | Archived/removed/inaccessible/dismissed/stale targets skip without mutation. | `client-attention`, `web-presentation`, `web-keyboard-navigation` | Stale surface degrades to repository, unrelated signal is dismissed, or archived target selects. |
| **ATTN-03** | Shortcut, visible control, help, and exact no-attention feedback share one callback. | `web-keyboard-overlays`, `web-keyboard-navigation` | Surface is missing, callback differs, or empty action changes focus/selection. |

---

## RED → GREEN Wave Order

| Validation Wave | RED first | GREEN implementation evidence | Exit gate |
|---:|---|---|---|
| **0 — Contract sentinels** | Add strict protocol tests for eight IDs, physical bindings, primary+aliases, and four distinct mutation intents. | None. | Failures reflect missing schema behavior, not import/setup errors. |
| **1 — Canonical contract** | Unknown/hybrid/oversized transport shapes fail. | Plan 01 schemas/types make contract tests green. | Protocol typecheck and contract suite pass. |
| **2A — Authority** | Persistence, conflict, alias, reset/unbind, stale revision, scope, and disclosure cases fail. | Plan 02 core/service authority passes without core→protocol edge. | Authority suites plus dependency gate pass. |
| **2B — Shared semantics** | Key safety, fuzzy tiers, and attention skip/order cases fail. | Plan 03 pure helpers pass using protocol types in client only. | Semantics suites pass; Plan 02/03 file sets remain disjoint. |
| **3 — Dispatch and direct actions** | Double-bubble, PTY leakage, repeat, terminal wrap, and attention application cases fail. | Plan 04 one-owner dispatcher and canonical callbacks pass. | Navigation suite, post-merge inventory agreement, web build, types, deps pass. |
| **4 — Overlay/settings UI** | Singleton/focus/fuzzy/help/alias/conflict/loading/error/responsive states fail. | Plan 05 DOM/CSS behavior passes. | All focused suites and UI-SPEC state coverage pass. |
| **5 — Full closure** | Run full/coverage/architecture gates to expose drift. | Repair within phase scope. | Full local gates green; human browser/physical-key evidence remains Phase 127. |

### Wave 0 Required Files

- [ ] `tests/service/web-shortcut-contract.test.ts` — strict inventory, physical binding, primary/aliases, mutation union, hostile extra fields.
- [ ] `tests/lib/web-shortcut-config.test.ts` — defaults, aliases, reset/unbind, conflict, concurrency, atomic preservation.
- [ ] `tests/service/web-shortcut-authority.test.ts` — scopes, mapping, capability absence, stable errors, non-disclosure.
- [ ] `tests/lib/client-shortcuts.test.ts` — exact code/modifiers, non-US key, AltGraph, IME/dead/process, keyup/repeat, labels/conflicts.
- [ ] `tests/lib/client-fuzzy.test.ts` — score tiers, field weights, top partial, recency/stable tie, zero/one/many navigation.
- [ ] `tests/lib/client-attention.test.ts` — resolvability, dedupe, ordering, offset/wrap, stale/archived/dismissed skip, no mutation.
- [ ] `tests/service/web-keyboard-navigation.test.ts` — document/xterm single ownership, pass-through, registry availability, terminal/attention callbacks.
- [ ] `tests/service/web-keyboard-overlays.test.ts` — singleton DOM, focus containment/restore, fuzzy overlays, help/settings/capture/aliases, responsive states.
- [ ] Extend `tests/architecture/secure-browser-bundle.test.mjs` — reject Keyboard Lock in the packaged bundle and prove the scanner catches a hostile synthetic fixture.

No new test framework or browser-state dependency is required.

---

## Keyboard and Event Matrix

| Case | App dispatch | xterm processing | Required assertion |
|---|---:|---:|---|
| Exact registered `keydown` from document | once | n/a | prevent default + stop propagation once |
| Exact registered `keydown` from xterm | once | no | preprocessor returns false; bubbling document boundary cannot run again |
| Unmatched xterm key | never | yes | returns true; no marker/prevent/stop |
| Non-US `key` with matching physical `code` | once | no when chord exact | matcher uses code, not produced glyph |
| AltGraph active | never | yes | rejected before registry lookup |
| `isComposing`, `Process`, or `Dead` | never | yes | no consumption or mutation |
| Keyup | never | yes/default | keydown is sole dispatch phase |
| Repeat on create/close/previous/next/attention | callback/service/toast unchanged after initial | no | event remains app-owned: xterm returns false and prevent/stop/consumed marking occurs once |
| Repeat on current overlay shortcut | refocus only | no | returns false; one backdrop/listener; no close/reopen |
| Active overlay navigation/capture | overlay only | no | contained handler consumes once |

## Anti-False-Positive Gates

| Gate | Guardrail | Required proof |
|---|---|---|
| **AF-125-01 No browser durability** | Prevent in-memory/localStorage success from masquerading as authority. | Restart/read fixture derives state from global config through service; static scan rejects storage APIs. |
| **AF-125-02 Reset vs unbind** | Prevent both controls mapping to null. | Reset restores safe primary/removes aliases; unbind returns primary null/aliases empty after round trip. |
| **AF-125-03 Alias coexistence** | Prevent familiar alias replacing safe primary. | Effective response and help contain both; conflicts scan all primaries/aliases. |
| **AF-125-04 Atomic conflict** | Prevent UI-only conflict checks. | Direct hostile service/core mutation fails and config bytes/revision remain unchanged. |
| **AF-125-05 Core leaf** | Prevent convenient forbidden type import. | `test:deps` plus import scan; mapping lives in service. |
| **AF-125-06 Forbidden defaults/Keyboard Lock** | Prevent legacy/familiar chords or fullscreen capture from returning. | Default fixtures send Ctrl+K, Ctrl+Shift+P, Ctrl/Cmd+Shift+T, and Ctrl+PageUp/Down through xterm/document with zero callback and true pass-through; hostile bundle fixture proves lock/unlock scanner fails. |
| **AF-125-07 Physical-key safety** | Prevent US-layout happy path. | Fixture uses mismatched `event.key` and `code`, plus AltGraph/composition/dead cases. |
| **AF-125-08 One event owner/repeat** | Prevent xterm false or callback suppression from hiding bubble/leakage. | Same event object traverses both adapters exactly once; repeat fixtures stay consumed with callback count unchanged. |
| **AF-125-09 Real fuzzy ranking** | Prevent substring filter branded as fuzzy. | Non-contiguous and word-boundary cases rank; recency changes only equal-score order. |
| **AF-125-10 Archived exclusion** | Prevent client filter relying on normal fixtures. | Candidate fixture explicitly contains archived/removed decoys. |
| **AF-125-11 Stale attention** | Prevent stale surface degrading to repository. | Named missing/ended surface is absent from candidates; repository-only signal remains valid. |
| **AF-125-12 Focus restoration** | Prevent `document.activeElement` smoke from missing replacement. | Original terminal target survives A→B overlay replacement and missing-target fallback is deterministic. |
| **AF-125-13 Source-string insufficiency** | Prevent grep checks from claiming behavior. | Matchers, dispatchers, ranking, attention, and overlay controller are imported/executed in tests. |

---

## Manual / Hosted Handoff

Phase 125 automated verification stops short of claiming a human browser pass. Phase 127 must exercise the built web client against the live service on supported hosts and confirm:

- macOS `Ctrl+Command` and Linux `Ctrl+Alt+Shift` physical chords while xterm owns focus;
- ordinary shell editing plus an interactive TUI, AltGraph, IME/composition, and a non-US layout remain usable;
- workspace/command fuzzy overlays select the visible top partial row and restore exact terminal focus;
- alias/rebind/unbind/reset survive browser restart from authoritative config;
- visible Next Attention/help controls and narrow responsive states match the approved UI-SPEC;
- screenshot comparison and assistive keyboard traversal expose no accepted visual/focus regression.

These are pre-tag blockers in Phase 127, not reasons to leave automatable Phase 125 behavior untested.

---

## Validation Sign-Off

- [ ] Every KEY-01..10 and ATTN-01..03 row has a failing behavioral test before implementation.
- [ ] RED failures are behavioral, not missing-import or harness errors.
- [ ] Protocol, core, and client inventories agree without a core→protocol dependency.
- [ ] Primary, alias, reset, unbind, conflict, stale revision, and persistence behavior is green.
- [ ] xterm/document single ownership and all pass-through matrix rows are green.
- [ ] Fuzzy top-partial, singleton/focus, terminal wrap, and attention skip/order behavior is green.
- [ ] UI Considerations empty/loading/error/populated/partial/overflow/zero-one-many/long-text states have executable evidence.
- [ ] Focused, build, type, dependency, full, coverage, and verify gates are green.
- [ ] Phase 127 handoff retains physical-keyboard/live-xterm/screenshot verification before tagging.

**Approval:** validation strategy is plan-ready; behavioral evidence remains pending implementation.
