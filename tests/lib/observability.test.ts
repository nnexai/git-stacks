import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import {
  configureObservability,
  debugEnabled,
  silenceObservability,
  timeOperation,
} from "../../src/lib/observability"

const originalWriter = Bun.stderr.writer
const decoder = new TextDecoder()

function installStderrCapture() {
  let output = ""

  Bun.stderr.writer = () =>
    ({
      write(chunk: Uint8Array | string) {
        output += typeof chunk === "string" ? chunk : decoder.decode(chunk)
        return typeof chunk === "string" ? chunk.length : chunk.byteLength
      },
      flush() {},
      end() {},
    }) as ReturnType<typeof Bun.stderr.writer>

  return () => output
}

describe("observability", () => {
  beforeEach(async () => {
    Bun.stderr.writer = originalWriter
    await silenceObservability()
  })

  afterEach(async () => {
    Bun.stderr.writer = originalWriter
    await silenceObservability()
  })

  test("returns the callback result without calling performance.now when disabled", async () => {
    let calls = 0
    const nowSpy = spyOn(performance, "now").mockImplementation(() => {
      calls += 1
      return 123
    })

    const result = timeOperation("workspace-status", "getWorkspaceListInfo", () => "ok")

    expect(result).toBe("ok")
    expect(calls).toBe(0)

    nowSpy.mockRestore()
  })

  test("emits formatted timing output when enabled", async () => {
    const getOutput = installStderrCapture()

    await configureObservability(true)

    const result = timeOperation("workspace-status", "getWorkspaceListInfo", () => "ok")
    await Bun.sleep(10)

    expect(result).toBe("ok")
    expect(getOutput()).toContain("[workspace-status] getWorkspaceListInfo:")
  })

  test("silenceObservability disables debug mode after it was enabled", async () => {
    await configureObservability(true)
    expect(debugEnabled()).toBe(true)

    await silenceObservability()

    expect(debugEnabled()).toBe(false)
  })
})
