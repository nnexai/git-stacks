# Phase 111 Summary

Replaced the Bun service carrier with Node `http`, exact-pinned `ws`, and a race-safe managed-service lifecycle. Authentication, snapshots, operations, SSE cursors/replay gaps/heartbeats, browser and trusted projections, discovery, stale-startup recovery, and idle shutdown retain the existing contract.
