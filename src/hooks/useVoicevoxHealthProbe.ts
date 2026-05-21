import { useEffect, useState } from "react"
import { fetchVoicevoxHealth, type VoicevoxHealth } from "../lib/voicevox"

const VOICEVOX_FALLBACK_HEALTH: VoicevoxHealth = {
  ok: false,
  speaker: 1,
  url: "http://127.0.0.1:50021",
  version: null,
}

/**
 * One-shot probe of the local VOICEVOX engine on mount.
 *
 * Mirrors the original effect in App.tsx: success → store the reported health;
 * failure → store a fallback record so the UI can render the "not reachable"
 * state without flickering null first.
 */
export function useVoicevoxHealthProbe(): VoicevoxHealth | null {
  const [health, setHealth] = useState<VoicevoxHealth | null>(null)

  useEffect(() => {
    const abortController = new AbortController()

    fetchVoicevoxHealth(abortController.signal)
      .then((next) => setHealth(next))
      .catch(() => setHealth(VOICEVOX_FALLBACK_HEALTH))

    return () => abortController.abort()
  }, [])

  return health
}
