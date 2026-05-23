import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  extractJsonObjectSafe,
  readJsonFileSafe,
  writeJsonFileAtomic,
} from "./cursorAgentUtils.js"

describe("cursor agent utils", () => {
  it("extracts JSON while ignoring braces inside strings", () => {
    const raw = [
      "Here is the result:",
      '```json\n{"name":"effect","css":"@keyframes x { 0% { opacity: 0; } 100% { opacity: 1; } }"}\n```',
    ].join("\n")

    expect(JSON.parse(extractJsonObjectSafe(raw))).toEqual({
      css: "@keyframes x { 0% { opacity: 0; } 100% { opacity: 1; } }",
      name: "effect",
    })
  })

  it("recovers a valid first JSON object from a file with trailing garbage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cursor-json-safe-"))
    const filePath = path.join(dir, "session.json")
    await writeFile(filePath, '{"agentId":"a","ok":true}\n}\n', "utf8")

    const result = await readJsonFileSafe<{ agentId: string; ok: boolean }>(filePath)

    expect(result.status).toBe("recovered")
    expect(result.value).toEqual({ agentId: "a", ok: true })
  })

  it("reports unrecoverable JSON without throwing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cursor-json-invalid-"))
    const filePath = path.join(dir, "broken.json")
    await writeFile(filePath, '{"agentId":', "utf8")

    const result = await readJsonFileSafe(filePath)

    expect(result.status).toBe("invalid")
    expect(result.value).toBeNull()
  })

  it("writes a clean single JSON document atomically", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cursor-json-write-"))
    const filePath = path.join(dir, "settings.json")

    await writeJsonFileAtomic(filePath, { ok: true })

    expect(await readFile(filePath, "utf8")).toBe('{"ok":true}\n')
  })
})
