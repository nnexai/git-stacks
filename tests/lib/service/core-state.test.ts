import { describe, expect, test } from "@test/api"

import { RevisionBoundCoreStateCache } from "../../../packages/service/src/policy/core-state"
import type { CoreState } from "../../../packages/service/src/policy/core-contract"

function state(revision: string): CoreState {
  return { revision } as CoreState
}

describe("revision-bound core state cache", () => {
  test("returns an exact cached revision without running an authoritative projection", async () => {
    const cache = new RevisionBoundCoreStateCache()
    const revisionSeven = state("7")
    let completedRevisionReads = 0
    cache.replaceIfCurrent(cache.beginGeneration(), revisionSeven)

    expect(await cache.current("7", () => {
      completedRevisionReads++
      return "7"
    })).toBe(revisionSeven)
    expect(completedRevisionReads).toBe(1)
    expect(await cache.current("7", () => {
      return "8"
    })).toBeUndefined()
    expect(await cache.current("7", () => "7")).toBeUndefined()
  })

  test("fails closed without a completed authoritative revision", async () => {
    const cache = new RevisionBoundCoreStateCache()
    cache.replaceIfCurrent(cache.beginGeneration(), state("7"))

    expect(await cache.current("7")).toBeUndefined()
    expect(await cache.current("7", () => undefined)).toBeUndefined()
  })

  test("does not let an older concurrent completion overwrite the newer revision", async () => {
    const cache = new RevisionBoundCoreStateCache()
    const olderBuild = cache.beginGeneration()
    const newerBuild = cache.beginGeneration()
    const revisionEight = state("8")

    cache.replaceIfCurrent(newerBuild, revisionEight)
    // A slower build that began first cannot publish after the newer build.
    cache.replaceIfCurrent(olderBuild, state("7"))
    // Seeds claim a generation only when their source request completes, so
    // their older revision must be rejected independently of start order.
    cache.replaceIfCurrent(cache.beginGeneration(), state("7"))

    expect(await cache.current("8", () => "8")).toBe(revisionEight)
    expect(await cache.current("7", () => "8")).toBeUndefined()
  })
})
