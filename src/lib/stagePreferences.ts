import { defaultMotionPngSettings, defaultSvgAvatarSettings, defaultSvgCharacter, type AvatarMode, type MotionPngSettings, type SvgAvatarSettings, type SvgCharacterId } from "./avatarConfig"

const STAGE_DISPLAY_KEY = "ctk.stage.display"
const MOTIONPNG_SETTINGS_KEY = "ctk.motionpng.settings"
const SVG_SETTINGS_KEY = "ctk.svg.settings"
const AVATAR_MODE_KEY = "ctk.avatar.mode"
const SVG_CHARACTER_KEY = "ctk.svg.character"

export type StageDisplayPreferences = {
  showCaption: boolean
  showComments: boolean
}

export const defaultStageDisplayPreferences: StageDisplayPreferences = {
  showCaption: true,
  showComments: false,
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadStageDisplayPreferences(): StageDisplayPreferences {
  const ls = safeLocalStorage()
  if (!ls) return defaultStageDisplayPreferences
  try {
    const raw = ls.getItem(STAGE_DISPLAY_KEY)
    if (!raw) return defaultStageDisplayPreferences
    const parsed = JSON.parse(raw) as Partial<StageDisplayPreferences>
    return {
      showCaption: typeof parsed.showCaption === "boolean" ? parsed.showCaption : defaultStageDisplayPreferences.showCaption,
      showComments:
        typeof parsed.showComments === "boolean" ? parsed.showComments : defaultStageDisplayPreferences.showComments,
    }
  } catch {
    return defaultStageDisplayPreferences
  }
}

export function saveStageDisplayPreferences(prefs: StageDisplayPreferences): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(STAGE_DISPLAY_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota errors */
  }
}

export function loadMotionPngSettings(): MotionPngSettings {
  const ls = safeLocalStorage()
  if (!ls) return defaultMotionPngSettings
  try {
    const raw = ls.getItem(MOTIONPNG_SETTINGS_KEY)
    if (!raw) return defaultMotionPngSettings
    const parsed = JSON.parse(raw) as Partial<MotionPngSettings>
    return { ...defaultMotionPngSettings, ...parsed }
  } catch {
    return defaultMotionPngSettings
  }
}

export function saveMotionPngSettings(settings: MotionPngSettings): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(MOTIONPNG_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function loadSvgAvatarSettings(): SvgAvatarSettings {
  const ls = safeLocalStorage()
  if (!ls) return defaultSvgAvatarSettings
  try {
    const raw = ls.getItem(SVG_SETTINGS_KEY)
    if (!raw) return defaultSvgAvatarSettings
    const parsed = JSON.parse(raw) as Partial<SvgAvatarSettings>
    return { ...defaultSvgAvatarSettings, ...parsed }
  } catch {
    return defaultSvgAvatarSettings
  }
}

export function saveSvgAvatarSettings(settings: SvgAvatarSettings): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(SVG_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function loadAvatarMode(): AvatarMode | null {
  const ls = safeLocalStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(AVATAR_MODE_KEY)
    if (raw === "svg" || raw === "motionpng") return raw
    return null
  } catch {
    return null
  }
}

export function saveAvatarMode(mode: AvatarMode): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(AVATAR_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function loadSvgCharacter(): SvgCharacterId {
  const ls = safeLocalStorage()
  if (!ls) return defaultSvgCharacter
  try {
    const raw = ls.getItem(SVG_CHARACTER_KEY)
    if (raw === "maid_cat" || raw === "catlin_v2") return raw
    return defaultSvgCharacter
  } catch {
    return defaultSvgCharacter
  }
}

export function saveSvgCharacter(character: SvgCharacterId): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(SVG_CHARACTER_KEY, character)
  } catch {
    /* ignore */
  }
}

export const stagePreferenceStorageKeys = {
  stageDisplay: STAGE_DISPLAY_KEY,
  motionPngSettings: MOTIONPNG_SETTINGS_KEY,
  svgSettings: SVG_SETTINGS_KEY,
  avatarMode: AVATAR_MODE_KEY,
  svgCharacter: SVG_CHARACTER_KEY,
} as const
