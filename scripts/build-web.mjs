import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { build } from "esbuild"

const root = resolve(import.meta.dirname, "..")
const source = join(root, "packages", "web", "src")
const output = join(root, "packages", "web", "dist")

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const result = await build({
  entryPoints: [join(source, "app.ts")],
  outdir: output,
  bundle: true,
  packages: "external",
  platform: "browser",
  format: "esm",
  target: "es2024",
  minify: true,
  sourcemap: true,
  metafile: true,
  entryNames: "app-[hash]",
  assetNames: "asset-[hash]",
})
const outputs = Object.keys(result.metafile.outputs).map((path) => basename(path))
const script = outputs.find((path) => path.endsWith(".js"))
const style = outputs.find((path) => path.endsWith(".css"))
if (!script || !style) throw new Error("Web build did not emit JavaScript and CSS assets")
let html = await readFile(join(source, "index.html"), "utf8")
html = html.replace("/web/assets/app.js", `/web/assets/${script}`).replace("/web/assets/app.css", `/web/assets/${style}`)
await writeFile(join(output, "index.html"), html)
await cp(join(source, "favicon.svg"), join(output, "favicon.svg")).catch(() => {})
const assets = ["index.html", script, style, ...outputs.filter((path) => !path.endsWith(".map") && path !== script && path !== style)]
await writeFile(join(output, "manifest.json"), `${JSON.stringify({ version: "v1", assets: [...new Set(assets)].sort() }, null, 2)}\n`)
