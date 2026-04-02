# Phase 53: Shell Completion Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 53-Shell Completion Fixes
**Areas discussed:** Arity enforcement, Enum auto-detection, Parent flag leakage, Testing strategy

---

## Arity enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Offer flags only | After all positional args filled, Tab suggests remaining unused flags | ✓ |
| Stop completely | After all positional args filled, Tab offers nothing | |
| You decide | Claude picks per shell conventions | |

**User's choice:** Offer flags only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, variadic = no limit | Commands with variadic args keep completing indefinitely | ✓ |
| Yes, variadic = file completion | Fall back to default file completion after variadic args | |
| You decide | Claude handles variadic edge cases | |

**User's choice:** Yes, variadic = no limit
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| All three (bash, zsh, fish) | Fix arity in all three shells | ✓ |
| Fish only | Fish is where bug was reported | |
| Fish + verify others | Fix fish, audit bash/zsh | |

**User's choice:** All three (bash, zsh, fish)
**Notes:** None

---

## Enum auto-detection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect from Commander | Extract .choices() from Commander options at tree-walk time | |
| Keep manual map | Audit and populate OPTION_ENUMS exhaustively | |
| Both (auto + manual override) | Auto-detect primary, OPTION_ENUMS as override/supplement | ✓ |

**User's choice:** Both (auto + manual override)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add .choices() everywhere | Update all command definitions to use .choices() | ✓ |
| No, just extract what exists | Only extract where .choices() already set | |
| You decide | Claude determines which commands benefit | |

**User's choice:** Yes, add .choices() everywhere
**Notes:** None

---

## Parent flag leakage

| Option | Description | Selected |
|--------|-------------|----------|
| Strict scoping | Only show flags defined directly on the subcommand | |
| Show inherited flags too | Show both subcommand and inherited parent flags | |
| You decide per-flag | Claude determines per-flag | |

**User's choice:** (Free text) "inherited flags are fine, but the mentioned issue is about git-stacks list vs git-stacks integration list which do not share a parent!"
**Notes:** The bug is command name collision, not parent inheritance. `--sort` and `--status` from `git-stacks list` appear in `git-stacks integration list` completions because OPTION_ENUMS are emitted globally.

| Option | Description | Selected |
|--------|-------------|----------|
| I'll reproduce it later | Skip specifics, investigate during implementation | |
| Let me describe it | User has specific scenario | |

**User's choice:** (Free text) "--sort and --status but only for completions"
**Notes:** Confirmed the specific flags that leak.

---

## Testing strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests only | String matching/regex on generated shell output | ✓ |
| Unit + snapshot tests | Unit tests plus full output snapshots | |
| You decide | Claude picks testing approach | |

**User's choice:** Unit tests only
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, extend mock program | Add scenarios to existing buildTestProgram() | |
| Separate test programs | Focused mini-programs per bug for isolation | ✓ |
| You decide | Claude structures for best coverage | |

**User's choice:** Separate test programs
**Notes:** None

---

## Claude's Discretion

- Exact shell script structure for arity guards in each shell
- How to extract `.choices()` from Commander option objects (API details)
- Specific regex/string assertions in test cases

## Deferred Ideas

- `git-stacks env` command — Phase 54
- Copilot hook support — Phase 55
- Tmux config example — Phase 56
- `--status` flag fix for `git-stacks list` — out of scope for v0.13.0
