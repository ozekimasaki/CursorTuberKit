export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function parseJsonMessage(message: string) {
  if (!message.startsWith("{") && !message.startsWith("[")) {
    return null
  }

  try {
    return JSON.parse(message)
  } catch {
    return null
  }
}

export function extractErrorMessage(value: unknown, seen: Set<object>): string | null {
  if (typeof value === "string") {
    const message = value.trim()

    if (!message) {
      return null
    }

    const parsedJson = parseJsonMessage(message)

    return extractErrorMessage(parsedJson, seen) ?? message
  }

  if (value instanceof Error) {
    return extractErrorMessage(value.message, seen) ?? value.name
  }

  if (!isRecord(value)) {
    return null
  }

  if (seen.has(value)) {
    return null
  }

  seen.add(value)

  return (
    extractErrorMessage(value.message, seen) ??
    extractErrorMessage(value.error, seen) ??
    extractErrorMessage(value.details, seen)
  )
}

export function getErrorMessage(error: unknown) {
  return extractErrorMessage(error, new Set()) ?? "AI応答の生成中に不明なエラーが発生しました。"
}
