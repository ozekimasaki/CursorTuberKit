import { useEffect, useRef, useState, type ChangeEvent } from "react"

import { findBackgroundPreset } from "../lib/backgroundPresets"

export type StageBackgroundMedia =
  | { kind: "image"; name: string; url: string }
  | { kind: "video"; name: string; url: string }
  | { kind: "preset"; id: string; name: string; css: string }

/**
 * Owns the stage background asset (uploaded image/video or preset selection)
 * together with the hidden <input type="file"> trigger and object-URL cleanup.
 *
 * Behavior preserved:
 * - When a non-preset media replaces the prior one, the previous object URL is
 *   revoked on cleanup (matches the original useEffect with cleanup function).
 * - Selecting the same file twice still works because the input value is reset
 *   to "" inside the change handler.
 */
export function useStageBackgroundMedia() {
  const [stageBackgroundMedia, setStageBackgroundMedia] = useState<StageBackgroundMedia | null>(null)
  const stageBackgroundInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const url =
      stageBackgroundMedia && stageBackgroundMedia.kind !== "preset"
        ? stageBackgroundMedia.url
        : null

    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [stageBackgroundMedia])

  const handleStageBackgroundSelect = () => {
    stageBackgroundInputRef.current?.click()
  }

  const handleStageBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    setStageBackgroundMedia({
      kind: file.type.startsWith("video/") ? "video" : "image",
      name: file.name,
      url: URL.createObjectURL(file),
    })
  }

  const handleStageBackgroundClear = () => {
    setStageBackgroundMedia(null)
  }

  const handleStageBackgroundPresetSelect = (presetId: string) => {
    const preset = findBackgroundPreset(presetId)
    if (!preset) return
    setStageBackgroundMedia({
      kind: "preset",
      id: preset.id,
      name: preset.label,
      css: preset.css,
    })
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
