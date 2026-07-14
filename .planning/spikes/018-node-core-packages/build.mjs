import { build } from "esbuild"

await build({
  entryPoints: ["probe.ts"],
  outfile: "dist/probe.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  logLevel: "warning",
})
