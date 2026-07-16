import { describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import type { Signal } from "../../packages/protocol/src/service"
import { createWorkspaceLifecycleAdmission } from "../../packages/service/src/policy/workspace-lifecycle-admission"
import type { TerminalAttachment } from "../../packages/service/src/terminal-attachment"
import {
  WebTerminalManager,
  type PtyFactory,
  type PtyProcess,
  type TerminalAttachmentData,
} from "../../packages/service/src/web/terminal-manager"

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111"
const WORKSPACE_B = "33333333-3333-4333-8333-333333333333"
const REPOSITORY = "22222222-2222-4222-8222-222222222222"

type FakeExitBehavior = "term" | "kill" | "never"

function createPtyFactory(behaviors: FakeExitBehavior[]): {
  spawn: PtyFactory
  processes: Array<PtyProcess & { signals: string[] }>
  allocations: () => number
} {
  const processes: Array<PtyProcess & { signals: string[] }> = []
  let allocations = 0
  const spawn: PtyFactory = () => {
    const behavior = behaviors[allocations] ?? behaviors.at(-1) ?? "term"
    allocations += 1
    let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined
    const process = {
      pid: 900_000 + allocations,
      signals: [] as string[],
      write: () => {},
      resize: () => {},
      kill: (signal = "SIGTERM") => {
        process.signals.push(signal)
        if (behavior === "term" && signal === "SIGTERM") queueMicrotask(() => exitListener?.({ exitCode: 0 }))
        if (behavior === "kill" && signal === "SIGKILL") queueMicrotask(() => exitListener?.({ exitCode: 137, signal: 9 }))
      },
      onData: () => ({ dispose: () => {} }),
      onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => { exitListener = listener; return { dispose: () => {} } },
    } satisfies PtyProcess & { signals: string[] }
    processes.push(process)
    return process
  }
  return { spawn, processes, allocations: () => allocations }
}

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
  test("PHASE123_RED terminal barrier contract", async () => {
    const admission = createWorkspaceLifecycleAdmission()
    const ptys = createPtyFactory(["term", "term"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, admission, 10)

    const firstLease = await admission.acquire(WORKSPACE_A)
    let queuedLeaseGranted = false
    const queuedLease = admission.acquire(WORKSPACE_A).then((lease) => { queuedLeaseGranted = true; return lease })
    const unrelatedLease = await admission.acquire(WORKSPACE_B)
    unrelatedLease.release()
    await Promise.resolve()
    expect(queuedLeaseGranted).toBe(false)
    await expect(manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })).rejects.toMatchObject({ code: "workspace_lifecycle_in_progress" })
    expect(ptys.allocations()).toBe(0)

    const other = await manager.create("browser-1", { workspace_id: WORKSPACE_B, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    expect(other.workspace_id).toBe(WORKSPACE_B)
    expect(ptys.allocations()).toBe(1)
    await manager.close("browser-1", other.id)
    firstLease.release()
    const secondLease = await queuedLease
    secondLease.release()
  })

  test("confirms TERM and KILL exits and reports a never-exiting PTY honestly", async () => {
    const ptys = createPtyFactory(["term", "kill", "never"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10)

    const term = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", term.id)).resolves.toMatchObject({ state: "ended" })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM"])

    const killed = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", killed.id)).resolves.toMatchObject({ state: "ended" })
    expect(ptys.processes[1]?.signals).toEqual(["SIGTERM", "SIGKILL"])

    const stuck = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", stuck.id)).resolves.toMatchObject({ state: "cleanup_failed" })
    expect(ptys.processes[2]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    expect(manager.get("browser-1", stuck.id)).toMatchObject({ state: "cleanup_failed" })
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 })
  })

  test("shares concurrent close settlement and closes a workspace across principals without metadata", async () => {
    const ptys = createPtyFactory(["kill", "term", "term", "term"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10)

    const shared = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    const firstClose = manager.close("browser-1", shared.id)
    const secondClose = manager.close("browser-1", shared.id)
    expect(firstClose).toBe(secondClose)
    expect(await firstClose).toMatchObject({ state: "ended" })

    await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await manager.create("browser-2", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    const unrelated = await manager.create("browser-1", { workspace_id: WORKSPACE_B, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: true, status: "closed", requested: 2, closed: 2, failed: 0 })
    expect(manager.list("browser-1")).toEqual([expect.objectContaining({ id: unrelated.id, workspace_id: WORKSPACE_B })])
    expect(manager.list("browser-2")).toEqual([])
    await manager.close("browser-1", unrelated.id)
  })

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
