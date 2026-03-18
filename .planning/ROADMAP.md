# Roadmap: git-stacks

## Milestones

- **v1.0 → v0.2.0** (archived 2026-03-18) — Foundation, file ops, version command, destructive-op safety, Stack→Registry+Template model, UX/--json/doctor --fix/run --parallel, tech debt cleanup — 61/61 requirements, 7 phases, 21 plans. See [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

## Next Milestone

To be defined. Run `/gsd:new-milestone` to start planning the next version with fresh requirements.

### Candidate themes (from v2 backlog)

- **Programmatic API** — `workspace-ops.ts` exported as typed package entry; `Result<T>` return type across all ops
- **Power user features** — PR/MR checkout (`clone --pr`), WezTerm/Zellij integrations, autocomplete prompt upgrade, per-repo ahead/behind in `status`
- **Agent-aware** — Agent status file protocol, `manage` dashboard indicators, batch workspace generation

See `.planning/milestones/v1.0-REQUIREMENTS.md` for carried-forward v2 requirements.
