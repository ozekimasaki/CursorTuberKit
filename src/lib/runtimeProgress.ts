import type { PlatformChatState } from "../../shared/platformChat"
import type { AutomaticContentCandidate } from "./autopilotScheduler"
import type { StreamMetadata } from "./streamAi"
import { MAX_RUNTIME_ACTIVITY_ITEMS } from "./autoReplyConstants"

export type StreamStatus = "ready" | "thinking" | "synthesizing" | "playing" | "error"

export const stageStatusLabel: Record<StreamStatus, string> = {
  ready: "待機中",
  thinking: "考え中",
  synthesizing: "音声生成中",
  playing: "発話中",
  error: "エラー",
}

export type RuntimeTone = "active" | "error" | "muted" | "ok" | "warn"

export type StreamRuntimeActivity = {
  detail: string | null
  id: string
  kind: string
  label: string
  status: string | null
  tone: RuntimeTone
}

export type StreamRuntimeProgress = {
  activeDetail: string | null
  activeLabel: string | null
  activities: StreamRuntimeActivity[]
}

export function createIdleRuntimeProgress(): StreamRuntimeProgress {
  return {
    activeDetail: null,
    activeLabel: null,
    activities: [],
  }
}

export function createPendingRuntimeProgress(): StreamRuntimeProgress {
  return appendRuntimeActivity(createIdleRuntimeProgress(), {
    detail: "サーバーとのストリーム接続を準備しています。",
    kind: "status",
    label: "リクエストを送信しました",
    status: "pending",
  })
}

export function applyRuntimeStateEvent(progress: StreamRuntimeProgress, state: "thinking" | "speaking" | "done") {
  switch (state) {
    case "thinking":
      return appendRuntimeActivity(progress, {
        detail: "応答内容を考えています。",
        kind: "status",
        label: "考え中",
        status: "running",
      })
    case "speaking":
      return appendRuntimeActivity(progress, {
        detail: "字幕テキストを順次受信しています。",
        kind: "status",
        label: "返答をストリーム中",
        status: "running",
      })
    case "done":
      return appendRuntimeActivity(progress, {
        detail: "本文ストリームは完了しました。必要なら読み上げを続けます。",
        kind: "status",
        label: "本文ストリーム完了",
        status: "done",
      })
  }
}

export function applyRuntimeMetadataEvent(progress: StreamRuntimeProgress, meta: StreamMetadata) {
  return appendRuntimeActivity(progress, {
    detail: meta.detail,
    kind: meta.kind,
    label: meta.name && !meta.label.includes(meta.name) ? `${meta.label} · ${meta.name}` : meta.label,
    status: meta.status,
  })
}

export function appendRuntimeActivity(
  progress: StreamRuntimeProgress,
  activity: Omit<StreamRuntimeActivity, "id" | "tone">,
): StreamRuntimeProgress {
  const nextActivity: StreamRuntimeActivity = {
    ...activity,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tone: toneFromRuntimeStatus(activity.status),
  }

  return {
    activeDetail: activity.detail,
    activeLabel: activity.label,
    activities: [nextActivity, ...progress.activities].slice(0, MAX_RUNTIME_ACTIVITY_ITEMS),
  }
}

export function finalizeRuntimeProgress(progress: StreamRuntimeProgress): StreamRuntimeProgress {
  if (!progress.activeLabel && progress.activities.length === 0) {
    return progress
  }

  return {
    activeDetail: progress.activeDetail,
    activeLabel: progress.activeLabel,
    activities:
      progress.activities.length > 0 && progress.activities[0].status !== "done"
        ? [
            {
              detail: "次のコメントを待っています。",
              id: `${Date.now()}-done`,
              kind: "status",
              label: "完了",
              status: "done",
              tone: "ok" as const,
            },
            ...progress.activities,
          ].slice(0, MAX_RUNTIME_ACTIVITY_ITEMS)
        : progress.activities,
  }
}

export function describeRuntimeDisplay(
  status: StreamStatus,
  runtimeProgress: StreamRuntimeProgress,
  errorMessage: string | null,
  options?: {
    autoReplyEnabled: boolean
    nextAutomaticContentCandidate: AutomaticContentCandidate | null
    platformState: PlatformChatState
    recentViewerEventCount: number
  },
) {
  if (status === "error") {
    return {
      detail: errorMessage ?? runtimeProgress.activeDetail,
      label: "エラーが発生しました",
      tone: "error" as const,
    }
  }

  if (status === "playing") {
    return {
      detail: "VOICEVOX 音声を再生しながら口パクを同期しています。",
      label: "読み上げ中",
      tone: "active" as const,
    }
  }

  if (status === "synthesizing") {
    return {
      detail: "VOICEVOX で短い発話単位ごとに音声を準備しています。",
      label: "音声を準備中",
      tone: "warn" as const,
    }
  }

  if (status === "thinking" && runtimeProgress.activeLabel) {
    return {
      detail: runtimeProgress.activeDetail,
      label: runtimeProgress.activeLabel,
      tone: runtimeProgress.activities[0]?.tone ?? "warn",
    }
  }

  if (status === "ready") {
    if (options?.autoReplyEnabled) {
      return describeAutopilotReadyDisplay(options)
    }

    return {
      detail: responseReadyDetail(runtimeProgress),
      label: "待機中",
      tone: "ok" as const,
    }
  }

  return {
    detail: runtimeProgress.activeDetail,
    label: stageStatusLabel[status],
    tone: runtimeProgress.activities[0]?.tone ?? "muted",
  }
}

export function describeAutopilotReadyDisplay(options: {
  nextAutomaticContentCandidate: AutomaticContentCandidate | null
  platformState: PlatformChatState
  recentViewerEventCount: number
}) {
  if (options.nextAutomaticContentCandidate) {
    return {
      detail: options.nextAutomaticContentCandidate.reason,
      label: "次ネタ待ち",
      tone: "warn" as const,
    }
  }

  if (options.platformState.status === "connected" && options.recentViewerEventCount > 0) {
    return {
      detail: "視聴者コメントを監視しつつ、空き時間は自動進行へ戻ります。",
      label: "コメント待ち",
      tone: "ok" as const,
    }
  }

  return {
    detail: "コメントが無くても、次の雑談ネタを自動で用意します。",
    label: "自動進行待ち",
    tone: "ok" as const,
  }
}

export function responseReadyDetail(runtimeProgress: StreamRuntimeProgress) {
  const latestActivity = runtimeProgress.activities[0]

  if (!latestActivity) {
    return "次のコメントや手動入力を待っています。"
  }

  if (latestActivity.status === "error") {
    return latestActivity.detail
  }

  return latestActivity.status === "done"
    ? "前回の応答は完了しています。次の入力を待っています。"
    : latestActivity.detail
}

export function toneFromRuntimeStatus(status: string | null): RuntimeTone {
  const normalized = status?.toLowerCase()

  if (!normalized) {
    return "muted"
  }

  if (["error", "failed"].includes(normalized)) {
    return "error"
  }

  if (["done", "completed", "complete", "ok", "success", "succeeded"].includes(normalized)) {
    return "ok"
  }

  if (["running", "working", "pending", "queued", "active", "synthesizing", "thinking"].includes(normalized)) {
    return "warn"
  }

  if (["playing", "streaming", "speaking"].includes(normalized)) {
    return "active"
  }

  return "muted"
}
