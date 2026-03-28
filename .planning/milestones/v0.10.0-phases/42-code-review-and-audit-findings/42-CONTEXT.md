# Phase 42: Code Review and Audit Findings - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Address all 7 findings from the external code review (`_references/CODE_REVIEW_REPORT.md`). Covers input validation, shell injection fixes, path escape prevention, atomic writes, shell quoting, snapshot determinism, and docs correction. Does NOT include the 3 audit completion gaps (shell completion entries for paths/pull/--template).

</domain>

<decisions>
## Implementation Decisions

### Name Validation (Finding #1 — Critical)
- **D-01:** Add a shared `NameSchema` (Zod refinement) used by workspace, template, and repo schemas
- **D-02:** Pattern: `^[A-Za-z0-9._-]+$` — reject path separators, traversal sequences, shell metacharacters
- **D-03:** Apply validation at schema level in `config.ts` so all read paths reject invalid names automatically
- **D-04:** CLI entry points that accept names as arguments should also validate before passing to business logic

### Doctor Shell Injection (Finding #2 — Critical)
- **D-05:** Replace fix strings with structured operation objects (e.g., `{ action: "remove-dir", path: string }`, `{ action: "open-workspace", name: string }`, `{ action: "remove-repo", name: string }`)
- **D-06:** Execute fixes directly via Bun APIs (`rmSync`, function calls) — no `sh -c` for fix execution
- **D-07:** Keep diagnostic output as human-readable strings; only the fix execution path changes

### env_file Path Escape (Finding #3 — High)
- **D-08:** Normalize `env_file` and reject any value that resolves outside `repo.task_path` (or `repo.main_path` for trunk mode)
- **D-09:** Check uses `path.resolve()` + `startsWith()` boundary test
- **D-10:** Apply at write time in `workspace-ops.ts` before `writeFileSync`

### Atomic Config Writes (Finding #4 — High)
- **D-11:** Modify `writeYaml()` in `config.ts` to write to a temp sibling file first, then `renameSync()` into place
- **D-12:** Apply to ALL `writeYaml` calls — single change protects everything consistently
- **D-13:** Temp file naming: `{path}.tmp` sibling in same directory (ensures same filesystem for atomic rename)

### tmux/niri Shell Quoting (Finding #5 — Medium)
- **D-14:** Quote all interpolated paths in shell commands with proper escaping
- **D-15:** For tmux `sendToTmuxPane`, use shell-escaped `cd` paths
- **D-16:** For niri layout code, quote `resolvedCwd` in shell composition

### Snapshot Time Sensitivity (Finding #6 — Medium)
- **D-17:** Freeze `Date.now()` in WorkspaceRow snapshot tests to a fixed timestamp
- **D-18:** Use Bun's `mock.module` or direct `Date.now` override so `formatAge()` produces deterministic output

### Docs Test Command (Finding #7 — Low)
- **D-19:** Update CLAUDE.md to use `bun run test` instead of `bun test tests/`
- **D-20:** Optionally add a note explaining why direct `bun test tests/` produces false failures (mock pollution)

### Claude's Discretion
- Exact shell-escaping utility function design (inline vs shared helper)
- Whether to add runtime warnings for previously-saved configs with invalid names (migration path)
- Temp file cleanup strategy if rename fails

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code Review Report
- `_references/CODE_REVIEW_REPORT.md` — Full findings with evidence, line numbers, and recommendations

### Affected Source Files
- `src/lib/config.ts` — NameSchema (D-01..D-03), writeYaml atomic writes (D-11..D-13)
- `src/commands/doctor.ts` — Structured fix ops (D-05..D-07)
- `src/lib/workspace-ops.ts` — env_file boundary check (D-08..D-10)
- `src/lib/integrations/tmux.ts` — Shell quoting (D-14..D-15)
- `src/lib/integrations/niri.ts` — Shell quoting (D-16)
- `tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx` — Snapshot fix (D-17..D-18)
- `CLAUDE.md` — Docs correction (D-19..D-20)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts` already uses Zod schemas — NameSchema can be a refinement composed into existing schemas
- `writeYaml()` is the single write path for all config — atomic write change has maximum leverage
- `src/tui/dashboard/messageUtils.ts:formatAge()` is the function snapshot tests need to stabilize

### Established Patterns
- Zod validation at read time (`readYaml` → `schema.parse`) — name validation follows the same pattern
- `{ ok: true } | { ok: false; error: string }` result types — doctor fixes should return this shape
- Bun `$` shell for git operations, `Bun.spawn` for hooks — keep consistency

### Integration Points
- NameSchema must compose into `StackSchema`, `WorkspaceSchema`, `RegistryEntrySchema` without breaking existing valid configs
- `writeYaml()` is called from `writeStack`, `writeWorkspace`, `writeGlobalConfig`, `writeRegistry` — all paths benefit from atomic writes
- Doctor fixes currently stored as `issue.fix` string — needs schema change to structured type

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow the code review report's recommendations with the decisions above.

</specifics>

<deferred>
## Deferred Ideas

- Shell completion gaps for `paths`, `pull`, `--template` — audit finding, not code review; separate quick task
- `createWorktree()` error normalization to `{ ok, error }` shape — mentioned in code review additional observations, lower priority
- `TerminalConsoleCache` listener leak warnings in dashboard tests — investigation item, not a fix

</deferred>

---

*Phase: 42-code-review-and-audit-findings*
*Context gathered: 2026-03-28*
