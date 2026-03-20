# Milestones

## v0.3.0 Dashboard UI Overhaul (Shipped: 2026-03-20)

**Phases completed:** 4 phases (6–9), 13 plans
**Files changed:** 75 files, +13,251 / -1,171 lines
**Timeline:** 2026-03-18 → 2026-03-20 (2 days)
**Commits:** ~60 since v0.2.0

**Key accomplishments:**

- **Workspace notification system** (`git-stacks message send|list|clear`) — JSONL-backed per-workspace message store with optional sender identity; delivered in real-time to the running TUI via Unix socket; silently durable when TUI is not running
- **Dashboard tabbed layout** — Workspaces | Templates | Repos tabs with split list + detail pane per tab, independent cursor/filter state per tab, and full keyboard navigation (1/2/3, [/])
- **Full in-TUI CRUD** — all workspace actions (open, rename, merge, run, clean, remove, edit YAML) accessible via action menus; template edit/clone/remove; repo registry browsing with disk health indicators
- **IPC push message display** — workspace list rows show live notification previews (sender, truncated text, relative age); detail pane shows grouped per-sender history; `m` key opens full-screen MessageOverlay with cursor navigation and `c`-to-clear; IPC socket status indicator in help bar
- **Shell completion overhaul** — OPTION_ENUMS + FLAG_COMPLETIONS tables with prev-word detection in bash/zsh/fish; covers `--strategy`, `--sort`, `--workspace`, `--from`, and the full `message send|list|clear` subcommand tree
- **OpenTUI layout patterns** — discovered and documented root cause of nested `<text>` crash; established two-box flexGrow layout, height-based tab visibility, and SolidJS reactive function pattern for `<For>` callbacks

**Archive:** [.planning/milestones/v0.3.0-ROADMAP.md](.planning/milestones/v0.3.0-ROADMAP.md)

---

## v0.2.0 Foundation + Model Redesign (Shipped: 2026-03-18)

**Phases completed:** 7 phases (1–5 + 1.1, 1.2), 21 plans
**Requirements:** 61/61 shipped

**Key accomplishments:**

- Stable Repo Registry + Template model replacing the Stack model
- Test infra with real git repos; Zod schema resilience and prerequisite checks
- File ops engine (copy/symlink with glob, idempotent, loud-fail)
- Destructive op safety (`--dry-run`/`--force` on remove/clean/merge/rename)
- UX polish — `formatError`, `--json`, `doctor --fix`, richer columns, `run --parallel`
- Dynamic version command with git hash and `-dirty` flag

**Archive:** [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

---
