import { createHash } from "node:crypto"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import type { FinalEmotionPayload } from "../shared/emotion.js"
import type { ConversationTurn, MemKraftPromptContext } from "./aiCommon.js"
import type { AiProvider } from "./aiProvider.js"
import { readAppConfig } from "./appConfig.js"

const MEMORY_ROOT = resolveMemoryRoot()
const RUNTIME_DIR = path.join(MEMORY_ROOT, "runtime")
const ENTITY_DIR = path.join(MEMORY_ROOT, "entities")
const LIVE_NOTES_DIR = path.join(MEMORY_ROOT, "live-notes")

export const CHARACTER_ARTIFACT_FILES = {
  historyLogFile: path.join(RUNTIME_DIR, "character-artifacts.ndjson"),
  latestBundleFile: path.join(RUNTIME_DIR, "character-artifacts-latest.json"),
  loreCardsFile: path.join(ENTITY_DIR, "lore-cards.json"),
  relationshipsFile: path.join(ENTITY_DIR, "relationships.json"),
  streamDiaryFile: path.join(LIVE_NOTES_DIR, "stream-diary.md"),
  teaserFile: path.join(LIVE_NOTES_DIR, "next-stream-teaser.md"),
} as const

export type PersistCharacterArtifactsInput = {
  assistantResponse: string
  artifacts: CharacterArtifactsPayload | null
  characterStateSignature: string
  finalEmotion: FinalEmotionPayload | null
  memKraftContext: MemKraftPromptContext
  provider: AiProvider
  recentTurns: ConversationTurn[]
  runId: string
  userPrompt: string
}

type CharacterArtifactBundle = {
  assistantPreview: string
  characterArtifacts: CharacterArtifactsPayload | null
  characterStateSignature: string
  diary: CharacterDiaryEntry
  finalEmotion: FinalEmotionPayload | null
  generatedAt: string
  loreCards: CharacterLoreCard[]
  provider: AiProvider
  recentTurnsPreview: Array<{
    role: "assistant" | "user"
    text: string
  }>
  relationships: CharacterRelationshipUpdate[]
  runId: string
  teaser: CharacterTeaser
  userPromptPreview: string
}

type CharacterDiaryEntry = {
  highlights: string[]
  mood: string
  nextBeat: string
  summary: string
  title: string
}

type CharacterLoreCard = {
  category: string
  evidence: string
  summary: string
  tags: string[]
  title: string
}

type CharacterRelationshipUpdate = {
  callbacks: string[]
  evidence: string
  latestBeat: string
  name: string
  status: string
  summary: string
}

type CharacterTeaser = {
  body: string
  headline: string
  hook: string
}

type PersistedLoreCard = CharacterLoreCard & {
  createdAt: string
  key: string
  sourceRunId: string
  updatedAt: string
}

type PersistedRelationship = CharacterRelationshipUpdate & {
  createdAt: string
  key: string
  sourceRunId: string
  updatedAt: string
}

export type CharacterArtifactPersistenceSummary = {
  artifacts: {
    historyLogFile: string
    latestBundleFile: string
    loreCardsFile: string
    relationshipsFile: string
    streamDiaryFile: string
    teaserFile: string
  }
  diaryTitle: string
  generatedAt: string
  loreCardCount: number
  relationshipCount: number
  teaserHeadline: string
  teaserHook: string
}

let artifactWriteQueue = Promise.resolve()

export async function persistCharacterArtifacts(
  input: PersistCharacterArtifactsInput,
): Promise<CharacterArtifactPersistenceSummary> {
  const bundle = buildCharacterArtifactBundle(input)
  return persistCharacterArtifactBundle(bundle)
}

function buildCharacterArtifactBundle(input: PersistCharacterArtifactsInput): CharacterArtifactBundle {
  return {
    assistantPreview: truncateText(input.assistantResponse, 400),
    characterArtifacts: input.artifacts ? copyCharacterArtifactsPayload(input.artifacts) : null,
    characterStateSignature: input.characterStateSignature,
    diary: buildDiaryEntry(input),
    finalEmotion: input.finalEmotion,
    generatedAt: new Date().toISOString(),
    loreCards: buildLoreCards(input),
    provider: input.provider,
    recentTurnsPreview: input.recentTurns.slice(-6).map((turn) => ({
      role: turn.role,
      text: truncateText(turn.text, 180),
    })),
    relationships: buildRelationships(input),
    runId: input.runId,
    teaser: buildTeaser(input),
    userPromptPreview: truncateText(input.userPrompt, 240),
  }
}

async function persistCharacterArtifactBundle(
  bundle: CharacterArtifactBundle,
): Promise<CharacterArtifactPersistenceSummary> {
  let summary: CharacterArtifactPersistenceSummary | null = null

  artifactWriteQueue = artifactWriteQueue.then(async () => {
    await ensureArtifactDirectories()

    const currentLoreCards = await readJsonFile<PersistedLoreCard[]>(CHARACTER_ARTIFACT_FILES.loreCardsFile, [])
    const currentRelationships = await readJsonFile<PersistedRelationship[]>(CHARACTER_ARTIFACT_FILES.relationshipsFile, [])

    const mergedLoreCards = mergeLoreCards(currentLoreCards, bundle.loreCards, bundle.generatedAt, bundle.runId)
    const mergedRelationships = mergeRelationships(
      currentRelationships,
      bundle.relationships,
      bundle.generatedAt,
      bundle.runId,
    )

    await appendFile(CHARACTER_ARTIFACT_FILES.historyLogFile, `${JSON.stringify(bundle)}\n`, "utf8")
    await writeFile(CHARACTER_ARTIFACT_FILES.latestBundleFile, `${JSON.stringify(bundle, null, 2)}\n`, "utf8")
    await writeFile(CHARACTER_ARTIFACT_FILES.loreCardsFile, `${JSON.stringify(mergedLoreCards, null, 2)}\n`, "utf8")
    await writeFile(
      CHARACTER_ARTIFACT_FILES.relationshipsFile,
      `${JSON.stringify(mergedRelationships, null, 2)}\n`,
      "utf8",
    )
    await appendDiaryEntry(bundle)
    await writeFile(CHARACTER_ARTIFACT_FILES.teaserFile, `${renderTeaserMarkdown(bundle)}\n`, "utf8")

    summary = {
      artifacts: mapArtifactFilesToRelativePaths(),
      diaryTitle: bundle.diary.title,
      generatedAt: bundle.generatedAt,
      loreCardCount: mergedLoreCards.length,
      relationshipCount: mergedRelationships.length,
      teaserHeadline: bundle.teaser.headline,
      teaserHook: bundle.teaser.hook,
    }
  })

  await artifactWriteQueue

  if (!summary) {
    throw new Error("Character artifact summary was not produced.")
  }

  return summary
}

async function appendDiaryEntry(bundle: CharacterArtifactBundle) {
  const existing = await readTextFile(CHARACTER_ARTIFACT_FILES.streamDiaryFile)
  const separator = existing.trim().length > 0 ? "\n\n---\n\n" : ""
  await writeFile(
    CHARACTER_ARTIFACT_FILES.streamDiaryFile,
    `${existing}${separator}${renderDiaryEntryMarkdown(bundle)}\n`,
    "utf8",
  )
}

function renderDiaryEntryMarkdown(bundle: CharacterArtifactBundle) {
  const lines = [
    `## ${bundle.generatedAt} · ${bundle.diary.title}`,
    "",
    `- Mood: ${bundle.diary.mood}`,
    `- Emotion: ${bundle.finalEmotion?.emotion ?? "unknown"}`,
    `- Provider: ${bundle.provider}`,
    `- Character state: ${bundle.characterStateSignature}`,
    `- Prompt: ${bundle.userPromptPreview}`,
    "",
    bundle.diary.summary,
  ]

  if (bundle.diary.highlights.length > 0) {
    lines.push("", "### Highlights", ...bundle.diary.highlights.map((entry) => `- ${entry}`))
  }

  lines.push("", "### Next beat", bundle.diary.nextBeat)

  if (bundle.teaser.headline || bundle.teaser.body) {
    lines.push("", "### Teaser", `**${bundle.teaser.headline}**`, bundle.teaser.body)

    if (bundle.teaser.hook) {
      lines.push("", `Hook: ${bundle.teaser.hook}`)
    }
  }

  if (bundle.loreCards.length > 0) {
    lines.push("", "### Lore updates", ...bundle.loreCards.map((card) => `- ${card.title}: ${card.summary}`))
  }

  if (bundle.relationships.length > 0) {
    lines.push(
      "",
      "### Relationship updates",
      ...bundle.relationships.map((relationship) => `- ${relationship.name}: ${relationship.summary}`),
    )
  }

  return lines.join("\n")
}

function renderTeaserMarkdown(bundle: CharacterArtifactBundle) {
  return [
    `# ${bundle.teaser.headline}`,
    "",
    bundle.teaser.body,
    "",
    `- Hook: ${bundle.teaser.hook}`,
    `- Updated: ${bundle.generatedAt}`,
    `- Source run: ${bundle.runId}`,
    `- Character state: ${bundle.characterStateSignature}`,
  ].join("\n")
}

function buildLoreCards(input: PersistCharacterArtifactsInput): CharacterLoreCard[] {
  const payload = input.artifacts

  if (!payload) {
    const fallbackCards = normalizeLoreCards([
      buildLoreCardFromText(
        "current-stream",
        input.memKraftContext.runningSummary || input.assistantResponse,
        "stream",
        "latest-response",
      ),
    ])

    return fallbackCards
  }

  const candidates = [
    ...payload.lore.canonFacts.map((entry) => buildLoreCardFromText("canon", entry, "canon", payload.lore.summary)),
    ...payload.lore.continuityNotes.map((entry) =>
      buildLoreCardFromText("continuity", entry, "continuity", payload.lore.summary),
    ),
    ...payload.lore.openLoops.map((entry) => buildLoreCardFromText("open-loop", entry, "open-loop", payload.lore.summary)),
  ]

  return normalizeLoreCards(candidates)
}

function buildRelationships(input: PersistCharacterArtifactsInput): CharacterRelationshipUpdate[] {
  const payload = input.artifacts

  if (!payload) {
    return normalizeRelationships([
      {
        callbacks: [],
        evidence: input.userPrompt,
        latestBeat: truncateText(input.assistantResponse, 120),
        name: "視聴者",
        status: input.finalEmotion?.emotion ?? "ongoing",
        summary: `今回の返答では ${input.finalEmotion?.emotion ?? "やわらかい"} 温度で視聴者へ応答した。`,
      },
    ])
  }

  return normalizeRelationships([
    {
      callbacks: payload.relationship.callbacks,
      evidence: payload.relationship.summary,
      latestBeat:
        payload.relationship.callbacks[0] ??
        payload.lore.openLoops[0] ??
        truncateText(input.assistantResponse, 120),
      name: payload.relationship.viewerRole || "視聴者",
      status: describeRelationshipStatus(payload),
      summary: payload.relationship.summary,
    },
  ])
}

function buildDiaryEntry(input: PersistCharacterArtifactsInput): CharacterDiaryEntry {
  const payload = input.artifacts
  const highlights = [
    ...(payload?.writer.segments.map((segment) => segment.text) ?? []),
    ...(payload?.lore.memoryCandidates ?? []),
  ]

  return {
    highlights: normalizeStringList(highlights, 5, 100, [truncateText(input.assistantResponse, 100)]),
    mood: payload?.director.focusEmotion ?? input.finalEmotion?.emotion ?? "neutral",
    nextBeat:
      payload?.lore.openLoops[0] ??
      payload?.relationship.callbacks[0] ??
      input.memKraftContext.continuityNotes[0] ??
      "次回も今回の余韻を保ったまま、拾い直したい話題を自然につなげる。",
    summary:
      payload?.director.summary ??
      input.memKraftContext.runningSummary ??
      `視聴者コメント「${truncateText(input.userPrompt, 80)}」へ、${truncateText(input.assistantResponse, 140)}`,
    title: buildDiaryTitle(input),
  }
}

function buildTeaser(input: PersistCharacterArtifactsInput): CharacterTeaser {
  const payload = input.artifacts
  const hook =
    payload?.lore.openLoops[0] ??
    payload?.relationship.callbacks[0] ??
    input.memKraftContext.continuityNotes[0] ??
    `${input.finalEmotion?.emotion ?? "neutral"} の余韻を残したまま次回へ。`

  return {
    body:
      payload?.writer.closer ??
      payload?.writer.summary ??
      `次の配信でも ${truncateText(input.assistantResponse, 90)} みたいな流れを、もう少し深く育てていきます。`,
    headline:
      payload?.director.sceneIntent ||
      payload?.lore.openLoops[0] ||
      `次回も ${input.finalEmotion?.emotion ?? "やわらかい"} 余韻で`,
    hook,
  }
}

function buildDiaryTitle(input: PersistCharacterArtifactsInput) {
  const payload = input.artifacts
  const sceneIntent = payload?.director.sceneIntent?.trim()

  if (sceneIntent) {
    return `配信日誌 · ${truncateText(sceneIntent, 60)}`
  }

  return `配信日誌 · ${input.finalEmotion?.emotion ?? "neutral"} な返答`
}

function buildLoreCardFromText(prefix: string, text: string, category: string, evidence: string): CharacterLoreCard {
  const normalized = truncateText(text, 220)
  return {
    category,
    evidence: truncateText(evidence, 160),
    summary: normalized,
    tags: [category],
    title: `${prefix}: ${truncateText(normalized, 40)}`,
  }
}

function describeRelationshipStatus(payload: CharacterArtifactsPayload) {
  const parts = []

  if (payload.relationship.trustLevel >= 70) {
    parts.push("trusted")
  }

  if (payload.relationship.intimacyLevel >= 60) {
    parts.push("close")
  }

  if (payload.relationship.teasingLevel >= 60) {
    parts.push("playful")
  }

  if (payload.relationship.comfortLevel >= 70) {
    parts.push("cozy")
  }

  return parts.length > 0 ? parts.join("/") : "ongoing"
}

function normalizeLoreCards(value: CharacterLoreCard[]) {
  return dedupeBy(
    value
      .map((entry) => ({
        category: normalizeNonEmptyString(entry.category, 40) || "stream",
        evidence: normalizeNonEmptyString(entry.evidence, 160) || "",
        summary: normalizeNonEmptyString(entry.summary, 220) || "",
        tags: normalizeStringList(entry.tags, 5, 32),
        title: normalizeNonEmptyString(entry.title, 80) || "",
      }))
      .filter((entry) => entry.title && entry.summary),
    (entry) => hashKey(`lore:${entry.title}:${entry.category}`),
  ).slice(0, 6)
}

function normalizeRelationships(value: CharacterRelationshipUpdate[]) {
  return dedupeBy(
    value
      .map((entry) => ({
        callbacks: normalizeStringList(entry.callbacks, 4, 80),
        evidence: normalizeNonEmptyString(entry.evidence, 160) || "",
        latestBeat: normalizeNonEmptyString(entry.latestBeat, 160) || "",
        name: normalizeNonEmptyString(entry.name, 80) || "",
        status: normalizeNonEmptyString(entry.status, 40) || "ongoing",
        summary: normalizeNonEmptyString(entry.summary, 220) || "",
      }))
      .filter((entry) => entry.name && entry.summary),
    (entry) => hashKey(`relationship:${entry.name}`),
  ).slice(0, 6)
}

function mergeLoreCards(
  current: PersistedLoreCard[],
  additions: CharacterLoreCard[],
  timestamp: string,
  runId: string,
) {
  const merged = new Map<string, PersistedLoreCard>()

  for (const entry of current) {
    merged.set(entry.key, entry)
  }

  for (const entry of additions) {
    const key = hashKey(`lore:${entry.title}:${entry.category}`)
    const existing = merged.get(key)
    merged.set(key, {
      ...entry,
      createdAt: existing?.createdAt ?? timestamp,
      key,
      sourceRunId: runId,
      updatedAt: timestamp,
    })
  }

  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function mergeRelationships(
  current: PersistedRelationship[],
  additions: CharacterRelationshipUpdate[],
  timestamp: string,
  runId: string,
) {
  const merged = new Map<string, PersistedRelationship>()

  for (const entry of current) {
    merged.set(entry.key, entry)
  }

  for (const entry of additions) {
    const key = hashKey(`relationship:${entry.name}`)
    const existing = merged.get(key)
    merged.set(key, {
      ...entry,
      createdAt: existing?.createdAt ?? timestamp,
      key,
      sourceRunId: runId,
      updatedAt: timestamp,
    })
  }

  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function ensureArtifactDirectories() {
  await Promise.all([
    mkdir(RUNTIME_DIR, { recursive: true }),
    mkdir(ENTITY_DIR, { recursive: true }),
    mkdir(LIVE_NOTES_DIR, { recursive: true }),
  ])
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

async function readTextFile(filePath: string) {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return ""
  }
}

function mapArtifactFilesToRelativePaths() {
  return {
    historyLogFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.historyLogFile),
    latestBundleFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.latestBundleFile),
    loreCardsFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.loreCardsFile),
    relationshipsFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.relationshipsFile),
    streamDiaryFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.streamDiaryFile),
    teaserFile: path.relative(process.cwd(), CHARACTER_ARTIFACT_FILES.teaserFile),
  }
}

function resolveMemoryRoot() {
  const configured = readAppConfig().memkraft.dir.trim()
  return path.resolve(process.cwd(), configured || "memory")
}

function normalizeNonEmptyString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.replace(/\s+/g, " ").trim()

  if (!normalized) {
    return null
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number, fallback: string[] = []) {
  const entries = Array.isArray(value) ? value : fallback
  return entries
    .map((entry) => normalizeNonEmptyString(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}

function hashKey(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function dedupeBy<T>(values: T[], getKey: (value: T) => string) {
  const map = new Map<string, T>()

  for (const value of values) {
    map.set(getKey(value), value)
  }

  return [...map.values()]
}

function copyCharacterArtifactsPayload(payload: CharacterArtifactsPayload): CharacterArtifactsPayload {
  return JSON.parse(JSON.stringify(payload)) as CharacterArtifactsPayload
}
