import type { BackgroundPreset } from "./types"
import { atmosphericPresets } from "./atmospheric"
import { geometricPresets } from "./geometric"
import { abstractPresets } from "./abstract"
import { scenePresets } from "./scene"

export type { BackgroundPreset, BackgroundPresetCategory } from "./types"

export const backgroundPresets: BackgroundPreset[] = [
  ...atmosphericPresets,
  ...geometricPresets,
  ...abstractPresets,
  ...scenePresets,
]

export const backgroundPresetCategoryLabels: Record<string, string> = {
  atmospheric: "空・自然",
  geometric: "幾何パターン",
  abstract: "抽象",
  scene: "シーン",
}

export function findBackgroundPreset(id: string | null | undefined): BackgroundPreset | null {
  if (!id) return null
  return backgroundPresets.find((preset) => preset.id === id) ?? null
}
