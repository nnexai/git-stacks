#!/usr/bin/env node

import { startManagedService } from "./main.js"

const service = await startManagedService()

if (!service.existing) {
  await new Promise<void>((resolve, reject) => {
    let stopping = false
    const stop = async () => {
      if (stopping) return
      stopping = true
      try {
        await service.stop()
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    process.once("SIGINT", () => { void stop() })
    process.once("SIGTERM", () => { void stop() })
  })
}
