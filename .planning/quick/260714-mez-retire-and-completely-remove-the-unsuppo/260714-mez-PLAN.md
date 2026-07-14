---
quick_id: 260714-mez
status: complete
mode: validate
date: 2026-07-14
must_haves:
  truths:
    - The active branch contains no GTK, Zig, patched libghostty, or native application implementation.
    - Browser terminals retain service-owned launch resolution, agent signal setup, lifecycle, and reconnect behavior.
    - No supported command, API capability, documentation, or active planning item advertises the retired native client.
    - The final native state remains recoverable from the annotated archive tag.
  artifacts:
    - .planning/notes/native-client-retirement.md
    - src/lib/service/contract.ts
    - src/lib/service/snapshot.ts
    - src/service/web/terminal-manager.ts
    - .planning/PROJECT.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
  key_links:
    - Browser terminal creation resolves a generic terminal launch inside the TypeScript service.
    - Snapshot launch environment preparation uses generic terminal-session helpers.
    - Default build, test, publish, and documentation surfaces contain no native-client obligations.
---

# Quick Task 260714-mez: Retire and remove the native client

## Task 1: Remove the native runtime and generalize retained service seams

**Files:** `native/`, `scripts/verify-native.ts`, `package.json`, service contracts/snapshot/server/web modules, agent-session helper, related tests and fixtures

**Action:** Delete the GTK/Zig/libghostty implementation and verification harness. Remove the native-only public launch endpoint and discovery capability. Rename retained internal launch-resolution and terminal agent-environment code to generic terminal concepts, updating tests without exposing resolved launch secrets to browser code.

**Verify:** Focused service, contract, snapshot, web-terminal, and agent-session tests pass; TypeScript and web typechecks pass.

**Done:** No supported source or command depends on the removed runtime, and browser terminals retain equivalent behavior.

## Task 2: Remove native product obligations and record the retirement

**Files:** native docs, README/help/changelog references, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, native-oriented planning artifacts, `.planning/notes/native-client-retirement.md`

**Action:** Delete native acceptance and historical implementation artifacts from the active branch, rewrite active planning around the web/service product, and record the archive tag plus the rationale and revival boundary in one concise retirement note.

**Verify:** Repository-wide scans find no active native-client, GTK, Zig, libghostty, Ghostty-patch, or macOS-proof product obligations outside the retirement note and immutable quick-task record.

**Done:** A contributor reading the active branch sees only supported product surfaces and a clear historical retirement pointer.

## Task 3: Run release-grade verification and commit atomically

**Files:** generated web assets if needed, quick-task summary/verification, state tracking

**Action:** Build the web client; run focused tests, full tests, root/web typechecks, dependency checks, release gates, and diff hygiene. Repair any retirement regressions, document evidence, and commit source cleanup separately from planning closure where practical.

**Verify:** All applicable release gates pass and `git diff --check` is clean.

**Done:** The retirement is committed, the worktree is clean, and the archive tag resolves to the final pre-removal commit.
