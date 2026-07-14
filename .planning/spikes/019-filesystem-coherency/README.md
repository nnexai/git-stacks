---
spike: 019
name: filesystem-coherency
type: standard
validates: "Given a daemonless local CLI and a long-running service, when the CLI atomically changes authoritative persisted state, then the service observes and reconciles it without a refresh RPC while partial writes and lost-update risks are explicitly bounded"
verdict: PARTIAL
related: [018]
tags: [node, filesystem, atomic-write, watcher, concurrency, macos, linux]
---

# Spike 019: Filesystem Coherency

## What This Validates

Given a local CLI that writes files directly and a service that watches the same authoritative state, when workspaces/configuration change, then the service can rebuild and emit normal events without a CLI-to-service refresh path or a global lock.

## Research

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Parent/root `fs.watch` plus periodic content reconciliation | No dependency, low idle cost, Node 24 recursive directory support on Linux and macOS, correctness does not depend on event fidelity | Must implement debounce, digest scope, and rebind/error handling deliberately | Selected |
| [`chokidar`](https://github.com/paulmillr/chokidar) 5 | Mature, MIT, normalizes add/change/unlink and atomic editor events | Another dependency; recursive watcher cost; normalized events still cannot be the sole correctness source | Viable but unnecessary initially |
| Polling only | Simple correctness model | Higher steady-state I/O/CPU and slower interaction | Reconciliation fallback only |
| CLI refresh RPC | Immediate explicit invalidation | Couples local commands to a running daemon and introduces failure behavior the local-only CLI does not need | Rejected |

Node documents `fs.watch` as platform-dependent and not fully consistent. Directory watching uses inotify on Linux and FSEvents on macOS. Therefore watch events are treated as low-latency hints, not a journal. Correctness comes from rebuilding authoritative state and comparing a revision/content digest.

Chokidar's normalization is useful for broad or editor-oriented trees, but git-stacks watches a small, known configuration tree and already owns aggregate snapshot rebuilding. A standard watcher plus bounded content digest has fewer dependencies and stronger missed-event semantics than trusting either raw or normalized event names.

## How to Run

```bash
cd .planning/spikes/019-filesystem-coherency
npm run check
```

## What to Expect

The probe runs a separate writer process, performs 100 atomic replacements, simulates dropped watcher events, demonstrates the fixed temporary-path race, verifies unique temporary paths, and demonstrates the remaining semantic lost-update race. It prints JSON and exits nonzero if any expected property is absent.

## Observability

The report contains watch and reconciliation counts, final versions, fingerprints, parseability, and lost-update state. Temporary data is removed after the run.

## Investigation Trail

- Kept watcher delivery and reconciliation as separate evidence: operating-system notifications are latency hints, while a periodic content digest is the correctness fallback.
- A separate Node process performed 100 unique-temp-file replacements of one workspace definition. The watcher coalesced the burst into one invalidation and read final version 100; no refresh call or service cooperation was involved.
- A same-size replacement with its original modification time restored produced exactly the same filename/size/mtime fingerprint used by the current `workspace-change-monitor.ts`, while the content digest changed. A metadata-only fallback can therefore miss a change forever if the operating-system event is lost.
- The current fallback fingerprints only the workspace directory. Correct reconciliation must cover all authoritative inputs that affect the shared projection: global config, registry, templates, workspaces, and any other persisted definition roots.
- The current `config.ts` writer uses the shared path `${path}.tmp`. Two writers can open the same temporary inode; after one renames it into place, the other descriptor can continue modifying the now-visible target. The deterministic probe produced a corrupt, unparseable target.
- Process- and UUID-qualified temporary paths opened with exclusive creation eliminated that partial-write race; sequential replacement always left one complete parseable document.
- Unique atomic replacements still do not solve semantic lost updates. Two readers starting from `{ labels: [], priority: 0 }` independently wrote a label and a priority; the second valid rename preserved the priority but erased the label.
- The complete probe passed under Node 24.18.0 and 26.5.0 on Linux x64. Actual macOS watcher behavior remains a CI gate, though the design uses only documented Node APIs and a carrier-independent reconciliation fallback.

## Results

**PARTIAL** — the filesystem-authoritative architecture is validated: the CLI does not need a refresh protocol, watcher events can coalesce aggressively, and a global service lock is unnecessary. The current write and fallback implementations need correction before relying on this contract.

Required shared-core primitives:

1. `atomicReplace(path, bytes)` uses a same-directory, process/random-qualified temporary file opened exclusively, flushes and closes it, renames it, cleans failures, preserves intended mode, and flushes the parent directory where supported when crash durability matters.
2. `mutateWorkspace(name, intent)` and equivalent registry/template helpers are the only read-modify-write entry points. They reread authoritative state immediately before applying a field-level intent.
3. A narrow per-target cross-process lock or equivalent serialized mutation protocol is used only for operations that must merge with current state. Atomic create/replace/delete and read-only operations do not take a global lock.
4. The service watches the configuration root/parent directories for latency, debounces bursts, rebuilds once, and emits only when the aggregate revision changes.
5. A periodic bounded content digest spans all authoritative definition roots, recovers dropped events, rebinds watchers after directory replacement, and records/retries errors without exposing file contents.

This preserves the desired product boundary: local CLI operations remain daemonless; the service independently notices durable state; web and TUI clients receive normal snapshot/event updates.
