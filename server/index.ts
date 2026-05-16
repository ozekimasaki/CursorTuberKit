import express, { type Request, type Response } from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chatAutomationReplyStyles, type ChatAutomationRequest } from "../shared/automation.js"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import { parseChatSettingsPatch } from "../shared/chatSettings.js"
import { describeCharacterPresetValidation, parseCharacterPresetInput } from "../shared/characterPresets.js"
import { characterProfile } from "../shared/characterProfile.js"
import type { ChatStreamEvent } from "../shared/chatStream.js"
import { inferEmotionFromText, type FinalEmotionPayload } from "../shared/emotion.js"
import { classifyModeration, mergeModerationAssessments } from "../shared/moderation.js"
import { isPlatformChatMode, type PlatformChatMode } from "../shared/platformChat.js"
import { buildAutomationEnvelope } from "./automationSafety.js"
import { buildAvatarPromptBundle, createEmptyMemKraftPromptContext, type ConversationTurn } from "./aiCommon.js"
import { readAiProvider, resolveAiMetadata, streamAiResponse, validateAiConfiguration } from "./aiProvider.js"
import { readChatSettings, updateChatSettings } from "./chatSettings.js"
import { persistCharacterArtifacts } from "./characterArtifacts.js"
import {
  createCharacterPreset,
  deleteCharacterPreset,
  readCharacterPresets,
  updateCharacterPreset,
} from "./characterPresets.js"
import { readCharacterRuntimeSinValues, resetCharacterRuntimeSinValues } from "./characterRuntimeState.js"
import { resolveChatRequestSession } from "./chatSession.js"
import { resolveCharacterRuntimeContext } from "./characterState.js"
import {
  clearMemKraftMemory,
  loadMemKraftPromptContext,
  persistMemKraftExchange,
  validateMemKraftConfiguration,
} from "./memkraft.js"
import { PlatformChatOrchestrator } from "./platformChatOrchestrator.js"
import { RuntimeStatusTracker, type ChatRunRecap } from "./runtimeStatus.js"
import { getVoicevoxHealth, synthesizeVoice, VoicevoxError } from "./voicevox.js"

const isBunRuntime = typeof globalThis === "object" && "Bun" in globalThis

if (!isBunRuntime) {
  await import("dotenv/config")
}

type ChatStreamRequestBody = {
  automation?: unknown
  prompt?: unknown
  recentTurns?: unknown
}

type VoicevoxSynthesisRequestBody = {
  text?: unknown
}

type PlatformChatStartRequestBody = {
  mode?: unknown
  target?: unknown
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const port = Number(process.env.PORT ?? 8787)
const platformChatOrchestrator = new PlatformChatOrchestrator()
const runtimeStatusTracker = new RuntimeStatusTracker()

app.use(express.json({ limit: "64kb" }))

runtimeStatusTracker.recordPlatformChatState(platformChatOrchestrator.getSnapshot().state)

platformChatOrchestrator.on("state", (state) => {
  runtimeStatusTracker.recordPlatformChatState(state)
})

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    runtimeStatusEndpoint: "/api/runtime/status",
    service: characterProfile.serviceSlug,
  })
})

app.get("/api/runtime/status", (_request, response) => {
  response.json(runtimeStatusTracker.getSnapshot())
})

app.get("/api/chat-settings", async (_request, response) => {
  try {
    response.json(await readChatSettings())
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.put("/api/chat-settings", async (request, response) => {
  const patch = parseChatSettingsPatch(request.body)

  if (!patch) {
    response.status(400).json({ error: "characterName / characterPrompt / characterState / memory を正しく指定してください。" })
    return
  }

  try {
    const settings = await updateChatSettings(patch)
    settings.characterState.sins = await resetCharacterRuntimeSinValues(settings.characterState.sins)
    response.json(settings)
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.post("/api/chat-settings/memory/clear", async (_request, response) => {
  try {
    await validateMemKraftConfiguration()
    await clearMemKraftMemory()
    response.json({ ok: true })
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.get("/api/chat-settings/presets", async (_request, response) => {
  try {
    response.json(await readCharacterPresets())
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.post("/api/chat-settings/presets", async (request, response) => {
  const input = parseCharacterPresetInput(request.body)

  if (!input) {
    response.status(400).json({ error: describeCharacterPresetValidation() })
    return
  }

  try {
    response.status(201).json(await createCharacterPreset(input))
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.put("/api/chat-settings/presets/:presetId", async (request, response) => {
  const input = parseCharacterPresetInput(request.body)

  if (!input) {
    response.status(400).json({ error: describeCharacterPresetValidation() })
    return
  }

  try {
    const preset = await updateCharacterPreset(request.params.presetId, input)

    if (!preset) {
      response.status(404).json({ error: "プリセットが見つかりません。" })
      return
    }

    response.json(preset)
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.delete("/api/chat-settings/presets/:presetId", async (request, response) => {
  try {
    const deleted = await deleteCharacterPreset(request.params.presetId)

    if (!deleted) {
      response.status(404).json({ error: "プリセットが見つかりません。" })
      return
    }

    response.json({ ok: true })
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.get("/api/voicevox/health", async (_request, response) => {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 3000)

  try {
    const health = await getVoicevoxHealth(abortController.signal)
    runtimeStatusTracker.recordVoicevoxHealth(health)
    response.json(health)
  } finally {
    clearTimeout(timeout)
  }
})

app.get("/api/platform-chat/state", (_request, response) => {
  response.json(platformChatOrchestrator.getSnapshot())
})

app.get("/api/platform-chat/stream", (_request, response) => {
  prepareSseResponse(response)

  const writeState = (state: ReturnType<typeof platformChatOrchestrator.getSnapshot>["state"]) => {
    writeSse(response, "state", state)
  }

  const writeViewerEvent = (event: ReturnType<typeof platformChatOrchestrator.getSnapshot>["recentEvents"][number]) => {
    writeSse(response, "viewer-event", event)
  }

  const snapshot = platformChatOrchestrator.getSnapshot()
  writeState(snapshot.state)
  for (const event of snapshot.recentEvents.slice().reverse()) {
    writeViewerEvent(event)
  }

  platformChatOrchestrator.on("state", writeState)
  platformChatOrchestrator.on("viewer-event", writeViewerEvent)

  response.on("close", () => {
    platformChatOrchestrator.off("state", writeState)
    platformChatOrchestrator.off("viewer-event", writeViewerEvent)
    response.end()
  })
})

app.post(
  "/api/platform-chat/start",
  async (request: Request<unknown, unknown, PlatformChatStartRequestBody>, response) => {
    const config = parsePlatformChatConfig(request.body)

    if (!config) {
      response.status(400).json({ error: "mode と target を正しく指定してください。" })
      return
    }

    try {
      response.json(await platformChatOrchestrator.start(config.mode, config.target))
    } catch (error) {
      response.status(500).json({ error: getErrorMessage(error) })
    }
  },
)

app.post("/api/platform-chat/stop", async (_request, response) => {
  try {
    response.json(await platformChatOrchestrator.stop())
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
  }
})

app.post(
  "/api/voicevox/synthesis",
  async (request: Request<unknown, unknown, VoicevoxSynthesisRequestBody>, response) => {
    const text = parseSpeechText(request.body)

    if (!text) {
      response.status(400).json({ error: "text は1文字以上1000文字以下で指定してください。" })
      return
    }

    const abortController = new AbortController()
    let streamCompleted = false

    response.on("close", () => {
      if (!streamCompleted) {
        abortController.abort()
      }
    })

    try {
      const wav = await synthesizeVoice({ signal: abortController.signal, text })

      if (!abortController.signal.aborted) {
        streamCompleted = true
        response.setHeader("Content-Type", "audio/wav")
        response.setHeader("Cache-Control", "no-store")
        response.send(wav)
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        streamCompleted = true
        response.status(error instanceof VoicevoxError ? 502 : 500).json({ error: getErrorMessage(error) })
      }
    }
  },
)

app.post("/api/chat/stream", async (request: Request<Record<string, never>, unknown, ChatStreamRequestBody>, response) => {
  const prompt = parsePrompt(request.body)
  const recentTurns = parseRecentTurns(request.body)
  const automationRequest = parseChatAutomationRequest(request.body)

  if (!prompt) {
    response.status(400).json({ error: "prompt は1文字以上4000文字以下で指定してください。" })
    return
  }

  if (recentTurns === null) {
    response.status(400).json({ error: "recentTurns は role と text を持つ配列で指定してください。" })
    return
  }

  if (automationRequest === null) {
    response.status(400).json({ error: "automation は source と target を持つオブジェクトで指定してください。" })
    return
  }

  let provider
  let routeBase
  let chatSettings
  let runtimeCharacterSins: CharacterArtifactsPayload["director"]["sevenDeadlySins"] | undefined
  let memKraftContext = createEmptyMemKraftPromptContext()

  try {
    chatSettings = await readChatSettings()
    runtimeCharacterSins = await readCharacterRuntimeSinValues(chatSettings.characterState.sins)
    provider = readAiProvider()
    routeBase = resolveAiMetadata(provider)
    await validateAiConfiguration(provider)

    if (chatSettings.memory.mode !== "off" || chatSettings.memory.persistResponses) {
      await validateMemKraftConfiguration()
      memKraftContext = await loadMemKraftPromptContext()
    }
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) })
    return
  }

  const abortController = new AbortController()
  let hasSentSpeakingState = false
  let streamCompleted = false
  let fullResponseText = ""
  let finalEmotion: FinalEmotionPayload | null = null
  let characterArtifactsPersisted = false
  let latestCharacterArtifacts: CharacterArtifactsPayload | null = null
  let emotionActionObserved = false
  let memKraftPersisted = false
  const promptModeration = classifyModeration(prompt)
  const session = resolveChatRequestSession(request, response)
  const characterContext = resolveCharacterRuntimeContext({
    browserSessionId: session.browserSessionId,
    sinOverrides: runtimeCharacterSins,
  })
  const route = {
    ...routeBase,
    characterState: characterContext.metadata,
  }
  runtimeStatusTracker.recordCharacterState(characterContext.metadata)
  const runId = runtimeStatusTracker.startChatRun({
    characterStateSignature: characterContext.metadata.signature,
    promptLength: prompt.length,
    provider,
    recentTurnsCount: recentTurns.length,
  })
  const promptBundle = buildAvatarPromptBundle(prompt, {
    characterContext,
    chatSettings,
    memoryContext: memKraftContext,
    recentTurns,
    replyStyle: automationRequest?.replyStyle,
  })

  response.on("close", () => {
    if (!streamCompleted) {
      abortController.abort()
    }
  })

  prepareSseResponse(response)
  writeMetadata(response, "status", {
    detail: `${provider} と継続コンテキストの準備が整いました。`,
    label: "応答の準備ができました",
    status: "ready",
  })
  writeSse(response, "moderation", promptModeration)
  writeChatEvent(response, {
    type: "metadata",
    payload: route,
  })
  if (!route.supportsProviderSessionReuse) {
    writeChatEvent(response, {
      type: "session",
      payload: {
        browserSessionId: session.browserSessionId,
        characterStateSignature: characterContext.metadata.signature,
        provider,
        supportsResume: route.supportsProviderSessionReuse,
        transport: session.transport,
      },
    })
  }
  writeSse(response, "state", { state: "thinking" })
  writeMetadata(response, "task", {
    detail: `${provider} に返答を依頼しています。`,
    label: "AI へ応答を依頼中",
    name: provider,
    status: "running",
    task: "ai-response",
  })

  try {
    await streamAiResponse(provider, {
      compactPrompt: provider === "cursor" ? promptBundle.resumePrompt : undefined,
      compiledPrompt: promptBundle.fullPrompt,
      onEmotion: (payload) => {
        finalEmotion = payload
        runtimeStatusTracker.setChatEmotion(runId, payload)
      },
      onSupportingEvent: (event) => {
        if (event.type === "action" && event.payload.kind === "emotion-finalize") {
          emotionActionObserved = true
        }

        if (event.type === "character-artifacts") {
          latestCharacterArtifacts = event.payload
          runtimeStatusTracker.setChatCharacterArtifacts(runId, event.payload)
          writeMetadata(response, "task", {
            detail: `${event.payload.source === "cursor-subagents" ? "4つの Cursor subagent" : "ローカル fallback"} でキャラクター補助データを整理しました。`,
            label: "キャラクター補助データを更新しました",
            name: event.payload.writer.segments.length > 0 ? `${event.payload.writer.segments.length} segments` : null,
            raw: event.payload,
            status: event.payload.source === "cursor-subagents" ? "done" : "warning",
            task: "character-agents",
          })
        }

        if (event.type === "session" && typeof event.payload.promptLength === "number" && event.payload.promptMode) {
          runtimeStatusTracker.setChatPromptDetails(runId, {
            promptLength: event.payload.promptLength,
            promptMode: event.payload.promptMode,
          })
        }

        writeChatEvent(response, event)
      },
      onText: (text) => {
        if (!hasSentSpeakingState) {
          hasSentSpeakingState = true
          writeSse(response, "state", { state: "speaking" })
        }

        fullResponseText += text
        runtimeStatusTracker.appendChatText(runId, text)
        writeSse(response, "text", { text })
      },
      route,
      session,
      signal: abortController.signal,
    })

    if (!abortController.signal.aborted) {
      if (!fullResponseText.trim()) {
        const message = "AI から空の応答が返りました。"
        runtimeStatusTracker.finishChatRun(runId, {
          characterMemoryPersisted: characterArtifactsPersisted,
          error: message,
          memKraftPersisted,
          status: "error",
        })
        writeMetadata(response, "status", {
          detail: message,
          label: "空の応答を受信しました",
          status: "error",
        })
        writeSse(response, "error", { message })
        return
      }

      writeChatEvent(response, {
        type: "action",
        payload: {
          kind: "memory-persist",
          provider,
          status: "started",
        },
      })

      if (chatSettings.memory.persistResponses) {
        try {
          await persistMemKraftExchange({
            assistantResponse: fullResponseText,
            recentTurns,
            userPrompt: prompt,
          })
          memKraftPersisted = true
          writeChatEvent(response, {
            type: "action",
            payload: {
              kind: "memory-persist",
              provider,
              status: "completed",
            },
          })
          writeMetadata(response, "action", {
            detail: "今回の返答を継続メモリへ保存しました。",
            label: "MemKraft を更新しました",
            name: "MemKraft",
            status: "done",
          })
        } catch (error) {
          writeChatEvent(response, {
            type: "action",
            payload: {
              detail: getErrorMessage(error),
              kind: "memory-persist",
              provider,
              status: "failed",
            },
          })
          throw error
        }
      } else {
        writeChatEvent(response, {
          type: "action",
          payload: {
            detail: "設定により継続メモリへの保存を行いませんでした。",
            kind: "memory-persist",
            provider,
            status: "skipped",
          },
        })
        writeMetadata(response, "action", {
          detail: "設定により今回の返答は長期記憶へ保存していません。",
          label: "MemKraft 保存をスキップしました",
          name: "MemKraft",
          status: "warning",
        })
      }

      if (!finalEmotion) {
        finalEmotion = {
          emotion: inferEmotionFromText(fullResponseText),
          hookObserved: false,
          source: "text-inference",
        }
        runtimeStatusTracker.setChatEmotion(runId, finalEmotion)

        if (!emotionActionObserved) {
          writeChatEvent(response, {
            type: "action",
            payload: {
              detail: "Provider finalization metadata was unavailable, so text inference was used.",
              kind: "emotion-finalize",
              provider,
              source: finalEmotion.source,
              status: "completed",
            },
          })
        }
      }

      writeMetadata(response, "task", {
        detail:
          finalEmotion.source === "cursor-subagent"
            ? `最終感情は ${finalEmotion.emotion} です。${finalEmotion.hookObserved ? " stop hook を観測しました。" : ""}`
            : `最終感情は ${finalEmotion.emotion} です。本文から推定しました。`,
        label: "最終感情を確定しました",
        name: finalEmotion.emotion,
        status: "done",
        task: "emotion-finalization",
      })
      writeChatEvent(response, { type: "emotion", payload: finalEmotion })
      writeMetadata(response, "task", {
        detail:
          provider === "cursor" && latestCharacterArtifacts
            ? "Lore / relationship / diary / teaser をアーティファクトとして保存しています。"
            : "Lore / relationship / diary / teaser の永続アーティファクトを更新しています。",
        label: "キャラクター記録を保存中",
        name: "memory artifacts",
        status: "running",
        task: "character-memory",
      })

      try {
        const characterMemorySummary = await persistCharacterArtifacts({
          artifacts: latestCharacterArtifacts,
          assistantResponse: fullResponseText,
          characterStateSignature: characterContext.metadata.signature,
          finalEmotion,
          memKraftContext,
          provider,
          recentTurns,
          runId,
          userPrompt: prompt,
        })
        characterArtifactsPersisted = true
        runtimeStatusTracker.recordCharacterMemory(characterMemorySummary)
        writeMetadata(response, "action", {
          detail: `${characterMemorySummary.loreCardCount} lore / ${characterMemorySummary.relationshipCount} relationship を更新し、配信日誌と teaser を保存しました。`,
          label: "キャラクター記録を更新しました",
          name: characterMemorySummary.teaserHeadline,
          raw: characterMemorySummary,
          status: "done",
        })
      } catch (error) {
        writeMetadata(response, "action", {
          detail: getErrorMessage(error),
          label: "キャラクター記録の保存はスキップされました",
          name: "memory artifacts",
          status: "warning",
        })
      }

      writeSse(
        response,
        "automation",
        buildAutomationEnvelope({
          moderation: mergeModerationAssessments(promptModeration, classifyModeration(fullResponseText)),
          request: automationRequest,
          target: automationRequest?.target,
        }),
      )
      const recap = runtimeStatusTracker.finishChatRun(runId, {
        characterMemoryPersisted: characterArtifactsPersisted,
        memKraftPersisted,
        status: "completed",
      })
      if (recap) {
        writeChatRunRecap(response, recap)
      }

      writeSse(response, "state", { state: "done" })
      writeSse(response, "done", { ok: true })
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      const message = getErrorMessage(error)
      runtimeStatusTracker.finishChatRun(runId, {
        characterMemoryPersisted: characterArtifactsPersisted,
        error: message,
        memKraftPersisted,
        status: "error",
      })
      writeMetadata(response, "status", {
        detail: message,
        label: "ストリーム処理でエラーが発生しました",
        status: "error",
      })
      writeSse(response, "error", { message })
    }
  } finally {
    if (abortController.signal.aborted) {
      runtimeStatusTracker.finishChatRun(runId, {
        characterMemoryPersisted: characterArtifactsPersisted,
        memKraftPersisted,
        status: "aborted",
      })
    }
    streamCompleted = true
    response.end()
  }
})

if (process.env.NODE_ENV === "production") {
  const clientDistPath = path.resolve(__dirname, "../client")
  app.use(express.static(clientDistPath))
  app.get("*", (_request, response) => {
    response.sendFile(path.join(clientDistPath, "index.html"))
  })
}

app.listen(port, () => {
  console.log(`${characterProfile.agentName} server listening on http://localhost:${port}`)
})

function parsePrompt(body: ChatStreamRequestBody) {
  if (typeof body.prompt !== "string") {
    return null
  }

  const prompt = body.prompt.trim()

  if (!prompt || prompt.length > 4000) {
    return null
  }

  return prompt
}

function parseRecentTurns(body: ChatStreamRequestBody): ConversationTurn[] | null {
  if (body.recentTurns === undefined) {
    return []
  }

  if (!Array.isArray(body.recentTurns) || body.recentTurns.length > 12) {
    return null
  }

  const turns: ConversationTurn[] = []

  for (const entry of body.recentTurns) {
    if (!isRecord(entry)) {
      return null
    }

    if ((entry.role !== "user" && entry.role !== "assistant") || typeof entry.text !== "string") {
      return null
    }

    const text = entry.text.trim()

    if (!text || text.length > 1000) {
      return null
    }

    turns.push({ role: entry.role, text })
  }

  return turns
}

function parseChatAutomationRequest(body: ChatStreamRequestBody): ChatAutomationRequest | null {
  if (body.automation === undefined) {
    return {
      source: "manual",
    }
  }

  if (!isRecord(body.automation)) {
    return null
  }

  if (body.automation.source !== "manual" && body.automation.source !== "platform_auto_reply") {
    return null
  }

  if (body.automation.target === undefined) {
    return {
      replyStyle: parseChatAutomationReplyStyle(body.automation.replyStyle),
      source: body.automation.source,
    }
  }

  if (!isRecord(body.automation.target)) {
    return null
  }

  const platform =
    body.automation.target.platform === undefined
      ? undefined
      : isPlatformChatMode(body.automation.target.platform)
        ? body.automation.target.platform
        : null
  const target =
    body.automation.target.target === undefined
      ? undefined
      : typeof body.automation.target.target === "string"
        ? body.automation.target.target.trim()
        : null

  if (platform === null || target === null) {
    return null
  }

  return {
    replyStyle: parseChatAutomationReplyStyle(body.automation.replyStyle),
    source: body.automation.source,
    target: {
      platform,
      target: target || undefined,
    },
  }
}

function parseSpeechText(body: VoicevoxSynthesisRequestBody) {
  if (typeof body.text !== "string") {
    return null
  }

  const text = body.text.trim()

  if (!text || text.length > 1000) {
    return null
  }

  return text
}

function parseChatAutomationReplyStyle(value: unknown): ChatAutomationRequest["replyStyle"] {
  return typeof value === "string" && chatAutomationReplyStyles.includes(value as (typeof chatAutomationReplyStyles)[number])
    ? (value as ChatAutomationRequest["replyStyle"])
    : undefined
}

function parsePlatformChatConfig(body: PlatformChatStartRequestBody): { mode: PlatformChatMode; target: string } | null {
  if (!isPlatformChatMode(body.mode) || typeof body.target !== "string") {
    return null
  }

  const target = body.target.trim()
  if (!target || target.length > 400) {
    return null
  }

  return {
    mode: body.mode,
    target,
  }
}

function prepareSseResponse(response: Response) {
  response.status(200)
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.flushHeaders()
}

function writeSse(response: Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(data)}\n\n`)
}

function writeMetadata(
  response: Response,
  event: string,
  payload: {
    detail?: string | null
    label: string
    name?: string | null
    raw?: unknown
    status?: string | null
    task?: string | null
  },
) {
  writeSse(response, event, {
    detail: payload.detail ?? null,
    label: payload.label,
    name: payload.name ?? null,
    raw: payload.raw ?? null,
    status: payload.status ?? null,
    task: payload.task ?? null,
  })
}

function writeChatEvent(response: Response, event: ChatStreamEvent) {
  switch (event.type) {
    case "action":
    case "character-artifacts":
    case "emotion":
    case "metadata":
    case "session":
      writeSse(response, event.type, event.payload)
      return
    case "done":
      writeSse(response, "done", { ok: true })
      return
    case "error":
      writeSse(response, "error", { message: event.message })
      return
    case "state":
      writeSse(response, "state", { state: event.state })
      return
    case "text":
      writeSse(response, "text", { text: event.text })
      return
  }
}

function writeChatRunRecap(response: Response, recap: ChatRunRecap) {
  writeMetadata(response, "metadata", {
    detail: `${recap.responseLength}文字 / ${formatDuration(recap.durationMs)} / ${
      recap.emotion?.emotion ?? "neutral"
    } / MemKraft ${recap.memKraftPersisted ? "ok" : "skip"} / Artifacts ${recap.characterMemoryPersisted ? "ok" : "skip"}`,
    label: "今回の返答サマリー",
    raw: recap,
    status: recap.status === "error" ? "error" : recap.status === "aborted" ? "cancelled" : "done",
  })
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

function getErrorMessage(error: unknown) {
  return extractErrorMessage(error, new Set()) ?? "AI応答の生成中に不明なエラーが発生しました。"
}

function extractErrorMessage(value: unknown, seen: Set<object>): string | null {
  if (typeof value === "string") {
    const message = value.trim()

    if (!message) {
      return null
    }

    const parsedJson = parseJsonMessage(message)

    return extractErrorMessage(parsedJson, seen) ?? message
  }

  if (value instanceof Error) {
    return extractErrorMessage(value.message, seen) ?? value.name
  }

  if (!isRecord(value)) {
    return null
  }

  if (seen.has(value)) {
    return null
  }

  seen.add(value)

  return (
    extractErrorMessage(value.message, seen) ??
    extractErrorMessage(value.error, seen) ??
    extractErrorMessage(value.details, seen)
  )
}

function parseJsonMessage(message: string) {
  if (!message.startsWith("{") && !message.startsWith("[")) {
    return null
  }

  try {
    return JSON.parse(message)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
