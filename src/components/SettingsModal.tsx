import { useEffect, useState } from "react"
import { X as LucideX } from "lucide-react"
import { describeAutomationExecutionLevel, type AutomationPolicy } from "../../shared/automation"
import {
  maxCharacterPresetLabelLength,
  type CharacterPreset,
  type CharacterPresetInput,
} from "../../shared/characterPresets"
import {
  createDefaultChatSettings,
  maxCharacterFullPromptLength,
  maxCharacterNameLength,
  maxCharacterPromptLength,
  renderCharacterFullPrompt,
  type ChatSettings,
} from "../../shared/chatSettings"
import type { CharacterRuleStatus } from "../../shared/characterRules"
import { characterProfile, characterProfileHighlights } from "../../shared/characterProfile"
import { characterSinNames, type CharacterSinName, type CharacterSinValues } from "../../shared/characterState"
import type { ModerationAssessment } from "../../shared/moderation"
import { svgCharacterChoices, type AvatarMode, type MotionPngAssetStatus, type MotionPngSettings, type SvgAvatarSettings, type SvgCharacterId } from "../lib/avatarConfig"
import { type VoicevoxHealth } from "../lib/voicevox"
import type { StageDisplayPreferences } from "../lib/stagePreferences"
import {
  backgroundPresetCategoryLabels,
  backgroundPresets,
  type BackgroundPresetCategory,
} from "../lib/backgroundPresets"
import type { ReactNode } from "react"

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  avatarMode: AvatarMode
  onAvatarModeChange: (mode: AvatarMode) => void
  backgroundAssetKind: "image" | "video" | "preset" | null
  backgroundAssetLabel: string | null
  backgroundPresetId: string | null
  onBackgroundClear: () => void
  onBackgroundSelect: () => void
  onBackgroundPresetSelect: (presetId: string) => void
  onMotionPngClear: () => void
  onMotionPngFolderSelect: () => void
  onMotionPngSettingChange: (patch: Partial<MotionPngSettings>) => void
  motionPngAssetStatus: MotionPngAssetStatus
  motionPngFolderLabel: string | null
  motionPngSettings: MotionPngSettings
  svgAvatarSettings: SvgAvatarSettings
  onSvgAvatarSettingChange: (patch: Partial<SvgAvatarSettings>) => void
  svgCharacter: SvgCharacterId
  onSvgCharacterChange: (character: SvgCharacterId) => void
  stagePreview?: ReactNode
  stageDisplayPrefs: StageDisplayPreferences
  onStageDisplayPrefsChange: (patch: Partial<StageDisplayPreferences>) => void
  voiceEnabled: boolean
  onVoiceEnabledChange: (enabled: boolean) => void
  voicevoxHealth: VoicevoxHealth | null
  latestAutomationPolicy: AutomationPolicy
  latestModeration: ModerationAssessment | null
  chatSettings: ChatSettings
  chatSettingsBusy: boolean
  chatSettingsNotice: string | null
  chatMemoryClearBusy: boolean
  characterPresets: CharacterPreset[]
  characterPresetBusy: boolean
  characterPresetNotice: string | null
  characterRuleStatus: CharacterRuleStatus
  runtimeCharacterSins: CharacterSinValues
  onCharacterPresetCreate: (preset: CharacterPresetInput) => CharacterPreset | Promise<CharacterPreset | null> | null
  onCharacterPresetDelete: (presetId: string) => boolean | Promise<boolean>
  onCharacterPresetUpdate: (
    presetId: string,
    preset: CharacterPresetInput,
  ) => CharacterPreset | Promise<CharacterPreset | null> | null
  onChatMemoryClear: () => void | Promise<void>
  onChatSettingsSave: (settings: ChatSettings) => void | Promise<void>
  onPersonaAutoRewriteRequest: () => void | Promise<void>
  personaAutoRewriteBusy: boolean
  personaAutoRewriteNotice: string | null
  personaAutoRewriteUpdatedAt: string | null
}

export function SettingsModal(props: SettingsModalProps) {
  const {
    open,
    onClose,
    avatarMode,
    onAvatarModeChange,
    backgroundAssetKind,
    backgroundAssetLabel,
    backgroundPresetId,
    onBackgroundClear,
    onBackgroundSelect,
    onBackgroundPresetSelect,
    onMotionPngClear,
    onMotionPngFolderSelect,
    onMotionPngSettingChange,
    motionPngAssetStatus,
    motionPngFolderLabel,
    motionPngSettings,
    svgAvatarSettings,
    onSvgAvatarSettingChange,
    svgCharacter,
    onSvgCharacterChange,
    stagePreview,
    stageDisplayPrefs,
    onStageDisplayPrefsChange,
    voiceEnabled,
    onVoiceEnabledChange,
    voicevoxHealth,
    latestAutomationPolicy,
    latestModeration,
    chatSettings,
    chatSettingsBusy,
    chatSettingsNotice,
    chatMemoryClearBusy,
    characterPresets,
    characterPresetBusy,
    characterPresetNotice,
    characterRuleStatus,
    runtimeCharacterSins,
    onCharacterPresetCreate,
    onCharacterPresetDelete,
    onCharacterPresetUpdate,
    onChatMemoryClear,
    onChatSettingsSave,
    onPersonaAutoRewriteRequest,
    personaAutoRewriteBusy,
    personaAutoRewriteNotice,
    personaAutoRewriteUpdatedAt,
  } = props

  const [characterNameDraft, setCharacterNameDraft] = useState(chatSettings.characterName)
  const [characterFullPromptDraft, setCharacterFullPromptDraft] = useState(chatSettings.characterFullPrompt)
  const [characterPromptDraft, setCharacterPromptDraft] = useState(chatSettings.characterPrompt)
  const [presetLabelDraft, setPresetLabelDraft] = useState(chatSettings.characterName)
  const [selectedPresetId, setSelectedPresetId] = useState("")
  const [memoryModeDraft, setMemoryModeDraft] = useState(chatSettings.memory.mode)
  const [memoryPersistDraft, setMemoryPersistDraft] = useState(chatSettings.memory.persistResponses)

  useEffect(() => {
    setCharacterNameDraft(chatSettings.characterName)
    setCharacterFullPromptDraft(chatSettings.characterFullPrompt)
    setCharacterPromptDraft(chatSettings.characterPrompt)
    setMemoryModeDraft(chatSettings.memory.mode)
    setMemoryPersistDraft(chatSettings.memory.persistResponses)
  }, [chatSettings])

  useEffect(() => {
    if (!selectedPresetId) return
    if (!characterPresets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId("")
    }
  }, [characterPresets, selectedPresetId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const selectedPreset = characterPresets.find((preset) => preset.id === selectedPresetId) ?? null
  const trimmedPresetLabel = presetLabelDraft.replace(/\s+/g, " ").trim()
  const canSavePreset = trimmedPresetLabel.length > 0 && !characterPresetBusy
  const canOverwritePreset = !!selectedPreset && trimmedPresetLabel.length > 0 && !characterPresetBusy
  const canDeletePreset = !!selectedPreset && !characterPresetBusy
  const renderedCharacterFullPrompt = renderCharacterFullPrompt({
    characterFullPrompt: characterFullPromptDraft,
    characterName: characterNameDraft.trim() || characterProfile.name,
    characterPrompt: characterPromptDraft,
  })
  const isCharacterDraftDirty = characterNameDraft !== chatSettings.characterName
  const isMemoryDirty =
    memoryModeDraft !== chatSettings.memory.mode || memoryPersistDraft !== chatSettings.memory.persistResponses
  const isSettingsDirty = isCharacterDraftDirty || isMemoryDirty
  const voiceSummary = voicevoxHealth
    ? voicevoxHealth.ok
      ? `接続中 · speaker ${voicevoxHealth.speaker}${voicevoxHealth.version ? ` · ${voicevoxHealth.version}` : ""}`
      : `未接続 · ${voicevoxHealth.url}`
    : "確認中..."
  const automationPolicySummary = describeAutomationExecutionLevel(latestAutomationPolicy.maxExecutionLevel)

  function buildPresetInput(): CharacterPresetInput {
    return {
      label: trimmedPresetLabel || characterNameDraft,
      characterFullPrompt: characterFullPromptDraft,
      characterName: characterNameDraft,
      characterPrompt: characterPromptDraft,
    }
  }

  async function handlePresetCreate() {
    const created = await onCharacterPresetCreate(buildPresetInput())
    if (created) {
      setSelectedPresetId(created.id)
      setPresetLabelDraft(created.label)
    }
  }

  async function handlePresetOverwrite() {
    if (!selectedPreset) return
    const updated = await onCharacterPresetUpdate(selectedPreset.id, buildPresetInput())
    if (updated) {
      setSelectedPresetId(updated.id)
      setPresetLabelDraft(updated.label)
    }
  }

  async function handlePresetDelete() {
    if (!selectedPreset) return
    if (!window.confirm(`プリセット「${selectedPreset.label}」を削除しますか？`)) return
    const deleted = await onCharacterPresetDelete(selectedPreset.id)
    if (deleted) setSelectedPresetId("")
  }

  function handlePresetApply() {
    if (!selectedPreset) return
    setCharacterNameDraft(selectedPreset.characterName)
    setCharacterFullPromptDraft(selectedPreset.characterFullPrompt)
    setCharacterPromptDraft(selectedPreset.characterPrompt)
    setPresetLabelDraft(selectedPreset.label)
  }

  async function handleMemoryClear() {
    if (!window.confirm("長期記憶をクリアしますか？ 継続文脈がリセットされます。")) return
    await onChatMemoryClear()
  }

  function handleBackgroundClear() {
    if (!backgroundAssetLabel || window.confirm("現在の背景差し替えをクリアしますか？")) {
      onBackgroundClear()
    }
  }

  function handleMotionPngClear() {
    if ((!motionPngFolderLabel && !motionPngAssetStatus.message) || window.confirm("MotionPNGTuber アセットをクリアしますか？")) {
      onMotionPngClear()
    }
  }

  async function saveDraftSettings() {
    await onChatSettingsSave({
      ...chatSettings,
      characterName: characterNameDraft,
      characterFullPrompt: characterFullPromptDraft,
      characterPrompt: characterPromptDraft,
      memory: {
        mode: memoryModeDraft,
        persistResponses: memoryPersistDraft,
      },
    })
  }

  function resetDraftToDefaults() {
    const defaults = createDefaultChatSettings()
    setCharacterNameDraft(defaults.characterName)
    setCharacterFullPromptDraft(defaults.characterFullPrompt)
    setCharacterPromptDraft(defaults.characterPrompt)
    setPresetLabelDraft(defaults.characterName)
    setMemoryModeDraft(defaults.memory.mode)
    setMemoryPersistDraft(defaults.memory.persistResponses)
  }

  return (
    <div className="settings-modal" role="dialog" aria-modal="true" aria-label="設定">
      <div className="settings-modal__backdrop" onClick={onClose} />
      <div className="settings-modal__card">
        <header className="settings-modal__header">
          <h2 className="settings-modal__title">Settings</h2>
          <button className="settings-modal__close" type="button" aria-label="閉じる" onClick={onClose}>
            <LucideX size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="settings-modal__body">
          <nav className="settings-modal__nav" aria-label="設定セクション">
            {SETTINGS_NAV.map((item) => (
              <a
                key={item.id}
                className="settings-modal__nav-item"
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="settings-modal__sections">
          {/* キャラクター */}
          <section className="settings-section" id="section-character">
            <h3 className="settings-section__heading">キャラクター</h3>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">キャラクター設定</p>
                  <p className="card__hint card__hint--compact">
                    名前はここで保存し、話し方は AI 自動更新とリポジトリ人格ルールで育てます。
                  </p>
                </div>
                <span className={`info-chip info-chip--${isCharacterDraftDirty ? "warn" : "ok"}`}>
                  {isCharacterDraftDirty ? "名前 未保存" : "名前 反映済み"}
                </span>
              </div>
              <label className="field">
                <span className="card__key">名前</span>
                <input
                  className="field__input"
                  type="text"
                  maxLength={maxCharacterNameLength}
                  value={characterNameDraft}
                  onChange={(e) => setCharacterNameDraft(e.target.value)}
                  disabled={chatSettingsBusy || chatMemoryClearBusy || characterPresetBusy}
                />
              </label>
              <div className="field">
                <span className="card__key">短い人格プロンプト</span>
                <pre className="character-draft__preview" aria-readonly="true">{characterPromptDraft || "(未設定)"}</pre>
              </div>
              <div className="field">
                <span className="card__key">詳細人格プロンプト</span>
                <pre className="character-draft__preview" aria-readonly="true">{characterFullPromptDraft || "(未設定)"}</pre>
              </div>
              <details>
                <summary>反映後プロンプトを見る</summary>
                <pre className="character-draft__preview">{renderedCharacterFullPrompt}</pre>
              </details>
              <p className="card__hint card__hint--compact">
                ※ 短い人格プロンプトと詳細人格プロンプトの実体は .cursor/rules の専用ファイルにあります。AI が直近の会話を踏まえて自動で書き換え、この画面では読み取り専用で表示します。
              </p>
              <div className="composer__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => void saveDraftSettings()}
                  disabled={chatSettingsBusy || characterPresetBusy || !isSettingsDirty}
                >
                  {chatSettingsBusy ? "保存中…" : "名前を保存"}
                </button>
              </div>
              {chatSettingsNotice && (
                <div className="notice notice--ok">
                  <p className="notice__text">{chatSettingsNotice}</p>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">AI 自動更新</p>
                  <p className="card__hint card__hint--compact">
                    会話の流れを踏まえて AI が人格プロンプトとリポジトリ人格ルールを書き換えます。自走で定期実行されますが、ここから即時実行も可能です。
                  </p>
                </div>
                <span className={`info-chip info-chip--${personaAutoRewriteBusy ? "warn" : "muted"}`}>
                  {personaAutoRewriteBusy ? "更新中" : "待機中"}
                </span>
              </div>
              <div className="card__row">
                <span className="card__key">最終更新</span>
                <span className="card__val">
                  {personaAutoRewriteUpdatedAt
                    ? new Date(personaAutoRewriteUpdatedAt).toLocaleString()
                    : "未実行"}
                </span>
              </div>
              <div className="card__row">
                <span className="card__key">人格ルール</span>
                <span className="card__val">
                  {characterRuleStatus.error
                    ? "読み込みエラー"
                    : characterRuleStatus.loaded
                      ? `${characterRuleStatus.path} · ${characterRuleStatus.contentLength} 文字`
                      : "未作成"}
                </span>
              </div>
              {characterRuleStatus.updatedAt && (
                <div className="card__row">
                  <span className="card__key">ルール更新</span>
                  <span className="card__val">{new Date(characterRuleStatus.updatedAt).toLocaleString()}</span>
                </div>
              )}
              <p className="card__hint card__hint--compact">
                .cursor/rules の専用ファイルも自動更新されます。配信文脈を反映した内容が git diff に出るため、コミット前に確認してください。
              </p>
              {characterRuleStatus.error && (
                <div className="notice notice--error">
                  <p className="notice__text">{characterRuleStatus.error}</p>
                </div>
              )}
              <div className="composer__actions">
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => void onPersonaAutoRewriteRequest()}
                  disabled={personaAutoRewriteBusy}
                >
                  {personaAutoRewriteBusy ? "更新中…" : "今すぐ AI に書き換えてもらう"}
                </button>
              </div>
              {personaAutoRewriteNotice && (
                <div className="notice notice--ok">
                  <p className="notice__text">{personaAutoRewriteNotice}</p>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">Long-term Memory</p>
                  <p className="card__hint card__hint--compact">記憶をどれくらい使うか決めます。</p>
                </div>
                <span className={`info-chip info-chip--${isMemoryDirty ? "warn" : "ok"}`}>
                  {isMemoryDirty ? "未保存あり" : "保存済み"}
                </span>
              </div>
              <label className="field">
                <span className="card__key">返答への反映</span>
                <select
                  className="field__input"
                  value={memoryModeDraft}
                  onChange={(e) => setMemoryModeDraft(e.target.value as ChatSettings["memory"]["mode"])}
                  disabled={chatSettingsBusy || chatMemoryClearBusy}
                >
                  <option value="curated">整理して使う（推奨）</option>
                  <option value="full">強めに使う</option>
                  <option value="off">使わない</option>
                </select>
              </label>
              <div className="card__row">
                <span className="card__key">返答後に記憶へ保存</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={memoryPersistDraft}
                    onChange={(e) => setMemoryPersistDraft(e.target.checked)}
                    disabled={chatSettingsBusy || chatMemoryClearBusy}
                  />
                  <span className="toggle__slider" />
                </label>
              </div>
              <div className="composer__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => void saveDraftSettings()}
                  disabled={chatSettingsBusy || characterPresetBusy || !isSettingsDirty}
                >
                  {chatSettingsBusy ? "保存中…" : "保存"}
                </button>
                <button
                  className="btn btn--danger"
                  type="button"
                  onClick={() => void handleMemoryClear()}
                  disabled={chatSettingsBusy || chatMemoryClearBusy}
                >
                  {chatMemoryClearBusy ? "クリア中…" : "長期記憶をクリア"}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">Current Hidden State</p>
                  <p className="card__hint card__hint--compact">
                    現在プロンプトに反映されている内部値です。初期値は全軸 50 です。
                  </p>
                </div>
                <span className="info-chip info-chip--muted">Read only</span>
              </div>
              {characterSinNames.map((sinName) => (
                <div key={sinName} className="card__row">
                  <span className="card__key">{describeSinLabel(sinName)}</span>
                  <span className="card__val">{runtimeCharacterSins[sinName]}</span>
                </div>
              ))}
            </div>
          </section>

          {/* アバター */}
          <section className="settings-section" id="section-avatar">
            <h3 className="settings-section__heading">アバター</h3>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">Avatar</p>
                  <p className="card__hint card__hint--compact">モデル切替と MotionPNGTuber 調整。</p>
                </div>
              </div>
              <label className="field">
                <span className="card__key">モデル</span>
                <select
                  className="field__input"
                  value={avatarMode}
                  onChange={(e) => onAvatarModeChange(e.target.value as AvatarMode)}
                >
                  <option value="svg">SVG</option>
                  <option value="motionpng">MotionPNGTuber</option>
                </select>
              </label>
              {avatarMode === "svg" && (
                <>
                  <label className="field">
                    <span className="card__key">SVGキャラクター</span>
                    <select
                      className="field__input"
                      value={svgCharacter}
                      onChange={(e) => onSvgCharacterChange(e.target.value as SvgCharacterId)}
                    >
                      {svgCharacterChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings-preview">
                    <div className="settings-preview__label">ステージプレビュー（実寸スケール）</div>
                    <div className="settings-preview__frame">
                      {stagePreview ?? (
                        <div className="settings-preview__empty">プレビューが利用できません。</div>
                      )}
                    </div>
                  </div>
                  <label className="field">
                    <span className="card__key">拡大率 {svgAvatarSettings.scale.toFixed(2)}x</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={0.3}
                      max={2.5}
                      step={0.01}
                      value={svgAvatarSettings.scale}
                      onChange={(e) => onSvgAvatarSettingChange({ scale: Number.parseFloat(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">横位置 {svgAvatarSettings.offsetX}px</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={-320}
                      max={320}
                      step={4}
                      value={svgAvatarSettings.offsetX}
                      onChange={(e) => onSvgAvatarSettingChange({ offsetX: Number.parseInt(e.target.value, 10) })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">縦位置 {svgAvatarSettings.offsetY}px</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={-320}
                      max={320}
                      step={4}
                      value={svgAvatarSettings.offsetY}
                      onChange={(e) => onSvgAvatarSettingChange({ offsetY: Number.parseInt(e.target.value, 10) })}
                    />
                  </label>
                </>
              )}
              {avatarMode === "motionpng" && (
                <>
                  <div className="composer__actions">
                    <button className="btn btn--primary" type="button" onClick={onMotionPngFolderSelect}>
                      フォルダを選択
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={handleMotionPngClear}
                      disabled={!motionPngFolderLabel && !motionPngAssetStatus.message}
                    >
                      クリア
                    </button>
                  </div>
                  <div className="card__row">
                    <span className="card__key">選択中</span>
                    <span className="card__val">{motionPngFolderLabel ?? "未選択"}</span>
                  </div>
                  {motionPngAssetStatus.message && (
                    <p className="card__hint">{motionPngAssetStatus.message}</p>
                  )}
                  <div className="settings-preview">
                    <div className="settings-preview__label">ステージプレビュー（実寸スケール）</div>
                    <div className="settings-preview__frame">
                      {stagePreview ?? (
                        <div className="settings-preview__empty">
                          プレビューが利用できません。
                        </div>
                      )}
                    </div>
                  </div>
                  <label className="field">
                    <span className="card__key">感度 {motionPngSettings.sensitivity}</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={0}
                      max={100}
                      value={motionPngSettings.sensitivity}
                      onChange={(e) => onMotionPngSettingChange({ sensitivity: Number.parseInt(e.target.value, 10) })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">拡大率 {motionPngSettings.scale.toFixed(2)}x</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={0.5}
                      max={1.8}
                      step={0.01}
                      value={motionPngSettings.scale}
                      onChange={(e) => onMotionPngSettingChange({ scale: Number.parseFloat(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">横位置 {motionPngSettings.offsetX}px</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={-320}
                      max={320}
                      step={4}
                      value={motionPngSettings.offsetX}
                      onChange={(e) => onMotionPngSettingChange({ offsetX: Number.parseInt(e.target.value, 10) })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">縦位置 {motionPngSettings.offsetY}px</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={-320}
                      max={320}
                      step={4}
                      value={motionPngSettings.offsetY}
                      onChange={(e) => onMotionPngSettingChange({ offsetY: Number.parseInt(e.target.value, 10) })}
                    />
                  </label>
                  <div className="card__row">
                    <span className="card__key">HQ Audio</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={motionPngSettings.hqAudioEnabled}
                        onChange={(e) => onMotionPngSettingChange({ hqAudioEnabled: e.target.checked })}
                      />
                      <span className="toggle__slider" />
                    </label>
                  </div>
                  <div className="card__row">
                    <span className="card__key">クロマキー</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={motionPngSettings.chromaKeyEnabled}
                        onChange={(e) => onMotionPngSettingChange({ chromaKeyEnabled: e.target.checked })}
                      />
                      <span className="toggle__slider" />
                    </label>
                  </div>
                  <label className="field">
                    <span className="card__key">キー色</span>
                    <input
                      className="field__input field__input--color"
                      type="color"
                      value={motionPngSettings.chromaKeyColor}
                      onChange={(e) => onMotionPngSettingChange({ chromaKeyColor: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">しきい値 {motionPngSettings.chromaKeyThreshold}</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={0}
                      max={220}
                      value={motionPngSettings.chromaKeyThreshold}
                      onChange={(e) =>
                        onMotionPngSettingChange({ chromaKeyThreshold: Number.parseInt(e.target.value, 10) })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="card__key">フェザー {motionPngSettings.chromaKeyFeather}</span>
                    <input
                      className="field__input field__input--range"
                      type="range"
                      min={1}
                      max={120}
                      value={motionPngSettings.chromaKeyFeather}
                      onChange={(e) =>
                        onMotionPngSettingChange({ chromaKeyFeather: Number.parseInt(e.target.value, 10) })
                      }
                    />
                  </label>
                </>
              )}
            </div>

            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">Background</p>
                  <p className="card__hint card__hint--compact">ステージ背景の差し替えをここで行います。</p>
                </div>
              </div>
              <div className="composer__actions">
                <button className="btn btn--primary" type="button" onClick={onBackgroundSelect}>
                  背景を選択
                </button>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={handleBackgroundClear}
                  disabled={!backgroundAssetLabel}
                >
                  クリア
                </button>
              </div>
              <div className="card__row">
                <span className="card__key">状態</span>
                <span className={`card__val card__val--${backgroundAssetLabel ? "ok" : "warn"}`}>
                  {backgroundAssetLabel ? "差し替え中" : "デフォルト"}
                </span>
              </div>
              <div className="card__row">
                <span className="card__key">選択中</span>
                <span className="card__val">
                  {backgroundAssetLabel
                    ? `${backgroundAssetKind === "video" ? "動画" : backgroundAssetKind === "preset" ? "プリセット" : "画像"} · ${backgroundAssetLabel}`
                    : "未選択"}
                </span>
              </div>
              <BackgroundPresetPicker
                selectedId={backgroundPresetId}
                onSelect={onBackgroundPresetSelect}
              />
            </div>
          </section>

          {/* ステージ表示 */}
          <section className="settings-section" id="section-stage">
            <h3 className="settings-section__heading">ステージ表示</h3>
            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">OBS Browser Source (?view=stage)</p>
                  <p className="card__hint card__hint--compact">
                    別タブ・OBS に読み込んだステージ表示で何を出すかを切り替えます。設定は localStorage で同期されます。
                  </p>
                </div>
              </div>
              <div className="card__row">
                <span className="card__key">字幕を表示</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={stageDisplayPrefs.showCaption}
                    onChange={(e) => onStageDisplayPrefsChange({ showCaption: e.target.checked })}
                  />
                  <span className="toggle__slider" />
                </label>
              </div>
              <div className="card__row">
                <span className="card__key">コメントを表示</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={stageDisplayPrefs.showComments}
                    onChange={(e) => onStageDisplayPrefsChange({ showComments: e.target.checked })}
                  />
                  <span className="toggle__slider" />
                </label>
              </div>
            </div>
          </section>

          {/* 音声 */}
          <section className="settings-section" id="section-voice">
            <h3 className="settings-section__heading">音声</h3>
            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">VOICEVOX</p>
                  <p className="card__hint card__hint--compact">音声ON/OFFと接続状態を確認します。</p>
                </div>
              </div>
              <div className="card__row">
                <span className="card__key">音声発話</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={voiceEnabled}
                    onChange={(e) => onVoiceEnabledChange(e.target.checked)}
                  />
                  <span className="toggle__slider" />
                </label>
              </div>
              <div className="card__row">
                <span className="card__key">接続状態</span>
                <span className={`card__val card__val--${voicevoxHealth?.ok ? "ok" : "warn"}`}>
                  {voiceSummary}
                </span>
              </div>
            </div>
          </section>

          {/* ストリーム */}
          <section className="settings-section" id="section-stream">
            <h3 className="settings-section__heading">ストリーム</h3>
            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">Automation Safety</p>
                  <p className="card__hint card__hint--compact">自動実行の上限と安全判定だけを確認します。</p>
                </div>
              </div>
              <div className="card__row">
                <span className="card__key">最大実行レベル</span>
                <span className="card__val">{automationPolicySummary}</span>
              </div>
              <div className="card__row">
                <span className="card__key">サービス投稿</span>
                <span className={`card__val card__val--${latestAutomationPolicy.allowExternalExecution ? "ok" : "warn"}`}>
                  {latestAutomationPolicy.allowExternalExecution ? "許可" : "無効"}
                </span>
              </div>
              <div className="card__row">
                <span className="card__key">最新の安全判定</span>
                <span className="card__val">{formatModerationSummary(latestModeration)}</span>
              </div>
            </div>
          </section>

          {/* 詳細 */}
          <section className="settings-section" id="section-about">
            <h3 className="settings-section__heading">詳細</h3>
            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">{characterProfile.profileHeading}</p>
                  <p className="card__hint card__hint--compact">同梱サンプル人格の世界観・役割の確認用です。</p>
                </div>
              </div>
              <dl className="profile-list">
                {characterProfileHighlights.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="card">
              <div className="card__header">
                <div>
                  <p className="card__title">情報</p>
                  <p className="card__hint card__hint--compact">アプリとキャラクターの基本情報です。</p>
                </div>
              </div>
              <div className="card__row">
                <span className="card__key">アプリ</span>
                <span className="card__val">{characterProfile.appName}</span>
              </div>
              <div className="card__row">
                <span className="card__key">キャラクター</span>
                <span className="card__val">{characterNameDraft.trim() || characterProfile.name}</span>
              </div>
            </div>
          </section>
          </div>
        </div>
      </div>
    </div>
  )
}

const SETTINGS_NAV = [
  { id: "section-character", label: "キャラクター" },
  { id: "section-avatar", label: "アバター" },
  { id: "section-stage", label: "ステージ表示" },
  { id: "section-voice", label: "音声" },
  { id: "section-stream", label: "ストリーム" },
  { id: "section-about", label: "詳細" },
] as const

function describeSinLabel(name: CharacterSinName) {
  switch (name) {
    case "pride": return "Pride"
    case "greed": return "Greed"
    case "envy": return "Envy"
    case "wrath": return "Wrath"
    case "sloth": return "Sloth"
    case "lust": return "Lust"
    case "gluttony": return "Gluttony"
  }
}

function formatModerationSummary(assessment: ModerationAssessment | null) {
  if (!assessment) return "未評価"
  if (assessment.disposition === "allow") return "問題なし"
  const categories = assessment.categories.join(", ")
  return categories ? `${assessment.disposition} · ${categories}` : assessment.disposition
}

type BackgroundPresetPickerProps = {
  selectedId: string | null
  onSelect: (presetId: string) => void
}

function BackgroundPresetPicker({ selectedId, onSelect }: BackgroundPresetPickerProps) {
  const grouped = backgroundPresets.reduce<Record<string, typeof backgroundPresets>>(
    (acc, preset) => {
      const list = acc[preset.category] ?? []
      list.push(preset)
      acc[preset.category] = list
      return acc
    },
    {},
  )

  const order: BackgroundPresetCategory[] = ["atmospheric", "geometric", "abstract", "scene"]

  return (
    <div className="bg-preset-picker">
      <p className="card__hint card__hint--compact">プリセットから選ぶ（{backgroundPresets.length}種）</p>
      {order
        .filter((category) => (grouped[category]?.length ?? 0) > 0)
        .map((category) => (
          <div key={category} className="bg-preset-picker__group">
            <p className="bg-preset-picker__group-title">
              {backgroundPresetCategoryLabels[category] ?? category}
            </p>
            <div className="bg-preset-picker__grid">
              {grouped[category].map((preset) => {
                const active = preset.id === selectedId
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`bg-preset-tile${active ? " bg-preset-tile--active" : ""}`}
                    onClick={() => onSelect(preset.id)}
                    aria-pressed={active}
                    title={preset.label}
                  >
                    <span
                      className="bg-preset-tile__thumb"
                      style={{ background: preset.css }}
                      aria-hidden="true"
                    />
                    <span className="bg-preset-tile__label">{preset.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}
