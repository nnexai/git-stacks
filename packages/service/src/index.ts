export {
  readServiceDescriptor,
  readUsableServiceDescriptor,
  startManagedService,
  ensureManagedServiceProcess,
} from "./main.js"
export { startServiceServer } from "./server.js"
export { readOfficialClientCredential } from "./policy/credentials.js"
export { WebTerminalManager } from "./web/terminal-manager.js"
export type { PtyFactory, PtyProcess } from "./web/terminal-manager.js"
