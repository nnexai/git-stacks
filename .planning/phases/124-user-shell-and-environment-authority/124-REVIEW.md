---
phase: 124-user-shell-and-environment-authority
reviewed: 2026-07-16T14:02:30Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - .github/workflows/node-runtime-matrix.yml
  - packages/cli/src/commands/service.ts
  - packages/cli/src/commands/web.ts
  - packages/cli/src/commands/workspace.ts
  - packages/cli/src/lib/cli-program.ts
  - packages/core/src/lifecycle.ts
  - packages/core/src/node-runtime.ts
  - packages/core/src/user-shell.ts
  - packages/core/src/workspace-command.ts
  - packages/core/src/workspace-env.ts
  - packages/core/src/workspace-lifecycle.ts
  - packages/protocol/src/secure.ts
  - packages/protocol/src/service.ts
  - packages/service/src/main.ts
  - packages/service/src/policy/client.ts
  - packages/service/src/policy/dynamic-environment.ts
  - packages/service/src/policy/snapshot.ts
  - packages/service/src/secure/router.ts
  - packages/service/src/secure/runtime.ts
  - packages/service/src/security/session-authority.ts
  - packages/service/src/web/terminal-manager.ts
  - packages/tui/src/run.tsx
  - tests/architecture/shell-hosted-matrix.test.mjs
  - tests/commands/run-parallel.test.ts
  - tests/commands/user-shell-host-fixture.test.ts
  - tests/fixtures/user-shell/bash-init.sh
  - tests/fixtures/user-shell/fish-init.fish
  - tests/fixtures/user-shell/zsh-init.zsh
  - tests/lib/agent-terminal-session.test.ts
  - tests/lib/lifecycle.test.ts
  - tests/lib/service/contract.test.ts
  - tests/lib/service/launch-context.test.ts
  - tests/lib/service/snapshot.test.ts
  - tests/lib/user-shell-adapter.test.ts
  - tests/lib/workspace-env.test.ts
  - tests/lib/workspace-lifecycle.test.ts
  - tests/service-node/secure-contract-runtime.test.mjs
  - tests/service/managed-service-process.test.ts
  - tests/service/web-projection.test.ts
  - tests/service/web-terminal.test.ts
  - tests/tui/dashboard/managed-service-bootstrap.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: passed
---

# Phase 124: Code Review Report

**Reviewed:** 2026-07-16T14:02:30Z
**Depth:** standard
**Files Reviewed:** 41
**Status:** passed

## Summary

The final independent review found no remaining blocker or high-severity defect. Earlier adversarial and goal-verification passes found and closed invalid Bash invocation, post-profile environment authority loss, PTY input/resize loss, incomplete process-group cleanup, split UTF-8 decoding, shadowable shell dispatch, false logical completion after failed cleanup, traced-value disclosure, private-value residue after PTY allocation failure, and inherited Bash-function interception of non-PTY bootstrap dispatch. The complete repair history and focused evidence are recorded in `124-EARLY-REVIEW-FIX.md`.

The final implementation applies the authoritative overlay only after the selected interactive-login shell initializes, avoids profile-overridable command dispatch, keeps injected values out of traced output, preserves command input/resize and exact status, and removes private initialization assets even when allocation fails. Failed TERM/KILL confirmation still retains the active process honestly and reports retryable cleanup failure rather than fabricating an ended terminal.

## Final Review Evidence

- Final read-only adversarial review: PASS; no blocker or high-severity finding.
- Focused Phase 124 integration: 43 passed, one explicit local zsh capability skip.
- Full Vitest suite: 139 files, 1,847 passed, one skipped.
- Node suite: 45 passed.
- Full TUI suite: passed.
- Seven workspace typechecks: passed.
- Dependency architecture, coverage, and `verify:gates`: passed.
- Hosted Linux/macOS zero-skip receipts remain an explicit Phase 127 pre-tag gate and are not claimed here.

---

_Reviewed: 2026-07-16T14:02:30Z_
_Reviewer: independent GSD code review_
_Depth: standard_
