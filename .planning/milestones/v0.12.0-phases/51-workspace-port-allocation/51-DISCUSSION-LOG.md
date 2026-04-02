# Phase 51: Workspace Port Allocation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 51-workspace-port-allocation
**Areas discussed:** Port declaration UX, Conflict & collision behavior, Stability vs reallocation, Template port inheritance

---

## Port Declaration UX

### Q1: How should users declare port names in the wizard?

| Option | Description | Selected |
|--------|-------------|----------|
| Comma-separated prompt | Single text prompt, user types "PORT,DEBUG_PORT" or hits enter to skip | ✓ |
| One-at-a-time loop | Repeated prompt, add one port per prompt until empty | |
| Skip wizard entirely | No wizard prompt, YAML-only | |

**User's choice:** Comma-separated prompt
**Notes:** Minimal friction, consistent with how similar multi-value inputs work.

### Q2: Can users pin a specific port number?

| Option | Description | Selected |
|--------|-------------|----------|
| Allow pinning | ports: { PORT: 3000, DEBUG: ~ } — pinned skip allocation, null auto-assigned | ✓ |
| Always auto-allocate | All ports auto-assigned from pool | |
| Pin via separate field | Separate ports: and fixed_ports: fields | |

**User's choice:** Allow pinning
**Notes:** None.

### Q3: Adding ports to existing workspaces?

| Option | Description | Selected |
|--------|-------------|----------|
| Edit YAML + re-open | Add port names manually, set to ~, run open | ✓ |
| Dedicated command | git-stacks ports add <workspace> PORT_NAME | |
| Wizard re-run | git-stacks edit <workspace> interactive editor | |

**User's choice:** Edit YAML + re-open
**Notes:** None.

---

## Conflict & Collision Behavior

### Q4: Template + workspace same port name?

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace wins | Workspace overrides template, consistent with env last-wins | ✓ |
| Error on conflict | Force user to remove duplicate | |
| Template wins unless workspace pins | More nuanced inheritance | |

**User's choice:** Workspace wins
**Notes:** None.

### Q5: Resolved port conflicts with another workspace on re-open?

| Option | Description | Selected |
|--------|-------------|----------|
| Reallocate silently | Detect and reallocate, log message | |
| Error and ask user | Error with --reallocate suggestion | ✓ |
| Reallocate with warning | Auto-reallocate but print prominent warning | |

**User's choice:** Error and ask user
**Notes:** Protects scripts/configs that hardcoded port numbers.

### Q6: --reallocate scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Only conflicting | Keep stable ports, reassign clashing ones | ✓ |
| All ports | Wipe and reallocate everything | |
| User's choice per-port | Interactive prompt per conflicting port | |

**User's choice:** Only conflicting
**Notes:** None.

---

## Stability vs Reallocation

### Q7: Global range change with existing out-of-range ports?

| Option | Description | Selected |
|--------|-------------|----------|
| Error like conflict | Same as conflict behavior, --reallocate suggestion | ✓ |
| Auto-reallocate out-of-range | Silently reallocate | |
| Ignore range for resolved | Range only applies to new allocations | |

**User's choice:** Error like conflict
**Notes:** Consistent treatment of all "port no longer valid" scenarios.

### Q8: Explicit reset of all ports?

| Option | Description | Selected |
|--------|-------------|----------|
| --reallocate | Same flag as conflict resolution, doubles as manual reset | |
| --reallocate-all | Separate flag for full wipe | |
| No explicit reset | Edit YAML to set ports back to ~ | ✓ |

**User's choice:** No explicit reset (edit YAML manually)
**Notes:** Consistent with edit-and-reopen pattern for adding ports.

---

## Template Port Inheritance

### Q9: Template adds new ports after workspace creation?

| Option | Description | Selected |
|--------|-------------|----------|
| No — snapshot at creation | Template changes don't affect existing workspaces | ✓ |
| Yes — merge on open | Re-read template and merge new port names | |
| Opt-in via sync | git-stacks sync pulls new template ports | |

**User's choice:** Snapshot at creation
**Notes:** Consistent with how repos/hooks work today.

### Q10: Contiguous allocation scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Only auto-allocated | Pinned ports outside contiguous block | ✓ |
| Full set contiguous | All ports form contiguous range | |
| No contiguity guarantee | Each port independently allocated | |

**User's choice:** Only auto-allocated
**Notes:** None.

### Q11: Pinned ports in templates creating multiple workspaces?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip conflict check for pinned | Pinned ports trusted, no collision check | |
| Use env for shared ports | Fixed well-known ports belong in env:, not ports: | ✓ |
| Add shared marker syntax | ports: { PORT: 3000! } or { value: 3000, shared: true } | |

**User's choice:** Use env for shared ports
**Notes:** User noted that templates with pinned ports can't derive more than one workspace. Clean separation: ports: for managed allocation, env: for unmanaged fixed values.

### Q12: Should pinning still be allowed given env: for shared?

| Option | Description | Selected |
|--------|-------------|----------|
| Null only | ports: only accepts ~ values | |
| Keep pinning | Pinned ports collision-checked, useful at workspace level | ✓ |

**User's choice:** Keep pinning — "if used on template it would not make sense, but if i create a workspace i still want to set a port manually sometimes"
**Notes:** Pinning is a workspace-level power move. Templates should use ~ for auto-allocation.

---

## Claude's Discretion

- Filesystem lock implementation details (timeout, stale lock detection)
- fsync addition to writeYaml
- Error message formatting
- Doctor port-conflict warnings
- Allocation algorithm internals

## Deferred Ideas

None — discussion stayed within phase scope.
