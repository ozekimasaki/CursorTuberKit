export const cursorPromptModes = ["full-context", "resume-compact"] as const

export type CursorPromptMode = (typeof cursorPromptModes)[number]
