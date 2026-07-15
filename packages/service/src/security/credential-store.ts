import { createRequire } from "node:module"

export interface PrivateKeyCredentialStore {
  readonly kind: "os"
  get(account: string): string | null
  set(account: string, value: string): void
  delete(account: string): boolean
}

type KeyringEntry = {
  getPassword(): string | null
  setPassword(value: string): void
  deletePassword(): boolean
}
type KeyringModule = { Entry: new (service: string, account: string) => KeyringEntry }

const require = createRequire(import.meta.url)

/**
 * Use the native OS credential service without ever placing key material in a
 * command line. Unsupported, locked, or unavailable stores return null so a
 * new identity can use the protected-file fallback. Once metadata selects the
 * OS store, later access failures are fatal in IdentityStore.
 */
export function discoverOsCredentialStore(): PrivateKeyCredentialStore | null {
  if (process.env.GIT_STACKS_KEY_STORE === "file") return null
  if (process.platform !== "darwin" && process.platform !== "linux") return null
  try {
    const { Entry } = require("@napi-rs/keyring") as KeyringModule
    const entry = (account: string) => new Entry("dev.git-stacks.identity", account)
    return {
      kind: "os",
      get: (account) => entry(account).getPassword(),
      set: (account, value) => entry(account).setPassword(value),
      delete: (account) => entry(account).deletePassword(),
    }
  } catch { return null }
}

