---
quick_id: 260714-mvm
status: complete
completed: 2026-07-14
---

# Quick Task 260714-mvm Summary

Coding-agent signal hooks are now an explicitly selected, ownership-safe user action rather than a side effect of terminal startup.

## Delivered

- Added the top-level `git-stacks hooks` command with read-only `status`, provider-selected `install` and `uninstall`, and installed-only `update` operations.
- Supports `codex`, `claude`, `copilot`, and `opencode`, with `all` as an explicit install/uninstall convenience.
- Removed automatic integration installation from service terminal launch preparation.
- Retained service-local process wrappers as the zero-configuration fallback for providers without installed user hooks.
- Made terminal setup inspect integration state without rewriting provider files.
- Made uninstall byte-inert when shared configuration contains no git-stacks-owned entry.
- Preserved existing Codex `hooks` feature settings, including restoring an explicitly disabled setting after uninstall.
- Documented exact managed paths, ownership behavior, lifecycle commands, and the no-automatic-install guarantee.
- Removed the superseded `git-stacks install --hooks` command, project-local provider plugins, and their separate tests/documentation from active product surfaces.

## Commit

- `3cf846fe` — implement opt-in coding-agent hooks and release-facing documentation.
- `795c1219` — remove the superseded project-local hook command and plugins.

## Verification

See `260714-mvm-VERIFICATION.md`.
