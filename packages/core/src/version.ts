import { readFile } from "node:fs/promises"

import { $ } from "./node-runtime"

export async function getVersionString(): Promise<string> {
  let pkg: { version: string } | undefined
  for (const candidate of [new URL("../package.json", import.meta.url), new URL("../../package.json", import.meta.url)]) {
    try { pkg = JSON.parse(await readFile(candidate, "utf8")) as { version: string }; break } catch {}
  }
  if (!pkg) throw new Error("Unable to locate git-stacks package metadata")
  const version: string = pkg.version

  // Try to get git commit hash — fails silently when not in a git repo.
  const hashResult = await $`git rev-parse --short HEAD`.quiet().nothrow()
  if (hashResult.exitCode !== 0) {
    return version
  }
  const hash = hashResult.stdout.toString().trim()

  // Check if working tree is dirty.
  const dirtyResult = await $`git status --porcelain`.quiet().nothrow()
  const isDirty = dirtyResult.exitCode === 0 && dirtyResult.stdout.toString().trim().length > 0

  return `${version} (${hash}${isDirty ? "-dirty" : ""})`
}
