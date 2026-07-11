---
phase: 105-shared-native-model-and-terminal-foundation
verified: 2026-07-11T19:08:18Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 105: Shared Native Model and Terminal Foundation Verification Report

**Phase Goal:** Native shells share deterministic product state while Linux users can operate one correct, exclusively owned embedded terminal surface.
**Verified:** 2026-07-11
**Status:** passed
**Re-verification:** No — initial independent goal-backward verification after the full-Ghostty replan

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Linux and future macOS shells consume the same deterministic model through a portable opaque ABI. | ✓ VERIFIED | `bun run native:verify` compiled the C11 harness, checked header portability with Clang, and passed the fixture-driven Zig ABI/model tests. `native/core/abi.zig` keeps platform and Ghostty types behind `native/include/git_stacks_native_v1.h`; actual macOS runtime execution remains correctly assigned to Phase 107. |
| 2 | Restored session metadata preserves presentation identity without representing terminated processes as live. | ✓ VERIFIED | The independent native gate passed persistence, quarantine, ended-on-restore, distinct relaunch identity, and reducer tests. The restored contract remains product-owned and separate from Ghostty's runtime PTY. |
| 3 | A Linux user can operate a full embedded Ghostty terminal with production input, rendering, configuration, and TUI behavior. | ✓ VERIFIED | The exact `GtkGLArea` production graph passed real Wayland GTK, terminal, and multisurface smokes. The user approved font/config/cursor fidelity, cooked and raw keys, Unicode/IME, selection/clipboards, mouse, resize, alternate-screen/full-screen TUIs, Fish queries, and color parity after direct testing. |
| 4 | Terminal exit, close, quit, crash, and repeated surface lifecycle leave no owned process or surface resources behind. | ✓ VERIFIED | Ordinary production stress ran 25 alternating one/two-surface cycles and reported `exact_zero=true`, RSS slope `-57494.905`, FD range `1`, and thread range `1`. Lifecycle/guard suites passed normal exit, bounded close, app quit, crash guard, birth-token admission, absence, and failed-cleanup truth. The 250-cycle lane was not repeated per explicit user instruction; its prior completed evidence remains recorded. |
| 5 | The Ghostty/Zig integration is exact, reproducible, upgrade-audited, and exposes an honest accessibility contract. | ✓ VERIFIED | Pin/patch/tree/ABI/build audits passed for Ghostty `81ab8ffa90185221782baf785e85387321e16f8d` and Zig `0.15.2`; the production graph audit confirms Ghostty is the sole renderer/configuration/PTY owner. Accessibility tests verify the actual generic focusable GL leaf and documentation explicitly declines unsupported cell text/caret/selection and screen-reader claims. |

**Score:** 5/5 consolidated roadmap truths verified. All non-superseded plan-level truths were traced through the artifacts and gates below; the old Plan 105-01 Ghostty v1.3.1 feasibility pin is superseded by D-17 through D-23 and Plan 105-05's full-surface pin.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `native/include/git_stacks_native_v1.h`, `native/core/{abi,model,reducer,persistence}.zig` | Versioned native contract, deterministic state, and truthful restore | ✓ VERIFIED | Substantive, C-portable, wired into the native model/harness graph, and exercised by `native:verify`. |
| `native/deps/ghostty.lock`, `native/deps/ghostty-linux-process-control.patch` | Exact fork/toolchain/source/patch/ABI provenance | ✓ VERIFIED | Lock is read by `scripts/verify-native.ts`; pristine and derived trees, patch hash, symbols, and drift metadata are checked before build. |
| `native/linux/ghostty_runtime.zig` | One finalized Ghostty app/config runtime | ✓ VERIFIED | Calls default, recursive, CLI, and finalize config APIs before `ghostty_app_new`; no product font/theme parser feeds production. |
| `native/linux/ghostty_surface.zig` | Reusable `GtkGLArea` full Ghostty leaf | ✓ VERIFIED | Creates/draws/sizes/focuses/realizes/unrealizes a `ghostty_surface_t`, registers process identity before publication, and tears down with generation-safe callbacks. |
| `native/linux/ghostty_input.zig`, `native/linux/ghostty_clipboard.zig` | Complete surface-local input, IME, mouse, and clipboard forwarding | ✓ VERIFIED | Physical-key-preserving IM arbitration, preedit position, pointer/scroll/button forwarding, and generation-validated system/primary clipboard callbacks are wired to each live surface. |
| `native/tests/lifecycle_stress.zig`, `scripts/verify-native.ts` | Production lifecycle and composed verification | ✓ VERIFIED | The orchestrator launches the exact application graph and rejects nonzero resource counts or synthetic diagnostics. |
| `docs/native-terminal-acceptance.md`, `docs/native-terminal-accessibility.md` | Human acceptance and honest supported/unsupported semantics | ✓ VERIFIED | Exact artifact/pin identity and final user approval are recorded; unsupported AT text semantics are not presented as passing. |

All nine PLAN artifact checks returned `all_passed: true`.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Phase 104 fixture contract | native reducer/ABI | exported golden fixtures and C/Zig harness | ✓ WIRED | `verifyFixtureExport`, header portability, model tests, and ABI harness are composed by `verifyModel`. |
| `native/deps/ghostty.lock` | derived `libghostty.so` | verified checkout, hashed patch/tree, `app-runtime=none` build | ✓ WIRED | `scripts/verify-native.ts` reads `LOCK_PATH`, validates base/derived identity, builds the library, and verifies expected ABI. |
| GTK application | Ghostty terminal leaf | shared runtime plus one `GtkGLArea`/`ghostty_surface_t` per pane | ✓ WIRED | Production graph and graphical smoke passed; no standalone Ghostty window or product renderer is composed. |
| GTK controllers/IME/clipboards | correct Ghostty surface | surface-local context and generation validation | ✓ WIRED | Interaction suite and final human raw/cooked input remediation prove the link beyond symbol presence. |
| Ghostty child identity | guard/reducer lifecycle truth | PID/PGID/birth token registration-before-live and cleanup outcomes | ✓ WIRED | Lifecycle, process-control, graphical, stress, and multisurface gates passed. |
| Human matrices | exact production artifact | commit, pin, patch, artifact hash, environment, and final approval | ✓ WIRED | Final artifact evidence records the accepted runtime and remediation history. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Complete native contract and production terminal | `bun run native:verify` | Exit 0; ABI/model/restore/lifecycle/surface/input/accessibility and graphical smokes passed | ✓ PASS |
| Ordinary production teardown | composed 25-cycle stress inside `native:verify` | `exact_zero=true`; bounded RSS/FD/thread trends | ✓ PASS |
| Full repository regression suite | `bun run test` | Unit tests and 85/85 integration files passed | ✓ PASS |
| Type and dependency integrity | `bun run typecheck && bun run test:deps` | Exit 0; no circular dependencies | ✓ PASS |
| Release verification inventory | `bun run verify:gates` | Inventory, mapped tests, and coverage artifacts aligned | ✓ PASS |

The opt-in `GIT_STACKS_NATIVE_EXTENDED_STRESS=1` 250-cycle lane was intentionally not rerun. The user explicitly requested that it run only when absolutely necessary and that the existing completed run not be repeated.

### Probe Execution

No Phase 105 plan declares a standalone `probe-*.sh`; all required executable probes are composed native commands above.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| CORE-01 | ✓ SATISFIED | Stable typed identities in the shared native contract and fixture parity. |
| CORE-02 | ✓ SATISFIED | Reducer/model gate covers connection, loading, failure, operation, tab, attention, and terminal lifecycle effects without GTK types. |
| CORE-03 | ✓ SATISFIED | Versioned opaque C ABI and portable harness passed. |
| CORE-04 | ✓ SATISFIED | Cross-language exported golden fixtures and ABI harness passed. |
| CORE-05 | ✓ SATISFIED | Restore tests force ended state; relaunch uses a new identity and real child exit feeds lifecycle truth. |
| TERM-01 | ✓ SATISFIED | Automated production interaction/terminal smokes plus final user approval cover keyboard, raw keys, mouse, Unicode/IME, resize/reflow, alternate screen, clipboard, and full-screen TUIs. |
| TERM-02 | ✓ SATISFIED | Ghostty exclusively owns terminal PTYs; the bounded process-control extension and guard enforce registration, close, exit, quit, crash, and absence semantics. |
| TERM-03 | ✓ SATISFIED | Exact Ghostty/Zig/base/patch/derived tree and ABI gates passed. |
| TERM-04 | ✓ SATISFIED | Independent ordinary 25-cycle production stress passed with exact-zero counters and bounded resources. |
| TERM-05 | ✓ SATISFIED | Actual GTK role/name/focus contract is tested; unsupported cell text/caret/selection/actions are documented without overclaiming. |

No Phase 105 requirement is orphaned.

### Anti-Patterns and Disconfirmation Pass

| Finding | Severity | Assessment |
|---|---|---|
| Superseded custom VT/Pango/PTy modules remain in the repository | ℹ️ Info | They are retained only for historical/independent tests. `native:audit-production-graph` proves they are excluded from the production executable; removal is not required for the phase goal. |
| Full cell-level AT text, caret, selection, actions, and spoken terminal output are absent | ℹ️ Info | This is explicitly documented as unsupported/unverified, consistent with D-16 and TERM-05. No misleading accessibility claim exists. |
| Generic artifact-link tooling reported the old Plan 105-01 lock target as textually unresolved | ℹ️ Info | Manual trace confirms `scripts/verify-native.ts` reads `native/deps/ghostty.lock` through `LOCK_PATH`; current full-surface Plan 105-05 pin supersedes Plan 105-01's feasibility pin. |
| Repository tests emit pre-existing `TerminalConsoleCache` listener warnings | ℹ️ Info | The full suite exits successfully and the warning belongs to the TypeScript TUI test harness, not the Phase 105 native terminal resource graph. |

No unreferenced `TBD`, `FIXME`, or `XXX` marker exists in the verified production native graph. The disconfirmation pass found no partial Phase 105 requirement, misleading green production test, or untested required cleanup path.

### Human Verification Required

None remaining. The project owner exercised the exact production artifact through multiple remediation rounds and concluded, "looks all fixed to me." The completed matrices retain the unsupported accessibility boundaries rather than converting them into false passes.

### Gaps Summary

No blocking gaps. Phase 105 achieves its goal and is ready for Phase 106 composition work.

---

_Verified: 2026-07-11_
_Verifier: independent gsd-verifier (generic-agent workaround)_
