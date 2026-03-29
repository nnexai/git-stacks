# Pitfalls Research

**Domain:** AeroSpace multi-workspace integration — adding `workspaces` array support to the existing single-workspace AeroSpace plugin in git-stacks v0.12.0
**Researched:** 2026-03-29
**Confidence:** HIGH — pitfalls grounded in direct reads of `src/lib/integrations/aerospace.ts` (the full `open()` sequence), `src/lib/aerospace.ts` (snapshot-delta with exponential backoff), `tests/lib/integrations/aerospace.test.ts` (test structure), `src/lib/integrations/runner.ts` (WindowDetector lifecycle), and `src/lib/integrations/types.ts` (ArtifactBag shape)

---

## Critical Pitfalls

### Pitfall 1: Bag Window Routing — All Bag Windows Move to First Entry When Routing Logic Is Wrong

**What goes wrong:**
The current `open()` iterates `Object.values(bag)` and moves every window artifact to a single `targetWorkspace`. When `workspaces` is an array, the most natural refactor loops over `workspaces` entries and moves all bag windows on every iteration — resulting in every window being sent to every AeroSpace workspace entry, not just the intended one.

The opposite failure: if the routing logic is too narrow (only the last entry processes bag windows, or only the first), tier-1 windows from VSCode/IntelliJ land in the wrong AeroSpace workspace.

The requirement is: bag windows from tier-1 integrations default to `workspaces[0]` unless explicitly routed by a `source` command in a specific workspace entry. If routing is not explicitly coded, the default-to-first behavior must be enforced by the schema or by the loop — not by accident.

**Why it happens:**
The v0.11.0 implementation processes bag windows in one step (Step 2) and command-sourced windows in another step (Step 3). In the multi-workspace loop, developers naturally process both steps for each entry without tracking which bag windows have already been routed. There is no "consumed" flag on ArtifactBag entries — an entry can be read any number of times. This makes it easy to write a loop that double-routes.

**How to avoid:**
Assign bag window routing to exactly one workspace entry. The simplest safe approach: process bag windows only for `workspaces[0]` unconditionally, then process commands for each entry independently. If a later workspace entry needs a specific bag window, it uses a `source` command entry — which already handles the move-to-workspace step.

Alternatively, add a `bag_windows: true | false` field (default `true` on `workspaces[0]`, `false` on all others) to make routing explicit. This is more configurable but adds schema complexity.

**Warning signs:**
- The multi-workspace loop calls the bag-iteration block (the `for (const artifact of Object.values(bag))` block) unconditionally for every entry
- No test that sets up two workspace entries and verifies each bag window is moved to exactly one target
- A test with two entries and one bag window that passes when the window appears in `movedWindows` twice (one per entry)

**Phase to address:**
Schema + core loop implementation phase. The routing rule must be in the design spec before code is written, not discovered during test failures.

---

### Pitfall 2: `listWorkspaces()` Called Once Per Entry — N Subprocess Calls for N Workspace Entries

**What goes wrong:**
The current `open()` calls `listWorkspaces()` once to validate the target workspace exists. In a multi-workspace loop, naively calling `listWorkspaces()` once per entry spawns one `aerospace list-workspaces` subprocess per entry. With 4 workspace entries, that is 4 process spawns that all return the same data.

More critically: if `flattenWorkspaceTree(targetWorkspace)` is called per entry, and `listWindows()` is called per entry for layout application, the total subprocess count per `git-stacks open` call grows linearly with the number of workspace entries. On a slow machine or with AeroSpace under load, this can add several seconds to workspace open time.

**Why it happens:**
The sequential processing requirement ("iterate workspaces array in order") reads naturally as "run the full current `open()` body in a loop." The existing body calls `listWorkspaces()`, `flattenWorkspaceTree()`, and `listWindows()` with no caching. Wrapping in a loop inherits all of them uncached.

**How to avoid:**
Hoist `listWorkspaces()` and the initial `isAerospaceRunning()` check out of the loop. Call them once before the loop starts, validate all targets up front, and pass the result into each iteration. Similarly, cache the pre-loop `listWindows()` call if needed for layout — though layout requires a post-move window list, so caching the pre-loop snapshot is only useful for the "does this workspace have any windows" check.

```typescript
// Correct pattern:
const running = await isAerospaceRunning()
if (!running) return null
const workspaces = await listWorkspaces()

for (const entry of config.workspaces) {
  const exists = workspaces.some(ws => ws.workspace === entry.workspace)
  if (!exists) { warn(…); continue }
  // ... per-entry logic
}
```

**Warning signs:**
- `listWorkspaces()` call inside the workspace-entry loop
- `isAerospaceRunning()` call inside the workspace-entry loop
- No test counting how many times `mockListWorkspaces` was called for a 3-entry config

**Phase to address:**
Core loop implementation phase. Structure the loop with hoisted pre-checks before writing any per-entry logic.

---

### Pitfall 3: Focus Stealing — Multiple Workspace Entries With `focus: true`, Last One Wins Silently

**What goes wrong:**
The requirement states at most one workspace entry may have `focus: true`. If the schema does not enforce this and the loop processes entries sequentially, each entry with `focus: true` calls `_exec.run(["workspace", targetWorkspace])`, switching AeroSpace focus mid-processing. The result: the last `focus: true` entry wins, overriding all previous focus operations. Earlier focus calls wasted subprocess calls and may have disrupted layout application on subsequent entries (layout requires a window focus call to set context).

A subtler form: a workspace entry has `focus: true` AND a `commands` entry with `focus: true`. Both the workspace-level focus and the window-level focus fire. The window focus runs after the workspace focus (`focusWindow()` after `_exec.run(["workspace", ...])`). This is correct within one entry but if another entry has `focus: true`, the workspace-level focus of the second entry then overrides the window-level focus of the first.

**Why it happens:**
Focus validation is only needed in the multi-workspace case — single entry has no conflict. When adding multi-workspace support, it is easy to forget to add the validation because the single-entry test suite passes without it. The schema change is mechanical (add `workspaces` array) but the cross-entry constraint is a new concern that the original schema had no concept of.

**How to avoid:**
Add a Zod `.superRefine()` or `.refine()` on the `workspaces` array schema that counts entries with `focus: true` and rejects if count > 1:

```typescript
z.array(aerospaceWorkspaceEntrySchema).refine(
  (entries) => entries.filter(e => e.focus === true).length <= 1,
  { message: "At most one workspace entry may have focus: true" }
)
```

This must trigger at `aerospaceConfigSchema.safeParse()` time in `open()`, so invalid configs are caught before any subprocess calls are made.

**Warning signs:**
- `workspaces` array schema that validates each entry independently but has no cross-entry constraint
- `open()` that calls `_exec.run(["workspace", ...])` per-entry without a pre-check that only one entry has `focus: true`
- No test: two entries with `focus: true` → parse fails with specific message

**Phase to address:**
Schema definition phase. The `.refine()` must be on the array schema, not on individual entries.

---

### Pitfall 4: Snapshot-Delta Interference — Concurrent `snapshotWindowIds` Polls Merge New Windows From Different Entries

**What goes wrong:**
`snapshotWindowIds` takes a before-snapshot, spawns an app, then polls `listWindows()` until new IDs appear. In a multi-workspace loop, if entry A's `snapshotWindowIds` poll is still running (has not returned because the app is slow) when entry B starts its own `snapshotWindowIds` call, both polls may detect the same new window ID. Entry A returns `[winId]`, entry B also returns `[winId]` (because the window appeared during its polling window). Both entries try to move `winId` to their respective target workspaces. The second `move-node-to-workspace` call wins — the window ends up in entry B's workspace regardless of which entry launched it.

In practice the current loop is sequential (not concurrent), so entry B's poll does not start until entry A's commands finish. But if entry A has a slow app (`timeout: 10s`), entry B is blocked for 10 seconds. If someone refactors the loop to `Promise.all` for performance, the race becomes active.

**Why it happens:**
The snapshot strategy was designed for single-entry use. Each call to `snapshotWindowIds` takes a fresh `before` snapshot that includes all windows visible at that instant — including ones that entry A just launched and moved. If entry A launched a terminal and moved it to workspace "dev", that window is now in the global window list. Entry B's before-snapshot includes it. Entry B's poll will not re-detect it as new. This is actually correct behavior. The real risk is the concurrent case above.

A secondary risk with sequential processing: if entry A's app launch produces 2 windows quickly (e.g., VSCode main window + status bar window), `snapshotWindowIds` returns both. Entry A moves both to its target. Entry B's before-snapshot now includes both. Entry B's subsequent commands launch a different app, and all is correct. This case is safe.

**How to avoid:**
Keep the loop sequential. Do not introduce `Promise.all` over workspace entries. Document the reason:

```typescript
// Sequential: snapshotWindowIds polls are not concurrent-safe across entries.
// Promise.all would cause delta interference for apps that launch slowly.
for (const entry of config.workspaces) { ... }
```

If a future performance optimization introduces parallelism, each parallel task must take its own `before` snapshot at the start of its execution (before any other task launches a window), not at a shared pre-loop snapshot point. This is a hard constraint.

**Warning signs:**
- `await Promise.all(config.workspaces.map(entry => processEntry(entry)))` anywhere in `open()`
- A performance comment like "parallelize for speed" without acknowledging the snapshot interference risk
- No test that verifies entry B's `snapshotWindowIds` before-snapshot includes windows launched by entry A

**Phase to address:**
Core loop implementation phase. The sequential constraint must be called out in a code comment so it is not "optimized away" later.

---

### Pitfall 5: Layout Focus Contamination — `focusWindow()` for Layout Context Switches AeroSpace Focus Between Entries

**What goes wrong:**
The current `open()` Step 4 (layout application) calls `focusWindow(targetWindow.windowId)` to set AeroSpace context before calling `setLayout(layout)`. The `focus` command in AeroSpace moves the user's visible focus to that window — it is not a silent internal context set. In a multi-workspace loop:

- Entry A focuses a window in workspace "dev" to apply its layout → user's AeroSpace focus is now on workspace "dev"
- Entry B focuses a window in workspace "tools" to apply its layout → user's AeroSpace focus is now on workspace "tools"
- Entry C has `focus: false` but its layout step focuses a window in workspace "chat" → user ends up on "chat" even though no entry requested focus

If only entry A should be the final focus (it has `focus: true`), the layout focus calls for B and C override it mid-loop, and then entry A's workspace focus call at the end of its processing restores focus correctly. But if entry A is processed before B and C, A's workspace focus fires before B and C's layout focus calls, so the net result is focus on C's workspace, not A's.

**Why it happens:**
The layout implementation unconditionally calls `focusWindow()` to establish context for `setLayout()`. In the single-workspace case, this is fine — the final focus call immediately follows in Step 5. In multi-workspace, layout focus for each entry interferes with the ordered focus intent.

**How to avoid:**
Two options:
1. Defer all `focus: true` workspace switching to after the loop completes. Process all entries first (flatten, move windows, commands, layout — including the layout-context `focusWindow()` calls), then at the very end switch to the designated workspace if any entry had `focus: true`.
2. Use `--window-id` variant of `setLayout` (already supported: `setLayout(layout, windowId)`) which does not require a prior `focusWindow()` call. Check if AeroSpace's `layout --window-id` works without focus context (verified: `aerospace layout h_tiles --window-id 123` is supported syntax in `src/lib/aerospace.ts:setLayout()`).

Option 2 is cleaner: pass `windowId` to `setLayout` and remove the `focusWindow()` call from the layout step. This eliminates the focus contamination entirely.

**Warning signs:**
- Layout step calls `focusWindow()` then `setLayout()` without `windowId` inside the per-entry loop
- No test: two entries both with layouts → verify final focus state matches the entry with `focus: true`, not the entry processed last in the layout step

**Phase to address:**
Core loop implementation phase. Decide between option 1 (deferred focus) or option 2 (windowId-aware setLayout) before writing the loop.

---

### Pitfall 6: Schema Migration — `workspace: "dev"` (v0.11.0 flat) Silently Drops to No-Op When `workspaces` Array Replaces It

**What goes wrong:**
The v0.11.0 config shape is:
```yaml
settings:
  integrations:
    aerospace:
      workspace: "dev"
      layout: h_tiles
```

The v0.12.0 shape will be:
```yaml
settings:
  integrations:
    aerospace:
      workspaces:
        - workspace: "dev"
          layout: h_tiles
```

If the new schema parses the `workspaces` field and the old flat `workspace` field is gone, existing v0.11.0 YAML files silently parse to a config with no workspace entries. The integration skips entirely with no warning. The user sees no AeroSpace setup on `git-stacks open`, with no explanation.

The milestone context says "breaking change: replacing flat config with workspaces array (no backward compat)." Even with no backward compat, the failure must be loud — not silent.

**Why it happens:**
Zod's `.optional()` on `workspaces` means an empty or absent array parses successfully. The `open()` method checks `if (!parsedConfig?.workspace)` in v0.11.0 — in v0.12.0, if the check becomes `if (!parsedConfig?.workspaces?.length)`, a user with old-style `workspace: "dev"` config gets a silent no-op.

**How to avoid:**
Add an explicit detection and error path for the old flat-config shape. In `open()`, after parsing:

```typescript
// Detect v0.11.0 config shape (flat `workspace` field without `workspaces` array)
if (!parsedConfig?.workspaces?.length) {
  const hasLegacyField = 'workspace' in (rawConfig ?? {})
  if (hasLegacyField) {
    p.log.warn(`AeroSpace: config uses v0.11.0 format (flat 'workspace' field). Update to 'workspaces' array format.`)
  } else {
    spinner?.stop("AeroSpace: no workspaces configured — skipped")
  }
  return null
}
```

This way users with old YAML get an actionable migration message instead of a silent skip.

**Warning signs:**
- `open()` that checks `!parsedConfig?.workspaces?.length` and returns null without checking for legacy `workspace` field
- No test: v0.11.0-style YAML with flat `workspace: "dev"` → warn is emitted, not silent skip
- No `bun run test` run against the existing `backward compatibility` test block — the v0.11.0 test at line 721 of `aerospace.test.ts` will fail after the schema migration and must be either updated or removed explicitly

**Phase to address:**
Schema definition phase. The legacy detection path must be part of the schema change, not a follow-up fix.

---

### Pitfall 7: `snapshotWindowIds` Polling Finds Windows From Previous Entry's App Launch

**What goes wrong:**
The `snapshotWindowIds` function in `src/lib/aerospace.ts` takes a before-snapshot, calls `spawnFn()`, then polls until `after.filter(id => !before.has(id)).length > 0` returns true. In the multi-workspace loop, if entry A launches an app that is slow to produce a window (> 200ms), entry A's `snapshotWindowIds` call times out and returns `[]`. Entry A proceeds without moving any windows.

Entry B then starts. Entry B's `snapshotWindowIds` takes a before-snapshot. The slow app from entry A NOW appears as a new window (it finished launching during entry B's before-snapshot delay). Entry B's poll immediately finds the app from entry A as a "new" window and returns its ID. Entry B moves that window to its workspace target — the wrong target.

This is a cross-entry delta contamination at the timing boundary, distinct from the concurrent-snapshot case in Pitfall 4.

**Why it happens:**
`snapshotWindowIds` is stateless — it has no memory of what entry A launched. Entry B's before-snapshot includes everything currently visible. When a slow app appears between entry A's timeout and entry B's first poll, it looks exactly like a new window launched by entry B.

**How to avoid:**
Track a "globally seen window IDs" set across all entries. Initialize it once before the loop with a `listWindows()` call. Pass it as the baseline for each entry's delta detection instead of taking a fresh `listWindows()` call at the start of each entry's `snapshotWindowIds`. Update the set after each entry completes its commands.

This requires either:
- A custom snapshot function that accepts an external `before` set (modify `snapshotWindowIds` to accept `beforeSet?: Set<number>` in `SnapshotOpts`), or
- Inline snapshot logic inside the multi-workspace loop rather than delegating to `snapshotWindowIds`

The injectable `_listWindows` in `SnapshotOpts` is already there for test isolation, but `beforeSet` injection would need to be added.

**Warning signs:**
- Multi-workspace loop where each entry calls `snapshotWindowIds` independently with no shared before-set
- No test: entry A launches slow app that times out, entry B's `snapshotWindowIds` detects it as new
- The existing `snapshotWindowIds` signature not extended with `beforeSet` option

**Phase to address:**
Core loop implementation phase. The shared before-set pattern must be designed before writing the per-entry command processing.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Process bag windows in every entry's loop iteration | Simple uniform loop body | Every bag window moved to every AeroSpace workspace; wrong UX for 2+ entries | Never — route bag windows to workspaces[0] only (or explicit source commands) |
| Call `listWorkspaces()` per entry | Simple reads | N subprocess calls for N entries; adds 200-500ms per extra entry | Never — hoist before loop |
| Allow `focus: true` on multiple entries without validation | No Zod refine needed | Last-processed entry wins focus; user intent violated silently | Never — enforce at schema level |
| Use `focusWindow()` before `setLayout()` in multi-workspace loop | Matches current single-entry pattern | Focus contamination between entries; final focus lands on last-layout entry | Never — use `setLayout(layout, windowId)` or defer all workspace focus to post-loop |
| Sequential `snapshotWindowIds` per entry with independent before-sets | Simple — reuses existing function unchanged | Slow-app IDs from entry A detected as new by entry B; wrong workspace routing | Never — pass shared before-set or use global seen-set |
| Skip legacy `workspace` field detection | Simpler schema change | v0.11.0 users get silent no-op; no migration guidance | Never — explicit warning required |
| `Promise.all` for parallel entry processing | Faster open for many entries | Snapshot delta interference; order-dependent race for focus | Never — entries must be sequential |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AeroSpace `workspaces` loop | Process bag windows per-entry | Route bag windows to `workspaces[0]` only; subsequent entries use `source` commands |
| AeroSpace multi-entry validation | Validate each entry independently | Add `z.array(...).refine(entries => entries.filter(e => e.focus).length <= 1)` on the array |
| AeroSpace `listWorkspaces()` | Call inside entry loop | Call once before loop; pass results into loop |
| AeroSpace `focusWindow()` in layout step | Call per-entry for layout context | Use `setLayout(layout, windowId)` to avoid focus side effects during layout application |
| AeroSpace `snapshotWindowIds` cross-entry | Fresh before-set per entry | Pass shared global before-set accumulated across entries; update after each entry |
| AeroSpace legacy config detection | Silent no-op on old `workspace` field | Detect old flat field; warn with migration instructions |
| AeroSpace workspace focus ordering | Fire `_exec.run(["workspace", ...])` per-entry during loop | Collect the focus target and fire exactly once after all entries complete |
| Bun `mock.module` test isolation | Existing test file structure unchanged for multi-workspace tests | New `beforeEach` state for `workspaces`-array configs; extend existing mock file, do not create parallel one |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `listWorkspaces()` inside entry loop | Open time grows linearly with entry count | Hoist `listWorkspaces()` before loop; pass results as argument | With 3+ entries (~600ms overhead) |
| `isAerospaceRunning()` inside entry loop | Multiple `which aerospace` spawns | Hoist to top of `open()`; existing code already does this for single-entry; ensure refactor keeps it outside loop | With 2+ entries |
| Snapshot polling timeout per entry (10s each) | `git-stacks open` hangs for up to N×10s when apps are slow | Share global before-set; a window that did not appear for entry A is still detectable by entry B's delta | With N entries where any app is slow |
| `listWindows()` call for layout per entry | N list-windows calls during layout phase | Call `listWindows()` once after all moves complete; filter per workspace target | With 4+ entries |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Per-entry `workspace` name from `workspaces[i].workspace` passed to shell via string interpolation | Shell injection if name has metacharacters | Already blocked by NameSchema at YAML parse time; pass as positional arg to `_exec.run([..., workspaceName])` — maintain existing pattern |
| Duplicate workspace names in `workspaces` array | Two entries target the same AeroSpace workspace; second entry's flatten destroys first entry's layout | Add `.refine(entries => new Set(entries.map(e => e.workspace)).size === entries.length)` to workspaces array schema |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent no-op when v0.11.0 `workspace` flat field is present | User loses AeroSpace integration with no explanation after upgrade | Detect legacy field; emit actionable warning with migration example |
| `flatten_before_open: true` on multiple entries | Second entry's flatten resets layout applied by first entry | Document: `flatten_before_open` should only be on the first entry that targets a given AeroSpace workspace; warn if two entries target same workspace both with `flatten_before_open: true` |
| Focus switches N times during open (N entries with `focus: true`) | Visible flicker as AeroSpace switches workspaces mid-setup | Schema validates at most 1; focus deferred to post-loop |
| Spinner message shows only first workspace name | User cannot see progress across entries | Update spinner text per entry: `"AeroSpace: setting up workspace 'dev' (1/3)"` |

---

## "Looks Done But Isn't" Checklist

- [ ] **Bag window routing:** Test with two entries and one VSCode artifact — verify the window is moved to exactly one AeroSpace workspace (the first entry's target), not both
- [ ] **`focus: true` validation:** Parse a `workspaces` array with two `focus: true` entries — verify `.safeParse()` returns `success: false` with a message about at most one focus
- [ ] **Duplicate workspace names:** Parse a `workspaces` array with two entries targeting `"dev"` — verify `.safeParse()` returns `success: false`
- [ ] **`listWorkspaces()` call count:** Run `open()` with a 3-entry config — verify `mockListWorkspaces` was called exactly once (not 3 times)
- [ ] **Legacy config warning:** Parse v0.11.0-style `{ workspace: "dev" }` config in v0.12.0 — verify a warning is logged, not a silent skip
- [ ] **Sequential entry ordering:** Entries are processed in array order — verify via call-order tracking that entry[0]'s `flattenWorkspaceTree` is called before entry[1]'s
- [ ] **Focus deferred to post-loop:** Entry[0] has `focus: true`, entry[1] has `layout: h_tiles` — verify `_exec.run(["workspace", ...])` is called AFTER entry[1]'s layout step, not during entry[0]'s processing
- [ ] **Cross-entry snapshot pollution:** Entry[0] launches a slow app (times out), entry[1] launches a fast app — verify entry[1]'s `snapshotWindowIds` only returns the fast app's window ID, not the slow app's ID that appeared after entry[0]'s timeout
- [ ] **`setLayout` uses `windowId`:** In layout step, `setLayout` is called with `windowId` argument — no bare `focusWindow()` call in the multi-workspace path
- [ ] **Existing backward-compat test updated:** The `backward compatibility` describe block in `aerospace.test.ts` is updated to use `workspaces: [{ workspace: "dev" }]` format, and the old flat-field test case is explicitly removed with a comment

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bag windows moved to every entry | LOW | Fix routing logic; no state persisted in YAML; user manually moves windows back |
| `focus: true` on multiple entries, last wins | LOW | Add schema validation; user updates config; no YAML migration |
| `listWorkspaces()` called per entry | LOW | Hoist before loop; no behavior change, only performance fix |
| Focus contamination from layout step | MEDIUM | Switch to `setLayout(layout, windowId)` or post-loop focus; verify with test |
| Cross-entry snapshot pollution | MEDIUM | Add shared before-set to `SnapshotOpts`; requires `snapshotWindowIds` signature change |
| v0.11.0 config silently no-ops | HIGH | Users lose integration silently; requires doc + warning message; no automated migration possible |
| Concurrent loop introduced later | HIGH | Any future `Promise.all` refactor breaks snapshot correctness; sequential constraint must be commented |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Bag window double-routing | Schema + loop design phase | Test: 2 entries + 1 VSCode artifact → `movedWindows` length === 1 |
| `listWorkspaces()` per-entry overhead | Core loop implementation phase | Test: 3-entry config → `mockListWorkspaces.mock.calls.length === 1` |
| Multiple `focus: true` entries | Schema definition phase | Test: array with 2 focus entries → `safeParse().success === false` |
| Layout focus contamination across entries | Core loop implementation phase | Test: 2 entries with layouts + 1 with `focus: true` → final focus is on correct workspace |
| Cross-entry snapshot pollution | Core loop implementation phase | Test: entry[0] times out, entry[1] detects only its own app |
| Legacy `workspace` flat field | Schema definition phase | Test: old-format config → warn logged, not silent skip |
| Sequential constraint violated | Code review / documentation | Comment on loop; no `Promise.all` for entry processing |
| Duplicate workspace names | Schema definition phase | Test: 2 entries with same `workspace` value → `safeParse().success === false` |

---

## Sources

- `src/lib/integrations/aerospace.ts` lines 98-288 — full `open()` method sequence: gate check, config parse, validation, flatten, bag window move, commands, layout, focus
- `src/lib/aerospace.ts` lines 214-241 — `snapshotWindowIds()` implementation: before-snapshot, spawnFn, exponential backoff poll
- `src/lib/aerospace.ts` lines 182-188 — `setLayout(layout, windowId?)` accepts optional `windowId` — enables focus-free layout application
- `tests/lib/integrations/aerospace.test.ts` lines 112-132 — `beforeEach` reset pattern; test structure to extend for multi-workspace
- `tests/lib/integrations/aerospace.test.ts` lines 721-740 — existing `backward compatibility` block that will fail after schema migration and must be explicitly updated
- `src/lib/integrations/runner.ts` lines 21-62 — WindowDetector snapshot lifecycle: `begin()` before each `open()` call, `resolve()` after; relevant because WindowDetector's `begin()` also takes a before-snapshot — a second snapshot source to keep consistent with the shared-before-set strategy
- `src/lib/integrations/types.ts` lines 17-29 — `ArtifactBag` is `Record<string, IntegrationArtifact | null>` with no "consumed" flag; multiple entries can read the same bag entry freely
- `.planning/PROJECT.md` lines 185-187 — v0.12.0 active requirements: `workspaces` array, focus validation, tier-1 windows default to `workspaces[0]`, sequential processing

---
*Pitfalls research for: v0.12.0 — multi-workspace AeroSpace support in git-stacks*
*Researched: 2026-03-29*
