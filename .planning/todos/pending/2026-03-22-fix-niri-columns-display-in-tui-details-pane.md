---
created: 2026-03-22T08:51:23.406Z
title: Fix niri columns display in TUI details pane
area: ui
files:
  - src/tui/dashboard/
---

## Problem

The niri columns configuration is not displaying correctly in the details pane of the TUI dashboard. The rendering of the niri integration's column settings needs to be fixed so users can see and understand their current configuration.

## Solution

Investigate how niri columns config is rendered in the details pane and fix the display formatting. Likely involves the dashboard detail view component that shows integration settings for the selected workspace.
