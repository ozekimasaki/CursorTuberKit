import { useCallback, useEffect, useState } from "react"

import type { CharacterPreset, CharacterPresetInput } from "../../shared/characterPresets"
import { createDefaultChatSettings, type ChatSettings } from "../../shared/chatSettings"
import {
  clearChatMemory,
  createCharacterPreset,
  deleteCharacterPreset,
  fetchCharacterPresets,
  fetchChatSettings,
  updateCharacterPreset as saveCharacterPreset,
  updateChatSettings,
} from "../lib/chatSettings"
import { isAbortError } from "../lib/sseHelpers"

type ChatSettingsAction = "idle" | "saving" | "clearing"

interface UseChatSettingsManagerArgs {
  showError: (message: string) => void
  syncRuntimeStatus: () => Promise<void> | void
}

/**
 * Owns the chat-settings + character-preset state that was previously inlined
 * into App.tsx.
 *
 * Behavior preserved exactly:
 * - Initial load on mount uses an AbortController and silently ignores abort
 *   errors; any other failure is surfaced via `showError`.
 * - Save / preset CRUD / memory clear set their respective busy + notice state
 *   in the same order as before, and update local state on success.
 * - `setChatSettings` is exposed so that persona auto-rewrite can patch the
 *   settings in-place, matching the previous wiring.
 */
export function useChatSettingsManager({ showError, syncRuntimeStatus }: UseChatSettingsManagerArgs) {
  const [chatSettings, setChatSettings] = useState<ChatSettings>(createDefaultChatSettings)
  const [characterPresets, setCharacterPresets] = useState<CharacterPreset[]>([])
  const [chatSettingsAction, setChatSettingsAction] = useState<ChatSettingsAction>("idle")
  const [chatSettingsNotice, setChatSettingsNotice] = useState<string | null>(null)
  const [characterPresetBusy, setCharacterPresetBusy] = useState(false)
  const [characterPresetNotice, setCharacterPresetNotice] = useState<string | null>(null)

  useEffect(() => {
    const abortController = new AbortController()

    fetchChatSettings(abortController.signal)
      .then((settings) => setChatSettings(settings))
      .catch((error) => {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "設定の取得に失敗しました。")
        }
      })

    return () => abortController.abort()
  }, [showError])

  useEffect(() => {
    const abortController = new AbortController()

    fetchCharacterPresets(abortController.signal)
      .then((presets) => setCharacterPresets(presets))
      .catch((error) => {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "プリセットの取得に失敗しました。")
        }
      })

    return () => abortController.abort()
  }, [showError])

  const handleChatSettingsSave = useCallback(
    async (nextSettings: ChatSettings) => {
      setChatSettingsAction("saving")
      setChatSettingsNotice(null)
      setCharacterPresetNotice(null)

      try {
        const saved = await updateChatSettings({
          characterName: nextSettings.characterName,
          characterFullPrompt: nextSettings.characterFullPrompt,
          characterPrompt: nextSettings.characterPrompt,
          memory: nextSettings.memory,
        })
        setChatSettings(saved)
        setChatSettingsNotice("キャラクター名・人格 prompt・長期記憶設定を保存しました。")
        void syncRuntimeStatus()
      } catch (error) {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "設定の保存に失敗しました。")
        }
      } finally {
        setChatSettingsAction("idle")
      }
    },
    [showError, syncRuntimeStatus],
  )

  const handleCharacterPresetCreate = useCallback(
    async (input: CharacterPresetInput) => {
      setCharacterPresetBusy(true)
      setCharacterPresetNotice(null)
      setChatSettingsNotice(null)

      try {
        const created = await createCharacterPreset(input)
        setCharacterPresets((current) => [...current, created])
        setCharacterPresetNotice(`プリセット「${created.label}」を保存しました。`)
        return created
      } catch (error) {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "プリセットの保存に失敗しました。")
        }
        return null
      } finally {
        setCharacterPresetBusy(false)
      }
    },
    [showError],
  )

  const handleCharacterPresetUpdate = useCallback(
    async (presetId: string, input: CharacterPresetInput) => {
      setCharacterPresetBusy(true)
      setCharacterPresetNotice(null)
      setChatSettingsNotice(null)

      try {
        const updated = await saveCharacterPreset(presetId, input)
        setCharacterPresets((current) =>
          current.map((preset) => (preset.id === updated.id ? updated : preset)),
        )
        setCharacterPresetNotice(`プリセット「${updated.label}」を更新しました。`)
        return updated
      } catch (error) {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "プリセットの更新に失敗しました。")
        }
        return null
      } finally {
        setCharacterPresetBusy(false)
      }
    },
    [showError],
  )

  const handleCharacterPresetDelete = useCallback(
    async (presetId: string) => {
      setCharacterPresetBusy(true)
      setCharacterPresetNotice(null)
      setChatSettingsNotice(null)

      try {
        await deleteCharacterPreset(presetId)
        setCharacterPresets((current) => current.filter((preset) => preset.id !== presetId))
        setCharacterPresetNotice("プリセットを削除しました。")
        return true
      } catch (error) {
        if (!isAbortError(error)) {
          showError(error instanceof Error ? error.message : "プリセットの削除に失敗しました。")
        }
        return false
      } finally {
        setCharacterPresetBusy(false)
      }
    },
    [showError],
  )

  const handleChatMemoryClear = useCallback(async () => {
    setChatSettingsAction("clearing")
    setChatSettingsNotice(null)
    setCharacterPresetNotice(null)

    try {
      await clearChatMemory()
      setChatSettingsNotice("MemKraft の長期記憶をクリアしました。次の返答から新しい流れで組み直します。")
    } catch (error) {
      if (!isAbortError(error)) {
        showError(error instanceof Error ? error.message : "長期記憶のクリアに失敗しました。")
      }
    } finally {
      setChatSettingsAction("idle")
    }
  }, [showError])

  return {
    characterPresetBusy,
    characterPresetNotice,
    characterPresets,
    chatSettings,
    chatSettingsAction,
    chatSettingsNotice,
    handleChatMemoryClear,
    handleCharacterPresetCreate,
    handleCharacterPresetDelete,
    handleCharacterPresetUpdate,
    handleChatSettingsSave,
    setChatSettings,
    setChatSettingsNotice,
    setCharacterPresetNotice,
  }
}
