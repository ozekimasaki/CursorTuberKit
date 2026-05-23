import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

type DisposableAgent = {
  close?: () => void
  [Symbol.asyncDispose]?: () => Promise<void>
}

export type SafeJsonFileReadResult<T> =
  | { status: "ok"; value: T }
  | { status: "recovered"; value: T; detail: string }
  | { status: "empty"; value: null }
  | { status: "invalid"; value: null; error: Error }

export function extractJsonObject(
  raw: string,
  label = "Cursor agent response",
  createError: (message: string) => Error = (message) => new Error(message),
): string {
  return extractJsonObjectSafe(raw, label, createError)
}

export function extractJsonObjectSafe(
  raw: string,
  label = "Cursor agent response",
  createError: (message: string) => Error = (message) => new Error(message),
): string {
  const normalized = raw.trim()

  if (!normalized) {
    throw createError(`${label} was empty`)
  }

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    try {
      const json = extractJsonObjectFromText(candidate)
      JSON.parse(json)
      return json
    } catch {
      // Fall through to the whole response.
    }
  }

  try {
    const json = extractJsonObjectFromText(normalized)
    JSON.parse(json)
    return json
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw createError(`${label} did not contain valid JSON: ${detail}`)
  }
}

export function extractJsonObjectFromText(text: string): string {
  const first = text.indexOf("{")
  if (first < 0) {
    throw new Error("No JSON object start was found")
  }

  let depth = 0
  let inString = false
  let escapeNext = false
  let last = -1
  for (let i = first; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === "\\") {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) {
        last = i
        break
      }
    }
  }

  if (last < 0) {
    throw new Error("No complete JSON object was found")
  }

  return text.slice(first, last + 1)
}

export async function readJsonFileSafe<T>(filePath: string): Promise<SafeJsonFileReadResult<T>> {
  const raw = await readFile(filePath, "utf8")
  const normalized = raw.trim()

  if (!normalized) {
    return { status: "empty", value: null }
  }

  try {
    return { status: "ok", value: JSON.parse(normalized) as T }
  } catch (firstError) {
    try {
      const json = extractJsonObjectFromText(normalized)
      const value = JSON.parse(json) as T
      const trailing = normalized.slice(json.length).trim()
      return {
        detail: trailing
          ? `Recovered first JSON object and ignored trailing data: ${truncate(trailing, 80)}`
          : `Recovered first JSON object after parse failure: ${
              firstError instanceof Error ? firstError.message : String(firstError)
            }`,
        status: "recovered",
        value,
      }
    } catch (secondError) {
      return {
        error: secondError instanceof Error ? secondError : new Error(String(secondError)),
        status: "invalid",
        value: null,
      }
    }
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown, options: { pretty?: boolean } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const body = options.pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
  await writeFile(tempFile, `${body}\n`, "utf8")
  await rename(tempFile, filePath)
}

export function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
  createError: (message: string) => Error = (message) => new Error(message),
): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.()
          reject(createError(`${label} exceeded ${ms}ms`))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function disposeAgentSafely(agent: DisposableAgent): Promise<void> {
  const asyncDispose = agent[Symbol.asyncDispose]
  if (typeof asyncDispose === "function") {
    await asyncDispose.call(agent)
  } else {
    agent.close?.()
  }
}
