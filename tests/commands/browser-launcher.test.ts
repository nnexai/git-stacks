import { afterEach, describe, expect, test } from "@test/api"
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createProtectedBrowserLauncher } from "../../packages/cli/src/lib/browser-launcher"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("browser launcher handoff", () => {
  test("keeps the one-use grant out of the browser command URL", () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-browser-launcher-")); roots.push(root)
    const client = join(root, "git-stacks.html")
    writeFileSync(client, "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\"></head><body><script>trusted()</script></body></html>")
    const target = new URL(`file://${client}#launch=classified-bearer`)
    const launcher = createProtectedBrowserLauncher(target, join(root, "launchers"))
    expect(launcher.toString()).not.toContain("classified-bearer")
    const path = decodeURIComponent(launcher.pathname)
    expect(lstatSync(path).mode & 0o777).toBe(0o600)
    const html = readFileSync(path, "utf8")
    expect(html).toContain('name="git-stacks-launch" content="classified-bearer"')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain("navigate-to")
    expect(html).not.toContain("http-equiv=\"refresh\"")
    expect(html).toContain("<script>trusted()</script>")
  })
})
