import { afterEach, describe, expect, test } from "@test/api"
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createProtectedBrowserLauncher } from "../../packages/cli/src/lib/browser-launcher"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("browser launcher handoff", () => {
  test("keeps the one-use grant out of the browser command URL", () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-browser-launcher-")); roots.push(root)
    const target = new URL("file:///opt/git-stacks/git-stacks.html#launch=classified-bearer")
    const launcher = createProtectedBrowserLauncher(target, join(root, "launchers"))
    expect(launcher.toString()).not.toContain("classified-bearer")
    const path = decodeURIComponent(launcher.pathname)
    expect(lstatSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, "utf8")).toContain("launch=classified-bearer")
  })
})
