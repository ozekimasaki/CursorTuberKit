import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  characterRuleRelativePath,
  createEmptyCharacterRuleStatus,
  maxCharacterRuleContentLength,
  type CharacterRuleStatus,
} from "../shared/characterRules.js"
import {
  maxCharacterFullPromptLength,
  maxCharacterPromptLength,
  normalizeCharacterFullPrompt,
  normalizeCharacterPrompt,
} from "../shared/chatSettings.js"

const RULE_PATH = path.resolve(process.cwd(), characterRuleRelativePath)
const DEFAULT_FRONTMATTER = [
  "---",
  "description: CursorTuberKit runtime character seed. App-loaded only; do not apply to coding tasks.",
  "alwaysApply: false",
  "---",
].join("\n")
const SHORT_PROMPT_HEADING = "## 短い人格プロンプト"
const FULL_PROMPT_HEADING = "## 詳細人格プロンプト"
const SUPPORT_RULE_HEADING = "## 補助人格ルール"

const SECRET_PATTERNS = [
  /crsr_[A-Za-z0-9_-]{12,}/,
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
]

export type CharacterRuleSource = {
  characterFullPrompt: string | null
  characterPrompt: string | null
  content: string
  runtimeRuleContent: string
  status: CharacterRuleStatus
}

export class CharacterRuleSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CharacterRuleSourceError"
  }
}

export async function readCharacterRuleSource(): Promise<CharacterRuleSource> {
  try {
    await access(RULE_PATH)
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        characterFullPrompt: null,
        characterPrompt: null,
        content: "",
        runtimeRuleContent: "",
        status: createEmptyCharacterRuleStatus(),
      }
    }
    throw error
  }

  const raw = await readFile(RULE_PATH, "utf8")
  const parsed = parseCharacterRuleFile(raw)
  const fileStat = await stat(RULE_PATH)
  return {
    characterFullPrompt: parsed.characterFullPrompt,
    characterPrompt: parsed.characterPrompt,
    content: parsed.content,
    runtimeRuleContent: parsed.runtimeRuleContent,
    status: {
      contentLength: parsed.content.length,
      error: null,
      loaded: true,
      path: characterRuleRelativePath,
      updatedAt: fileStat.mtime.toISOString(),
    },
  }
}

export async function readCharacterRuleStatus(): Promise<CharacterRuleStatus> {
  try {
    return (await readCharacterRuleSource()).status
  } catch (error) {
    return {
      ...createEmptyCharacterRuleStatus(),
      error: error instanceof Error ? error.message : "Character rule status could not be read.",
    }
  }
}

export async function writeCharacterRuleContent(content: string): Promise<CharacterRuleStatus> {
  const normalized = validateCharacterRuleContent(content)
  await mkdir(path.dirname(RULE_PATH), { recursive: true })
  const tempFile = `${RULE_PATH}.tmp`
  await writeFile(tempFile, `${DEFAULT_FRONTMATTER}\n\n${normalized}\n`, "utf8")
  await rename(tempFile, RULE_PATH)
  return (await readCharacterRuleSource()).status
}

export function composeCharacterRuleContent(input: {
  characterFullPrompt: string
  characterPrompt: string
  ruleContent: string
}) {
  const characterPrompt = normalizeCharacterPrompt(input.characterPrompt, "")
  const characterFullPrompt = normalizeCharacterFullPrompt(input.characterFullPrompt, "")
  const ruleContent = validateCharacterRuleContent(input.ruleContent)

  if (!characterPrompt || !characterFullPrompt) {
    throw new CharacterRuleSourceError("Character rule prompt sections must not be empty.")
  }

  return [
    "# CursorTuberKit サンプル人格ルール",
    "",
    "このファイルは、配信アバターの runtime prompt にアプリ側で明示的に合成されるキャラクター rule です。日本語配信向けの基準人格として、同梱サンプルの「キャットリン」を置いています。別キャラクターに差し替える場合も、同じ粒度で声・距離感・禁止事項を書き換えてください。",
    "",
    SHORT_PROMPT_HEADING,
    "",
    "```text",
    characterPrompt,
    "```",
    "",
    FULL_PROMPT_HEADING,
    "",
    "```text",
    characterFullPrompt,
    "```",
    "",
    SUPPORT_RULE_HEADING,
    "",
    ruleContent,
  ].join("\n")
}

export function validateCharacterRuleContent(content: string) {
  const normalized = normalizeCharacterRuleContent(content)

  if (!normalized) {
    throw new CharacterRuleSourceError("Character rule content is empty.")
  }

  if (normalized.length > maxCharacterRuleContentLength) {
    throw new CharacterRuleSourceError(
      `Character rule content must be ${maxCharacterRuleContentLength} characters or fewer.`,
    )
  }

  if (normalized.split("\n").some((line) => line.trim() === "---")) {
    throw new CharacterRuleSourceError("Character rule content must not contain frontmatter delimiters.")
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new CharacterRuleSourceError("Character rule content appears to contain a secret or API key.")
    }
  }

  return normalized
}

export function renderCharacterRuleContent(
  content: string,
  values: {
    characterName: string
    characterPrompt: string
  },
) {
  return normalizeCharacterRuleContent(content)
    .replaceAll("{{characterName}}", values.characterName)
    .replaceAll("{{characterPrompt}}", values.characterPrompt)
    .trim()
}

function parseCharacterRuleFile(raw: string) {
  const normalizedRaw = raw.replace(/\r\n?/g, "\n")
  const { body, frontmatter } = splitFrontmatter(normalizedRaw)
  validateFrontmatter(frontmatter)
  const content = validateCharacterRuleContent(body)
  const characterPrompt = parseFencedSection(content, "短い人格プロンプト")
  const characterFullPrompt = parseFencedSection(content, "詳細人格プロンプト")
  const runtimeRuleContent = parseSupportRuleContent(content)

  return {
    characterFullPrompt: characterFullPrompt
      ? normalizeCharacterFullPrompt(characterFullPrompt, "").slice(0, maxCharacterFullPromptLength)
      : null,
    characterPrompt: characterPrompt ? normalizeCharacterPrompt(characterPrompt, "").slice(0, maxCharacterPromptLength) : null,
    content,
    runtimeRuleContent,
  }
}

function parseFencedSection(content: string, heading: string) {
  const escapedHeading = escapeRegExp(heading)
  const match = content.match(new RegExp(`^##\\s+${escapedHeading}\\s*\\n\\s*\`\`\`(?:text)?\\n([\\s\\S]*?)\\n\`\`\``, "m"))
  return match?.[1]?.trim() || null
}

function parseSupportRuleContent(content: string) {
  const markerIndex = content.indexOf(SUPPORT_RULE_HEADING)

  if (markerIndex !== -1) {
    return content.slice(markerIndex + SUPPORT_RULE_HEADING.length).trim()
  }

  return content
    .replace(/^##\s+短い人格プロンプト\s*\n\s*```(?:text)?\n[\s\S]*?\n```\s*/m, "")
    .replace(/^##\s+詳細人格プロンプト\s*\n\s*```(?:text)?\n[\s\S]*?\n```\s*/m, "")
    .trim()
}

function splitFrontmatter(raw: string) {
  if (!raw.startsWith("---\n")) {
    return {
      body: raw,
      frontmatter: "",
    }
  }

  const lines = raw.split("\n")
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
  if (closingIndex === -1) {
    throw new CharacterRuleSourceError("Character rule frontmatter is not closed.")
  }

  return {
    body: lines.slice(closingIndex + 1).join("\n"),
    frontmatter: lines.slice(1, closingIndex).join("\n"),
  }
}

function validateFrontmatter(frontmatter: string) {
  if (!frontmatter) {
    return
  }

  if (!/^alwaysApply:\s*false\s*$/m.test(frontmatter)) {
    throw new CharacterRuleSourceError("Character rule frontmatter must include alwaysApply: false.")
  }

  if (/^globs:/m.test(frontmatter)) {
    throw new CharacterRuleSourceError("Character rule frontmatter must not define globs; the app loads it explicitly.")
  }
}

function normalizeCharacterRuleContent(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isMissingFileError(error: unknown) {
  return isNodeError(error) && error.code === "ENOENT"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
