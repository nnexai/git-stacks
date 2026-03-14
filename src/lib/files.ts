import { copyFileSync, symlinkSync, existsSync } from "fs"
import { join } from "path"
import type { StackRepo } from "./config"

// For each path in `copy`: copies main_path/file → task_path/file (if source exists)
// For each path in `symlink`: creates symlink task_path/file → main_path/file (if source exists)
export function applyFileOperations(stackRepo: StackRepo, taskPath: string): void {
  const { files } = stackRepo
  if (!files) return

  for (const file of files.copy ?? []) {
    const src = join(stackRepo.path, file)
    const dst = join(taskPath, file)
    if (existsSync(src)) {
      try {
        copyFileSync(src, dst)
      } catch {
        // silently skip
      }
    }
  }

  for (const file of files.symlink ?? []) {
    const src = join(stackRepo.path, file)
    const dst = join(taskPath, file)
    if (existsSync(src)) {
      try {
        symlinkSync(src, dst)
      } catch {
        // silently skip (dst may already exist)
      }
    }
  }
}
