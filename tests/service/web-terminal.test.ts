import { describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import type { Signal } from "../../packages/protocol/src/service"
import type { TerminalAttachment } from "../../packages/service/src/terminal-attachment"
import { WebTerminalManager, type TerminalAttachmentData } from "../../packages/service/src/web/terminal-manager"

function createManager(publishSignal?: (signal: Signal) => Promise<void>): WebTerminalManager {
  return new WebTerminalManager({
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
    resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
      argv: ["/bin/bash", "--noprofile", "--norc", "-i"], cwd: process.cwd(),
      environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", PS1: "$ " }, ports: {}, configuration: { shell: true }, redacted: [],
    } }),
  }, publishSignal)
}

function attach(manager: WebTerminalManager, terminalId: string, streaming = true): { sent: Array<string | Uint8Array>; socket: TerminalAttachment } {
  const sent: Array<string | Uint8Array> = []
  const socket = {
    data: { kind: "web-terminal", principalId: "browser-1", sessionId: terminalId, streaming } satisfies TerminalAttachmentData,
    send: (value: string | Uint8Array) => { sent.push(value); return typeof value === "string" ? value.length : value.length },
    close: () => {},
    getBufferedAmount: () => 0,
  } satisfies TerminalAttachment
  manager.attach(socket)
  return { sent, socket }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await sleep(20)
  expect(predicate()).toBe(true)
}

describe("service-owned web terminal", () => {
  test("runs a real PTY roundtrip, resizes, and closes its process group", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id)
    manager.message(socket, JSON.stringify({ type: "resize", cols: 91, rows: 27 }))
    manager.message(socket, JSON.stringify({ type: "input", data: "echo WEB_PTY_MARKER; stty size\r" }))
    await sleep(150)
    const output = sent.filter((item): item is Uint8Array => item instanceof Uint8Array).map((frame) => frame.slice(9))
    const text = new TextDecoder().decode(Buffer.concat(output))
    expect(text).toContain("WEB_PTY_MARKER")
    expect(text).toContain("27 91")
    expect(manager.diagnostics.inputs_received).toBe(1)
    const closed = await manager.close("browser-1", terminal.id)
    expect(closed?.state).toBe("ended")
    expect(manager.list("browser-1")).toEqual([])
    expect(manager.diagnostics.sessions).toBe(0)
    await manager.stop()
  })

  test("pauses hidden output, keeps lifecycle controls live, and replays on resume", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)
    manager.rename("browser-1", terminal.id, "Paused shell", "manual")
    manager.message(socket, JSON.stringify({ type: "input", data: "echo PAUSED_OUTPUT_MARKER\r" }))
    await sleep(150)

    expect(manager.diagnostics).toMatchObject({ attached: 1, streaming: 0 })
    expect(sent.filter((item) => item instanceof Uint8Array)).toHaveLength(0)
    expect(sent.filter((item): item is string => typeof item === "string").some((item) => item.includes('"type":"renamed"'))).toBe(true)

    manager.message(socket, JSON.stringify({ type: "flow", streaming: true }))
    await waitFor(() => sent.some((item) => item instanceof Uint8Array && new TextDecoder().decode(item.slice(9)).includes("PAUSED_OUTPUT_MARKER")))
    expect(manager.diagnostics.streaming).toBe(1)
    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("captures agent lifecycle signals while terminal output streaming is paused", async () => {
    if (process.platform !== "linux") return
    const published: Signal[] = []
    const manager = createManager(async (signal) => { published.push(signal) })
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)

    manager.message(socket, JSON.stringify({ type: "input", data: "printf '\\033]9;git-stacks-signal:%s:codex:codex-hidden:working\\033\\\\' \"$GIT_STACKS_SIGNAL_TOKEN\"\r" }))
    await waitFor(() => published.length === 1)

    expect(published[0]).toMatchObject({ kind: "activity", source: "codex", session_id: "codex-hidden", state: "working", surface_id: terminal.surface_id })
    expect(sent.filter((item) => item instanceof Uint8Array)).toHaveLength(0)
    expect(manager.diagnostics.streaming).toBe(0)
    await manager.close("browser-1", terminal.id)
    expect(published.at(-1)).toMatchObject({ kind: "activity", source: "codex", session_id: "codex-hidden", state: "idle", surface_id: terminal.surface_id })
    await manager.stop()
  })

  test("tracks automatic titles until a manual override is pinned and restores automation when cleared", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })

    expect(manager.rename("browser-1", terminal.id, "fish · project", "automatic")).toMatchObject({ title: "fish · project", title_pinned: false })
    expect(manager.rename("browser-1", terminal.id, "Build shell", "manual")).toMatchObject({ title: "Build shell", title_pinned: true })
    expect(manager.rename("browser-1", terminal.id, "fish · elsewhere", "automatic")).toMatchObject({ title: "Build shell", title_pinned: true })
    expect(manager.rename("browser-1", terminal.id, "", "manual")).toMatchObject({ title: "fish · elsewhere", title_pinned: false })

    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("retains an unattached shell and replays it when the browser reconnects", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const first = attach(manager, terminal.id)
    manager.detached(first.socket)
    manager.message(first.socket, JSON.stringify({ type: "input", data: "echo should-not-route\r" }))
    expect(manager.diagnostics).toMatchObject({ sessions: 1, active: 1, attached: 0 })

    const second = attach(manager, terminal.id)
    manager.message(second.socket, JSON.stringify({ type: "input", data: "echo RECONNECTED_SHELL\r" }))
    await waitFor(() => second.sent.some((item) => item instanceof Uint8Array && new TextDecoder().decode(item.slice(9)).includes("RECONNECTED_SHELL")))

    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("resets to retained history when a paused terminal exceeds the replay window", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)
    manager.message(socket, JSON.stringify({ type: "input", data: "printf '%1050000s' x\r" }))
    await waitFor(() => manager.get("browser-1", terminal.id)?.history_available === false, 5_000)

    manager.message(socket, JSON.stringify({ type: "flow", streaming: true }))
    await waitFor(() => sent.some((item) => typeof item === "string" && item.includes('"type":"history_unavailable"')))
    const controls = sent.filter((item): item is string => typeof item === "string")
    expect(controls.some((item) => item.includes('"type":"ready"') && item.includes('"reset":true'))).toBe(true)
    expect(sent.filter((item) => item instanceof Uint8Array).reduce((size, frame) => size + frame.byteLength - 9, 0)).toBeLessThanOrEqual(1024 * 1024)
    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })
})
