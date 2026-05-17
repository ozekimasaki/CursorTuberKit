import { spawn } from "node:child_process"

const command = process.argv[2]
const runtime = process.env.VOICEVOX_CONTAINER_RUNTIME ?? "podman"
const containerName = process.env.VOICEVOX_CONTAINER_NAME ?? "cursor-tuber-kit-voicevox"
const image = normalizeImageRef(process.env.VOICEVOX_IMAGE ?? "docker.io/voicevox/voicevox_engine:cpu-latest")
const port = process.env.VOICEVOX_PORT ?? "50021"
const voicevoxUrl = process.env.VOICEVOX_URL ?? `http://127.0.0.1:${port}`

if (!command || !["start", "stop", "status"].includes(command)) {
  console.error("Usage: node scripts/voicevox.mjs <start|stop|status>  (or: bun scripts/voicevox.mjs <start|stop|status>)")
  process.exit(1)
}

try {
  if (command === "start") {
    await startVoicevox()
  }

  if (command === "stop") {
    await stopVoicevox()
  }

  if (command === "status") {
    await printStatus()
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "VOICEVOX command failed.")
  process.exit(1)
}

async function startVoicevox() {
  await ensureRuntime()

  if (await isEngineHealthy()) {
    console.log(`VOICEVOX ENGINE is already reachable at ${voicevoxUrl}`)
    return
  }

  await run(runtime, ["rm", "-f", containerName], { allowFailure: true })
  await run(runtime, [
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-p",
    `127.0.0.1:${port}:50021`,
    image,
  ])

  await waitForEngine()
  console.log(`VOICEVOX ENGINE started at ${voicevoxUrl}`)
}

async function stopVoicevox() {
  await ensureRuntime()
  await run(runtime, ["stop", containerName], { allowFailure: true })
  console.log(`VOICEVOX ENGINE container stopped: ${containerName}`)
}

async function printStatus() {
  const healthy = await isEngineHealthy()

  if (healthy) {
    const version = await getEngineVersion()
    console.log(`VOICEVOX ENGINE is reachable at ${voicevoxUrl}${version ? ` (version: ${version})` : ""}`)
    return
  }

  console.log(`VOICEVOX ENGINE is not reachable at ${voicevoxUrl}`)

  try {
    await ensureRuntime()
  } catch (error) {
    console.log(error instanceof Error ? `Container runtime is not ready: ${error.message}` : "Container runtime is not ready.")
  }
}

async function ensureRuntime() {
  await run(runtime, ["--version"])
}

async function waitForEngine() {
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    if (await isEngineHealthy()) {
      return
    }

    await delay(1500)
  }

  throw new Error(`VOICEVOX ENGINE did not become ready at ${voicevoxUrl}`)
}

async function isEngineHealthy() {
  return Boolean(await getEngineVersion())
}

async function getEngineVersion() {
  try {
    const response = await fetch(`${voicevoxUrl}/version`, { signal: AbortSignal.timeout(3000) })

    if (!response.ok) {
      return null
    }

    return (await response.text()).trim().replace(/^"|"$/g, "")
  } catch {
    return null
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function run(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "inherit" })

    child.on("error", (error) => {
      reject(new Error(`${bin} failed to start: ${error.message}`))
    })

    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve()
        return
      }

      if (bin === "podman" && code === 125) {
        reject(
          new Error(
            [
              `${bin} ${args.join(" ")} exited with code ${code}`,
              "Rootless Podman could not start the container.",
              "If this happens inside Devbox/Nix, install/configure Podman on the host so newuidmap/newgidmap have setuid or file capabilities, then rerun devbox run voicevox:start.",
              "Alternatively set VOICEVOX_CONTAINER_RUNTIME=docker if Docker is available.",
            ].join("\n"),
          ),
        )
        return
      }

      reject(new Error(`${bin} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

function normalizeImageRef(ref) {
  const firstSegment = ref.split("/")[0]
  const isQualified =
    firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost"

  if (isQualified) {
    return ref
  }

  return `docker.io/${ref}`
}
