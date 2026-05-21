import { useRef, useState, type MutableRefObject } from "react"
import type { CharacterSinValues } from "../../shared/characterState"
import type { ChatSettings } from "../../shared/chatSettings"
import { requestPersonaAutoRewrite } from "../lib/personaCurator"
import type { ConversationTurn } from "../lib/streamAi"

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === "AbortError") {
    return true
  }

  const message = error.message.toLowerCase()
  return message.includes("signal is aborted without reason") || message.includes("the operation was aborted")
}

export function usePersonaAutoRewrite(options: {
  recentTurnsRef: MutableRefObject<ConversationTurn[]>
  runtimeCharacterSins: CharacterSinValues
  setChatSettings: (settings: ChatSettings) => void
  showError: (message: string) => void
  syncRuntimeStatus: () => void | Promise<void>
}) {
  const [personaAutoRewriteBusy, setPersonaAutoRewriteBusy] = useState(false)
  const [personaAutoRewriteNotice, setPersonaAutoRewriteNotice] = useState<string | null>(null)
  const [personaAutoRewriteUpdatedAt, setPersonaAutoRewriteUpdatedAt] = useState<string | null>(null)
  const personaAutoRewriteBusyRef = useRef(false)
  const personaAutoRewriteAbortRef = useRef<AbortController | null>(null)
  const personaAutoRewriteAssistantTurnCountRef = useRef(0)
  const personaAutoRewriteLastTimestampRef = useRef<number>(0)

  async function triggerPersonaAutoRewrite(reason: "manual" | "scheduled"): Promise<boolean> {
    if (personaAutoRewriteBusyRef.current) return false
    personaAutoRewriteBusyRef.current = true
    setPersonaAutoRewriteBusy(true)
    if (reason === "manual") {
      setPersonaAutoRewriteNotice(null)
    }

    const controller = new AbortController()
    personaAutoRewriteAbortRef.current = controller

    try {
      const result = await requestPersonaAutoRewrite(
        {
          recentTurns: options.recentTurnsRef.current.map((t) => ({ role: t.role, text: t.text })),
          runtimeSins: options.runtimeCharacterSins,
        },
        controller.signal,
      )
      options.setChatSettings(result.settings)
      setPersonaAutoRewriteUpdatedAt(result.updatedAt)
      personaAutoRewriteLastTimestampRef.current = Date.now()
      personaAutoRewriteAssistantTurnCountRef.current = 0
      const noticeBase = result.summary?.trim() || "プロンプトを更新しました。"
      setPersonaAutoRewriteNotice(
        reason === "manual" ? `更新完了: ${noticeBase}` : `自動更新: ${noticeBase}`,
      )
      void options.syncRuntimeStatus()
      return true
    } catch (error) {
      if (!isAbortError(error)) {
        const message = error instanceof Error ? error.message : "AI 自動更新に失敗しました。"
        if (reason === "manual") {
          options.showError(message)
        } else {
          console.warn("[personaAutoRewrite] scheduled rewrite failed:", message)
        }
      }
      return false
    } finally {
      personaAutoRewriteBusyRef.current = false
      setPersonaAutoRewriteBusy(false)
      if (personaAutoRewriteAbortRef.current === controller) {
        personaAutoRewriteAbortRef.current = null
      }
    }
  }

  async function handlePersonaAutoRewriteRequest() {
    await triggerPersonaAutoRewrite("manual")
  }

  function handlePersonaAutoRewriteTick() {
    if (personaAutoRewriteBusyRef.current) return
    personaAutoRewriteAssistantTurnCountRef.current += 1
    const elapsed = Date.now() - personaAutoRewriteLastTimestampRef.current
    const turnThreshold = 8
    const intervalThreshold = 10 * 60 * 1000
    if (
      personaAutoRewriteAssistantTurnCountRef.current >= turnThreshold &&
      elapsed >= intervalThreshold &&
      options.recentTurnsRef.current.length >= 4
    ) {
      void triggerPersonaAutoRewrite("scheduled")
    }
  }

  return {
    handlePersonaAutoRewriteRequest,
    handlePersonaAutoRewriteTick,
    personaAutoRewriteBusy,
    personaAutoRewriteNotice,
    personaAutoRewriteUpdatedAt,
    triggerPersonaAutoRewrite,
  }
}
