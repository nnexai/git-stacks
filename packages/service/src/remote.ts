export { connectNodeWebTransport, connectNodeWebTransportEndpoints, startWebTransportListener } from "./transport/webtransport.js"
export { TargetRegistry, PairingAuthority, targetFromBundle, PairingBundleSchema } from "./security/targets.js"
export { IdentityStore, identityFingerprint } from "./security/identity.js"
export { verifySignedPinSet } from "./security/certificates.js"

import { createPrivateKey, createPublicKey } from "node:crypto"
import { authenticateSecureCarrier } from "@git-stacks/client"
import { PairingBundleSchema, TargetRegistry, targetFromBundle, type TargetRecord } from "./security/targets.js"
import { IdentityStore } from "./security/identity.js"
import { connectNodeWebTransportEndpoints } from "./transport/webtransport.js"

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
