import type { PlatformChatMode } from "./platformChat.js"
import type { ModerationAssessment } from "./moderation.js"

export const automationExecutionLevels = ["suggestion_only", "approval_required", "auto_executable"] as const

export type AutomationExecutionLevel = (typeof automationExecutionLevels)[number]

export const automationActionKinds = ["in_app_reply", "platform_reply"] as const

export type AutomationActionKind = (typeof automationActionKinds)[number]

export type AutomationApprovalState = "not_required" | "pending" | "approved"
export type AutomationActionStatus = "ready" | "blocked"

export type AutomationTarget = {
  platform?: PlatformChatMode
  target?: string
}

export type AutomationAction = {
  approvalState: AutomationApprovalState
  available: boolean
  detail: string | null
  executionLevel: AutomationExecutionLevel
  id: string
  kind: AutomationActionKind
  status: AutomationActionStatus
  summary: string
  target: AutomationTarget
  title: string
}

export type AutomationPolicy = {
  allowExternalExecution: boolean
  allowInAppAutoExecution: boolean
  maxExecutionLevel: AutomationExecutionLevel
}

export type AutomationEnvelope = {
  actions: AutomationAction[]
  policy: AutomationPolicy
}

export type ChatAutomationRequest = {
  source: "manual" | "platform_auto_reply"
  target?: AutomationTarget
}

export function clampAutomationExecutionLevel(
  requested: AutomationExecutionLevel,
  maxAllowed: AutomationExecutionLevel,
): AutomationExecutionLevel {
  return automationExecutionLevelRank(requested) > automationExecutionLevelRank(maxAllowed) ? maxAllowed : requested
}

export function automationExecutionLevelRank(level: AutomationExecutionLevel) {
  switch (level) {
    case "suggestion_only":
      return 0
    case "approval_required":
      return 1
    case "auto_executable":
      return 2
  }
}

export function createInAppReplyAutomationAction(options: {
  id: string
  moderation: ModerationAssessment
  policy: AutomationPolicy
  target: AutomationTarget
}): AutomationAction {
  const { id, moderation, policy, target } = options
  const requestedLevel =
    moderation.disposition === "block"
      ? "suggestion_only"
      : moderation.disposition === "review"
        ? "approval_required"
        : policy.allowInAppAutoExecution
          ? "auto_executable"
          : "approval_required"
  const executionLevel = clampAutomationExecutionLevel(requestedLevel, policy.maxExecutionLevel)
  const status = moderation.disposition === "block" ? "blocked" : "ready"

  return {
    approvalState: executionLevel === "auto_executable" ? "not_required" : "pending",
    available: status === "ready",
    detail: describeAutomationDetail(moderation),
    executionLevel,
    id,
    kind: "in_app_reply",
    status,
    summary:
      executionLevel === "auto_executable"
        ? "アプリ内でそのまま再生できます。"
        : executionLevel === "approval_required"
          ? "再生前に承認が必要です。"
          : "提案のみを保持し、自動実行しません。",
    target,
    title: "アプリ内返答",
  }
}

export function describeAutomationExecutionLevel(level: AutomationExecutionLevel) {
  switch (level) {
    case "suggestion_only":
      return "提案のみ"
    case "approval_required":
      return "承認待ち"
    case "auto_executable":
      return "自動実行"
  }
}

function describeAutomationDetail(moderation: ModerationAssessment) {
  if (moderation.disposition === "allow") {
    return null
  }

  return moderation.reasons.length > 0
    ? moderation.reasons.join(" / ")
    : moderation.disposition === "block"
      ? "安全確認のため自動実行を停止しました。"
      : "安全確認のため承認を挟みます。"
}
