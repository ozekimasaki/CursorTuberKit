import { useEffect, useState } from "react"

export type AudioOutputDevice = {
  deviceId: string
  label: string
}

function supportsSetSinkId(): boolean {
  return typeof Audio !== "undefined" && "setSinkId" in Audio.prototype
}

export function useAudioOutputDevices() {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([])

  useEffect(() => {
    if (!supportsSetSinkId()) {
      setDevices([])
      return
    }

    let cancelled = false

    async function refresh() {
      try {
        // Prompt permission so labels are populated
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const all = await navigator.mediaDevices.enumerateDevices()
        const outputs = all
          .filter((d) => d.kind === "audiooutput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `出力 ${d.deviceId.slice(0, 8)}...`,
          }))
        if (!cancelled) setDevices(outputs)
      } catch {
        if (!cancelled) setDevices([])
      }
    }

    refresh()
    return () => {
      cancelled = true
    }
  }, [])

  return { devices, supported: supportsSetSinkId() }
}
