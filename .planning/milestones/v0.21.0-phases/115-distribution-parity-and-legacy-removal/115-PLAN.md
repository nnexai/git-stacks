---
phase: 115
status: planned
depends_on: [113, 114]
requirements: [DIST-01, DIST-02, DIST-03, DIST-04, DIST-05]
---

# Phase 115 Plan: Distribution Parity and Legacy Removal

## Objective

Turn the migrated repository into a supportable v0.21.0 release candidate and prove there is only one implementation of each supported capability.

## Work packages

### 1. Package and installation design

- Finalize whether internal workspaces publish separately or roll into a default `git-stacks` facade plus optional TUI package; preserve the public command and repository identity.
- Set Node 24 engine constraints, bin paths, exports, files lists, asset manifests, optional-peer behavior, and package provenance.
- Ensure default installs contain CLI, core, protocol/client runtime as needed, service, and web assets but no Bun/OpenTUI dependency.
- Document explicit optional TUI installation/runtime behavior.

### 2. Supported-platform matrix

- Build and clean-install packed artifacts on Linux x64/arm64 and current supported macOS x64/arm64 runners/hosts.
- Run CLI smoke/parity, service startup/auth/SSE/WS, web browser smoke, PTY lifecycle/process-tree, watcher reconciliation, and shutdown/resource suites.
- Inspect install logs to prove node-pty uses the lockfile-pinned prebuild with no compiler fallback.
- Publish CI artifacts for inspection only; do not tag, push packages, or create a release without explicit approval.

### 3. Legacy and duplication removal

- Resolve every Phase 108 migration-shim manifest entry and fail CI if any expired shim remains.
- Delete Bun CLI/service entrypoints, direct Bun runtime helpers outside TUI, old monolithic source paths, duplicate reducers/persistence/domain modules, and generated migration debris.
- Run import graph, source ownership, dead export, circular dependency, and duplicate-behavior audits.
- Verify tests import public package surfaces rather than keeping deleted internals alive artificially.

### 4. Release readiness

- Update README, architecture, security, contributor, install, troubleshooting, command, web/TUI, and release documentation from built behavior.
- Add a v0.21.0-rc.1 changelog section covering Node 24, package boundaries, daemonless CLI, Node service, optional Bun TUI, persistence changes, platform support, and node-pty beta exception.
- Generate package inventory, dependency/license notices, SBOM/provenance if supported by the existing release flow, and rollback instructions.
- Run complete verify gates from a clean checkout and record exact evidence in Phase 115 verification.

## Tests and evidence

- Supported-platform CI/host matrix with clean package tarballs.
- License policy allows MIT-compatible runtime/build dependencies and records node-pty/ws/esbuild provenance.
- No-compiler install assertion and offline reinstall from prepared package/cache where practical.
- Full test/typecheck/build/dependency/security/browser/TUI/resource gates.
- Repository searches prove old Bun service/CLI/runtime paths and expired migration shims are absent.

## Completion gate

- One default Node implementation supports CLI, service, and web on all declared platforms.
- Optional TUI is clearly isolated and supportable.
- Clean package artifacts and complete verification evidence are ready for v0.21.0-rc.1.
- Package version may be advanced as part of release preparation, but tagging, pushing, publishing, and releasing remain separate explicit actions.

## Rollback

Use the final v0.20 RC commit/tag as the release rollback boundary. Do not reintroduce permanent dual runtimes to create an in-package rollback path.
