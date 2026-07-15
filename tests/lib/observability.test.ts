import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import {
  configureObservability,
  debugEnabled,
  logDebug,
  silenceObservability,
  timeOperation,
} from "../../packages/core/src/observability"

const decoder = new TextDecoder()
const originalWrite = process.stderr.write

function installStderrCapture() {
  let output = ""

  process.stderr.write = ((chunk: Uint8Array | string) => {
    output += typeof chunk === "string" ? chunk : decoder.decode(chunk)
    return true
  }) as typeof process.stderr.write

  return () => output
}

describe("observability", () => {
  beforeEach(async () => {
    process.stderr.write = originalWrite
    await silenceObservability()
  })

  afterEach(async () => {
    process.stderr.write = originalWrite
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

    await configureObservability("1")

    const result = timeOperation("workspace-status", "getWorkspaceListInfo", () => "ok")
    await Bun.sleep(10)

    expect(result).toBe("ok")
    expect(getOutput()).toContain("[workspace-status]")
  })

  test("silenceObservability disables debug mode after it was enabled", async () => {
    await configureObservability("1")
    expect(debugEnabled()).toBe(true)

    await silenceObservability()

    expect(debugEnabled()).toBe(false)
  })
})

describe("observability selectors", () => {
  beforeEach(async () => {
    process.stderr.write = originalWrite
    await silenceObservability()
  })

  afterEach(async () => {
    process.stderr.write = originalWrite
    await silenceObservability()
  })

  test("configureObservability('1') emits structured fields: op=, module=, msg=, ms=", async () => {
    const getOutput = installStderrCapture()

    await configureObservability("1")

    const result = timeOperation("workspace-status", "getWorkspaceListInfo", () => "ok")
    await Bun.sleep(10)

    expect(result).toBe("ok")
    const output = getOutput()
    expect(output).toContain("op=getWorkspaceListInfo")
    expect(output).toContain("module=status")
    expect(output).toContain("msg=completed")
    expect(output).toMatch(/ms=\d+/)
  })

  test("configureObservability('true') emits structured fields", async () => {
    const getOutput = installStderrCapture()

    await configureObservability("true")

    const result = timeOperation("workspace-status", "getWorkspaceListInfo", () => "ok")
    await Bun.sleep(10)

    expect(result).toBe("ok")
    const output = getOutput()
    expect(output).toContain("op=getWorkspaceListInfo")
    expect(output).toContain("module=status")
    expect(output).toContain("msg=completed")
    expect(output).toMatch(/ms=\d+/)
  })

  test("configureObservability('git') emits module=git for workspace-git logs", async () => {
    const getOutput = installStderrCapture()

    await configureObservability("git")

    logDebug("workspace-git", "syncWorkspace.fetch: 2 repos")
    await Bun.sleep(10)

    const output = getOutput()
    expect(output).toContain("module=git")
  })

  test("configureObservability('git') suppresses workspace-lifecycle logs", async () => {
    const getOutput = installStderrCapture()

    await configureObservability("git")

    logDebug("workspace-lifecycle", "closeWorkspace: starting")
    await Bun.sleep(10)

    const output = getOutput()
    expect(output).toBe("")
  })

  test("configureObservability('lifecycle') emits for workspace-lifecycle and suppresses workspace-git", async () => {
    const getOutputLifecycle = installStderrCapture()

    await configureObservability("lifecycle")

    logDebug("workspace-lifecycle", "closeWorkspace: starting")
    logDebug("workspace-git", "syncWorkspace.fetch: 2 repos")
    await Bun.sleep(10)

    const lifecycleOutput = getOutputLifecycle()
    expect(lifecycleOutput).toContain("module=lifecycle")
    expect(lifecycleOutput).not.toContain("module=git")
  })

  test("configureObservability(undefined) disables all debug output", async () => {
    const getOutput = installStderrCapture()

    await configureObservability(undefined)

    logDebug("workspace-git", "some debug message")
    await Bun.sleep(10)

    expect(getOutput()).toBe("")
    expect(debugEnabled()).toBe(false)
  })

  test("configureObservability('0') disables all debug output", async () => {
    await configureObservability("1")
    expect(debugEnabled()).toBe(true)

    const getOutput = installStderrCapture()
    await configureObservability("0")

    logDebug("workspace-git", "some debug message")
    await Bun.sleep(10)

    expect(getOutput()).toBe("")
    expect(debugEnabled()).toBe(false)
  })

  test("configureObservability('false') disables all debug output", async () => {
    await configureObservability("1")
    expect(debugEnabled()).toBe(true)

    const getOutput = installStderrCapture()
    await configureObservability("false")

    logDebug("workspace-git", "some debug message")
    await Bun.sleep(10)

    expect(getOutput()).toBe("")
    expect(debugEnabled()).toBe(false)
  })
})
