import { createHash } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
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
  platform: "browser",
  format: "iife",
  target: "es2024",
  minify: true,
  sourcemap: false,
  write: false,
  legalComments: "none",
})
const scriptFile = result.outputFiles.find((file) => file.path.endsWith(".js"))
const styleFile = result.outputFiles.find((file) => file.path.endsWith(".css"))
if (!scriptFile || !styleFile) throw new Error("Web build did not emit JavaScript and CSS")
const script = scriptFile.text
const style = styleFile.text
const scriptHash = createHash("sha256").update(script).digest("base64")
const styleHash = createHash("sha256").update(style).digest("base64")
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; style-src-elem 'unsafe-inline'; style-src-attr 'unsafe-inline'; connect-src https://127.0.0.1:*; img-src data:; worker-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'">
    <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(), payment=(), usb=()">
    <title>git-stacks</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
    <style>${style}</style>
  </head>
  <body>
    <div id="app"></div>
    <script>${script}</script>
  </body>
</html>
`
await writeFile(join(output, "git-stacks.html"), html)
await writeFile(join(output, "index.html"), html)
await writeFile(join(output, "manifest.json"), `${JSON.stringify({ version: "secure-file-v1", assets: ["git-stacks.html"], sha256: createHash("sha256").update(html).digest("base64url") }, null, 2)}\n`)
