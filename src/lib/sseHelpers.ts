export function readSseData<T>(event: Event) {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null
  }

  try {
    return JSON.parse(event.data) as T
  } catch {
    return null
  }
}

export function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === "AbortError") {
    return true
  }

  const message = error.message.toLowerCase()
  return message.includes("signal is aborted without reason") || message.includes("the operation was aborted")
}

export function formatRelativeTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return null
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))

  if (diffSeconds < 10) {
    return "たった今"
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}分前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}時間前`
  }

  return `${Math.floor(diffHours / 24)}日前`
}
