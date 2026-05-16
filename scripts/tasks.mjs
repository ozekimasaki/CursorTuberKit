import { copyFile, mkdir, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import net from "node:net"
import { spawn } from "node:child_process"

const projectRoot = process.cwd()
const task = process.argv[2]
const backendPort = Number(process.env.PORT ?? 8787)
const clientPort = Number(process.env.VITE_PORT ?? 5173)

if (!task) {
  console.error("Usage: node scripts/tasks.mjs <task>")
  process.exit(1)
}

const tasks = {
  async build() {
    await ensureSupportedInstall()
    await runTypecheck()
    await runVite(["build"])
    await runTsc(["-p", "tsconfig.node.json"])
    await copyServerPythonFiles()
  },
  async "build:bun"() {
    await ensureSupportedInstall()
    await runTypecheck({ preferBun: true })
    await runVite(["build"], { preferBun: true })
    await runTsc(["-p", "tsconfig.node.json"], { preferBun: true })
    await copyServerPythonFiles()
  },
  async "build:client"() {
    await ensureSupportedInstall()
    await runVite(["build"])
  },
  async "build:server"() {
    await ensureSupportedInstall()
    await runTsc(["-p", "tsconfig.node.json"])
    await copyServerPythonFiles()
  },
  async dev() {
    await ensureSupportedInstall()
    await assertPortsAvailable([
      { label: "Frontend dev server", port: clientPort },
      { label: "Backend server", port: backendPort },
    ])
    await runTsc(["-p", "tsconfig.node.json"])
    await runTsx(["scripts/memkraft.ts", "prepare"])
    await runJsScript(["scripts/voicevox.mjs", "start"])
    await runManagedDev()
  },
  async "dev:bun"() {
    await ensureSupportedInstall()
    await assertPortsAvailable([
      { label: "Frontend dev server", port: clientPort },
      { label: "Backend server", port: backendPort },
    ])
    await runTsc(["-p", "tsconfig.node.json"], { preferBun: true })
    await runTsx(["scripts/memkraft.ts", "prepare"], { preferBun: true })
    await runJsScript(["scripts/voicevox.mjs", "start"], { preferBun: true })
    await runManagedDev({ preferBun: true })
  },
  async "dev:client"() {
    await ensureSupportedInstall()
    await assertPortAvailable(clientPort, "Frontend dev server")
    await tasks["_vite-dev"]()
  },
  async "dev:server"() {
    await ensureSupportedInstall()
    await assertPortAvailable(backendPort, "Backend server")
    await runTsc(["-p", "tsconfig.node.json"])
    await tasks["_server-dev"]()
  },
  async "memkraft:start"() {
    await runTsx(["scripts/memkraft.ts", "start"])
  },
  async "memkraft:status"() {
    await runTsx(["scripts/memkraft.ts", "status"])
  },
  async "memkraft:stop"() {
    await runTsx(["scripts/memkraft.ts", "stop"])
  },
  async start() {
    await ensureSupportedInstall()
    await assertPortAvailable(backendPort, "Backend server")
    await runServerStart(["dist/server/index.js"], {
      env: { NODE_ENV: "production" },
    })
  },
  async "start:bun"() {
    await ensureSupportedInstall()
    await assertPortAvailable(backendPort, "Backend server")
    await runServerStart(["dist/server/index.js"], {
      env: { NODE_ENV: "production" },
      preferBun: true,
    })
  },
  async "start:node"() {
    await ensureSupportedInstall()
    await assertPortAvailable(backendPort, "Backend server")
    await runNode([path.resolve(projectRoot, "dist", "server", "index.js")], {
      env: { NODE_ENV: "production" },
    })
  },
  async typecheck() {
    await ensureSupportedInstall()
    await runTypecheck()
  },
  async "typecheck:bun"() {
    await ensureSupportedInstall()
    await runTypecheck({ preferBun: true })
  },
  async "voicevox:start"() {
    await runJsScript(["scripts/voicevox.mjs", "start"])
  },
  async "voicevox:status"() {
    await runJsScript(["scripts/voicevox.mjs", "status"])
  },
  async "voicevox:stop"() {
    await runJsScript(["scripts/voicevox.mjs", "stop"])
  },
  async "_server-dev"() {
    await assertPortAvailable(backendPort, "Backend server")
    await runServerDev([], { preferBun: process.argv.includes("--prefer-bun") })
  },
  async "_vite-dev"() {
    await assertPortAvailable(clientPort, "Frontend dev server")
    await runVite(["--host", "0.0.0.0", "--strictPort"], { preferBun: process.argv.includes("--prefer-bun") })
  },
}

const selectedTask = tasks[task]

if (!selectedTask) {
  console.error(`Unsupported task: ${task}`)
  process.exit(1)
}

try {
  await selectedTask()
} catch (error) {
  console.error(error instanceof Error ? error.message : "Task execution failed.")
  process.exit(1)
}

async function ensureSupportedInstall() {
  await runNode([path.resolve(projectRoot, "scripts", "ensure-supported-install.mjs")])
}

async function runTypecheck(options = {}) {
  await runTsc(["-p", "tsconfig.json", "--noEmit"], options)
  await runTsc(["-p", "tsconfig.node.json", "--noEmit"], options)
}

async function runConcurrently(commands) {
  await runNode([resolvePackageBin("concurrently", "dist", "bin", "concurrently.js"), "-k", ...commands])
}

async function runManagedDev(options = {}) {
  const preferBun = Boolean(options.preferBun)
  const childArgs = preferBun ? ["--prefer-bun"] : []
  const serverChild = spawnChild(process.execPath, [path.resolve(projectRoot, "scripts", "tasks.mjs"), "_server-dev", ...childArgs], "server")

  try {
    await waitForHttpReady(`http://127.0.0.1:${backendPort}/api/health`, serverChild, "Backend server")
  } catch (error) {
    stopChild(serverChild)
    throw error
  }

  const clientChild = spawnChild(process.execPath, [path.resolve(projectRoot, "scripts", "tasks.mjs"), "_vite-dev", ...childArgs], "client")
  await waitForChildGroup([serverChild, clientChild])
}

async function runTsc(args, options = {}) {
  if (shouldUseBun("tsc", options)) {
    await runBunx("tsc", args, options)
    return
  }

  await runNode([resolvePackageBin("typescript", "bin", "tsc"), ...args], options)
}

async function runTsx(args, options = {}) {
  if (shouldUseBun("tsx", options)) {
    await runBunx("tsx", args, options)
    return
  }

  await runNode([resolvePackageBin("tsx", "dist", "cli.mjs"), ...args], options)
}

async function runVite(args, options = {}) {
  if (shouldUseBun("vite", options)) {
    await runBunx("vite", args, options)
    return
  }

  await runNode([resolvePackageBin("vite", "bin", "vite.js"), ...args], options)
}

async function runServerDev(args, options = {}) {
  if (shouldUseBun("server-dev", options)) {
    await runProcess(resolveBunExecutable(), ["--watch", "server/index.ts", ...args], options)
    return
  }

  await runNode([resolvePackageBin("tsx", "dist", "cli.mjs"), "watch", "server/index.ts", ...args], options)
}

async function runServerStart(args, options = {}) {
  if (shouldUseBun("server-start", options)) {
    await runProcess(resolveBunExecutable(), args, options)
    return
  }

  await runNode(args.map((value, index) => (index === 0 ? path.resolve(projectRoot, value) : value)), options)
}

async function runJsScript(args, options = {}) {
  if (shouldUseBun("js-script", options)) {
    await runProcess(resolveBunExecutable(), args, options)
    return
  }

  const [scriptPath, ...rest] = args
  await runNode([path.resolve(projectRoot, scriptPath), ...rest], options)
}

async function runBunx(command, args, options = {}) {
  await runProcess(resolveBunxExecutable(), [command, ...args], options)
}

async function runNode(args, options = {}) {
  await runProcess(process.execPath, args, options)
}

async function copyServerPythonFiles() {
  const sourceDir = path.resolve(projectRoot, "server")
  const targetDir = path.resolve(projectRoot, "dist", "server")
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const pythonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".py"))

  await mkdir(targetDir, { recursive: true })
  await Promise.all(
    pythonFiles.map((entry) =>
      copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name)),
    ),
  )
}

async function assertPortsAvailable(entries) {
  for (const entry of entries) {
    await assertPortAvailable(entry.port, entry.label)
  }
}

async function assertPortAvailable(port, label) {
  const available = await isPortAvailable(port)

  if (!available) {
    throw new Error(`${label} port ${port} is already in use. Stop the existing process before starting this command again.`)
  }
}

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        resolve(false)
        return
      }

      reject(error)
    })

    server.once("listening", () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }

        resolve(true)
      })
    })

    server.listen(port)
  })
}

function shouldUseBun(mode, options) {
  if ((mode === "server-dev" || mode === "server-start") && process.env.AI_PROVIDER === "cursor") {
    return false
  }

  if (options.preferBun) {
    return true
  }

  return (process.env.npm_config_user_agent ?? "").startsWith("bun/")
}

function spawnChild(command, args, label) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  })

  child.on("error", (error) => {
    console.error(`${label} failed to start: ${error.message}`)
  })

  return child
}

function stopChild(child) {
  if (!child.killed) {
    child.kill()
  }
}

function waitForChildGroup(children) {
  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      process.off("SIGINT", handleSignal)
      process.off("SIGTERM", handleSignal)
    }

    const finish = (error) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      for (const child of children) {
        stopChild(child)
      }

      if (error) {
        reject(error)
        return
      }

      resolve()
    }

    const handleSignal = () => {
      finish()
    }

    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)

    for (const [index, child] of children.entries()) {
      const label = index === 0 ? "server" : "client"

      child.on("exit", (code, signal) => {
        if (signal || code === 0) {
          finish()
          return
        }

        finish(new Error(`${label} exited with code ${code}.`))
      })

      child.on("error", (error) => {
        finish(new Error(`${label} failed to start: ${error.message}`))
      })
    }
  })
}

async function waitForHttpReady(url, child, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready.`)
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })

      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until the server is ready or the timeout expires.
    }

    await delay(500)
  }

  stopChild(child)
  throw new Error(`${label} did not become ready at ${url}.`)
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolvePackageBin(packageName, ...segments) {
  const resolvedPath = path.resolve(projectRoot, "node_modules", packageName, ...segments)

  if (!existsSync(resolvedPath)) {
    throw new Error(`Missing dependency entrypoint: ${resolvedPath}. Run npm install or bun install first.`)
  }

  return resolvedPath
}

function resolveBunExecutable() {
  return process.platform === "win32" ? "bun.exe" : "bun"
}

function resolveBunxExecutable() {
  return process.platform === "win32" ? "bunx.exe" : "bunx"
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    })

    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`))
    })

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}.`))
        return
      }

      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
    })
  })
}
