import {
  createInAppReplyAutomationAction,
  type AutomationEnvelope,
  type AutomationPolicy,
  type AutomationTarget,
  type ChatAutomationRequest,
} from "../shared/automation.js"
import type { ModerationAssessment } from "../shared/moderation.js"
import type { PlatformChatState } from "../shared/platformChat.js"

export function readAutomationPolicy(): AutomationPolicy {
  const maxExecutionLevel = parseExecutionLevel(process.env.AUTOMATION_MAX_EXECUTION_LEVEL)
  const allowInAppAutoExecution = parseBooleanFlag(process.env.AUTOMATION_ALLOW_IN_APP_AUTO_EXECUTE)

  return {
    allowExternalExecution: false,
    allowInAppAutoExecution: allowInAppAutoExecution ?? maxExecutionLevel === "auto_executable",
    maxExecutionLevel,
  }
}

export function withAutomationPolicy<T extends { automationPolicy?: AutomationPolicy }>(
  value: T,
  policy = readAutomationPolicy(),
): T & { automationPolicy: AutomationPolicy } {
  return {
    ...value,
    automationPolicy: policy,
  }
}

export function buildAutomationEnvelope(options: {
  moderation: ModerationAssessment
  request: ChatAutomationRequest | null
  target?: AutomationTarget
}): AutomationEnvelope {
  const policy = readAutomationPolicy()
  const target = options.request?.target ?? options.target ?? {}

  if (!options.request || options.request.source !== "platform_auto_reply") {
    return {
      actions: [],
      policy,
    }
  }

  return {
    actions: [
      createInAppReplyAutomationAction({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        moderation: options.moderation,
        policy,
        target,
      }),
    ],
    policy,
  }
}

export function applyAutomationPolicyToPlatformState(state: PlatformChatState): PlatformChatState {
  return withAutomationPolicy(state)
}

function parseExecutionLevel(value: string | undefined): AutomationPolicy["maxExecutionLevel"] {
  const normalized = value?.trim()

  switch (normalized) {
    case "suggestion_only":
    case "approval_required":
    case "auto_executable":
      return normalized
    default:
      return "auto_executable"
  }
}

function parseBooleanFlag(value: string | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return null
}
