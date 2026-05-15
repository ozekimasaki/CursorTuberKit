import { emotionValues, type Emotion } from "./emotion.js"

export const characterAgentKinds = [
  "character-director",
  "lore-keeper",
  "relationship-manager",
  "content-writer",
] as const

export type CharacterAgentKind = (typeof characterAgentKinds)[number]

export const sevenDeadlySinKeys = ["pride", "greed", "wrath", "envy", "lust", "gluttony", "sloth"] as const

export type SevenDeadlySinKey = (typeof sevenDeadlySinKeys)[number]

export type SevenDeadlySinsProfile = {
  pride: number
  greed: number
  wrath: number
  envy: number
  lust: number
  gluttony: number
  sloth: number
}

export type CharacterAgentUsage = Record<CharacterAgentKind, boolean>

export type CharacterDirectorArtifact = {
  audienceEnergy: number
  deliveryStyle: string[]
  focusEmotion: Emotion
  sceneIntent: string
  sevenDeadlySins: SevenDeadlySinsProfile
  summary: string
}

export type LoreKeeperArtifact = {
  canonFacts: string[]
  continuityNotes: string[]
  memoryCandidates: string[]
  openLoops: string[]
  summary: string
}

export type RelationshipManagerArtifact = {
  boundaries: string[]
  callbacks: string[]
  comfortLevel: number
  intimacyLevel: number
  summary: string
  teasingLevel: number
  trustLevel: number
  viewerRole: string
}

export type ContentSegmentPlan = {
  delivery: string
  emotion: Emotion
  id: string
  intensity: number
  pauseMs: number
  text: string
}

export type ContentWriterArtifact = {
  closer: string | null
  opener: string | null
  segments: ContentSegmentPlan[]
  summary: string
}

export type CharacterArtifactsPayload = {
  agentUsage: CharacterAgentUsage
  characterStateSignature: string
  director: CharacterDirectorArtifact
  generatedAt: string
  lore: LoreKeeperArtifact
  model: string
  relationship: RelationshipManagerArtifact
  source: "cursor-subagents" | "heuristic-fallback"
  warnings: string[]
  writer: ContentWriterArtifact
}

export function clampCharacterIntensity(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(numeric)))
}

export function createCharacterAgentUsage(overrides: Partial<CharacterAgentUsage> = {}): CharacterAgentUsage {
  return {
    "character-director": overrides["character-director"] === true,
    "content-writer": overrides["content-writer"] === true,
    "lore-keeper": overrides["lore-keeper"] === true,
    "relationship-manager": overrides["relationship-manager"] === true,
  }
}

export function isCharacterArtifactsPayload(value: unknown): value is CharacterArtifactsPayload {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.characterStateSignature === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.model === "string" &&
    (value.source === "cursor-subagents" || value.source === "heuristic-fallback") &&
    isCharacterAgentUsage(value.agentUsage) &&
    isCharacterDirectorArtifact(value.director) &&
    isLoreKeeperArtifact(value.lore) &&
    isRelationshipManagerArtifact(value.relationship) &&
    isContentWriterArtifact(value.writer) &&
    isStringArray(value.warnings)
  )
}

function isCharacterAgentUsage(value: unknown): value is CharacterAgentUsage {
  return (
    isRecord(value) &&
    characterAgentKinds.every((kind) => typeof value[kind] === "boolean")
  )
}

function isCharacterDirectorArtifact(value: unknown): value is CharacterDirectorArtifact {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    typeof value.sceneIntent === "string" &&
    isStringArray(value.deliveryStyle) &&
    isEmotion(value.focusEmotion) &&
    typeof value.audienceEnergy === "number" &&
    isSevenDeadlySinsProfile(value.sevenDeadlySins)
  )
}

function isLoreKeeperArtifact(value: unknown): value is LoreKeeperArtifact {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    isStringArray(value.canonFacts) &&
    isStringArray(value.continuityNotes) &&
    isStringArray(value.memoryCandidates) &&
    isStringArray(value.openLoops)
  )
}

function isRelationshipManagerArtifact(value: unknown): value is RelationshipManagerArtifact {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    typeof value.viewerRole === "string" &&
    typeof value.intimacyLevel === "number" &&
    typeof value.trustLevel === "number" &&
    typeof value.teasingLevel === "number" &&
    typeof value.comfortLevel === "number" &&
    isStringArray(value.boundaries) &&
    isStringArray(value.callbacks)
  )
}

function isContentWriterArtifact(value: unknown): value is ContentWriterArtifact {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    (value.opener === null || typeof value.opener === "string") &&
    (value.closer === null || typeof value.closer === "string") &&
    Array.isArray(value.segments) &&
    value.segments.every(isContentSegmentPlan)
  )
}

function isContentSegmentPlan(value: unknown): value is ContentSegmentPlan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.delivery === "string" &&
    isEmotion(value.emotion) &&
    typeof value.intensity === "number" &&
    typeof value.pauseMs === "number"
  )
}

function isSevenDeadlySinsProfile(value: unknown): value is SevenDeadlySinsProfile {
  return isRecord(value) && sevenDeadlySinKeys.every((key) => typeof value[key] === "number")
}

function isEmotion(value: unknown): value is Emotion {
  return typeof value === "string" && emotionValues.includes(value as Emotion)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
