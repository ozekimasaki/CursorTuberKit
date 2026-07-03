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
        // Labels are hidden until the user grants audio permission once.
        // Try enumerate first; if labels are missing we prompt for permission.
        let all = await navigator.mediaDevices.enumerateDevices()
        let outputs = all.filter((d) => d.kind === "audiooutput")

        if (outputs.length > 0 && outputs.every((d) => !d.label)) {
          await navigator.mediaDevices.getUserMedia({ audio: true })
          all = await navigator.mediaDevices.enumerateDevices()
          outputs = all.filter((d) => d.kind === "audiooutput")
        }

        const mapped = outputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `出力 ${d.deviceId.slice(0, 8)}...`,
        }))
        if (!cancelled) setDevices(mapped)
      } catch {
        if (!cancelled) setDevices([])
      }
    }

    refresh()

    const handleChange = () => {
      refresh()
    }
    navigator.mediaDevices.addEventListener("devicechange", handleChange)

    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener("devicechange", handleChange)
    }
  }, [])

  return { devices, supported: supportsSetSinkId() }
}
