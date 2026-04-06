---
phase: quick
plan: 260406-tis
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/workspace-lifecycle.ts
  - src/tui/workspace-wizard.ts
  - tests/lib/workspace-lifecycle-create.test.ts
  - tests/tui/workspace-wizard.test.ts
autonomous: true
requirements: [QUICK-260406-TIS]
must_haves:
  truths:
    - "A workspace created from a labeled template keeps those template labels even when the caller passes no explicit labels."
    - "Caller-provided labels are unioned with template labels exactly once, with no duplicates."
    - "Template labels merged through includes are snapshotted onto the workspace at creation time."
  artifacts:
    - path: "src/lib/workspace-lifecycle.ts"
      provides: "Shared createWorkspace label propagation for every template-based caller"
      contains: "composeTemplates"
    - path: "tests/lib/workspace-lifecycle-create.test.ts"
      provides: "Regression coverage for template-label propagation in the shared creation path"
    - path: "src/tui/workspace-wizard.ts"
      provides: "Wizard caller no longer owns template-label propagation"
    - path: "tests/tui/workspace-wizard.test.ts"
      provides: "Regression coverage that wizard-created workspaces still receive template labels"
  key_links:
    - from: "CreateWorkspaceInputs.templateName"
      to: "workspaceObj.labels"
      via: "readTemplate/composeTemplates snapshot unioned with inputs.labels"
      pattern: "templateName.*labels"
    - from: "src/tui/workspace-wizard.ts"
      to: "createWorkspace()"
      via: "pass only user-entered labels and rely on shared propagation"
      pattern: "createWorkspace\\("
---

<objective>
Fix template-label propagation at the shared workspace-creation boundary.

Purpose: `runWorkspaceNew()` currently unions template labels before calling `createWorkspace()`, but the dashboard path delegates to `createWorkspace()` without that merge. The smallest robust fix is to make `createWorkspace()` snapshot template labels itself (including composed labels from `includes`) so every caller gets the same persisted workspace labels.

Output: Centralized label propagation in `src/lib/workspace-lifecycle.ts`, shared-layer regression tests, and a small wizard cleanup so template-label ownership lives in one place.
</objective>

<execution_context>
@/home/nnex/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/workspace-lifecycle.ts
@src/lib/composition.ts
@src/tui/workspace-wizard.ts
@src/tui/dashboard/App.tsx
@tests/lib/workspace-lifecycle-create.test.ts
@tests/tui/workspace-wizard.test.ts

<interfaces>
From src/lib/workspace-lifecycle.ts:
```typescript
export type CreateWorkspaceInputs = {
  wsName: string
  branch: string
  description?: string
  templateName?: string
  repos: WorkspaceRepo[]
  wsHooks?: Workspace["hooks"]
  wsEnv?: Record<string, string>
  wsEnvFile?: string
  wsFiles?: Workspace["files"]
  wsIntegrationSettings?: Record<string, unknown>
  wsPorts?: Workspace["ports"]
  labels?: string[]
}

export async function createWorkspace(
  inputs: CreateWorkspaceInputs,
  onProgress?: ProgressCallback
): Promise<CreateWorkspaceResult>
```

From src/lib/composition.ts:
```typescript
export function composeTemplates(templateNames: string[]): Template
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add shared-path regression tests for template label propagation</name>
  <files>tests/lib/workspace-lifecycle-create.test.ts</files>
  <behavior>
    - Test: `createWorkspace({ templateName: "tpl", labels: undefined })` writes workspace labels copied from the template snapshot.
    - Test: caller labels are unioned with template labels and deduplicated when both contain the same value.
    - Test: when the raw template has `includes`, `createWorkspace()` snapshots labels from `composeTemplates(...)`, not only the top-level template file.
  </behavior>
  <action>
Extend `tests/lib/workspace-lifecycle-create.test.ts` so the shared `createWorkspace()` contract owns this bug fix. Add/override config mocks for `readTemplate`, and add a composition mock for `composeTemplates` so the tests can prove included labels are preserved. Assert against the workspace object passed to `writeWorkspaceMock` (and the returned `workspace`) rather than any wizard/dashboard-specific behavior. Do not add a dashboard-only regression here; the point is to lock the common creation boundary.
  </action>
  <verify>
    <automated>bun test tests/lib/workspace-lifecycle-create.test.ts</automated>
  </verify>
  <done>Shared createWorkspace tests fail before the fix and cover template-only labels, caller+template unions, and included/composed template labels.</done>
</task>

<task type="auto">
  <name>Task 2: Centralize template label snapshotting in createWorkspace and remove wizard-only ownership</name>
  <files>src/lib/workspace-lifecycle.ts, src/tui/workspace-wizard.ts, tests/tui/workspace-wizard.test.ts</files>
  <action>
In `src/lib/workspace-lifecycle.ts`, resolve template labels inside `createWorkspace()` before building `workspaceObj`: if `inputs.templateName` is set, load the raw template, and when it has `includes`, reuse `composeTemplates([...raw.includes, inputs.templateName])` so label propagation matches the composed template semantics already used elsewhere. Union those snapshot labels with `inputs.labels` via `Set`, keep snapshot-copy semantics from STATE.md, and only omit `labels` when the merged list is empty.

Do **not** patch only `src/tui/dashboard/App.tsx` or any single caller. The fix must live in `createWorkspace()` so every caller gets the same behavior. In `src/tui/workspace-wizard.ts`, remove the redundant pre-merge of `template.labels` into the local `labels` array so the shared layer is the single source of truth. Update `tests/tui/workspace-wizard.test.ts` to keep asserting that wizard-created workspaces still persist template labels plus CLI labels after that cleanup.
  </action>
  <verify>
    <automated>bun test tests/lib/workspace-lifecycle-create.test.ts && bun test tests/tui/workspace-wizard.test.ts && bun run typecheck</automated>
  </verify>
  <done>`createWorkspace()` persists template labels for wizard and dashboard flows, included template labels are preserved, wizard still saves user labels + template labels, and type-check plus targeted regressions pass.</done>
</task>

</tasks>

<verification>
1. `bun test tests/lib/workspace-lifecycle-create.test.ts` passes.
2. `bun test tests/tui/workspace-wizard.test.ts` passes.
3. `bun run typecheck` passes.
4. Code inspection confirms the label merge now happens in `createWorkspace()` instead of only in one caller.
</verification>

<success_criteria>
- Template-based workspace creation persists template labels regardless of whether the caller is the wizard, dashboard, or any future caller of `createWorkspace()`.
- Template includes contribute their merged labels to the saved workspace snapshot.
- Caller-provided labels still work and are deduplicated with propagated template labels.
- No caller-specific patch is required in the dashboard path.
</success_criteria>

<output>
After completion, create `.planning/quick/260406-tis-labels-on-templates-are-not-propagated-t/260406-tis-SUMMARY.md`
</output>
