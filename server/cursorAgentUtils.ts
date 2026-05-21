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

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return candidate
    }
  }

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return normalized
  }

  const first = normalized.indexOf("{")
  const last = normalized.lastIndexOf("}")
  if (first < 0 || last <= first) {
    throw createError(`${label} did not contain JSON`)
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
