import type { SecureScope } from "@git-stacks/protocol"

import { CertificateStore, createSignedPinSet, type SignedPinSet } from "../security/certificates.js"
import { IdentityStore, type ServiceIdentity } from "../security/identity.js"
import { LocalSessionAuthority, SecureSessionServer, type LaunchToken } from "../security/session-authority.js"
import { PairingAuthority, TargetRegistry } from "../security/targets.js"
import { startLocalTlsListener, type RunningLocalTlsListener } from "../transport/local-tls.js"
import { startWebTransportListener, type RunningWebTransportListener } from "../transport/webtransport.js"
import { SecureServiceRouter, type SecureServiceRouterOptions } from "./router.js"
import { RemoteTargetConnector, TargetRoutingHandler } from "./remote-connector.js"

export const ALL_LOCAL_SCOPES: SecureScope[] = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
]

export interface SecureServiceRuntimeOptions extends SecureServiceRouterOptions {
  serviceRoot: string
  webTransportHost?: string
  webTransportPort?: number
  remoteExposure?: { bindHost: string; advertiseHost: string; port?: number }
  onLaunchRotated?: (mode: "browser" | "tui", launch: LaunchToken) => void
  onLocalTransportRotated?: (value: {
    certificatePem: string
    webTransport: { endpoint: string; certificateHash: string }
    localTls: { hostname: "127.0.0.1"; port: number; servername: "localhost" }
  }) => void
}

export interface RunningSecureServiceRuntime {
  identity: ServiceIdentity
  pinSet: SignedPinSet
  listenerEpoch: string
  remoteListenerEpoch?: string
  certificatePem: string
  webTransport: { endpoint: string; certificateHash: string }
  localTls: { hostname: "127.0.0.1"; port: number; servername: "localhost" }
  initialBrowserLaunch: LaunchToken
  initialTuiLaunch: LaunchToken
  pairing: PairingAuthority
  targets: TargetRegistry
  get connectedClients(): number
  stop(): Promise<void>
}

export async function startSecureServiceRuntime(options: SecureServiceRuntimeOptions): Promise<RunningSecureServiceRuntime> {
  const identity = new IdentityStore(options.serviceRoot).loadOrCreate()
  const localCertificateStore = new CertificateStore(options.serviceRoot)
  const initialLocalRollover = await localCertificateStore.loadRollover()
  const certificate = initialLocalRollover.current
  const authority = new LocalSessionAuthority()
  const remoteListenerEpoch = crypto.randomUUID()
  const pairing = new PairingAuthority(options.serviceRoot, identity)
  const targets = new TargetRegistry(options.serviceRoot)
  let remoteSessionServer: SecureSessionServer | undefined
  let routing: TargetRoutingHandler | undefined
  let activePinSet: SignedPinSet | undefined
  const issueLaunch = (mode: "browser" | "tui", targetId: string) => {
    const target = targetId === identity.id ? undefined : targets.get(targetId)
    if (targetId !== identity.id && !target) throw new Error("Paired target not found")
    const launch = authority.issue({ mode, principalId: `${mode}:${targetId}`, targetId, scopes: target?.scopes ?? ALL_LOCAL_SCOPES })
    options.onLaunchRotated?.(mode, launch)
    return launch
  }
  const router = new SecureServiceRouter({
    ...options,
    issueLaunch,
    createPairingBundle: ({ name, scopes }) => {
      if (!activePinSet) throw new Error("Remote listener is not ready")
      return pairing.createBundle({ name, scopes, pinSet: activePinSet, listenerEpoch: remoteListenerEpoch })
    },
    listPairedHelpers: () => pairing.list(),
    revokePairedHelper: (id) => {
      const revoked = pairing.revoke(id)
      if (revoked) void remoteSessionServer?.revokeHelper(id)
      return revoked
    },
    listTargets: () => targets.list(),
    removeTarget: (id) => {
      const removed = targets.remove(id)
      if (removed) void routing?.closeTarget(id)
      return removed
    },
  })
  routing = new TargetRoutingHandler(identity.id, router, new RemoteTargetConnector(options.serviceRoot))
  const localSessionServer = new SecureSessionServer({
    serviceId: identity.id,
    listenerEpoch: authority.listenerEpoch,
    eventCursor: options.eventCursor ?? (async () => "0"),
    sessionOpened: (context) => context.mode === "browser" ? authority.registerBrowserSession(context) : undefined,
    sessionClosed: (context) => { if (context.mode === "browser") authority.clearBrowserSession(context) },
    admit: (hello) => {
      const admission = authority.admit(hello)
      if (admission && (hello.mode === "browser" || hello.mode === "tui")) {
        const launch = authority.issue({ mode: hello.mode, principalId: admission.principalId, targetId: admission.targetId, scopes: admission.scopes })
        options.onLaunchRotated?.(hello.mode, launch)
      }
      return admission
    },
    handler: routing,
  })
  remoteSessionServer = new SecureSessionServer({
    serviceId: identity.id,
    listenerEpoch: remoteListenerEpoch,
    eventCursor: options.eventCursor ?? (async () => "0"),
    pairingAuthority: pairing,
    currentPinSet: () => activePinSet,
    admit: () => null,
    handler: router,
  })
  type LocalListeners = { webTransport: RunningWebTransportListener; localTls: RunningLocalTlsListener }
  const localListeners = new Map<number, LocalListeners>()
  let localRotationTimer: ReturnType<typeof setTimeout> | undefined
  const remoteWebTransports = new Map<number, RunningWebTransportListener>()
  let remoteRotationTimer: ReturnType<typeof setTimeout> | undefined
  let currentLocal: LocalListeners | undefined
  try {
    const localPortFor = (generation: number) => options.webTransportPort
      ? options.webTransportPort + ((generation - 1) % 2)
      : 0
    const reconcileLocal = async (): Promise<void> => {
      const rollover = await localCertificateStore.loadRollover()
      const nextIsDue = Date.now() >= Date.parse(rollover.next.notBefore)
      const desired = new Set([rollover.current.generation, ...(nextIsDue ? [rollover.next.generation] : [])])
      for (const [generation, listeners] of [...localListeners]) {
        if (!desired.has(generation)) {
          localListeners.delete(generation)
          await Promise.allSettled([listeners.localTls.close(), listeners.webTransport.close()])
        }
      }
      for (const item of [rollover.current, ...(nextIsDue ? [rollover.next] : [])]) {
        if (localListeners.has(item.generation)) continue
        const webTransport = await startWebTransportListener({
          hostname: "127.0.0.1", port: localPortFor(item.generation),
          certificate: item.certPem, privateKey: item.keyPem, loopbackOnly: true,
          onControl: (duplex) => localSessionServer.accept(duplex),
        })
        try {
          const localTls = await startLocalTlsListener({
            certificate: item.certPem, privateKey: item.keyPem,
            onControl: (duplex) => localSessionServer.accept(duplex),
          })
          localListeners.set(item.generation, { webTransport, localTls })
        } catch (error) { await webTransport.close(); throw error }
      }
      currentLocal = localListeners.get(rollover.current.generation)!
      options.onLocalTransportRotated?.({
        certificatePem: rollover.current.certPem,
        webTransport: { endpoint: currentLocal.webTransport.endpoint, certificateHash: rollover.current.hash },
        localTls: { hostname: "127.0.0.1", port: currentLocal.localTls.port, servername: "localhost" },
      })
      if (localRotationTimer) clearTimeout(localRotationTimer)
      const wakeAt = nextIsDue ? Date.parse(rollover.current.notAfter) : Date.parse(rollover.next.notBefore)
      const delay = Math.max(1_000, wakeAt - Date.now() + 1_000)
      localRotationTimer = setTimeout(() => void reconcileLocal().catch(() => localSessionServer.close()), delay)
      localRotationTimer.unref?.()
    }
    await reconcileLocal()
    if (options.remoteExposure) {
      const store = new CertificateStore(options.serviceRoot, [options.remoteExposure.advertiseHost], "remote-transport")
      const portFor = (generation: number) => options.remoteExposure!.port
        ? options.remoteExposure!.port! + ((generation - 1) % 2)
        : 0
      const reconcile = async (): Promise<void> => {
        const rollover = await store.loadRollover()
        const nextIsDue = Date.now() >= Date.parse(rollover.next.notBefore) || !options.remoteExposure!.port
        const desired = new Set([rollover.current.generation, ...(nextIsDue ? [rollover.next.generation] : [])])
        for (const [generation, listener] of [...remoteWebTransports]) {
          if (!desired.has(generation)) { remoteWebTransports.delete(generation); await listener.close() }
        }
        for (const item of [rollover.current, ...(nextIsDue ? [rollover.next] : [])]) {
          if (remoteWebTransports.has(item.generation)) continue
          remoteWebTransports.set(item.generation, await startWebTransportListener({
            hostname: options.remoteExposure!.bindHost,
            port: portFor(item.generation),
            certificate: item.certPem,
            privateKey: item.keyPem,
            loopbackOnly: false,
            onControl: (duplex) => remoteSessionServer!.accept(duplex),
          }))
        }
        const current = remoteWebTransports.get(rollover.current.generation)!
        const next = remoteWebTransports.get(rollover.next.generation)
        const endpoint = `https://${options.remoteExposure!.advertiseHost}:${current.port}/git-stacks`
        const alternatePort = next?.port ?? portFor(rollover.next.generation)
        const alternateEndpoint = `https://${options.remoteExposure!.advertiseHost}:${alternatePort}/git-stacks`
        activePinSet = createSignedPinSet(identity, endpoint, rollover.current, [], { endpoint: alternateEndpoint, certificate: rollover.next })
        if (remoteRotationTimer) clearTimeout(remoteRotationTimer)
        const wakeAt = nextIsDue ? Date.parse(rollover.current.notAfter) : Date.parse(rollover.next.notBefore)
        const delay = Math.max(1_000, wakeAt - Date.now() + 1_000)
        remoteRotationTimer = setTimeout(() => void reconcile().catch(() => remoteSessionServer!.close()), delay)
        remoteRotationTimer.unref?.()
      }
      await reconcile()
    }
  } catch (error) {
    await Promise.allSettled([...localListeners.values()].flatMap((listeners) => [listeners.localTls.close(), listeners.webTransport.close()]))
    await Promise.allSettled([...remoteWebTransports.values()].map((listener) => listener.close()))
    throw error
  }
  if (!currentLocal) throw new Error("Local secure listeners did not start")
  const publishedLocal = currentLocal
  const localTarget = identity.id
  const initialBrowserLaunch = authority.issue({ mode: "browser", principalId: `browser:${localTarget}`, targetId: localTarget, scopes: ALL_LOCAL_SCOPES })
  const initialTuiLaunch = authority.issue({ mode: "tui", principalId: `tui:${localTarget}`, targetId: localTarget, scopes: ALL_LOCAL_SCOPES })
  const pinSet = activePinSet ?? createSignedPinSet(identity, publishedLocal.webTransport.endpoint, certificate)
  return {
    identity,
    pinSet,
    listenerEpoch: authority.listenerEpoch,
    ...(options.remoteExposure ? { remoteListenerEpoch } : {}),
    certificatePem: certificate.certPem,
    webTransport: { endpoint: publishedLocal.webTransport.endpoint, certificateHash: certificate.hash },
    localTls: { hostname: "127.0.0.1", port: publishedLocal.localTls.port, servername: "localhost" },
    initialBrowserLaunch,
    initialTuiLaunch,
    pairing,
    targets,
    get connectedClients() { return localSessionServer.activeSessions + remoteSessionServer!.activeSessions },
    async stop() {
      if (remoteRotationTimer) clearTimeout(remoteRotationTimer)
      if (localRotationTimer) clearTimeout(localRotationTimer)
      authority.revoke()
      await routing?.close()
      await Promise.all([localSessionServer.close(), remoteSessionServer!.close()])
      await router.stop()
      await Promise.allSettled([
        ...[...localListeners.values()].flatMap((listeners) => [listeners.localTls.close(), listeners.webTransport.close()]),
        ...[...remoteWebTransports.values()].map((listener) => listener.close()),
      ])
      options.broker?.close()
    },
  }
}
