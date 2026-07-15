import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const registry = "https://registry.npmjs.org"
const distTagConvergenceTimeoutMs = 5 * 60_000

export function releaseDistTag(version) {
  return version.includes("-") ? "next" : "latest"
}

export function assertPublishedArtifact(artifact, metadata) {
  if (metadata?.dist?.integrity !== artifact.integrity || metadata?.dist?.shasum !== artifact.shasum) {
    throw new Error(`${artifact.name}@${artifact.version} already exists with different release bytes`)
  }
}

export function registryRequestUrl(path, nonce = `${Date.now()}-${Math.random()}`) {
  const url = new URL(`${registry}/${path}`)
  url.searchParams.set("git-stacks-cache-bust", nonce)
  return url
}

async function registryJson(path) {
  const response = await fetch(registryRequestUrl(path), {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
    },
    cache: "no-store",
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`npm registry request failed with ${response.status}: ${await response.text()}`)
  return response.json()
}

async function publishedVersion(name, version) {
  return registryJson(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
}

async function publishTarball(path, tag) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("npm", ["publish", path, "--tag", tag, "--access", "public"], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
    child.once("error", reject)
    child.once("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`npm publish exited with code ${code}`)))
  })
}

async function verifyDistTags(artifacts, tag) {
  const deadline = Date.now() + distTagConvergenceTimeoutMs
  let pending = artifacts
  while (pending.length > 0 && Date.now() < deadline) {
    const next = []
    for (const artifact of pending) {
      const metadata = await registryJson(encodeURIComponent(artifact.name))
      if (metadata?.["dist-tags"]?.[tag] !== artifact.version) next.push(artifact)
    }
    pending = next
    if (pending.length > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000))
  }
  if (pending.length > 0) {
    throw new Error(`npm ${tag} dist-tag did not converge for: ${pending.map((item) => item.name).join(", ")}`)
  }
}

export async function publishRelease(manifestPath = join(root, "release", "npm", "manifest.json")) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const tag = releaseDistTag(manifest.version)
  if (process.env.NPM_DIST_TAG && process.env.NPM_DIST_TAG !== tag) {
    throw new Error(`Release metadata requires npm tag ${tag}, not ${process.env.NPM_DIST_TAG}`)
  }
  if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${manifest.version}`) {
    throw new Error(`GitHub release ${process.env.GITHUB_REF_NAME} does not match package version ${manifest.version}`)
  }

  const artifactByName = new Map(manifest.artifacts.map((artifact) => [artifact.name, artifact]))
  for (const name of manifest.publish_order) {
    const artifact = artifactByName.get(name)
    if (!artifact) throw new Error(`Release manifest is missing artifact metadata for ${name}`)
    const existing = await publishedVersion(artifact.name, artifact.version)
    if (existing) {
      assertPublishedArtifact(artifact, existing)
      console.log(`already published: ${artifact.name}@${artifact.version}`)
      continue
    }
    await publishTarball(join(dirname(manifestPath), artifact.filename), tag)
  }

  await verifyDistTags(manifest.artifacts, tag)
  console.log(`npm release published: ${manifest.version} (${tag})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishRelease(process.argv[2] ? resolve(process.argv[2]) : undefined)
}
