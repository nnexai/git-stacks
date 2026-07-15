# Phase 112 Summary

Added a narrow PTY adapter backed by exact-pinned `node-pty` `1.2.0-beta.14` and moved the complete terminal/signal service to Node. The terminal manager retains replay, visibility, pressure, title, resize, process cleanup, reconnect, and exact-surface signal policy.

The npm artifact contains trusted upstream prebuilds for Linux x64/arm64 and macOS x64/arm64. Hosted execution on all four targets remains a release gate.
