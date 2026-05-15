import { randomUUID } from "node:crypto"
import type { Request, Response } from "express"

const CHAT_SESSION_COOKIE_NAME = "catlin_chat_session"
const CHAT_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type ChatRequestSession = {
  browserSessionId: string
  isNew: boolean
  transport: "cookie"
}

export function resolveChatRequestSession<Params = unknown, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown>(
  request: Request<Params, ResBody, ReqBody, ReqQuery>,
  response: Response,
): ChatRequestSession {
  const existingSessionId = readCookie(request, CHAT_SESSION_COOKIE_NAME)

  if (existingSessionId) {
    return {
      browserSessionId: existingSessionId,
      isNew: false,
      transport: "cookie",
    }
  }

  const browserSessionId = randomUUID()
  response.setHeader("Set-Cookie", serializeChatSessionCookie(request, browserSessionId))

  return {
    browserSessionId,
    isNew: true,
    transport: "cookie",
  }
}

function readCookie<Params = unknown, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown>(
  request: Request<Params, ResBody, ReqBody, ReqQuery>,
  name: string,
) {
  const cookieHeader = request.headers.cookie

  if (!cookieHeader) {
    return null
  }

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=")

    if (rawName !== name || rawValue.length === 0) {
      continue
    }

    const value = decodeURIComponent(rawValue.join("=")).trim()

    if (value) {
      return value
    }
  }

  return null
}

function serializeChatSessionCookie<Params = unknown, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown>(
  request: Request<Params, ResBody, ReqBody, ReqQuery>,
  sessionId: string,
) {
  const parts = [
    `${CHAT_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    `Max-Age=${CHAT_SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ]

  if (request.secure || request.headers["x-forwarded-proto"] === "https") {
    parts.push("Secure")
  }

  return parts.join("; ")
}
