import { spawn } from "node:child_process"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const tsxPath = path.resolve(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
const serverEntry = path.resolve(projectRoot, "server", "index.ts")

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.once("listening", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
    server.listen(0)
  })
}

async function waitForHealth(port: number, timeoutMs = 15000): Promise<Response> {
  const deadline = Date.now() + timeoutMs
  const url = `http://127.0.0.1:${port}/api/health`
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        return response
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Server health check failed: ${lastError}`)
}

describe("server smoke", { timeout: 30_000 }, () => {
  it("starts and responds to /api/health", async () => {
    const port = await findAvailablePort()
    const child = spawn(process.execPath, [tsxPath, serverEntry], {
      cwd: projectRoot,
      env: { ...process.env, CTK_SERVER_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    })

    try {
      const response = await waitForHealth(port)
      const body = (await response.json()) as { ok: boolean; service?: string }
      expect(body.ok).toBe(true)
      expect(body.service).toBeDefined()
    } finally {
      try {
        child.kill("SIGTERM")
      } catch {
        // process may have already exited
      }
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve())
        setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {
            // already exited
          }
          resolve()
        }, 5000)
      })
    }
  })
})
