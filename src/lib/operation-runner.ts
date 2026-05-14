/**
 * operation-runner — generic LIFO compensation-stack runner.
 *
 * Why this exists:
 * Replaces the hand-rolled rollback at `src/tui/dashboard/App.tsx:883-911` (the
 * `createdWorktrees` cleanup loop) with a reusable primitive. Plan 02 wires this
 * into `createWorkspace()` so workspace creation no longer half-commits when an
 * intermediate step fails.
 *
 * The four properties of the proto-rollback that this runner reproduces exactly:
 *   1. Forward-then-push: the undo entry is pushed onto the stack ONLY after the
 *      forward step succeeds. A failing forward never registers its own undo, so
 *      rollback can never invoke an undo for work that was not actually performed.
 *   2. LIFO unwind: rollback pops the stack tail-to-head, mirroring the order in
 *      which forwards succeeded.
 *   3. Per-undo try/catch: each undo runs inside its own try/catch so a failing
 *      undo cannot abort the remaining undos. Best-effort cleanup (ENGN-03).
 *   4. No commit on failure: the runner returns a `{ ok: false }` result, leaving
 *      the orchestrating caller responsible for skipping the downstream "commit"
 *      step (e.g. writing workspace YAML).
 *
 * Out of scope (D-09, D-11): hooks and integration generation are NOT runner steps
 * because they cannot be inverted. Callers must run them outside the runner, AFTER
 * the runner returns `{ ok: true }`.
 *
 * The runner introduces no new test seam. All side effects live inside the
 * caller-supplied forward/undo closures, so the existing Phase 75 spawn seams
 * in workspace-git and lifecycle cover failure injection in the downstream
 * tests that wire the runner into `createWorkspace()`.
 */

export type RunnerResult =
  | { ok: true }
  | { ok: false; error: string; rollbackErrors: string[] }

export type ProgressCallback = (message: string) => void

export type Runner = {
  /**
   * Execute `forward` immediately. If it succeeds, push `undo` onto the LIFO
   * stack. If it throws, automatically run rollback (LIFO undo of all
   * previously-pushed steps), then re-throw the original error so the caller's
   * surrounding try/catch can convert it into a `RunnerResult` via `result()`.
   *
   * The `name` is used in rollback progress messages (`"Rollback: {name}"`) and
   * in undo-failure messages (`"Rollback error: {name} failed ({err})"`).
   */
  do(name: string, forward: () => Promise<void>, undo: () => Promise<void>): Promise<void>

  /**
   * Returns the runner's accumulated state as a discriminated union. Caller
   * invokes this after the orchestrating try/catch — on success returns
   * `{ ok: true }`, on failure returns `{ ok: false, error, rollbackErrors }`.
   *
   * `result()` is the single source of truth for the discriminated union; the
   * `do` method only manages the stack and rolls back on throw. This split lets
   * callers structure their orchestration as a normal try/catch without having
   * to reason about whether each `do` call returned ok or not.
   */
  result(): RunnerResult
}

type Step = { name: string; undo: () => Promise<void> }

export function createRunner(onProgress?: ProgressCallback): Runner {
  const stack: Step[] = []
  let forwardError: string | null = null
  const rollbackErrors: string[] = []

  async function rollback(): Promise<void> {
    while (stack.length > 0) {
      const step = stack.pop()!
      // Emit the rollback message FIRST so users see the attempt even if it fails.
      onProgress?.(`Rollback: ${step.name}`)
      try {
        await step.undo()
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        const message = `Rollback error: ${step.name} failed (${reason})`
        rollbackErrors.push(message)
        // Mirror the same string through onProgress (D-16): array and stream agree.
        onProgress?.(message)
        // Continue popping — best-effort rollback (ENGN-03).
      }
    }
  }

  return {
    async do(
      name: string,
      forward: () => Promise<void>,
      undo: () => Promise<void>
    ): Promise<void> {
      try {
        await forward()
      } catch (err) {
        // Capture the original forward error (D-17: never replaced by rollback errors).
        forwardError = err instanceof Error ? err.message : String(err)
        await rollback()
        // Re-throw the original error so the caller's try/catch fires.
        throw err
      }
      // Push undo only AFTER forward succeeds (D-04, property 1).
      stack.push({ name, undo })
    },

    result(): RunnerResult {
      if (forwardError === null && rollbackErrors.length === 0) {
        return { ok: true }
      }
      return {
        ok: false,
        error: forwardError ?? "unknown forward error",
        rollbackErrors: [...rollbackErrors],
      }
    },
  }
}
