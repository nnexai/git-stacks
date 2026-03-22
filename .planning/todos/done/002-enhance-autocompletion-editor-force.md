---
title: "Enhance autocompletion, editor shortcuts, and force cleanup"
status: pending
priority: P2
source: "promoted from /gsd:note"
created: 2026-03-22
theme: general
---

## Goal

Bundle of CLI quality-of-life improvements: enhance shell autocompletion to complete `new --from <templates>`, add a quick way to edit template or workspace configuration with an editor, make `remove --force` delete folder and config even if config is incomplete, and make `cleanup --force` try removing the workspace folder.

## Context

Promoted from quick note captured on 2026-03-18.

## Acceptance Criteria

- [ ] Shell completion completes `new --from <template-name>`
- [ ] Quick command to open template/workspace YAML in $EDITOR
- [ ] `remove --force` deletes folder and config even with incomplete config
- [ ] `cleanup --force` attempts to remove the workspace folder
