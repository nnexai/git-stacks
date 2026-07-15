import { readFile, readdir } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { builtinModules } from "node:module"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const packagesRoot = resolve(process.env.GS_ARCH_PACKAGES_ROOT ?? join(repositoryRoot, "packages"))
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])
const packageName = (directory) => `@git-stacks/${basename(directory)}`

const allowed = new Map([
  ["protocol", new Set()],
  ["client", new Set(["protocol"])],
  ["core", new Set()],
  ["cli", new Set(["core"])],
  ["service", new Set(["client", "core", "protocol", "web"])],
  ["web", new Set(["client", "protocol"])],
  ["tui", new Set(["client", "core", "protocol", "service"])],
])
const browserSafe = new Set(["protocol", "client", "web"])
const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']([^"']+)["']/g

async function sourceFiles(directory) {
  const files = []
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(path)
    }
  }
  await visit(directory)
  return files
}

function targetPackage(specifier) {
  const match = specifier.match(/^@git-stacks\/([^/]+)/)
  return match?.[1]
}

const failures = []
const localGraph = new Map()
for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const importer = entry.name
  const importerRoot = join(packagesRoot, importer)
  const sourceRoot = join(importerRoot, "src")
  let files
  try { files = await sourceFiles(sourceRoot) } catch { continue }
  for (const file of files) {
    const source = await readFile(file, "utf8")
    const localImports = []
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      const imported = targetPackage(specifier)
      const relativeFile = relative(repositoryRoot, file)
      const explicitCliLauncher = importer === "cli" && imported === "service"
        && ["packages/cli/src/commands/service.ts", "packages/cli/src/commands/web.ts"].includes(relativeFile)
      const forbiddenTuiServiceRoot = importer === "tui" && imported === "service"
        && specifier !== "@git-stacks/service/client"
      if (forbiddenTuiServiceRoot) {
        failures.push(`${relative(repositoryRoot, file)}: @git-stacks/tui may only import @git-stacks/service/client (${specifier})`)
      }
      if (imported && imported !== importer && !allowed.get(importer)?.has(imported) && !explicitCliLauncher) {
        failures.push(`${relative(repositoryRoot, file)}: ${packageName(importerRoot)} must not import @git-stacks/${imported} (${specifier})`)
      }
      if (browserSafe.has(importer) && (builtins.has(specifier) || specifier.startsWith("node:"))) {
        failures.push(`${relative(repositoryRoot, file)}: ${packageName(importerRoot)} must not import Node builtin ${specifier}`)
      }
      if (browserSafe.has(importer) && /^(?:bun|bun:)/.test(specifier)) {
        failures.push(`${relative(repositoryRoot, file)}: ${packageName(importerRoot)} must not import Bun runtime ${specifier}`)
      }
      if (specifier.startsWith(".")) {
        const candidate = resolve(dirname(file), specifier.replace(/\.js$/, ""))
        for (const resolved of [candidate, `${candidate}.ts`, `${candidate}.tsx`, join(candidate, "index.ts")]) {
          if (files.includes(resolved)) { localImports.push(resolved); break }
        }
      }
    }
    localGraph.set(file, localImports)
  }
}

if (process.argv.includes("--cycles")) {
  const visiting = new Set()
  const visited = new Set()
  function visit(file, path = []) {
    if (visiting.has(file)) {
      const cycle = [...path.slice(path.indexOf(file)), file].map((entry) => relative(repositoryRoot, entry)).join(" -> ")
      failures.push(`circular package import: ${cycle}`)
      return
    }
    if (visited.has(file)) return
    visiting.add(file)
    for (const dependency of localGraph.get(file) ?? []) visit(dependency, [...path, file])
    visiting.delete(file)
    visited.add(file)
  }
  for (const file of localGraph.keys()) visit(file)
}

if (failures.length) {
  console.error("Package architecture violations:\n" + failures.map((failure) => `- ${failure}`).join("\n"))
  process.exit(1)
}
console.log("Package architecture: OK")
