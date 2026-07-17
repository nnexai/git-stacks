---
phase: 127
slug: stale-workspace-intelligence-and-rc-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 127 — Validation Strategy

> Adversarial validation contract for explainable stale-workspace evidence, revision/cache safety, canonical lifecycle reuse, cross-client parity, and release-candidate closure without release side effects.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 for Node unit/integration/browser-support; native `node:test` for architecture/conformance/runtime; Bun 1.3.14 isolated OpenTUI tests |
| **Config file** | `vitest.config.ts`; TUI isolation through `scripts/test-tui.mjs` |
| **Quick run command** | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts` |
| **TUI command** | `npm run test:tui` — never run one combined Bun suite directly |
| **Pre-metadata product gate** | `npm run test:vitest && npm run test:node && npm run coverage && npm run typecheck && npm run test:architecture && npm run test:deps && npm run web:build && npm run tui:build` in Plan 127-09 |
| **Post-manifest/post-doc full suite** | `npm test` in Plan 127-11 only after Plans 127-10 and 127-11 outputs land |
| **RC validation** | `npm run release:check` without `--tag`, first in Plan 127-11 and repeated against the frozen candidate in Plan 127-12 |
| **Estimated quick runtime** | ~120 seconds after focused files exist |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest or `node --test` file plus the affected package typecheck; TUI tasks run `npm run test:tui`.
- **After every plan wave:** Run all landed Phase 127 focused suites plus `npm run build:packages`, `npm run typecheck`, `npm run test:architecture`, and `npm run test:deps`.
- **After service/router work:** Run revision-before-probe, cache-generation, sanitization, and no-mutation cases together.
- **After either UI surface:** Run the matching DOM/render/key suite, package build, and cross-client conformance fixture.
- **Before candidate freeze:** Plan 127-11 must run the first complete `npm test` and `npm run release:check` without `--tag` only after the RC manifests/lockfile and changelog/docs are present; Plan 127-12 repeats `release:check` against the exact frozen candidate SHA.
- **Max focused feedback latency:** 180 seconds; split focused commands rather than using watch mode.

---

## Per-Task Verification Map

This map matches the executable Plans 127-01 through 127-14, their Waves 0-11, declared dependencies, automated commands, and the two blocking human checkpoints. Status remains pending until execution produces the exact receipt.

| Task ID | Plan | Wave | Depends on | Requirements | Verification focus | Automated command | Human gate | Status |
|---|---:|---:|---|---|---|---|---|---|
| 127-01-01 | 01 | 0 | — | STALE-01/02/03/05 | Fixtures plus strict runtime Zod RED matrix | `node --experimental-strip-types --input-type=module -e "const m=await import('./tests/helpers/phase127-stale-fixtures.ts'); if (!m) process.exit(1); if (Object.keys(m).length < 6) process.exit(1)" && npx vitest run tests/service/web-stale-workspaces-schema.test.ts` | — | pending |
| 127-01-02 | 01 | 0 | — | STALE-01/05 | Read-only GitHub/GitLab and bounded abortable remote-branch RED matrices | `npx vitest run tests/lib/core/forge-change-status.test.ts tests/lib/core/remote-branch-status.test.ts` | — | pending |
| 127-01-03 | 01 | 0 | — | STALE-01/02/03/05 | Policy/cache/revision/no-mutation RED matrix | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` | — | pending |
| 127-02-01 | 02 | 0 | — | STALE-02/04/05 | Web/TUI state, focus, responsive, key, lifecycle RED matrix | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts && npm run test:tui` | — | pending |
| 127-02-02 | 02 | 0 | — | STALE-02/03/04/05 | Cross-client and hostile authority RED matrix | `node --test tests/architecture/phase127-stale-authority.test.mjs && npx vitest run tests/service/phase127-cross-client-conformance.test.ts` | — | pending |
| 127-02-03 | 02 | 0 | — | REL-01/02 | Isolated named pre-metadata release-authority/default-package/planning-tree fence; historical temp-tag fixture excluded | `node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts -t "Phase 127 pre-metadata release authority"` | — | pending |
| 127-03-01 | 03 | 1 | 127-01 | STALE-01/02/05 | Runtime stale schemas green plus protocol typecheck | `npx vitest run tests/service/web-stale-workspaces-schema.test.ts && npm run typecheck --workspace @git-stacks/protocol` | — | pending |
| 127-03-02 | 03 | 1 | 127-01 | STALE-01/05 | Provider status green plus core typecheck | `npx vitest run tests/lib/core/forge-change-status.test.ts && npm run typecheck --workspace @git-stacks/core` | — | pending |
| 127-04-01 | 04 | 2 | 127-01, 127-03 | STALE-01/02/03/05 | Pure qualification/ranking/timestamp behavior | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` | — | pending |
| 127-04-02 | 04 | 2 | 127-01, 127-03 | STALE-01/02/03/05 | Captured-read-model evaluator, abortable remote probe, TTL, generations, revision, no mutation | `npx vitest run tests/lib/core/remote-branch-status.test.ts && GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts && npm run typecheck --workspace @git-stacks/core && npm run typecheck --workspace @git-stacks/service` | — | pending |
| 127-05-01 | 05 | 3 | 127-01, 127-04 | STALE-01/02/03/05 | Allowlist projection and trusted client | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts && npm run typecheck --workspace @git-stacks/service` | — | pending |
| 127-05-02 | 05 | 3 | 127-01, 127-04 | STALE-01/02/03/05 | Revision-first route, one captured read model, abort propagation, and service-lifetime cache | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts && GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` | — | pending |
| 127-06-01 | 06 | 4 | 127-02, 127-05 | STALE-02/04/05 | Shared labels, timestamps, generations, one-conflict retry | `npx vitest run tests/service/phase127-cross-client-conformance.test.ts && npm run typecheck --workspace @git-stacks/client` | — | pending |
| 127-06-02 | 06 | 4 | 127-02, 127-05 | STALE-02/04/05 | Atomic global stale entry across protocol/core/client plus distinct scoped refresh registry | `npx vitest run tests/service/web-shortcut-contract.test.ts tests/lib/web-shortcut-config.test.ts tests/lib/client-shortcuts.test.ts tests/service/phase127-cross-client-conformance.test.ts && npm run typecheck --workspace @git-stacks/protocol && npm run typecheck --workspace @git-stacks/core && npm run typecheck --workspace @git-stacks/client && npm run build --workspace @git-stacks/client` | — | pending |
| 127-06-03 | 06 | 4 | 127-02, 127-05 | STALE-02/04/05 | Trusted TUI stale fetch and generation gate | `npx vitest run tests/service/phase127-cross-client-conformance.test.ts && npm run typecheck --workspace @git-stacks/tui` | — | pending |
| 127-07-01 | 07 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | Web retained-data state machine | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts` | — | pending |
| 127-07-02 | 07 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | Singleton/focus/shortcut/Open/lifecycle integration | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts && npm run typecheck --workspace @git-stacks/web` | — | pending |
| 127-07-03 | 07 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | Responsive/overflow/long-text contract | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts && npm run web:build` | — | pending |
| 127-08-01 | 08 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | Width-tiered pure OpenTUI rendering | `npm run test:tui` | — | pending |
| 127-08-02 | 08 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | UIView, keys, generation-safe refresh, origin restore | `npm run test:tui && npm run typecheck --workspace @git-stacks/tui` | — | pending |
| 127-08-03 | 08 | 5 | 127-02, 127-05, 127-06 | STALE-01/02/04/05 | Canonical Open/lifecycle/reconciliation | `npm run test:tui && npx vitest run tests/lib/service/workspace-action-authority.test.ts` | — | pending |
| 127-09-01 | 09 | 6 | 127-07, 127-08 | STALE-01..05, REL-01 | Focused schema, network-observation, policy, web, cross-client, and isolated TUI matrix | `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces-schema.test.ts tests/lib/core/forge-change-status.test.ts tests/lib/core/remote-branch-status.test.ts tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts tests/service/phase127-cross-client-conformance.test.ts && npm run test:tui` | — | pending |
| 127-09-02 | 09 | 6 | 127-07, 127-08 | STALE-01..05, REL-01 | Architecture, ASVS, package, build, type boundaries | `node --test tests/architecture/phase127-stale-authority.test.mjs && npm run build:packages && npm run typecheck && npm run test:architecture && npm run test:deps && npm run web:build && npm run tui:build` | — | pending |
| 127-09-03 | 09 | 6 | 127-07, 127-08 | STALE-01..05, REL-01 | Pre-metadata Node regression and coverage; no aggregate test/release gate | `npm run test:vitest && npm run test:node && npm run coverage` | — | pending |
| 127-10-01 | 10 | 7 | 127-09 | REL-01/02 | Migrate active v0.21 RC assertions, then add immediate manifest/lock RED assertions with no docs dependency | `node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts` | — | pending |
| 127-10-02 | 10 | 7 | 127-09 | REL-01/02 | First five manifests exact RC scan | `node -e "const fs=require('node:fs'); const files=['package.json','packages/protocol/package.json','packages/client/package.json','packages/core/package.json','packages/cli/package.json']; for (const f of files) { const p=JSON.parse(fs.readFileSync(f,'utf8')); if (p.version!=='0.22.0-rc.1') throw new Error(f); }"` | — | pending |
| 127-10-03 | 10 | 7 | 127-09 | REL-01/02 | Remaining manifests, lockfile, focused release/package gates | `npm install --package-lock-only --ignore-scripts --no-audit --no-fund && node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts && npm run check:packages` | — | pending |
| 127-11-01 | 11 | 8 | 127-10 | STALE-01..05, REL-01/02 | Immediate changelog/docs RED assertions | `node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts` | — | pending |
| 127-11-02 | 11 | 8 | 127-10 | STALE-01..05, REL-01/02 | Stale/migration/shortcut/shell/provider/release docs green | `node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts` | — | pending |
| 127-11-03 | 11 | 8 | 127-10 | STALE-01..05, REL-01/02 | First complete post-manifest/post-doc test and RC gate | `npm test && before="$(git for-each-ref --format='%(refname):%(objectname)' refs/tags)" && npm run release:check && after="$(git for-each-ref --format='%(refname):%(objectname)' refs/tags)" && test "$before" = "$after"` | — | pending |
| 127-12-01 | 12 | 9 | 127-11 | STALE-01..05, REL-01/02 | Freeze candidate and create the single canonical JSON exact-SHA row/subcase ledger | `node -e "const fs=require('node:fs'),cp=require('node:child_process'),s=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md','utf8'),a='<!-- phase127-receipts-json:start -->',b='<!-- phase127-receipts-json:end -->',i=s.indexOf(a),j=s.indexOf(b),ids=['HST-RUNTIME','HST-SHELL','HST-SSH','AUTH-GH-STATUS','AUTH-GL-STATUS','FORGE-GH-SAME','FORGE-GH-FORK','FORGE-GL-SAME','FORGE-GL-FORK','FORGE-RECOVERY','LIVE-ARCHIVE','LIVE-REMOVE-FORCE','LIVE-STALE','LIVE-ATTENTION-FUZZY','LIVE-P126-ACTIONS','LIVE-P126-NOTES','LIVE-P126-FILE-STATUS','LIVE-LIFECYCLE','PHYS-BROWSER-XTERM','VIS-RESPONSIVE','INT-TUI','HUMAN-PARITY','RELEASE-AUTHORIZATION']; if([i<0,j<=i,s.indexOf(a,i+1)!==-1,s.indexOf(b,j+1)!==-1].some(Boolean)) throw new Error('markers'); const d=JSON.parse(s.slice(i+a.length,j).trim()),sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); if([d.schema_version!==1,d.candidate_sha!==sha,d.version!=='0.22.0-rc.1',d.tag!=='v0.22.0-rc.1',d.channel!=='next',JSON.stringify(Object.keys(d.rows).sort())!==JSON.stringify([...ids].sort())].some(Boolean)) throw new Error('identity'); for(const id of ids.slice(0,-1)){const r=d.rows[id]; if([r.status!=='PENDING',r.candidate_sha!==sha,r.evidence!==null,!Array.isArray(r.required_subcases),r.required_subcases.length===0].some(Boolean)) throw new Error(id)} if(d.rows['RELEASE-AUTHORIZATION'].status!=='NOT_AUTHORIZED') throw new Error('authorization');"` | — | pending |
| 127-12-02 | 12 | 9 | 127-11 | STALE-01..05, REL-01/02 | Validation remains Nyquist-false/approval-pending with exact-SHA links | `node -e "const fs=require('node:fs'); const v=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md','utf8'); if (!/nyquist_compliant:\s*false/.test(v)) process.exit(1); if (!/Approval:\s*pending/i.test(v)) process.exit(1); if (!/PENDING/i.test(v)) process.exit(1);"` | — | pending |
| 127-13-01 | 13 | 10 | 127-12 | STALE-01/05, REL-01/02 plus criterion 4 | Hosted runtime, shell/SSH, authenticated status, complete same/fork forge matrix | `node -e "const fs=require('node:fs'); const s=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md','utf8'); for (const x of ['HST-RUNTIME','HST-SHELL','HST-SSH','AUTH-GH-STATUS','AUTH-GL-STATUS','FORGE-GH-SAME','FORGE-GH-FORK','FORGE-GL-SAME','FORGE-GL-FORK','FORGE-RECOVERY','PENDING']) if (!s.includes(x)) throw new Error(x);"` | blocking hosted/authenticated | pending |
| 127-13-02 | 13 | 10 | 127-12 | STALE-01..05, REL-01/02 plus criterion 4 | Archived/stale/navigation/Phase126/lifecycle/physical/visual/TUI/parity evidence | `node -e "const fs=require('node:fs'); const s=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md','utf8'); for (const x of ['LIVE-ARCHIVE','LIVE-REMOVE-FORCE','LIVE-STALE','LIVE-ATTENTION-FUZZY','LIVE-P126-ACTIONS','LIVE-P126-NOTES','LIVE-P126-FILE-STATUS','LIVE-LIFECYCLE','PHYS-BROWSER-XTERM','VIS-RESPONSIVE','INT-TUI','HUMAN-PARITY','PENDING']) if (!s.includes(x)) throw new Error(x);"` | blocking physical/manual | pending |
| 127-14-01 | 14 | 11 | 127-13 | STALE-01..05, REL-01/02 | Strict JSON reconciliation preserving committed IDs/subcases and requiring exact-SHA row approvals | `node -e "const fs=require('node:fs'),cp=require('node:child_process'),p='.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md',a='<!-- phase127-receipts-json:start -->',b='<!-- phase127-receipts-json:end -->',parse=s=>JSON.parse(s.slice(s.indexOf(a)+a.length,s.indexOf(b)).trim()),base=parse(cp.execFileSync('git',['show','HEAD:'+p],{encoding:'utf8'})),cur=parse(fs.readFileSync(p,'utf8')),ids=['HST-RUNTIME','HST-SHELL','HST-SSH','AUTH-GH-STATUS','AUTH-GL-STATUS','FORGE-GH-SAME','FORGE-GH-FORK','FORGE-GL-SAME','FORGE-GL-FORK','FORGE-RECOVERY','LIVE-ARCHIVE','LIVE-REMOVE-FORCE','LIVE-STALE','LIVE-ATTENTION-FUZZY','LIVE-P126-ACTIONS','LIVE-P126-NOTES','LIVE-P126-FILE-STATUS','LIVE-LIFECYCLE','PHYS-BROWSER-XTERM','VIS-RESPONSIVE','INT-TUI','HUMAN-PARITY']; if([cur.schema_version!==base.schema_version,cur.candidate_sha!==base.candidate_sha].some(Boolean)) throw new Error('identity'); for(const id of ids){const x=cur.rows[id],y=base.rows[id],a1=[...x.required_subcases].sort(),a2=[...(x.evidence?.approved_subcases??[])].sort(); if([JSON.stringify(x.required_subcases)!==JSON.stringify(y.required_subcases),x.status!=='PASS',x.candidate_sha!==cur.candidate_sha,x.evidence?.approved!==true,x.evidence?.candidate_sha!==cur.candidate_sha,JSON.stringify(a1)!==JSON.stringify(a2)].some(Boolean)) throw new Error(id)} cp.execFileSync('git',['cat-file','-e',cur.candidate_sha+'^{commit}']);"` | — | pending |
| 127-14-02 | 14 | 11 | 127-13 | STALE-01..05, REL-01/02 | Candidate ancestry, all-row/subcase PASS, Nyquist/approval, prohibition, and release-stop consistency | `node -e "const fs=require('node:fs'),cp=require('node:child_process'),s=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md','utf8'),v=fs.readFileSync('.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md','utf8'),a='<!-- phase127-receipts-json:start -->',b='<!-- phase127-receipts-json:end -->',d=JSON.parse(s.slice(s.indexOf(a)+a.length,s.indexOf(b)).trim()),head=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); if(head===d.candidate_sha) throw new Error('ledger commit missing'); cp.execFileSync('git',['merge-base','--is-ancestor',d.candidate_sha,head]); for(const [id,r] of Object.entries(d.rows)){if(id!=='RELEASE-AUTHORIZATION'&&r.status!=='PASS') throw new Error(id)} if([d.rows['RELEASE-AUTHORIZATION'].status!=='NOT_AUTHORIZED',!/nyquist_compliant:\s*true/.test(v),!/Approval:\s*approved/i.test(v),!v.includes(d.candidate_sha)].some(Boolean)) throw new Error('approval')" && git diff --check && node --test tests/architecture/release-publish.test.mjs && npx vitest run tests/commands/release-rc.test.ts` | — | pending |

*Status: pending until the owning task executes; Plan 127-13 rows additionally require the named blocking human approval.*

---

## Required Deterministic Matrix

| Domain | RED assertions required before implementation is accepted |
|--------|----------------------------------------------------------|
| Protocol | Extra-key rejection; finite reason/unknown/caution enums; array bounds; revision/timestamp parsing; no path/raw-error fields |
| Forge status | GitHub/GitLab merged, closed, open; Gitea unsupported; invalid provenance; missing tool; auth; rate limit; timeout; abort; malformed/oversized JSON; safe argv and sanitization |
| Remote branch | Fixed argv-only lookup; exit 0 present, exit 2 missing, other exit/rejection unknown; explicit timeout/output cap/AbortSignal; no raw path/output/argv; aborted generations never commit cache |
| Branch/worktree/activity | Present/missing/error distinction; repository-scoped reasons; managed missing only; inaccessible remains unknown; local facts derive from one captured authoritative read model with no second status/YAML/Git scan; `last_opened` precedence; strict 30-day cutoff boundary |
| Classification/ranking | One confirmed reason qualifies; reason+unknown remains candidate; unknown-only is incomplete; no evidence omits; cautions do not qualify; lexicographic ordering is stable |
| Cache/revision | Five-minute fresh/expired behavior; force bypass; ordinary singleflight; cached unknown; newest generation wins; new service clears cache; revision mismatch causes zero probes and one client retry |
| Lifecycle | Open success/failure; Archive/Remove descriptors unchanged; Force Remove absent initially and gated by fresh typed dirty blocker; terminal result reconciles without replay |
| Web | Singleton/refocus; loading/populated/incomplete/empty/errors; retained refresh data; focus restoration; native action callbacks; 320/375 overflow contract; disclosure canaries |
| TUI | Dedicated `UIView`; wide/stacked/narrow/too-small layouts; navigation; repeated refresh ignored; late response rejected; incomplete action denial; Escape origin restore; no key leakage |
| Architecture | Web/TUI cannot import core probes or execute provider/Git commands; evaluator has no mutation path; browser schema excludes secrets, paths, argv, stdout, stderr, and raw environment |
| Release | Eight manifests and internal ranges in lockstep; changelog/docs match RC; package dry-runs pass; default graph excludes TUI; release check does not tag by default |

---

## Wave 0 Requirements

Plan 127-01 and Plan 127-02 own Wave 0. This wave establishes behavior and security RED tests without requiring RC manifest, lockfile, changelog, or documentation metadata that belongs at the immediate Plan 127-10 and 127-11 implementation boundaries. Net-new contracts are loaded through existing-module namespace lookup or guarded test-lifecycle dynamic imports so absence produces named failing assertions inside Vitest/Bun rather than module-discovery errors; Wave 0 creates no product placeholders and skips no matrix rows.

- [ ] `tests/helpers/phase127-stale-fixtures.ts` — safe factories for core state, injected provider outcomes, clock advancement, cache generations, and bounded stale response rows.
- [ ] `tests/service/web-stale-workspaces-schema.test.ts` — explicit runtime Zod RED matrix for top-level and nested strict extra-key rejection; nested collection/string bounds; positive revision and valid timestamp enforcement; finite reason/unknown/caution/action enums; and rejection of path, raw-error, command, argv, stdout, stderr, credential, and environment-shaped fields.
- [ ] `tests/lib/core/forge-change-status.test.ts` — provider status unions, safe argv, timeout/abort, parse bounds, and sanitization for STALE-01/05.
- [ ] `tests/lib/core/remote-branch-status.test.ts` — fixed argv, exit 0/2/error separation, timeout/output limits, AbortSignal, sanitization, and no mutation for repository-scoped remote evidence.
- [ ] `tests/lib/service/stale-workspaces.test.ts` — qualification, timestamps, unknown separation, ranking, captured-read-model local evidence, TTL, singleflight, force refresh, cache races, revisions, and no mutation for STALE-01/02/03/05.
- [ ] `tests/service/web-stale-workspaces.test.ts` — secure route, browser projection, overlay state, focus, action inventory, responsive contract, and disclosure canaries for STALE-02/04/05.
- [ ] `tests/service/phase127-cross-client-conformance.test.ts` — identical order, labels, reasons, timestamps, actions, and reconciliation for STALE-02/04.
- [ ] `tests/tui/dashboard/StaleWorkspaces.test.tsx` — dedicated view layouts, navigation, generation safety, Open/actions, and input isolation for STALE-02/04/05.
- [ ] `tests/architecture/phase127-stale-authority.test.mjs` — reject client-owned provider/Git/mutation policy and browser disclosure for STALE-03/05.
- [ ] `tests/architecture/release-publish.test.mjs` and `tests/commands/release-rc.test.ts` — keep only the pre-metadata outward-release-authority, default-package-graph, and planning-tree-preservation assertions green. Put the new Vitest harness under the unique test-name filter `Phase 127 pre-metadata release authority`; Wave 0 runs only that suite, excluding the existing historical temp-repository tag fixture. The selected suite runs the no-tag script twice through temporary PATH shims, records no `git tag` request, and performs no real npm/Git/network work; the native `.mjs` file runs with `node --test` and the TypeScript suite runs with Vitest.

Plan 127-03 must turn `tests/service/web-stale-workspaces-schema.test.ts` green in addition to protocol typechecking. Manifest/internal-range/lockfile RED assertions are added only in Plan 127-10; changelog/docs RED assertions are added only in Plan 127-11.

---

## Threat References

| Threat | Risk | Required proof |
|--------|------|----------------|
| T-127-01 | Provider command injection | Validated provenance and argv-only execution; encoded GitLab project path; no shell invocation |
| T-127-02 | Credential/path/raw-output disclosure | Fixed safe error enums, allowlist projection, and browser/TUI canary scans |
| T-127-03 | Stale revision or late response accepted | Revision-before-probe plus one reload/retry and monotonic service/client generations |
| T-127-04 | Probe exhaustion or cache race | Bounded concurrency, time/output limits, abort, TTL, singleflight, duplicate-refresh suppression, newest-write wins |
| T-127-05 | False stale verdict from unknown evidence | Closed three-state unions; at least one confirmed reason required; unknown-only rows separated |
| T-127-06 | Stale evidence becomes lifecycle authority | Evaluator has no mutation capability; current canonical descriptors and typed Force Remove sequence remain mandatory |
| T-127-07 | Cross-repository evidence confusion | Repository identity remains attached to branch/worktree evidence and cache keys; no workspace-wide safety claim |
| T-127-08 | Validation triggers release side effects | No `--tag`, `git tag`, push, publish, `gh release create`, or release-only workflow dispatch in plans or commands |

---

## Manual-Only and Hosted Verifications

Plan 127-12 creates every row below in the canonical `127-RECEIPTS.md` ledger against one immutable full candidate SHA. Every external/manual row starts `PENDING` and remains `PENDING` until Plan 127-13 receives the named blocking approval with safe exact-SHA evidence; Plan 127-14 alone sanitizes and reconciles approved receipts. One generic approval cannot satisfy multiple rows or their enumerated subcases.

| Receipt ID | Requirement / handoff class | Required exact-SHA evidence | Gate | Initial status |
|---|---|---|---|---|
| HST-RUNTIME | REL-01 supported runtime matrix | Node 24 Linux/macOS x64/ARM job identities, conclusions, UTC time, exact candidate SHA, safe run reference and artifact checksums | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| HST-SHELL | SHELL-01..04 and ROADMAP configured-shell workflow | Authorized Bash/zsh/fish commands, hooks and PTYs; profile-only runtime/function/alias behavior; overlay precedence; startup diagnostics; PATH refresh | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| HST-SSH | KEY-01..04 and ROADMAP SSH-agent workflow | Authorized `SSH_AUTH_SOCK` refresh, `ssh-add` behavior, socket rotation and configured-shell propagation without recording raw environment or keys | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| AUTH-GH-STATUS | STALE-01/05 authenticated GitHub status | Real merged, closed and open status plus missing-tool/auth/rate-limit/timeout/malformed recovery on disposable authorized changes | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| AUTH-GL-STATUS | STALE-01/05 authenticated GitLab status | Real merged, closed and open status plus safe failure/recovery receipts from the blocking checkpoint or a separately authorized environment | Plan 127-13 hosted/authenticated checkpoint; never install or authenticate tooling implicitly | PENDING |
| FORGE-GH-SAME | SOURCE-01..06 GitHub same-repository creation | Resolve → Review → Create using immutable source anchors and the reviewed real head SHA; prove explicit Create and no provider checkout | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| FORGE-GH-FORK | SOURCE-01..06 GitHub fork creation | Resolve → Review → Create from a fork source with immutable anchors, reviewed real head SHA, explicit Create and no provider checkout | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| FORGE-GL-SAME | SOURCE-01..06 GitLab same-project creation | Resolve → Review → Create using immutable source anchors and the reviewed real head SHA; prove explicit Create and no provider checkout | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| FORGE-GL-FORK | SOURCE-01..06 GitLab fork creation | Resolve → Review → Create from a fork source with immutable anchors, reviewed real head SHA, explicit Create and no provider checkout | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| FORGE-RECOVERY | Complete Phase 126 forge recovery handoff | Every listed resolve/review/create failure, retry, rollback and cleanup case for GitHub and GitLab same/fork paths, with no partial local mutation | Plan 127-13 hosted/authenticated checkpoint | PENDING |
| LIVE-ARCHIVE | ARCH-01..05 archived-workspace flows | Active/archive ordering, Undo, unarchive, active-empty and archive-empty states in both clients against the exact candidate | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-REMOVE-FORCE | REMOVE-01..05 destructive confirmation | Clean removal, dirty rejection, stale-confirmation handling and exact-name Force Remove after fresh typed blocker, with retained recovery context | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-STALE | STALE-01..05 stale workspace intelligence | Loading, populated, reason+unknown/caution, incomplete-only, empty, retained-data failure, first-load failure, refresh and canonical actions | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-ATTENTION-FUZZY | ATTN-01..03 and ROADMAP navigation | Attention navigation and fuzzy navigation, focus restoration, no input/key leakage and correct route/origin behavior | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-P126-ACTIONS | PARITY-01..03 broader Phase 126 actions | Complete browser/TUI action inventory, confirmations, disabled reasons, canonical authority and post-operation reconciliation | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-P126-NOTES | PARITY-01..03 Phase 126 notes | Notes viewing/editing behavior, retained state, conflicts/errors and browser/TUI parity from the handoff | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-P126-FILE-STATUS | PARITY-01..03 Phase 126 file status | File-status ordering, state transitions, refresh/error behavior and cross-client parity from the handoff | Plan 127-13 physical/manual checkpoint | PENDING |
| LIVE-LIFECYCLE | Full operation lifecycle handoff | Durable reconnect, cancellation before/after terminal state, refresh-failed lock/retry, simultaneous clients, no terminal replay and authoritative convergence | Plan 127-13 physical/manual checkpoint | PENDING |
| PHYS-BROWSER-XTERM | STALE-02/04 and browser/TUI parity | Physical keyboard, AltGraph, IME, non-US, repeated/held keys, pointer actions, xterm focus, contained refresh, Tab/Shift+Tab, Escape and exact restoration | Plan 127-13 physical/manual checkpoint | PENDING |
| VIS-RESPONSIVE | STALE-02/05 responsive visual contract | Light/dark screenshots at desktop, 375px and 320px for every stale state plus required Phase 126 surfaces, with readable overflow and contrast | Plan 127-13 physical/manual checkpoint | PENDING |
| INT-TUI | STALE-02/04/05 interactive OpenTUI | Real wide, stacked, single-column, short-height and too-small terminals; navigation, refresh, Open, lifecycle, incomplete rejection and Escape restoration | Plan 127-13 physical/manual checkpoint | PENDING |
| HUMAN-PARITY | PARITY-01..03 and REL-01 | Side-by-side browser/TUI approval for order, wording, timestamps, reason/unknown/caution split, counts, actions, confirmations, lifecycle and reconciliation | Plan 127-13 physical/manual checkpoint | PENDING |
| RELEASE-AUTHORIZATION | REL-02 release boundary | Explicitly records that RC preparation grants no authority for tag, push, publish, GitHub Release creation or release-only workflow dispatch | No release checkpoint in this phase; status must remain NOT_AUTHORIZED | NOT_AUTHORIZED |

Self-hosted GitHub/GitLab hosts are `NOT_CLAIMED` unless the operator supplies an explicit supported-host list and safe exact-candidate-SHA receipts. Gitea status and provider mutation/search/inference remain reasoned `OPT_OUT` capability rows. Missing `glab`, unavailable runners, absent shell/SSH proof, incomplete forge cases, missing screenshots/TUI sessions, or absent human approval are blocking missing evidence, never waivers or deterministic passes.

---

## Validation Sign-Off

- [ ] Every STALE-01..05 and REL-01..02 requirement has automated or explicit hosted/manual evidence.
- [ ] No three consecutive implementation tasks lack an automated verification command.
- [ ] Wave 0 creates every missing focused test and fixture before dependent implementation seals.
- [ ] Revision mismatch proves zero probe calls; cache and client generations prove newest-result wins.
- [ ] Unknown evidence cannot qualify a candidate and raw provider/path/credential data cannot cross projections.
- [ ] Archive/Remove/Force Remove remain canonical and no evaluation/refresh path mutates state.
- [ ] Web and TUI consume identical service order, labels, reasons, timestamps, and action authority.
- [ ] `npm run release:check` is run without `--tag`; no tag, push, publish, GitHub Release, or release-only workflow dispatch appears in Phase 127 plans or execution, while ordinary local build/coverage/package outputs are recorded honestly.
- [ ] Hosted, authenticated, physical, screenshot, interactive, and human evidence is recorded honestly against the exact candidate SHA.
- [ ] `nyquist_compliant: true` is set only after all executable validation rows are green or explicitly routed to human verification.

**Approval:** pending
