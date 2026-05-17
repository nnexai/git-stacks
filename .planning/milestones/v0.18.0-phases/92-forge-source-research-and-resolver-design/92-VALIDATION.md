---
phase: 92
slug: forge-source-research-and-resolver-design
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-16
---

# Phase 92 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `package.json` scripts plus `tests/**/*.test.ts` |
| **Quick run command** | `bun test tests/lib/integrations/forge-source.test.ts` |
| **Full suite command** | `bun test tests/lib/integrations/forge-source.test.ts tests/lib/config.test.ts && bun run typecheck` |
| **Estimated runtime** | ~30 seconds focused, ~90 seconds full focused gate |

---

## Sampling Rate

- **After every task commit:** Run the task's focused `bun test ...` command.
- **After every plan wave:** Run `bun test tests/lib/integrations/forge-source.test.ts tests/lib/config.test.ts && bun run typecheck`.
- **Before `$gsd-verify-work`:** Focused gate plus source/doc assertions must be green.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 92-01-01 | 01 | 1 | FSRC-02, FSRC-08 | T-92-01 | N/A | docs/source assertion | `rg -n "glab mr view|gh pr view|tea pulls|plain Git fetch" docs/forge-source-resolver.md` | OK | pending |
| 92-02-01 | 02 | 1 | FSRC-02, FSRC-03, FSRC-08 | T-92-02 | unknown config rejected by typed parser only where relevant; existing config remains valid | unit | `bun test tests/lib/config.test.ts` | OK | pending |
| 92-03-01 | 03 | 2 | FSRC-02, FSRC-03, FSRC-08 | T-92-03 | malformed and unsupported source URLs fail closed | unit | `bun test tests/lib/integrations/forge-source.test.ts` | W0 | pending |
| 92-04-01 | 04 | 3 | FSRC-02, FSRC-03, FSRC-08 | T-92-04 | no live provider auth or checkout command is required in tests | focused gate | `bun test tests/lib/integrations/forge-source.test.ts tests/lib/config.test.ts && bun run typecheck` | W0 | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Plan 03 creates `tests/lib/integrations/forge-source.test.ts` before implementation of the pure parser/contract helpers.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `glab` JSON field shape | FSRC-02 | `glab` is not installed locally in this environment. | Phase 93 should run one authenticated `glab mr view <iid> --output json` fixture or record a manual validation note before relying on live field names. |
| Live `gh` JSON field shape | FSRC-08 | `gh` is not installed locally in this environment. | Phase 93 should run one authenticated `gh pr view <url> --json ...` fixture or keep the command behind an injected executor seam. |
| Live `tea` metadata command | FSRC-08 | Local `tea` exists but token refresh fails. | Re-authenticate Tea with `tea login oauth-refresh gitea` or a token login before live Gitea validation. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Feedback latency < 90s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending

