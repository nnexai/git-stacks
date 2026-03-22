---
title: "Dedicated lifecycle phases: close before clean, clean before remove"
status: pending
priority: P2
source: "promoted from /gsd:note"
created: 2026-03-22
theme: lifecycle
---

## Goal

Introduce dedicated lifecycle phases so that close happens before clean, and clean happens before remove. Hooks like `pre_close` should trigger in close/clean/remove commands, while `pre_remove` only fires in the remove command. This gives users finer-grained control over teardown behavior.

## Context

Promoted from quick note captured on 2026-03-22.

## Acceptance Criteria

- [ ] `close` lifecycle phase with `pre_close` / `post_close` hooks
- [ ] `pre_close` triggers in close, clean, and remove commands
- [ ] `pre_remove` only triggers in remove command
- [ ] Hook ordering: close → clean → remove
