type CacheEntry<T> = {
  storedAt: number
  promise: Promise<T>
}

const cache = new Map<string, CacheEntry<unknown>>()

export function getCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = cache.get(key) as CacheEntry<T> | undefined
  if (existing && now - existing.storedAt < ttlMs) {
    return existing.promise
  }

  const promise = fn().catch((error) => {
    if (cache.get(key)?.promise === promise) {
      cache.delete(key)
    }
    throw error
  })
  cache.set(key, { storedAt: now, promise })
  return promise
}
