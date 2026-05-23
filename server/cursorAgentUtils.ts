type DisposableAgent = {
  close?: () => void
  [Symbol.asyncDispose]?: () => Promise<void>
}

export function extractJsonObject(
  raw: string,
  label = "Cursor agent response",
  createError: (message: string) => Error = (message) => new Error(message),
): string {
  const normalized = raw.trim()
  if (!normalized) {
    throw createError(`${label} was empty`)
  }

  // Try fenced code block first
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return candidate
    }
  }

  // If entire text is a JSON object, use it directly
  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    try {
      JSON.parse(normalized)
      return normalized
    } catch {
      // Fall through to brace matching
    }
  }

  // Find first opening brace
  const first = normalized.indexOf("{")
  if (first < 0) {
    throw createError(`${label} did not contain JSON`)
  }

  // Find matching closing brace by counting depth
  let depth = 0
  let last = -1
  for (let i = first; i < normalized.length; i++) {
    const char = normalized[i]
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
    throw createError(`${label} did not contain a complete JSON object`)
  }

  return normalized.slice(first, last + 1)
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
