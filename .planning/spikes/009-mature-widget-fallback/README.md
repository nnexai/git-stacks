---
spike: 009
name: mature-widget-fallback
type: comparison
validates: "Given that a maintained Ghostty fork may be unacceptable, when mature GTK terminal widgets are compared, then a complete non-Ghostty pane fallback exists without product-owned terminal rendering"
verdict: VALIDATED
related: [005, 006]
tags: [terminal, gtk, vte, fallback]
---

# Spike 009: Mature Widget Fallback

## What This Validates

Whether git-stacks can still deliver fully functional terminal panes without implementing terminal behavior if the Ghostty fork path becomes untenable.

## Research

GNOME VTE is a GTK terminal widget, not a parser toolkit. Its GTK4 `VteTerminal` implements `GtkAccessibleText` and exposes PTY spawning, input, selection, primary/system clipboard, search, hyperlinks, cursor configuration, shaping, bidi, sixel, scrollback, resize/reflow, child watching, and text extraction.

Primary sources:

- https://gnome.pages.gitlab.gnome.org/vte/gtk4/class.Terminal.html
- https://gnome.pages.gitlab.gnome.org/vte/gtk4/method.Terminal.spawn_async.html
- https://gitlab.gnome.org/GNOME/vte

## Investigation Trail

1. Verified VTE is a first-class GTK widget with its own PTY and terminal behavior rather than a consumer-rendered state library.
2. Verified it is used by mature terminal applications and embedded terminal panels.
3. Compared its contract with the required panes: it eliminates the reimplementation failure mode and has stronger built-in accessibility than the custom Phase 105 widget.
4. It does not provide Ghostty rendering, Ghostty configuration compatibility, or Ghostty's exact protocol/feature behavior.

## Results

**VALIDATED as fallback only.** VTE can deliver complete embedded terminal panes with a stable GTK API and no custom terminal renderer. It is inferior to the Limux/Ghostty path for this project's stated Ghostty requirement, but materially better than continuing the current `ghostty-vt` plus Pango implementation.
