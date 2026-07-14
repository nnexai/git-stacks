import { describe, expect, test } from "bun:test"

describe("core-centred client architecture", () => {
  test("keeps the TUI renderer free of direct machine-side authorities", async () => {
    const glob = new Bun.Glob("src/tui/dashboard/**/*.{ts,tsx}")
    const exceptions = new Set([
      "src/tui/dashboard/editor-handoff.ts",
      "src/tui/dashboard/terminal-handoff.ts",
    ])
    const forbidden = [
      /from ["'][^"']*lib\/(workspace-ops|workspace-lifecycle|workspace-status|workspace-yaml|paths|git)["']/,
      /\b(readGlobalConfig|readWorkspace|writeWorkspace|listWorkspaces|readRegistry|writeRegistry|listRegistryEntries|readTemplate|writeTemplate|listTemplates|deleteTemplate)\b/,
      /Bun\.(spawn|spawnSync)/,
      /from ["'](?:node:)?fs["']/,
    ]
    const violations: string[] = []
    for await (const path of glob.scan({ cwd: ".", onlyFiles: true })) {
      if (exceptions.has(path)) continue
      const source = await Bun.file(path).text()
      if (forbidden.some((pattern) => pattern.test(source))) violations.push(path)
    }
    expect(violations).toEqual([])
  })

  test("uses generated service transport types in the browser client", async () => {
    const source = await Bun.file("src/web-client/app.ts").text()
    expect(source).toContain("WebSnapshot as Snapshot")
    expect(source).toContain("WebTerminal as TerminalMeta")
    expect(source).not.toMatch(/type Snapshot\s*=/)
    expect(source).not.toMatch(/type TerminalMeta\s*=/)
    expect(source).not.toMatch(/type Signal\s*=/)
  })
})
