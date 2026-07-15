import { readFile, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function packageDirectories() {
  const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  return rootPackage.workspaces.map((pattern) => join(root, pattern))
}

async function discoverPackages() {
  return packageDirectories()
}

async function buildPackage(directory) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
  if (manifest.gitStacksBuild?.runtime === "bun") {
    const { spawn } = await import("node:child_process")
    await new Promise((resolvePromise, reject) => {
      const child = spawn("bun", ["run", "build"], { cwd: directory, stdio: "inherit" })
      child.once("error", reject)
      child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${manifest.name} build exited with ${code}`)))
    })
    console.log(`built ${manifest.name}`)
    return
  }
  if (manifest.name === "@git-stacks/web") {
    const { spawn } = await import("node:child_process")
    await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [join(root, "scripts", "build-web.mjs")], { stdio: "inherit" })
      child.once("error", reject)
      child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Web build exited with ${code}`)))
    })
    console.log(`built ${manifest.name}`)
    return
  }
  const config = manifest.gitStacksBuild ?? {}
  let entries = config.entries ?? ["src/index.ts"]
  if (config.allSources) {
    const { readdir } = await import("node:fs/promises")
    const discovered = []
    async function visit(current) {
      for (const entry of await readdir(join(directory, current), { withFileTypes: true })) {
        const path = join(current, entry.name)
        if (entry.isDirectory()) await visit(path)
        else if (/\.(?:ts|tsx)$/.test(entry.name)) discovered.push(path)
      }
    }
    await visit("src")
    entries = discovered
  }
  const dependencies = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
  await rm(join(directory, "dist"), { recursive: true, force: true })
  await build({
    absWorkingDir: directory,
    entryPoints: entries,
    outdir: "dist",
    bundle: true,
    packages: "external",
    external: dependencies,
    platform: config.platform ?? "node",
    format: "esm",
    target: config.target ?? "node24",
    sourcemap: true,
    splitting: entries.length > 1,
    entryNames: "[dir]/[name]",
    logLevel: "info",
  })
  console.log(`built ${manifest.name}`)
}

const requested = process.argv.slice(2)
const packages = await discoverPackages()
const selected = []
for (const directory of packages) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
  const explicitlyRequested = requested.includes(basename(directory)) || requested.includes(manifest.name)
  const includedByAll = requested.includes("--all") && manifest.gitStacksBuild?.runtime !== "bun"
  if (includedByAll || explicitlyRequested || (requested.includes("--with-optional") && manifest.gitStacksBuild?.runtime === "bun")) {
    selected.push(directory)
  }
}

if (selected.length === 0) throw new Error("No workspace selected; pass --all or a package name")
for (const directory of selected) await buildPackage(directory)
