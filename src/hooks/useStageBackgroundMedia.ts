import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import { findBackgroundPreset } from "../lib/backgroundPresets"

export type StageBackgroundMedia =
  | { kind: "image"; name: string; url: string }
  | { kind: "video"; name: string; url: string }
  | { kind: "preset"; id: string; name: string; css: string }

export function useStageBackgroundMedia({
  presetId,
  onPresetChange,
}: {
  presetId: string | null
  onPresetChange: (preset: { kind: "preset"; id: string } | null) => void
}) {
  const [uploadMedia, setUploadMedia] = useState<
    | Extract<StageBackgroundMedia, { kind: "image" | "video" }>
    | null
  >(null)
  const stageBackgroundInputRef = useRef<HTMLInputElement | null>(null)

  const presetMedia = useMemo(() => {
    if (!presetId) return null
    const preset = findBackgroundPreset(presetId)
    if (!preset) return null
    return { kind: "preset" as const, id: preset.id, name: preset.label, css: preset.css }
  }, [presetId])

  const stageBackgroundMedia = uploadMedia ?? presetMedia

  useEffect(() => {
    const url = uploadMedia?.url ?? null
    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [uploadMedia])

  const handleStageBackgroundSelect = () => {
    stageBackgroundInputRef.current?.click()
  }

  const handleStageBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    setUploadMedia({
      kind: file.type.startsWith("video/") ? "video" : "image",
      name: file.name,
      url: URL.createObjectURL(file),
    })
  }

  const handleStageBackgroundClear = () => {
    setUploadMedia(null)
    onPresetChange(null)
  }

  const handleStageBackgroundPresetSelect = (selectedPresetId: string) => {
    const preset = findBackgroundPreset(selectedPresetId)
    if (!preset) return
    setUploadMedia(null)
    onPresetChange({ kind: "preset", id: preset.id })
  }

  return {
    handleStageBackgroundChange,
    handleStageBackgroundClear,
    handleStageBackgroundPresetSelect,
    handleStageBackgroundSelect,
    stageBackgroundInputRef,
    stageBackgroundMedia,
  }
}
