import { describe, expect, test } from "@test/api"

import {
  initializeOperationRecovery,
  recoverReviewedSourceRefs,
} from "../../../packages/service/src/policy/reviewed-source-recovery"

describe("reviewed source restart recovery", () => {
  test("runs reserved-ref recovery only after interrupted operations are durably settled", async () => {
    const calls: string[] = []
    await initializeOperationRecovery({
      initializeOperations: async () => { calls.push("operations:initialized") },
      recoverReviewedSources: async () => { calls.push("review-refs:recovered") },
    })
    expect(calls).toEqual(["operations:initialized", "review-refs:recovered"])
  })

  test("deduplicates authoritative Git repositories, skips directory entries, and fixes errors", async () => {
    const calls: string[] = []
    await expect(recoverReviewedSourceRefs({
      repositories: [
        { name: "api", local_path: "/private/api", is_dir: false },
        { name: "api-alias", local_path: "/private/api", is_dir: false },
        { name: "docs", local_path: "/private/docs", is_dir: true },
      ],
      cleanupRepository: async (path) => { calls.push(path); return 2 },
    })).resolves.toEqual({ repositories: 1, refs: 2 })
    expect(calls).toEqual(["/private/api"])

    await expect(recoverReviewedSourceRefs({
      repositories: [{ name: "api", local_path: "/private/api", is_dir: false }],
      cleanupRepository: async () => { throw new Error("/private/api TOKEN=credential-canary") },
    })).rejects.toMatchObject({
      code: "operation_failed",
      message: "Reviewed source recovery failed",
    })
  })
})
