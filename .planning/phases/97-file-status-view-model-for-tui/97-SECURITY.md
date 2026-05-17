---
phase: 97
slug: file-status-view-model-for-tui
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-17
---

# Phase 97 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| workspace config -> grouped helper | User-authored `files.copy`, `files.symlink`, and `files.sync` paths flow into the TUI-facing status model. | Workspace file config paths and file-status rows |
| filesystem -> status summaries | Current disk state is sampled to derive drift, missing, warning, and error summaries that later dashboard code will trust. | Configured source/target existence and file-status metadata |
| dashboard hook -> shared lib helper | TUI code consumes the grouped file-status model and must not bypass it with subprocesses or duplicated sync logic. | Selected workspace identity and grouped file-status result |
| selected workspace state -> async loader | User selection and workspace lifecycle changes can invalidate the requested workspace while a load is in flight. | Selected workspace name and async load state |
| dashboard startup -> detail load path | File-status work must remain outside the initial workspace-list loading loop. | Lazy detail-only load trigger |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-97-01 | Tampering | `src/lib/workspace-file-status.ts` | mitigate | `getWorkspaceFileStatusView()` is built from `getFileEntryStatuses()` plus workspace/repo metadata; CLI parity tests lock the shipped status vocabulary. Evidence: `src/lib/workspace-file-status.ts`, `tests/commands/files.test.ts`. | closed |
| T-97-02 | Information Disclosure | grouped warning/detail buckets | mitigate | The output model is scoped to configured entries, summaries, hints, and detail buckets; filesystem checks are limited to configured source/repo-root existence paths. Evidence: `src/lib/workspace-file-status.ts`. | closed |
| T-97-SC | Tampering | package-manager installs | mitigate | Phase implementation commits did not change package manifests or lockfiles; the work stayed in source, tests, and planning artifacts. Evidence: Phase 97 commit file lists. | closed |
| T-97-03 | Denial of Service | `src/tui/dashboard/hooks/useWorkspaceFileStatus.ts` | mitigate | The hook loads one selected workspace at a time, resets to idle when no workspace is selected, and remains independent from `useWorkspaces()`. Evidence: `src/tui/dashboard/hooks/useWorkspaceFileStatus.ts`, `tests/tui/dashboard/useWorkspaceFileStatus.test.tsx`. | closed |
| T-97-04 | Elevation of Privilege | dashboard file-status loading path | mitigate | The dashboard hook imports the shared lib helper directly and does not call CLI/subprocess APIs; tests assert no `runCli`, `Bun.spawn`, or `spawnSync` path. Evidence: `src/tui/dashboard/hooks/useWorkspaceFileStatus.ts`, `tests/tui/dashboard/useWorkspaceFileStatus.test.tsx`. | closed |
| T-97-05 | Repudiation | dashboard error state | mitigate | Dashboard file-status state is an explicit `idle/loading/loaded/error` union with error messages, and the hook sets success/failure states explicitly. Evidence: `src/tui/dashboard/types.ts`, `src/tui/dashboard/hooks/useWorkspaceFileStatus.ts`, `tests/tui/dashboard/useWorkspaceFileStatus.test.tsx`. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-17 | 6 | 6 | 0 | gsd-security-auditor |

## Threat Flags

No `## Threat Flags` section was present in `97-01-SUMMARY.md` or `97-02-SUMMARY.md`; no unregistered threat flags were found.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-17
