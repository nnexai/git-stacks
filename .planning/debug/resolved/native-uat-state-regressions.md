---
status: resolved
trigger: "Phase 107 human UAT exposed pinning, title-update navigation, attention, active-tab close, provider-copy, and native environment identity failures."
created: 2026-07-12
updated: 2026-07-12
---

# Native UAT state regressions

## Resolution

- root_cause: Projection-wide title refreshes destroyed active sidebar controls; keyboard close used cached model selection; legacy attention was rejected; structured lifecycle updates were discarded; generated hooks called a nonexistent command with nonexistent environment variables; native environment buffers were not null-terminated.
- fix: Targeted tab-title updates, visible-page close targeting, compatible attention decoding/update semantics, a real authenticated publication command and endpoint, provider-specific hook copy, correct exported identity variables, sidebar unread badges, and zero-initialized Ghostty environment storage.
- verification: Focused reducer/client/service tests, executable hook-to-service integration coverage, repeated workspace lifecycle smoke with rapid title changes, full native verification, repository gates, and final human GTK UAT all passed.
- files_changed: native/core/reducer.zig, native/linux/app.zig, native/linux/service_client.zig, native/linux/ghostty_surface.zig, src/commands/service.ts, src/lib/agent-hooks/types.ts, src/service/main.ts, src/service/server.ts, native/tests, tests/service/events.test.ts, hook and gate tests.
