import type { LocalAgentOptions } from "@cursor/sdk"

export function createCursorLocalOptions(): LocalAgentOptions {
  return {
    cwd: process.cwd(),
    settingSources: [],
  }
}
