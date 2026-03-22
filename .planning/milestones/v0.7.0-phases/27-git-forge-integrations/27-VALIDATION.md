---
phase: 27
slug: git-forge-integrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | none — Bun auto-discovers `*.test.ts` |
| **Quick run command** | `bun test tests/lib/integrations/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integrations/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | schema | unit | `bun test tests/lib/config.test.ts` | ✅ exists — add cases | ⬜ pending |
| 27-01-02 | 01 | 1 | forge-utils | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 1 | github-pr | unit | `bun test tests/lib/integrations/github.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 1 | github-web | unit | `bun test tests/lib/integrations/github.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 1 | gitlab-mr | unit | `bun test tests/lib/integrations/gitlab.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-02 | 03 | 1 | gitlab-web | unit | `bun test tests/lib/integrations/gitlab.test.ts` | ❌ W0 | ⬜ pending |
| 27-04-01 | 04 | 1 | gitea-pr | unit | `bun test tests/lib/integrations/gitea.test.ts` | ❌ W0 | ⬜ pending |
| 27-04-02 | 04 | 1 | gitea-url | unit | `bun test tests/lib/integrations/gitea.test.ts` | ❌ W0 | ⬜ pending |
| 27-05-01 | 05 | 2 | resolve | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ W0 | ⬜ pending |
| 27-05-02 | 05 | 2 | detect | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/integrations/forge-utils.test.ts` — resolveForgeRepo + detection unit tests
- [ ] `tests/lib/integrations/github.test.ts` — GitHub pr create/open/status command tests with `_exec` injection
- [ ] `tests/lib/integrations/gitlab.test.ts` — GitLab mr create/open/status command tests with `_exec` injection
- [ ] `tests/lib/integrations/gitea.test.ts` — Gitea pr create/open/status command tests (includes tea JSON URL parsing)

*Existing infrastructure covers config schema tests — add forge field cases to `tests/lib/config.test.ts`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doctor lists gh/glab/tea in binary checks | doctor | No doctor unit test framework | Run `git-stacks doctor` and verify forge CLIs appear |
| tea `pulls ls --output json` head field format | gitea-url | Requires live Gitea PR | Create test PR on Gitea instance, run `tea pulls ls --output json`, verify `head` field |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
