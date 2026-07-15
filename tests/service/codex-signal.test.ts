import { afterEach, describe, expect, test } from "@test/api"
import { runProcess } from "../process"
import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startManagedService } from "../../packages/service/src/main"
import { readOfficialClientCredential } from "../../packages/service/src/policy/credentials"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const repositoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const surfaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const snapshot = { buildAll: async () => [{ workspace: { id: workspaceId, name: "alpha" } }], buildWorkspace: async () => null, currentRevision: async () => "1" }

describe("Codex signal publication", () => {
  test("best-effort is silent and successful without a service while strict mode fails", async () => {
    const root = join(tmpdir(), `git-stacks-codex-absent-${crypto.randomUUID()}`)
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const run = async (bestEffort: boolean) => {
      const child = runProcess(["node", join(import.meta.dirname, "../../packages/cli/dist/index.js"), "service", "signal", "publish", "--state", "working", "--source", "codex", "--workspace", "alpha", ...(bestEffort ? ["--best-effort"] : [])], { cwd: join(import.meta.dirname, "../.."), env: { ...process.env, GIT_STACKS_CONFIG_DIR: root }, stdout: "pipe", stderr: "pipe" })
      return { exitCode: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
    }
    expect(await run(true)).toEqual({ exitCode: 0, stdout: "", stderr: "" })
    const strict = await run(false)
    expect(strict.exitCode).not.toBe(0)
    expect(strict.stderr).toContain("service is not running")
  })

  test("CLI publication survives authenticated journal and SSE transport with exact identity", async () => {
    const configRoot = join(tmpdir(), `git-stacks-codex-service-${crypto.randomUUID()}`)
    const root = join(configRoot, "service")
    cleanup.push(() => rmSync(configRoot, { recursive: true, force: true }))
    const service = await startManagedService({ serviceRoot: root, snapshot: snapshot as never })
    cleanup.push(() => service.stop())
    const child = runProcess(["node", join(import.meta.dirname, "../../packages/cli/dist/index.js"), "service", "signal", "publish", "--state", "waiting", "--source", "codex", "--workspace", "alpha", "--repository-id", repositoryId, "--surface-id", surfaceId, "--session-id", "codex-session", "--title", "Codex blocked", "--detail", "Approve the command", "--best-effort"], { cwd: join(import.meta.dirname, "../.."), env: { ...process.env, GIT_STACKS_CONFIG_DIR: configRoot }, stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    expect(await new Response(child.stderr).text()).toBe("")
    const record = JSON.parse(readFileSync(join(root, "events.jsonl"), "utf8").trim())
    expect(record).toMatchObject({ type: "signal", signal: { kind: "activity", source: "codex", state: "waiting", workspace_id: workspaceId, repository_id: repositoryId, surface_id: surfaceId, session_id: "codex-session", title: "Codex blocked", detail: "Approve the command" } })
    const credential = readOfficialClientCredential(service.descriptor.credential_lookup, { serviceRoot: root })!
    const replay = await fetch(new URL("/v1/events?cursor=0", service.descriptor.endpoint), { headers: { authorization: `Bearer ${credential.token}` } })
    const reader = replay.body!.getReader()
    let streamed = ""
    while (!streamed.includes('"source":"codex"')) {
      const next = await reader.read()
      if (next.done) break
      streamed += new TextDecoder().decode(next.value)
    }
    await reader.cancel()
    expect(streamed).toContain('"title":"Codex blocked"')
    expect(streamed).toContain(`"workspace_id":"${workspaceId}"`)
  })
})
