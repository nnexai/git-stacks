export {
  readServiceDescriptor,
  readUsableServiceDescriptor,
  startManagedService,
  ensureManagedServiceProcess,
} from "./main.js"
export { WebTerminalManager } from "./web/terminal-manager.js"
export type { PtyFactory, PtyProcess } from "./web/terminal-manager.js"
export { connectLocalTls } from "./transport/local-tls.js"
export { IdentityStore, identityFingerprint } from "./security/identity.js"
export { CertificateStore, createSignedPinSet, verifySignedPinSet } from "./security/certificates.js"
export { TargetRegistry, PairingAuthority, targetFromBundle } from "./security/targets.js"
export { configureRemoteExposure, readRemoteExposure } from "./security/exposure.js"
