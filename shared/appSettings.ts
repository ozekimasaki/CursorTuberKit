import {
  applyChatSettingsPatch,
  createDefaultChatSettings,
  normalizeChatSettings,
  type ChatSettings,
  type ChatSettingsPatch,
} from "./chatSettings.js"

export const appSettingsSchemaVersion = 1 as const

export type AvatarMode = "svg" | "motionpng"
export type SvgCharacterId = "maid_cat" | "catlin_v2"

export type SvgAvatarSettings = {
  offsetX: number
  offsetY: number
  scale: number
}

export type MotionPngSettings = {
  chromaKeyColor: string
  chromaKeyEnabled: boolean
  chromaKeyFeather: number
  chromaKeyThreshold: number
  hqAudioEnabled: boolean
  offsetX: number
  offsetY: number
  scale: number
  sensitivity: number
}

export type StageCaptionStyle = {
  fontId: string
  fontSizeScale: number
  fontWeight: number
  color: string
  backgroundOpacity: number
  outlineEnabled: boolean
}

export type StageDisplayPreferences = {
  showCaption: boolean
  showComments: boolean
  captionStyle: StageCaptionStyle
}

export type StageBackgroundPreset = {
  kind: "preset"
  id: string
}

export type AppUiSettings = {
  audioOutputDeviceId: string | null
  avatarMode: AvatarMode
  motionPngSettings: MotionPngSettings
  stageBackground: StageBackgroundPreset | null
  stageDisplay: StageDisplayPreferences
  svgAvatarSettings: SvgAvatarSettings
  svgCharacter: SvgCharacterId
}

export type AppSettings = {
  chatSettings: ChatSettings
  schemaVersion: typeof appSettingsSchemaVersion
  ui: AppUiSettings
}

export type AppSettingsPatch = {
  chatSettings?: ChatSettingsPatch
  ui?: Partial<AppUiSettings>
}

export const defaultSvgAvatarSettings: SvgAvatarSettings = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

export const defaultMotionPngSettings: MotionPngSettings = {
  chromaKeyColor: "#00ff00",
  chromaKeyEnabled: true,
  chromaKeyFeather: 36,
  chromaKeyThreshold: 92,
  hqAudioEnabled: true,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  sensitivity: 50,
}

export const defaultStageCaptionStyle: StageCaptionStyle = {
  fontId: "zen-maru-gothic",
  fontSizeScale: 1.4,
  fontWeight: 700,
  color: "#ffffff",
  backgroundOpacity: 0.55,
  outlineEnabled: true,
}

export const defaultStageDisplayPreferences: StageDisplayPreferences = {
  showCaption: true,
  showComments: false,
  captionStyle: defaultStageCaptionStyle,
}

export function createDefaultAppUiSettings(): AppUiSettings {
  return {
    audioOutputDeviceId: null,
    avatarMode: "svg",
    motionPngSettings: defaultMotionPngSettings,
    stageBackground: null,
    stageDisplay: defaultStageDisplayPreferences,
    svgAvatarSettings: defaultSvgAvatarSettings,
    svgCharacter: "maid_cat",
  }
}

export function createDefaultAppSettings(chatSettings = createDefaultChatSettings()): AppSettings {
  return {
    chatSettings,
    schemaVersion: appSettingsSchemaVersion,
    ui: createDefaultAppUiSettings(),
  }
}

export function normalizeAppSettings(value: unknown, fallback = createDefaultAppSettings()): AppSettings {
  if (!isRecord(value)) return fallback

  return {
    chatSettings: normalizeChatSettings(value.chatSettings),
    schemaVersion: appSettingsSchemaVersion,
    ui: normalizeAppUiSettings(value.ui, fallback.ui),
  }
}

export function applyAppSettingsPatch(base: AppSettings, patch: AppSettingsPatch): AppSettings {
  return {
    chatSettings: patch.chatSettings
      ? applyChatSettingsPatch(base.chatSettings, patch.chatSettings)
      : base.chatSettings,
    schemaVersion: appSettingsSchemaVersion,
    ui: patch.ui ? normalizeAppUiSettings({ ...base.ui, ...patch.ui }, base.ui) : base.ui,
  }
}

export function normalizeAppUiSettings(value: unknown, fallback = createDefaultAppUiSettings()): AppUiSettings {
  const raw = isRecord(value) ? value : {}
  return {
    audioOutputDeviceId:
      typeof raw.audioOutputDeviceId === "string" ? raw.audioOutputDeviceId : fallback.audioOutputDeviceId,
    avatarMode: raw.avatarMode === "motionpng" || raw.avatarMode === "svg" ? raw.avatarMode : fallback.avatarMode,
    motionPngSettings: normalizeMotionPngSettings(raw.motionPngSettings, fallback.motionPngSettings),
    stageBackground: normalizeStageBackground(raw.stageBackground, fallback.stageBackground),
    stageDisplay: normalizeStageDisplayPreferences(raw.stageDisplay, fallback.stageDisplay),
    svgAvatarSettings: normalizeSvgAvatarSettings(raw.svgAvatarSettings, fallback.svgAvatarSettings),
    svgCharacter:
      raw.svgCharacter === "maid_cat" || raw.svgCharacter === "catlin_v2" ? raw.svgCharacter : fallback.svgCharacter,
  }
}

function normalizeStageBackground(value: unknown, fallback: StageBackgroundPreset | null): StageBackgroundPreset | null {
  if (!isRecord(value)) return fallback
  if (value.kind === "preset" && typeof value.id === "string") {
    return { kind: "preset", id: value.id }
  }
  return fallback
}

function normalizeSvgAvatarSettings(value: unknown, fallback: SvgAvatarSettings): SvgAvatarSettings {
  const raw = isRecord(value) ? value : {}
  return {
    offsetX: clampNumber(raw.offsetX, -1000, 1000, fallback.offsetX),
    offsetY: clampNumber(raw.offsetY, -1000, 1000, fallback.offsetY),
    scale: clampNumber(raw.scale, 0.1, 5, fallback.scale),
  }
}

function normalizeMotionPngSettings(value: unknown, fallback: MotionPngSettings): MotionPngSettings {
  const raw = isRecord(value) ? value : {}
  return {
    chromaKeyColor:
      typeof raw.chromaKeyColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.chromaKeyColor)
        ? raw.chromaKeyColor
        : fallback.chromaKeyColor,
    chromaKeyEnabled:
      typeof raw.chromaKeyEnabled === "boolean" ? raw.chromaKeyEnabled : fallback.chromaKeyEnabled,
    chromaKeyFeather: clampNumber(raw.chromaKeyFeather, 0, 100, fallback.chromaKeyFeather),
    chromaKeyThreshold: clampNumber(raw.chromaKeyThreshold, 0, 100, fallback.chromaKeyThreshold),
    hqAudioEnabled: typeof raw.hqAudioEnabled === "boolean" ? raw.hqAudioEnabled : fallback.hqAudioEnabled,
    offsetX: clampNumber(raw.offsetX, -1000, 1000, fallback.offsetX),
    offsetY: clampNumber(raw.offsetY, -1000, 1000, fallback.offsetY),
    scale: clampNumber(raw.scale, 0.1, 5, fallback.scale),
    sensitivity: clampNumber(raw.sensitivity, 0, 100, fallback.sensitivity),
  }
}

function normalizeStageDisplayPreferences(
  value: unknown,
  fallback: StageDisplayPreferences,
): StageDisplayPreferences {
  const raw = isRecord(value) ? value : {}
  return {
    showCaption: typeof raw.showCaption === "boolean" ? raw.showCaption : fallback.showCaption,
    showComments: typeof raw.showComments === "boolean" ? raw.showComments : fallback.showComments,
    captionStyle: normalizeStageCaptionStyle(raw.captionStyle, fallback.captionStyle),
  }
}

function normalizeStageCaptionStyle(value: unknown, fallback: StageCaptionStyle): StageCaptionStyle {
  const raw = isRecord(value) ? value : {}
  return {
    fontId: typeof raw.fontId === "string" && raw.fontId.length > 0 ? raw.fontId : fallback.fontId,
    fontSizeScale: clampNumber(raw.fontSizeScale, 0.5, 3, fallback.fontSizeScale),
    fontWeight: clampNumber(raw.fontWeight, 100, 900, fallback.fontWeight),
    color: typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : fallback.color,
    backgroundOpacity: clampNumber(raw.backgroundOpacity, 0, 1, fallback.backgroundOpacity),
    outlineEnabled: typeof raw.outlineEnabled === "boolean" ? raw.outlineEnabled : fallback.outlineEnabled,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
