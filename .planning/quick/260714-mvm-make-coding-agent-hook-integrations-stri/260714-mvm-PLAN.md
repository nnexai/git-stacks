---
quick_id: 260714-mvm
status: complete
mode: validate
date: 2026-07-14
must_haves:
  truths:
    - Normal git-stacks startup and terminal creation never modify coding-agent configuration in the user's home directory.
    - Users explicitly choose which provider integrations to install or uninstall.
    - Updating reconciles only integrations already owned by git-stacks and never installs another provider.
    - Status is read-only and terminal process wrappers remain available when no user-level integration is installed.
    - The superseded project-local install command and hook-plugin implementation are absent from supported source and command surfaces.
  artifacts:
    - src/lib/agent-hooks/integration-manager.ts
    - src/lib/agent-hooks/terminal-session.ts
    - src/commands/hooks.ts
    - tests/lib/agent-hooks/integration-manager.test.ts
    - tests/commands/hooks.test.ts
    - README.md
  key_links:
    - Terminal environment preparation reads integration health to choose between installed hooks and service-local process wrappers.
    - CLI install and uninstall commands pass an explicit validated provider selection to the integration manager.
    - CLI update discovers owned installed or outdated integrations before writing any provider configuration.
---

# Quick Task 260714-mvm: Make agent hooks explicitly opt-in

## Task 1: Make integration mutation provider-scoped and explicit

**Files:** `src/lib/agent-hooks/integration-manager.ts`, `src/commands/hooks.ts`, command inventory

**Action:** Add provider selection to install/uninstall, add an update operation that only reconciles already owned integrations, and expose status/install/update/uninstall as explicit CLI subcommands with `all` convenience for provider-selected operations.

**Verify:** Unit and CLI tests prove selected providers are the only files changed, update does not add absent integrations, invalid providers fail before mutation, and uninstall preserves foreign configuration.

**Done:** Every user-home mutation requires an explicit install, update, or uninstall command.

## Task 2: Remove automatic installation from terminal startup

**Files:** `src/lib/agent-hooks/terminal-session.ts`, `src/lib/service/snapshot.ts`, terminal-session tests

**Action:** Replace startup installation with read-only health detection. Use service-local command wrappers for providers without a healthy installed integration and avoid wrappers for providers whose user-level hooks are installed.

**Verify:** Tests use isolated workspace and home directories to prove terminal preparation writes wrappers only and leaves provider configuration untouched.

**Done:** Opening a web terminal cannot alter Codex, Claude, Copilot, or OpenCode configuration.

## Task 3: Document, validate, and commit the release-facing lifecycle

**Files:** `README.md`, `CHANGELOG.md`, quick-task summary/verification, `.planning/STATE.md`

**Action:** Document commands, supported providers, exact files managed, ownership-safe behavior, and the no-automatic-install guarantee. Run focused tests, typechecks, dependency checks, release gates, and diff hygiene.

**Verify:** All applicable release gates pass and `git diff --check` is clean.

**Done:** The opt-in lifecycle is release-ready, documented, and committed.

## Task 4: Remove the superseded project-local hook system

**Files:** legacy install command, project-hook plugins/tests, CLI registration, completion and E2E inventory, active codebase documentation

**Action:** Remove `git-stacks install --hooks` and its project-local Claude/Copilot/Codex plugin implementation so `git-stacks hooks` is the only supported coding-agent hook lifecycle.

**Verify:** Command inventory and completions contain no top-level `install`; repository scans find no active project-hook implementation; supported tests and release gates pass.

**Done:** Contributors and users have one signal-based, provider-selected hook management model.
