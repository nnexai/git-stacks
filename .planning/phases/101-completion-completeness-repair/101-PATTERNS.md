# Phase 101: Completion Completeness Repair - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 5
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/completion-generator.ts` | service | transform | `src/lib/completion-generator.ts` | exact |
| `src/index.ts` | route | request-response | `src/index.ts` | exact |
| `tests/lib/completion-generator.test.ts` | test | transform | `tests/lib/completion-generator.test.ts` | exact |
| `scripts/verify-gates.ts` | utility | batch | `scripts/verify-gates.ts` | exact |
| `scripts/verify.ts` | utility | batch | `scripts/verify.ts` | exact |

## Pattern Assignments

### `src/lib/completion-generator.ts` (service, transform)

**Analog:** `src/lib/completion-generator.ts`

**Imports + type-map conventions** (lines 1-4, 8-16):
```typescript
import { Command } from "commander"
import { integrations } from "./integrations/index"
type DynamicCompletion = "workspace" | "repo" | "template" | "shells" | "integration" | "choices"
const NAME_TO_COMPLETION_TYPE: Record<string, DynamicCompletion> = { ... }
const DYNAMIC_COMPLETIONS: Record<string, DynamicCompletion> = { ... }
```

**Core tree-model build pattern** (lines 72-108):
```typescript
function buildNode(cmd: Command, parentPath: string): CommandNode { ... }
function buildTree(program: Command): CommandNode[] {
  return program.commands.map(cmd => buildNode(cmd, ""))
}
```

**Shell-specific emitter pattern** (lines 350-412, 653-742, 836-997):
```typescript
export function generateBash(program: Command): string { ... }
export function generateZsh(program: Command): string { ... }
export function generateFish(program: Command): string { ... }
```

**Scoped option/flag completion pattern** (lines 40-42, 230-257, 416-433, 939-973):
```typescript
function resolveFlagCompletion(commandPath: string, flagName: string): DynamicCompletion | undefined {
  return COMMAND_FLAG_COMPLETIONS[`${commandPath}:${flagName}`] ?? FLAG_COMPLETIONS[flagName]
}
```

### `src/index.ts` (route, request-response)

**Analog:** `src/index.ts`

**Program assembly order pattern** (lines 46-77):
```typescript
registerWorkspaceCommands(program)
program.addCommand(configCommand)
...
program.addCommand(commandCommand)
// Register last — program tree must be fully populated before the action runs
program.addCommand(createCompletionCommand(program))
```

**Execution guard pattern for completion path** (lines 83-87):
```typescript
const subcommand = process.argv[2]
if (subcommand !== "completion") {
  await checkGitVersion()
}
```

### `tests/lib/completion-generator.test.ts` (test, transform)

**Analog:** `tests/lib/completion-generator.test.ts`

**Test fixture builder pattern** (lines 5-162):
```typescript
function buildTestProgram(): Command {
  const program = new Command()
  ...
  return program
}
```

**Shell-parity assertion pattern (unit output)** (lines 395-429):
```typescript
describe("files command completions", () => {
  test("bash: ...", () => { const out = generateBash(buildTestProgram()); ... })
  test("zsh: ...", () => { const out = generateZsh(buildTestProgram()); ... })
  test("fish: ...", () => { const out = generateFish(buildTestProgram()); ... })
})
```

**Real program audit pattern (live CLI output)** (lines 756-842):
```typescript
const proc = Bun.spawn(["bun", "run", "src/index.ts", "completion", "bash"], {
  stdout: "pipe", stderr: "pipe", cwd: import.meta.dir + "/../..",
})
const out = await new Response(proc.stdout).text()
await proc.exited
expect(out).toContain("integration)")
```

**Regression pattern for position-aware behavior** (lines 1102-1148, 1219-1303):
```typescript
describe("multi-arg position dispatch (D-06)", () => { ... })
describe("positional arity (COMP-01)", () => { ... })
```

### `scripts/verify-gates.ts` (utility, batch)

**Analog:** `scripts/verify-gates.ts`

**Live command inventory extraction pattern** (lines 66-101):
```typescript
function buildProgram(): Command { ... }
function collectCommandPaths(command: Command, parents: string[] = []): string[] { ... }
export function getLiveCommandSurface(): string[] {
  const program = buildProgram()
  return [...new Set([...collectCommandPaths(program), "--version", "-V"])].sort()
}
```

**Drift gate comparator pattern** (lines 158-168, 266-298):
```typescript
function collectInventoryDrift(liveCommands: readonly string[], inventory: readonly E2EInventoryItem[]): string[] { ... }
export function collectVerifyGateReport(options: CollectOptions = {}): VerifyGateReport { ... }
```

**Gate output contract pattern** (lines 300-370):
```typescript
export function formatVerifyGateReport(report: VerifyGateReport): string { ... }
if (import.meta.main) {
  const report = collectVerifyGateReport()
  ...
  process.exit(report.ok ? 0 : 1)
}
```

### `scripts/verify.ts` (utility, batch)

**Analog:** `scripts/verify.ts`

**Ordered verify workflow pattern** (lines 9-16, 30-41):
```typescript
const VERIFY_COMMANDS = [
  "bun run verify:prereqs",
  "bun run coverage",
  "bun run verify:gates",
  "bun run test",
  "bun run test:deps",
  "bun run typecheck",
] as const

export async function runVerifyWorkflow(options: VerifyWorkflowOptions = {}): Promise<number> {
  for (const command of VERIFY_COMMANDS) { ... }
  return 0
}
```

**Spawn + early-exit failure handling pattern** (lines 22-28, 34-38):
```typescript
const proc = Bun.spawn(["sh", "-c", command], { stdio: ["inherit", "inherit", "inherit"] })
if (exitCode !== 0) return exitCode
```

## Shared Patterns

### Commander Tree As Source Of Truth
**Source:** `src/index.ts` lines 46-77; `scripts/verify-gates.ts` lines 66-101  
**Apply to:** `completion-generator`, tests, verify gate scripts.

```typescript
registerWorkspaceCommands(program)
...
program.addCommand(createCompletionCommand(program))
```

```typescript
export function getLiveCommandSurface(): string[] {
  const program = buildProgram()
  return [...new Set([...collectCommandPaths(program), "--version", "-V"])].sort()
}
```

### Position-Aware Completion Dispatch
**Source:** `src/lib/completion-generator.ts` lines 260-306, 470-527, 908-922  
**Apply to:** All shell emitters and related tests.

```typescript
if (node.argCompletions.length > 1) {
  // dispatch by argument position
}
```

### Regression Gate + Human-Readable Failure Output
**Source:** `scripts/verify-gates.ts` lines 266-370; `scripts/verify.ts` lines 30-46  
**Apply to:** Verify workflow and completion drift checks.

```typescript
const report = collectVerifyGateReport()
const output = formatVerifyGateReport(report)
process.exit(report.ok ? 0 : 1)
```

## No Analog Found

None.

## Metadata

**Analog search scope:** `src/`, `tests/`, `scripts/`, `.planning/phases/101-*`  
**Files scanned:** 8 (`101-CONTEXT.md`, `101-RESEARCH.md`, `src/lib/completion-generator.ts`, `src/index.ts`, `src/commands/completion.ts`, `tests/lib/completion-generator.test.ts`, `scripts/verify-gates.ts`, `scripts/verify.ts`)  
**Pattern extraction date:** 2026-05-25
