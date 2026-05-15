# Phase 85 Coverage Review

## Command

- `bun run coverage`

## Canonical Artifacts

- `.coverage/coverage-final.json`
- `.coverage/coverage-summary.json`
- `.coverage/lcov.info`
- `.coverage/index.html`

## Result

- Unit tests: 45/45 passed
- Integration tests: 69/69 passed
- Overall statement coverage: 66.93%
- Overall branch coverage: 58.11%
- Overall function coverage: 68.23%
- Overall line coverage: 69.3%

## Targeted Core Source Evidence

Coverage was inspected from `.coverage/coverage-final.json` and cross-checked against `.coverage/coverage-summary.json`.

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `src/lib/workspace-ops.ts` | 128/173 (73.98%) | 47/86 (54.65%) | 13/16 (81.25%) | 122/159 (76.72%) |
| `src/lib/git.ts` | 133/157 (84.71%) | 86/115 (74.78%) | 25/28 (89.28%) | 126/148 (85.13%) |
| `src/lib/lifecycle.ts` | 35/40 (87.5%) | 26/34 (76.47%) | 4/4 (100%) | 33/34 (97.05%) |
| `src/lib/files.ts` | 82/88 (93.18%) | 60/68 (88.23%) | 12/12 (100%) | 74/74 (100%) |
| `src/lib/env.ts` | 41/41 (100%) | 19/20 (95%) | 12/12 (100%) | 37/37 (100%) |
| `src/lib/secrets.ts` | 82/103 (79.61%) | 40/65 (61.53%) | 14/15 (93.33%) | 75/95 (78.94%) |
| `src/lib/ports.ts` | 125/138 (90.57%) | 59/70 (84.28%) | 14/16 (87.5%) | 111/119 (93.27%) |
| `src/lib/config.ts` | 148/168 (88.09%) | 44/61 (72.13%) | 33/34 (97.05%) | 136/148 (91.89%) |

All targeted files have nonzero source execution in the canonical coverage artifact. The strongest remaining Phase 85-relevant gaps are small stable branches in core helpers rather than broad command or TUI flows.

## Selected Focused Gaps

1. `src/lib/secrets.ts`
   - Cover keychain path validation for malformed `key=value` syntax.
   - Cover platform command construction for Linux and macOS keychain resolver commands.
   - Cover resolver list construction when config repeats resolver IDs or includes unknown IDs.

2. `src/lib/ports.ts`
   - Cover bounded port block selection failure when no contiguous block exists.
   - Cover env-file conflict handling for comments, malformed lines, and conflicting keys read from a real repo path.

3. `src/lib/git.ts`
   - Cover remote branch disappearance detection against a real bare remote.
   - Cover fast-forward merge helper success and failure paths with real git repositories.

4. `src/lib/config.ts`
   - Cover `listRegistryEntries()` as the public read-only registry wrapper.

## Deferred Gaps

- Broad `workspace-ops` dry-run and lifecycle branches remain better exercised through existing command and real-fixture lifecycle suites than by adding more narrow unit seams.
- TUI, desktop integration, and Phase 86-88 integration-contract coverage are intentionally out of scope for Phase 85.
