import express, { type Request, type Response } from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ChatAutomationRequest } from "../shared/automation.js"
import type { CharacterArtifactsPayload } from "../shared/characterAgents.js"
import { parseChatSettingsPatch } from "../shared/chatSettings.js"
import { describeCharacterPresetValidation, parseCharacterPresetInput } from "../shared/characterPresets.js"
import { characterProfile } from "../shared/characterProfile.js"
import { inferEmotionFromText, type FinalEmotionPayload } from "../shared/emotion.js"
import { classifyModeration, mergeModerationAssessments } from "../shared/moderation.js"
import { buildAutomationEnvelope } from "./automationSafety.js"
import { buildAvatarPromptBundle, createEmptyMemKraftPromptContext } from "./aiCommon.js"
import { readAiProvider, resolveAiMetadata, streamAiResponse, validateAiConfiguration } from "./aiProvider.js"
import { readChatSettings, updateChatSettings } from "./chatSettings.js"
import {
  composeCharacterRuleContent,
  readCharacterRuleSource,
  readCharacterRuleStatus,
  writeCharacterRuleContent,
  type CharacterRuleSource,
} from "./characterRuleSource.js"
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
import { RuntimeStatusTracker } from "./runtimeStatus.js"
import { fetchVoicevoxSpeakers, getVoicevoxHealth, synthesizeVoice, VoicevoxError } from "./voicevox.js"
import { AutopilotPlannerError, runAutopilotPlanner } from "./autopilotPlanner.js"
import { PersonaCuratorError, runPersonaCurator } from "./personaCurator.js"
import type { PersonaAutoRewriteRequestBody, PersonaAutoRewriteResponse } from "../shared/personaCurator.js"
import { normalizeAppSettings, type AppSettings } from "../shared/appSettings.js"
import { describeToneDirective } from "../shared/sinsBias.js"
import type { AutopilotTopicRequestBody, AutopilotTopicResponse } from "../shared/autopilot.js"
import { normalizeCharacterSinValues } from "../shared/characterState.js"
import { readAppConfig } from "./appConfig.js"
import { overwriteAppSettings, readAppSettings } from "./appSettings.js"
import { asyncRoute, readRequestSignal } from "./lib/asyncRoute.js"
import { getErrorMessage } from "./lib/errors.js"
import {
  prepareSseResponse,
  writeChatEvent,
  writeChatRunRecap,
  writeMetadata,
  writeSse,
} from "./lib/sse.js"
import {
  parseAutopilotTopicBody,
  parseChatAutomationRequest,
  parsePersonaAutoRewriteBody,
  parsePlatformChatConfig,
  parsePrompt,
  parseRecentTurns,
  parseSpeechText,
  type ChatStreamRequestBody,
  type PlatformChatStartRequestBody,
  type VoicevoxSynthesisRequestBody,
} from "./lib/parsers.js"

const isBunRuntime = typeof globalThis === "object" && "Bun" in globalThis

if (!isBunRuntime) {
  await import("dotenv/config")
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const appConfig = readAppConfig()
const port = appConfig.server.port
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

app.get("/api/runtime/status", asyncRoute(async (_request, response) => {
  const settings = await readChatSettings()
  const characterRule = await readCharacterRuleStatus()
  const characterStateCurrent = await readCharacterRuntimeSinValues(settings.characterState.sins)
  response.json({
    ...runtimeStatusTracker.getSnapshot(),
    characterRule,
    characterStateCurrent,
  })
}))

app.get("/api/chat-settings", asyncRoute(async (_request, response) => {
  response.json(await readChatSettings())
}))

app.get("/api/app-settings", asyncRoute(async (_request, response) => {
  response.json(await readAppSettings())
}))

app.put("/api/app-settings", asyncRoute(async (request: Request<unknown, unknown, AppSettings>, response) => {
  const normalized = normalizeAppSettings(request.body, await readAppSettings())
  response.json(await overwriteAppSettings(normalized))
}))

app.put("/api/chat-settings", asyncRoute(async (request, response) => {
  const patch = parseChatSettingsPatch(request.body)

  if (!patch) {
    response.status(400).json({ error: "characterName / characterState / memory を正しく指定してください。" })
    return
  }

  // characterPrompt / characterFullPrompt is now AI-managed via /api/character/auto-rewrite.
  // Silently ignore any client-supplied values for these fields.
  delete patch.characterPrompt
  delete patch.characterFullPrompt

  const settings = await updateChatSettings(patch)

  if (patch.characterState?.sins) {
    settings.characterState.sins = await resetCharacterRuntimeSinValues(settings.characterState.sins)
  }

  response.json(settings)
}))

app.post("/api/chat-settings/memory/clear", asyncRoute(async (_request, response) => {
  await validateMemKraftConfiguration()
  await clearMemKraftMemory()
  response.json({ ok: true })
}))

app.get("/api/chat-settings/presets", asyncRoute(async (_request, response) => {
  response.json(await readCharacterPresets())
}))

app.post("/api/chat-settings/presets", asyncRoute(async (request, response) => {
  const input = parseCharacterPresetInput(request.body)

  if (!input) {
    response.status(400).json({ error: describeCharacterPresetValidation() })
    return
  }

  response.status(201).json(await createCharacterPreset(input))
}))

app.put("/api/chat-settings/presets/:presetId", asyncRoute(async (request, response) => {
  const input = parseCharacterPresetInput(request.body)

  if (!input) {
    response.status(400).json({ error: describeCharacterPresetValidation() })
    return
  }

  const preset = await updateCharacterPreset(request.params.presetId, input)

  if (!preset) {
    response.status(404).json({ error: "プリセットが見つかりません。" })
    return
  }

  response.json(preset)
}))

app.delete("/api/chat-settings/presets/:presetId", asyncRoute(async (request, response) => {
  const deleted = await deleteCharacterPreset(request.params.presetId)

  if (!deleted) {
    response.status(404).json({ error: "プリセットが見つかりません。" })
    return
  }

  response.json({ ok: true })
}))

app.get("/api/voicevox/health", async (_request, response) => {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 3000)

  try {
    const settings = await readChatSettings().catch(() => null)
    const health = await getVoicevoxHealth(abortController.signal, settings?.voice)
    runtimeStatusTracker.recordVoicevoxHealth(health)
    response.json(health)
  } finally {
    clearTimeout(timeout)
  }
})

app.get("/api/voicevox/speakers", async (_request, response) => {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 5000)

  try {
    const groups = await fetchVoicevoxSpeakers(abortController.signal)
    response.json({ groups })
  } catch (error) {
    response.status(error instanceof VoicevoxError ? 502 : 500).json({ error: getErrorMessage(error) })
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
  asyncRoute(async (request, response) => {
    const config = parsePlatformChatConfig(request.body as PlatformChatStartRequestBody)

    if (!config) {
      response.status(400).json({ error: "mode と target を正しく指定してください。" })
      return
    }

    response.json(await platformChatOrchestrator.start(config.mode, config.target))
  }),
)

app.post("/api/platform-chat/stop", asyncRoute(async (_request, response) => {
  response.json(await platformChatOrchestrator.stop())
}))

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
      const settings = await readChatSettings().catch(() => null)
      const wav = await synthesizeVoice({ signal: abortController.signal, text, voice: settings?.voice })

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
  const inputKind: "viewer-comment" | "self-driven" =
    request.body?.inputKind === "self-driven" ? "self-driven" : "viewer-comment"

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
  let characterRule: CharacterRuleSource
  let runtimeCharacterSins: CharacterArtifactsPayload["director"]["sevenDeadlySins"] | undefined
  let memKraftContext = createEmptyMemKraftPromptContext()

  try {
    chatSettings = await readChatSettings()
    characterRule = await readCharacterRuleSource()
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
    promptIdentity: {
      characterFullPrompt: chatSettings.characterFullPrompt,
      characterName: chatSettings.characterName,
      characterPrompt: chatSettings.characterPrompt,
      characterRuleContent: characterRule.content,
    },
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
    characterRuleContent: characterRule.runtimeRuleContent,
    chatSettings,
    inputKind,
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

app.post(
  "/api/autopilot/topic",
  async (
    request: Request<Record<string, never>, unknown, AutopilotTopicRequestBody>,
    response: Response<AutopilotTopicResponse | { error: string }>,
  ) => {
    const body = parseAutopilotTopicBody(request.body)

    if (!body) {
      response.status(400).json({ error: "autopilot topic request の形式が不正です。" })
      return
    }

    const apiKey = process.env.CURSOR_API_KEY?.trim()
    if (!apiKey) {
      response.status(503).json({ error: "CURSOR_API_KEY が未設定です。" })
      return
    }

    let chatSettings
    try {
      chatSettings = await readChatSettings()
    } catch (error) {
      response.status(500).json({ error: getErrorMessage(error) })
      return
    }

    const runtimeSins = await readCharacterRuntimeSinValues(chatSettings.characterState.sins).catch(
      () => chatSettings.characterState.sins,
    )
    const effectiveSins = normalizeCharacterSinValues({ ...runtimeSins, ...body.characterStateSins })

    let memoryContext
    try {
      if (chatSettings.memory.mode !== "off") {
        await validateMemKraftConfiguration()
        memoryContext = await loadMemKraftPromptContext()
      }
    } catch {
      memoryContext = undefined
    }

    const route = resolveAiMetadata()
    const plannerModel = appConfig.cursor.autopilotModel || route.characterAgentModel || route.model

    try {
      const result = await runAutopilotPlanner({
        apiKey,
        model: plannerModel,
        body: {
          ...body,
          characterStateSins: effectiveSins,
          toneDirective: body.toneDirective ?? describeToneDirective(effectiveSins),
        },
        memoryContext,
      })

      response.json(result)
    } catch (error) {
      const status = error instanceof AutopilotPlannerError ? 502 : 500
      response.status(status).json({ error: getErrorMessage(error) })
    }
  },
)

app.post(
  "/api/character/auto-rewrite",
  async (
    request: Request<Record<string, never>, unknown, PersonaAutoRewriteRequestBody>,
    response: Response<PersonaAutoRewriteResponse | { error: string }>,
  ) => {
    const body = parsePersonaAutoRewriteBody(request.body)
    if (!body) {
      response.status(400).json({ error: "auto-rewrite request の形式が不正です。" })
      return
    }

    const apiKey = process.env.CURSOR_API_KEY?.trim()
    if (!apiKey) {
      response.status(503).json({ error: "CURSOR_API_KEY が未設定です。" })
      return
    }

    let chatSettings
    let characterRule: CharacterRuleSource
    try {
      chatSettings = await readChatSettings()
      characterRule = await readCharacterRuleSource()
    } catch (error) {
      response.status(500).json({ error: getErrorMessage(error) })
      return
    }

    const runtimeSins =
      body.runtimeSins ??
      (await readCharacterRuntimeSinValues(chatSettings.characterState.sins).catch(
        () => chatSettings.characterState.sins,
      ))

    let memoryContext = createEmptyMemKraftPromptContext()
    try {
      if (chatSettings.memory.mode !== "off") {
        await validateMemKraftConfiguration()
        memoryContext = await loadMemKraftPromptContext()
      }
    } catch {
      memoryContext = createEmptyMemKraftPromptContext()
    }

    const route = resolveAiMetadata()
    const curatorModel = appConfig.cursor.personaCuratorModel || route.characterAgentModel || route.model

    try {
      const result = await runPersonaCurator({
        apiKey,
        model: curatorModel,
        currentSettings: chatSettings,
        currentRuleContent: characterRule.content,
        recentTurns: body.recentTurns,
        runtimeSins: normalizeCharacterSinValues(runtimeSins),
        memoryContext,
        signal: readRequestSignal(request),
      })

      const previousRuleContent = characterRule.content
      const nextRuleStatus = await writeCharacterRuleContent(composeCharacterRuleContent(result))
      let saved
      try {
        saved = await updateChatSettings({
          characterPrompt: result.characterPrompt,
          characterFullPrompt: result.characterFullPrompt,
        })
      } catch (error) {
        await writeCharacterRuleContent(previousRuleContent).catch(() => undefined)
        throw error
      }

      response.json({
        characterRule: nextRuleStatus,
        settings: saved,
        summary: result.summary,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      const status = error instanceof PersonaCuratorError ? 502 : 500
      response.status(status).json({ error: getErrorMessage(error) })
    }
  },
)

app.listen(port, () => {
  console.log(`${characterProfile.agentName} server listening on http://localhost:${port}`)
})
