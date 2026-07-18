import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { loadAppConfig } from "../config/load-config.mjs"

const command = process.argv[2]
const appConfig = loadAppConfig()
const projectRoot = process.cwd()
const irodoriConfig = appConfig.irodori ?? {}
const irodoriUrl = irodoriConfig.url || "http://127.0.0.1:50021"
const pythonBin = irodoriConfig.pythonBin || "python"
const checkpoint = irodoriConfig.checkpoint || ""
const noRef = irodoriConfig.noRef ?? true
const useFused = irodoriConfig.useFused ?? true
const forceFp16 = irodoriConfig.forceFp16 ?? true
const pidFile = path.resolve(projectRoot, "memory", "irodori.pid")

if (!command || !["start", "stop", "status"].includes(command)) {
  console.error("Usage: node scripts/irodori.mjs <start|stop|status>")
  process.exit(1)
}

try {
  if (command === "start") {
    await startIrodori()
  } else if (command === "stop") {
    await stopIrodori()
  } else {
    await printStatus()
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Irodori command failed.")
  process.exit(1)
}

async function startIrodori() {
  if (await isEngineHealthy()) {
    console.log(`Irodori-TTS-Lite is already reachable at ${irodoriUrl}`)
    return
  }

  const { hostname, port } = new URL(irodoriUrl)
  const args = [
    path.resolve(projectRoot, "server", "python", "irodori_tts_server.py"),
    "--host",
    hostname,
    "--port",
    String(port),
  ]
  if (checkpoint) args.push("--checkpoint", checkpoint)
  if (noRef) args.push("--no-ref")
  if (!useFused) args.push("--no-fused")
  if (!forceFp16) args.push("--no-fp16")

  const child = spawn(pythonBin, args, {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  })

  child.unref()
  writeFileSync(pidFile, String(child.pid))

  await waitForEngine()
  console.log(`Irodori-TTS-Lite started at ${irodoriUrl} (pid: ${child.pid})`)
}

async function stopIrodori() {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, "utf8").trim())
    if (pid) {
      await killProcess(pid)
    }
    try {
      unlinkSync(pidFile)
    } catch {
      // ignore
    }
  }

  // Fallback: stop any python process listening on the Irodori port.
  await killProcessOnPort()
  console.log("Irodori-TTS-Lite stopped.")
}

async function printStatus() {
  const healthy = await isEngineHealthy()
  if (healthy) {
    const version = await getEngineVersion()
    console.log(`Irodori-TTS-Lite is reachable at ${irodoriUrl}${version ? ` (version: ${version})` : ""}`)
    return
  }
  console.log(`Irodori-TTS-Lite is not reachable at ${irodoriUrl}`)
}

async function isEngineHealthy() {
  return Boolean(await getEngineVersion())
}

async function getEngineVersion() {
  try {
    const response = await fetch(`${irodoriUrl}/version`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null
    return (await response.text()).trim().replace(/^"|"$/g, "")
  } catch {
    return null
  }
}

async function waitForEngine() {
  const deadline = Date.now() + 300_000 // 5 minutes; model download/loading can be slow
  while (Date.now() < deadline) {
    if (await isEngineHealthy()) return
    await delay(1500)
  }
  throw new Error(`Irodori-TTS-Lite did not become ready at ${irodoriUrl}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function killProcess(pid) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32"
    const bin = isWindows ? "taskkill" : "kill"
    const args = isWindows ? ["/PID", String(pid), "/F"] : ["-9", String(pid)]
    const child = spawn(bin, args, { stdio: "ignore" })
    child.on("exit", () => resolve())
    child.on("error", () => resolve())
  })
}

async function killProcessOnPort() {
  if (process.platform !== "win32") return
  // PowerShell fallback to terminate any python process bound to the Irodori port.
  const { port } = new URL(irodoriUrl)
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell",
      [
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: "ignore" },
    )
    ps.on("exit", () => resolve())
    ps.on("error", () => resolve())
  })
}
