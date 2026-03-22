---
created: 2026-03-22T08:51:23.406Z
title: Fix niri columns display in TUI details pane
area: ui
files:
  - src/tui/dashboard/
---

## Problem

The niri columns configuration displays `[object Object]` in the details pane of the TUI dashboard instead of a human-readable representation. The columns config is an object/array that needs to be serialized properly for display.

## Solution

Investigate how niri columns config is rendered in the details pane and fix the display formatting. Likely involves the dashboard detail view component that shows integration settings for the selected workspace.
