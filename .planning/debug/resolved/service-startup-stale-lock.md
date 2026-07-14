---
status: resolved
trigger: "git-stacks web times out waiting for service startup"
created: 2026-07-14
updated: 2026-07-14
---

# Debug Session: Service startup stale lock

## Symptoms

- `git-stacks web` throws `Timed out waiting for service startup` from `startManagedService`.
- The failure repeats without starting a service.

## Evidence

- `~/.config/git-stacks/service/startup.lock` exists as an empty mode-0600 file.
- No `descriptor.json` exists.
- No git-stacks service or web process is alive.
- The current startup loop treats every existing lock as active and gives up after 100 five-millisecond retries.

## Current Focus

- hypothesis: confirmed; an interrupted owner left an unidentifiable lock that could never be reclaimed automatically
- test: owner metadata plus dead-owner and legacy-incomplete recovery
- expecting: confirmed; crash leftovers no longer block startup
- next_action: none

## Resolution

- root_cause: startup used an empty exclusive-create lock and only removed it in the owning process's `finally`; interruption could leave the empty file permanently, and later launchers had no owner identity to validate.
- fix: startup locks now contain PID, nonce, and creation time; dead owners are reclaimed immediately, legacy/incomplete locks are reclaimed after a short write grace period, unsafe lock types fail closed, and release removes only the current nonce.
- verification: the focused discovery suite covers legacy empty and dead-PID locks; full tests, TypeScript checks, web TypeScript, and dependency checks pass. A real `git-stacks web --no-open --json` launch against the normal config started PID 1211220 at `http://127.0.0.1:44963/`, removed the startup lock, served `/web/` with HTTP 200, and opened the browser.
- files_changed: `src/service/main.ts`, `tests/service/discovery.test.ts`
