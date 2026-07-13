import { mkdir, rm, writeFile, copyFile } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const output = join(root, "dist", "web")
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

const result = await Bun.build({
  entrypoints: [join(root, "src", "web-client", "app.ts")],
  outdir: output,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "none",
  naming: "[name].[ext]",
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
await copyFile(join(root, "src", "web-client", "index.html"), join(output, "index.html"))
await writeFile(join(output, "manifest.json"), `${JSON.stringify({ assets: ["index.html", "app.js", "app.css"] }, null, 2)}\n`)
