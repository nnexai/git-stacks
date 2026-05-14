import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  runCli,
} from "../helpers"

function messageEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    GIT_STACKS_DISABLE_MESSAGE_SOCKET: "1",
    ...extra,
  }
}

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function messageFile(configDir: string, workspace: string): string {
  return join(configDir, "messages", `${workspace}.jsonl`)
}

function readJsonl(configDir: string, workspace: string): Array<Record<string, unknown>> {
  const raw = readFileSync(messageFile(configDir, workspace), "utf8")
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("message command durable subprocess contracts", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("message-test")
    configDir = createConfigFixture(baseDir)
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("message send --workspace writes JSONL with sender metadata and no socket dependency", () => {
    const sent = runCli(["message", "send", "build passed", "--workspace", "alpha", "--from", "ci-agent"], {
      baseDir,
      configDir,
      env: messageEnv(),
      envAllowlistExtras: ["GIT_STACKS_DISABLE_MESSAGE_SOCKET"],
    })

    expectSuccess(sent)
    expect(existsSync(messageFile(configDir, "alpha"))).toBe(true)

    const records = readJsonl(configDir, "alpha")
    expect(records).toHaveLength(1)
    expect(records[0].workspace).toBe("alpha")
    expect(records[0].text).toBe("build passed")
    expect(records[0].from).toBe("ci-agent")
    expect(records[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("message send and message list resolve workspace from GS_WORKSPACE_NAME", () => {
    const env = messageEnv({ GS_WORKSPACE_NAME: "env-ws" })
    const first = runCli(["message", "send", "older", "--from", "agent-a"], { baseDir, configDir, env })
    const second = runCli(["message", "send", "newer", "--from", "agent-b"], { baseDir, configDir, env })
    expectSuccess(first)
    expectSuccess(second)

    const listed = runCli(["message", "list"], { baseDir, configDir, env })
    expectSuccess(listed)
    expect(listed.stdout).toContain("agent-b")
    expect(listed.stdout).toContain("newer")
    expect(listed.stdout).toContain("agent-a")
    expect(listed.stdout).toContain("older")
    expect(listed.stdout.indexOf("newer")).toBeLessThan(listed.stdout.indexOf("older"))

    const json = runCli(["message", "list", "--json"], { baseDir, configDir, env })
    expectSuccess(json)
    const parsed = JSON.parse(json.stdout) as Array<{ text: string; from?: string }>
    expect(parsed.map((record) => record.text)).toEqual(["newer", "older"])
    expect(parsed.map((record) => record.from)).toEqual(["agent-b", "agent-a"])
  })

  test("message clear truncates durable JSONL state for a workspace", () => {
    const env = messageEnv()
    expectSuccess(runCli(["message", "send", "one", "--workspace", "alpha", "--from", "agent-a"], { baseDir, configDir, env }))
    expectSuccess(runCli(["message", "send", "two", "--workspace", "alpha", "--from", "agent-b"], { baseDir, configDir, env }))

    const cleared = runCli(["message", "clear", "--workspace", "alpha"], { baseDir, configDir, env })
    expectSuccess(cleared)
    expect(readFileSync(messageFile(configDir, "alpha"), "utf8")).toBe("")

    const listed = runCli(["message", "list", "--workspace", "alpha"], { baseDir, configDir, env })
    expectSuccess(listed)
    expect(listed.stdout).toContain("No messages for 'alpha'.")
  })

  test("message clear --from removes only matching sender records", () => {
    const env = messageEnv({ GS_WORKSPACE_NAME: "filtered" })
    expectSuccess(runCli(["message", "send", "from a", "--from", "agent-a"], { baseDir, configDir, env }))
    expectSuccess(runCli(["message", "send", "from b", "--from", "agent-b"], { baseDir, configDir, env }))
    expectSuccess(runCli(["message", "send", "from a again", "--from", "agent-a"], { baseDir, configDir, env }))

    const cleared = runCli(["message", "clear", "--from", "agent-a"], { baseDir, configDir, env })
    expectSuccess(cleared)

    const records = readJsonl(configDir, "filtered")
    expect(records).toHaveLength(1)
    expect(records[0].from).toBe("agent-b")
    expect(records[0].text).toBe("from b")
  })

  test("missing workspace fails before writing message state", () => {
    const sent = runCli(["message", "send", "no workspace"], {
      baseDir,
      configDir,
      env: messageEnv(),
    })

    expect(sent.exitCode).toBe(1)
    expect(sent.stderr).toContain("no workspace specified")
    expect(existsSync(messageFile(configDir, "unknown"))).toBe(false)
  })
})
