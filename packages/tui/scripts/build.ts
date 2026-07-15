import solidPlugin from "@opentui/solid/bun-plugin"
import { chmod, copyFile, rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ["src/run.tsx"],
  outdir: "dist",
  target: "bun",
  external: ["@git-stacks/*", "@opentui/*", "solid-js"],
  plugins: [solidPlugin],
  sourcemap: "external",
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

// Keep the launcher unbundled: it must await the preload before Bun resolves
// the separately compiled dashboard and its external Solid dependency.
await copyFile("src/index.ts", "dist/index.js")
await chmod("dist/index.js", 0o755)
