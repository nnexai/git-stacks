import { describe, expect, test } from "@test/api"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { prepareTerminalAgentEnvironment } from "../../packages/core/src/agent-hooks/terminal-session"

describe("agent terminal launch authority", () => {
  test("prefixes wrappers onto the effective refreshed PATH without consulting stale process state", () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-agent-terminal-"))
    const wrappers = join(root, "wrappers")
    const refreshed = "/phase124/refreshed/bin:/phase124/profile/runtime/bin:/usr/bin"
    const lookups: string[] = []
    const environment = prepareTerminalAgentEnvironment(
      root,
      "alpha",
      refreshed,
      wrappers,
      (_command, path) => { lookups.push(path); return null },
      { integrationHome: join(root, "home") },
    )

    expect(new Set(lookups)).toEqual(new Set([refreshed]))
    expect(environment.PATH).toBe(`${wrappers}:${refreshed}`)
    expect(environment.PATH).not.toContain(process.env.PATH ?? "<unset>")
  })
})
