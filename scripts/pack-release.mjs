import { execFileSync } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, process.argv[2] ?? "release/npm")
const packageTargets = [
  "packages/protocol",
  "packages/client",
  "packages/core",
  "packages/web",
  "packages/service",
  "packages/cli",
  "packages/tui",
  ".",
]

const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

const artifacts = []
for (const target of packageTargets) {
  const cwd = resolve(root, target)
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }))[0]
  if (!packed || packed.version !== rootManifest.version || typeof packed.filename !== "string") {
    throw new Error(`${target}: npm pack returned invalid release metadata`)
  }
  artifacts.push({
    name: packed.name,
    version: packed.version,
    filename: packed.filename,
    size: packed.size,
    unpackedSize: packed.unpackedSize,
    shasum: packed.shasum,
    integrity: packed.integrity,
    files: packed.entryCount,
  })
}

const manifest = {
  version: rootManifest.version,
  tag: `v${rootManifest.version}`,
  npm_dist_tag: "next",
  publish_order: artifacts.map((artifact) => artifact.name),
  artifacts,
}
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
console.log(`Release artifacts: OK (${artifacts.length} tarballs in ${output})`)
