import {
  createInAppReplyAutomationAction,
  type AutomationEnvelope,
  type AutomationPolicy,
  type AutomationTarget,
  type ChatAutomationRequest,
} from "../shared/automation.js"
import type { ModerationAssessment } from "../shared/moderation.js"
import type { PlatformChatState } from "../shared/platformChat.js"
import { readAppConfig } from "./appConfig.js"

export function readAutomationPolicy(): AutomationPolicy {
  const { automation } = readAppConfig()

  return {
    allowExternalExecution: false,
    allowInAppAutoExecution: automation.allowInAppAutoExecute ?? automation.maxExecutionLevel === "auto_executable",
    maxExecutionLevel: automation.maxExecutionLevel,
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
