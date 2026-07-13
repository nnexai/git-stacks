---
phase: 107.3-web-client-and-local-terminal-bridge
status: implemented-linux-verified
depends_on: [104, 107.2]
date: 2026-07-13
native_dependency: "Independent unless the shared service, launch, or signal contracts change."
---

# 107.3 — Web Workspace Client and Local Terminal Bridge

This package started as a replan built from the POC and live service code. The production Linux implementation is now complete and verified. It deliberately remains outside `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` so the parallel native-client workstream is not rewritten underneath its active agent.

## Decision

The existing git-stacks Bun service becomes the browser's machine-side authority. The web client stays thin: it renders a browser-safe workspace projection, sends stable IDs and user intents, and hosts xterm.js terminals. The service owns Git/filesystem interaction, launch resolution, browser pairing, web PTYs, process cleanup, replay state, backpressure, and terminal signal ingestion.

This reuses git-stacks rather than building a parallel backend. Native Ghostty surfaces and external integrations keep their current ownership. Browser PTYs are separate, service-owned sessions created only for web terminal surfaces.

## Feasibility status

- **Implemented and validated on Linux:** production pairing, browser-safe DTOs, multiple real PTYs, resize, cursor replay, reconnect/reload, explicit history loss, quotas/backpressure, operations, workspace creation, signals, packaging, and native-parity workspace behavior.
- **Capability-gated:** browser PTYs remain unavailable on macOS and Windows until actual-host process-tree and PTY verification exists.
- **Conclusion:** the service-owned/thin-browser architecture is production-feasible on the verified Linux boundary. The standalone POC remains historical evidence only.

## Documents

- [`107.3-CONTEXT.md`](107.3-CONTEXT.md) — locked decisions, discretion, and deferrals.
- [`107.3-RESEARCH.md`](107.3-RESEARCH.md) — live-code analysis, external evidence, reuse map, and corrected feasibility findings.
- [`107.3-ARCHITECTURE.md`](107.3-ARCHITECTURE.md) — service/browser boundaries, contracts, pairing, terminal protocol, signals, lifecycle, build, and security.
- [`107.3-PLAN.md`](107.3-PLAN.md) — vertical implementation slices, dependency order, acceptance gates, and traceability.
- [`107.3-POC.md`](107.3-POC.md) — honest POC evidence and known failures.
- [`107.3-SUMMARY.md`](107.3-SUMMARY.md) — implemented architecture, feature-parity result, and operating boundary.
- [`107.3-VERIFICATION.md`](107.3-VERIFICATION.md) — automated, browser, packaging, security, and lifecycle evidence.
- [`../../spikes/010-web-terminal-tabs/`](../../spikes/010-web-terminal-tabs/) — standalone feasibility source.

## Scope

In scope:

- Loopback web UI with the same workspace-first product behavior as the native client.
- Browser-safe projections of existing snapshots, events, signals, operations, and workspace creation.
- Service-owned browser PTYs launched from authoritative workspace/repository/command IDs.
- Multiple terminal tabs, resize, short reconnect, reload restoration/history-loss handling, close, and bounded cleanup.
- One-use local pairing, HttpOnly browser principals, Host/Origin/Fetch-Metadata policy, strict schemas, quotas, and security headers.
- Browser build/package/test infrastructure independent from OpenTUI compilation.

Out of scope:

- Exposing native Ghostty surfaces to the browser or sharing one live PTY across clients.
- Arbitrary browser-supplied commands, cwd, environment, paths, or executable names.
- Durable terminal sessions across service restart.
- LAN/public hosting, remote auth, collaboration, or multiple terminal writers.
- Replacing the native client.

## Execution status

All seven delivery slices have been implemented in the production service and browser client. Run `git-stacks web` to start or discover the service and open a one-use paired browser URL. See `107.3-VERIFICATION.md` for the exact evidence and remaining platform/browser-matrix limitations.
