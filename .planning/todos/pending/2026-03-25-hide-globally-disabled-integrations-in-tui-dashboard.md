---
created: 2026-03-25T04:57:55.759Z
title: Hide globally disabled integrations in TUI dashboard
area: ui
files:
  - src/tui/dashboard/
  - src/lib/integrations/
---

## Problem

The TUI dashboard currently shows all integrations regardless of their global enabled/disabled state. Integrations that are globally disabled in `config.yml` should not appear in the dashboard at all — unless they have been explicitly re-enabled via a per-workspace override (`settings.integrations.<id>.enabled: true`).

This creates visual noise and confusion when a user has disabled integrations they don't use (e.g., IntelliJ when they only use VS Code).

## Solution

Filter the integration list in the dashboard rendering logic:
- Check `globalConfig.integrations[id].enabled` (or equivalent)
- Only show an integration if it is globally enabled OR has a workspace-level override that enables it
- Use `resolveEnabled()` helper from `src/lib/integrations/types.ts` or equivalent logic
