import { $ } from "bun"

export async function getVersionString(): Promise<string> {
  // Read version from package.json relative to this file's location.
  // import.meta.dir resolves to src/lib/, so ../../package.json reaches project root.
  const pkg = await Bun.file(import.meta.dir + "/../../package.json").json()
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
