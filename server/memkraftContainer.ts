import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

export type MemKraftContainerStatus = {
  executionMode: "local" | "container"
  imageReady?: boolean
  runtime?: string
  running?: boolean
}

type MemKraftContainerConfig = {
  buildContext: string
  containerName: string
  containerfilePath: string
  helperPath: string
  image: string
  memoryDir: string
  projectDir: string
  runtime: string
  workdir: string
}

type CommandOptions = {
  allowFailure?: boolean
  input?: string
  timeoutMs?: number
}

type CommandResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stderr: string
  stdout: string
}

let imagePrepared = false

export function getMemKraftExecutionMode() {
  return process.env.MEMKRAFT_EXECUTION_MODE?.trim().toLowerCase() === "local" ? "local" : "container"
}

export async function prepareMemKraftContainer() {
  if (getMemKraftExecutionMode() !== "container") {
    return { executionMode: "local" } satisfies MemKraftContainerStatus
  }

  const config = resolveContainerConfig()
  await ensureRuntime(config.runtime)
  await ensureImage(config)
  await ensureContainerRunning(config)
  return {
    executionMode: "container",
    imageReady: true,
    runtime: config.runtime,
    running: true,
  } satisfies MemKraftContainerStatus
}

export async function getMemKraftContainerStatus(): Promise<MemKraftContainerStatus> {
  if (getMemKraftExecutionMode() !== "container") {
    return { executionMode: "local" }
  }

  const config = resolveContainerConfig()
  await ensureRuntime(config.runtime)
  const imageReady = await hasImage(config)
  const running = imageReady ? await isContainerRunning(config) : false
  return {
    executionMode: "container",
    imageReady,
    runtime: config.runtime,
    running,
  }
}

export async function stopMemKraftContainer() {
  if (getMemKraftExecutionMode() !== "container") {
    return { executionMode: "local" } satisfies MemKraftContainerStatus
  }

  const config = resolveContainerConfig()
  await ensureRuntime(config.runtime)
  await runCommand(config.runtime, ["rm", "-f", config.containerName], { allowFailure: true })
  return {
    executionMode: "container",
    imageReady: await hasImage(config),
    runtime: config.runtime,
    running: false,
  } satisfies MemKraftContainerStatus
}

export async function executeMemKraftInContainer(command: string, payload: unknown) {
  const config = await prepareMemKraftContainerConfig()
  const result = await runCommand(
    config.runtime,
    [
      "exec",
      "-i",
      "-e",
      `MEMKRAFT_AGENT_ID=${process.env.MEMKRAFT_AGENT_ID?.trim() || "catlin"}`,
      "-e",
      `MEMKRAFT_CHANNEL_ID=${process.env.MEMKRAFT_CHANNEL_ID?.trim() || "catlin-global"}`,
      "-e",
      `MEMKRAFT_DIR=${getContainerMemoryDir(config)}`,
      config.containerName,
      "python",
      getContainerHelperPath(config),
      command,
    ],
    {
      input: JSON.stringify(payload),
      timeoutMs: 10000,
    },
  )

  if (result.signal) {
    throw new Error(`MemKraft helper が ${result.signal} で終了しました。`)
  }

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `MemKraft helper が異常終了しました (code: ${result.code ?? "null"}).`)
  }

  return { stderr: result.stderr, stdout: result.stdout }
}

function resolveContainerConfig(): MemKraftContainerConfig {
  const projectDir = process.cwd()
  const helperPath = path.resolve(projectDir, resolveMemKraftHelperRelativePath())
  const memoryDir = resolveMemKraftDir(projectDir)
  const containerfilePath = path.resolve(projectDir, "server/Containerfile.memkraft")

  if (!existsSync(helperPath)) {
    throw new Error(`MemKraft helper が見つかりません: ${helperPath}`)
  }

  if (!existsSync(containerfilePath)) {
    throw new Error(`MemKraft container file が見つかりません: ${containerfilePath}`)
  }

  if (!isPathInside(projectDir, helperPath)) {
    throw new Error("MemKraft helper はプロジェクト配下にある必要があります。")
  }

  return {
    buildContext: path.dirname(containerfilePath),
    containerName: process.env.MEMKRAFT_CONTAINER_NAME?.trim() || "maid-cat-memkraft",
    containerfilePath,
    helperPath,
    image: process.env.MEMKRAFT_CONTAINER_IMAGE?.trim() || "maid-cat-memkraft:latest",
    memoryDir,
    projectDir,
    runtime: process.env.MEMKRAFT_CONTAINER_RUNTIME?.trim() || "podman",
    workdir: process.env.MEMKRAFT_CONTAINER_WORKDIR?.trim() || "/workspace",
  }
}

async function prepareMemKraftContainerConfig() {
  const config = resolveContainerConfig()
  await ensureRuntime(config.runtime)
  await ensureImage(config)
  await ensureContainerRunning(config)
  return config
}

async function ensureRuntime(runtime: string) {
  const result = await runCommand(runtime, ["--version"], { timeoutMs: 5000 })

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `${runtime} を起動できませんでした。`)
  }
}

async function ensureImage(config: MemKraftContainerConfig) {
  if (imagePrepared && (await hasImage(config))) {
    return
  }

  if (await hasImage(config)) {
    imagePrepared = true
    return
  }

  const result = await runCommand(
    config.runtime,
    ["build", "-t", config.image, "-f", config.containerfilePath, config.buildContext],
    { timeoutMs: 180000 },
  )

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `MemKraft image ${config.image} のビルドに失敗しました。`)
  }

  imagePrepared = true
}

async function hasImage(config: MemKraftContainerConfig) {
  const result = await runCommand(config.runtime, ["image", "inspect", config.image], {
    allowFailure: true,
    timeoutMs: 10000,
  })
  return result.code === 0
}

async function ensureContainerRunning(config: MemKraftContainerConfig) {
  if (await isContainerRunning(config)) {
    return
  }

  await runCommand(config.runtime, ["rm", "-f", config.containerName], {
    allowFailure: true,
    timeoutMs: 10000,
  })

  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    config.containerName,
    "-v",
    `${config.projectDir}:${config.workdir}`,
    "-w",
    config.workdir,
  ]

  if (!isPathInside(config.projectDir, config.memoryDir)) {
    args.push("-v", `${config.memoryDir}:/memkraft-data`)
  }

  args.push(config.image, "tail", "-f", "/dev/null")

  const result = await runCommand(config.runtime, args, { timeoutMs: 30000 })

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `MemKraft container ${config.containerName} の起動に失敗しました。`)
  }
}

async function isContainerRunning(config: MemKraftContainerConfig) {
  const result = await runCommand(
    config.runtime,
    ["inspect", "-f", "{{.State.Running}}", config.containerName],
    { allowFailure: true, timeoutMs: 10000 },
  )

  return result.code === 0 && result.stdout.trim() === "true"
}

function getContainerHelperPath(config: MemKraftContainerConfig) {
  return toContainerPath(config.workdir, path.relative(config.projectDir, config.helperPath))
}

function getContainerMemoryDir(config: MemKraftContainerConfig) {
  if (isPathInside(config.projectDir, config.memoryDir)) {
    return toContainerPath(config.workdir, path.relative(config.projectDir, config.memoryDir))
  }

  return "/memkraft-data"
}

function resolveMemKraftDir(projectDir: string) {
  const configured = process.env.MEMKRAFT_DIR?.trim()
  return path.resolve(projectDir, configured || "memory")
}

function resolveMemKraftHelperRelativePath() {
  const isDistRuntime = process.argv[1]?.includes(`${path.sep}dist${path.sep}`) ?? false
  return isDistRuntime ? "dist/server/memkraft_bridge.py" : "server/memkraft_bridge.py"
}

function toContainerPath(base: string, relativePath: string) {
  const normalizedBase = base.replace(/\\/g, "/").replace(/\/$/, "")
  const normalizedRelative = relativePath.split(path.sep).join("/")
  return `${normalizedBase}/${normalizedRelative}`
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function runCommand(bin: string, args: string[], options: CommandOptions = {}) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    const timeout =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            child.kill("SIGKILL")
          }, options.timeoutMs)
        : null

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", (error) => {
      if (settled) {
        return
      }

      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }

      reject(new Error(`${bin} failed to start: ${error.message}`))
    })

    child.on("exit", (code, signal) => {
      if (settled) {
        return
      }

      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }

      if (code !== 0 && !options.allowFailure) {
        resolve({ code, signal, stderr, stdout })
        return
      }

      resolve({ code, signal, stderr, stdout })
    })

    child.stdin.end(options.input ?? "")
  })
}
