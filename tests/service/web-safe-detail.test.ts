import { describe, expect, test } from "@test/api"

import {
  WebFileStatusResponseSchema,
  WebNotesResponseSchema,
  WebOperationSchema,
} from "../../packages/protocol/src/web"
import {
  projectWebFileStatus,
  projectWebNotes,
  projectWebOperation,
} from "../../packages/service/src/web/projection"

const workspaceId = "00000000-0000-4000-8000-000000000001"
const repositoryId = "00000000-0000-4000-8000-000000000002"
const generatedAt = "2026-07-16T12:00:00.000Z"
const POSIX = "/home/operator/private/workspace"
const WINDOWS = "C:\\Users\\operator\\private\\workspace"

describe("browser-safe service detail projection", () => {
  test("allowlist-projects rich file status without roots, errors, hints, or verbose paths", () => {
    const rich = {
      workspace: {
        scope: "workspace" as const,
        name: "demo",
        root: POSIX,
        entries: [{
          scope: "workspace" as const,
          repo: null,
          type: "sync" as const,
          target: ".env",
          state: "pullable" as const,
          severity: "warning" as const,
          needsAttention: true,
          hint: `copy ${POSIX}/.env to ${WINDOWS}`,
          details: {
            warnings: [`warning ${POSIX}`],
            errors: [`error ${WINDOWS}`],
            sync: {
              counts: { equal: 2, sourceOnly: 1, targetOnly: 0, differing: 1, errors: 0 },
              sourceOnly: [`${POSIX}/source-only`],
              targetOnly: [`${WINDOWS}\\target-only`],
              differing: [`${POSIX}/different`],
              errors: [`${POSIX}/raw-error`],
            },
          },
        }],
        summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1, sections: 1, byState: { pullable: 1 }, byType: { sync: 1 } },
        warnings: [`warning ${POSIX}`],
        errors: [`error ${WINDOWS}`],
      },
      repos: [{
        scope: "repo" as const,
        name: "app",
        repo: "app",
        mode: "worktree" as const,
        mainPath: POSIX,
        root: WINDOWS,
        entries: [],
        summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 1, byState: {}, byType: {} },
        warnings: [`warning ${POSIX}`],
        errors: [`error ${WINDOWS}`],
      }],
      summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1, sections: 2, byState: { pullable: 1 }, byType: { sync: 1 } },
      warnings: [`warning ${POSIX}`],
      errors: [`error ${WINDOWS}`],
    }

    const projected = projectWebFileStatus(rich, {
      workspaceId,
      revision: "7",
      generatedAt,
      repositoryIds: new Map([["app", repositoryId]]),
    })
    expect(WebFileStatusResponseSchema.parse(projected)).toEqual(projected)
    expect(projected.groups[0]?.entries[0]).toMatchObject({
      target: ".env",
      state: "pullable",
      reason: "content_differs",
      message: "The configured source has changes to pull.",
      counts: { equal: 2, source_only: 1, target_only: 0, differing: 1, errors: 0 },
    })
    const serialized = JSON.stringify(projected)
    for (const canary of [POSIX, WINDOWS, "mainPath", "root", "sourceOnly", "targetOnly", "hint", "raw-error"]) {
      expect(serialized).not.toContain(canary)
    }
  })

  test("projects bounded newest-first notes and drops storage-only fields", () => {
    const projected = projectWebNotes({
      workspaceId,
      revision: "7",
      notes: {
        revision: "3",
        count: 2,
        records: [
          { text: "new", created: "2026-07-16T12:01:00.000Z", path: POSIX },
          { text: "old", created: "2026-07-16T12:00:00.000Z", environment: { TOKEN: "secret" } },
        ],
      },
    })
    expect(WebNotesResponseSchema.parse(projected)).toEqual(projected)
    expect(projected.records).toEqual([
      { text: "new", created_at: "2026-07-16T12:01:00.000Z" },
      { text: "old", created_at: "2026-07-16T12:00:00.000Z" },
    ])
    expect(JSON.stringify(projected)).not.toContain(POSIX)
    expect(JSON.stringify(projected)).not.toContain("TOKEN")
  })

  test("never forwards raw progress, result, or failure strings to browser operations", () => {
    const running = projectWebOperation({
      operation_id: "op_0123456789abcdef",
      state: "running",
      accepted_at: generatedAt,
      started_at: generatedAt,
      progress: {
        stage: "executing",
        message: `git -C ${POSIX} fetch https://token@example.invalid/repo.git`,
        data: { argv: ["gh", "api"], stdout: "secret", stderr: WINDOWS, environment: { TOKEN: "secret" } },
      },
    })
    expect(WebOperationSchema.parse(running)).toEqual(running)
    expect(JSON.stringify(running)).not.toContain(POSIX)
    expect(JSON.stringify(running)).not.toContain(WINDOWS)
    expect(JSON.stringify(running)).not.toContain("token@example")
    expect(JSON.stringify(running)).not.toContain("stdout")

    const failed = projectWebOperation({
      operation_id: "op_fedcba9876543210",
      state: "failed",
      accepted_at: generatedAt,
      started_at: generatedAt,
      finished_at: generatedAt,
      completed_steps: [],
      error: { code: "operation_failed", message: `provider stderr ${POSIX} TOKEN=secret` },
      rollback_attempted: false,
      rollback_succeeded: false,
      rollback_errors: [],
    })
    expect(failed).toMatchObject({ error: { code: "operation_failed", message: "The operation failed." } })
    expect(JSON.stringify(failed)).not.toContain(POSIX)
    expect(JSON.stringify(failed)).not.toContain("TOKEN")
  })
})
