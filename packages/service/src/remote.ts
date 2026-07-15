export { connectNodeWebTransport, connectNodeWebTransportEndpoints, startWebTransportListener } from "./transport/webtransport.js"
export { TargetRegistry, PairingAuthority, targetFromBundle, PairingBundleSchema } from "./security/targets.js"
export { IdentityStore, identityFingerprint } from "./security/identity.js"
export { verifySignedPinSet } from "./security/certificates.js"

import { createPrivateKey, createPublicKey } from "node:crypto"
import { authenticateSecureCarrier } from "@git-stacks/client"
import { PairingBundleSchema, TargetRegistry, targetFromBundle, type TargetRecord } from "./security/targets.js"
import { IdentityStore } from "./security/identity.js"
import { connectNodeWebTransport, connectNodeWebTransportEndpoints } from "./transport/webtransport.js"

type LocalBrowserDescriptor = { webtransport: { endpoint: string; certificate_hash: string } }
type LocalBrowserLaunch = { token: string; listenerEpoch: string; grant: { targetId: string } }

export async function verifyLocalBrowserTransport(
  descriptor: LocalBrowserDescriptor,
  launch: LocalBrowserLaunch,
  timeoutMs = 2_000,
): Promise<void> {
  const carrier = await connectNodeWebTransport(descriptor.webtransport.endpoint, [descriptor.webtransport.certificate_hash], { timeoutMs })
  let rpc: Awaited<ReturnType<typeof authenticateSecureCarrier>>["rpc"] | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const authentication = authenticateSecureCarrier(carrier, {
      mode: "browser",
      targetId: launch.grant.targetId,
      listenerEpoch: launch.listenerEpoch,
      launchToken: launch.token,
      requestedScopes: [
        "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
        "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
      ],
      build: "git-stacks-web-preflight/0.21",
    })
    const authenticated = await Promise.race([
      authentication,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Browser transport preflight timed out")), timeoutMs) }),
    ])
    rpc = authenticated.rpc
  } finally {
    if (timer) clearTimeout(timer)
    const closing = rpc
      ? rpc.close("browser transport preflight complete").catch(() => undefined)
      : carrier.close("browser transport preflight failed").catch(() => undefined)
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      closing,
      new Promise<void>((resolve) => { closeTimer = setTimeout(resolve, 500) }),
    ])
    if (closeTimer) clearTimeout(closeTimer)
  }
}

async function cryptoKeyPair(privateKeyPem: string, publicKeyPem: string): Promise<CryptoKeyPair> {
  const privateDer = createPrivateKey(privateKeyPem).export({ type: "pkcs8", format: "der" })
  const publicDer = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" })
  return {
    privateKey: await crypto.subtle.importKey("pkcs8", privateDer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
    publicKey: await crypto.subtle.importKey("spki", publicDer, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
  }
}

export async function acceptRemotePairing(serviceRoot: string, value: unknown): Promise<TargetRecord> {
  const bundle = PairingBundleSchema.parse(value)
  if (Date.parse(bundle.expires_at) <= Date.now()) throw new Error("Pairing bundle is expired")
  const helper = new IdentityStore(serviceRoot, "helper").loadOrCreate()
  const carrier = await connectNodeWebTransportEndpoints(
    [bundle.pin_set.endpoint, ...(bundle.pin_set.alternate_endpoint ? [bundle.pin_set.alternate_endpoint] : [])],
    bundle.pin_set.hashes,
  )
  let authenticated: Awaited<ReturnType<typeof authenticateSecureCarrier>>
  try {
    authenticated = await authenticateSecureCarrier(carrier, {
      mode: "pairing",
      principalId: helper.id,
      targetId: bundle.target_id,
      listenerEpoch: bundle.listener_epoch,
      launchToken: bundle.token,
      requestedScopes: bundle.requested_scopes,
      build: "git-stacks-helper/0.21",
      keyPair: await cryptoKeyPair(helper.privateKeyPem, helper.publicKeyPem),
    })
  } catch (error) {
    await carrier.close("pairing authentication failed").catch(() => undefined)
    throw error
  }
  await authenticated.rpc.close("pairing complete")
  const registry = new TargetRegistry(serviceRoot)
  const target = registry.save(targetFromBundle(bundle, helper))
  return authenticated.pinSet === undefined ? target : registry.updatePins(target.id, authenticated.pinSet)
}
