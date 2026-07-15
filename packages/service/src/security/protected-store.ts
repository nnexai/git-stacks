import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

export function assertPrivateDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe protected directory: ${path}`)
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`Unsafe protected directory owner: ${path}`)
  if ((stat.mode & 0o777) !== 0o700) chmodSync(path, 0o700)
}

export function assertPrivateFile(path: string): void {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe protected file: ${path}`)
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`Unsafe protected file owner: ${path}`)
  if ((stat.mode & 0o777) !== 0o600) throw new Error(`Unsafe protected file permissions: ${path}`)
}

export function readProtectedFile(path: string): string | null {
  assertPrivateDirectory(dirname(path))
  let fd: number
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    if ((error as NodeJS.ErrnoException).code === "ELOOP") throw new Error(`Unsafe protected file: ${path}`, { cause: error })
    throw error
  }
  const stat = fstatSync(fd)
  if (!stat.isFile()) { closeSync(fd); throw new Error(`Unsafe protected file: ${path}`) }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) { closeSync(fd); throw new Error(`Unsafe protected file owner: ${path}`) }
  if ((stat.mode & 0o777) !== 0o600) { closeSync(fd); throw new Error(`Unsafe protected file permissions: ${path}`) }
  try { return readFileSync(fd, "utf8") } finally { closeSync(fd) }
}

export function writeProtectedFile(path: string, value: string, options: { replace?: boolean } = {}): void {
  assertPrivateDirectory(dirname(path))
  const temporary = join(dirname(path), `.${process.pid}.${crypto.randomUUID()}.tmp`)
  const fd = openSync(temporary, "wx", 0o600)
  try {
    writeFileSync(fd, value, "utf8")
    fsyncSync(fd)
  } catch (error) {
    try { unlinkSync(temporary) } catch {}
    throw error
  } finally {
    closeSync(fd)
  }
  if (options.replace === false) {
    try { linkSync(temporary, path) } finally { unlinkSync(temporary) }
  } else renameSync(temporary, path)
  chmodSync(path, 0o600)
  const directory = openSync(dirname(path), "r")
  try { fsyncSync(directory) } finally { closeSync(directory) }
}

export function readProtectedJson<T>(path: string, parse: (value: unknown) => T): T | null {
  const value = readProtectedFile(path)
  if (value === null) return null
  try { return parse(JSON.parse(value)) } catch (error) {
    throw new Error(`Invalid protected record ${path}`, { cause: error })
  }
}

export function writeProtectedJson(path: string, value: unknown, options: { replace?: boolean } = {}): void {
  writeProtectedFile(path, `${JSON.stringify(value)}\n`, options)
}
