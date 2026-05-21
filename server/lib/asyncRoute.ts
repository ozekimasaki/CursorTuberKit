import type { Request, Response } from "express"
import { getErrorMessage } from "./errors.js"

type AsyncRouteHandler = (request: Request, response: Response) => Promise<unknown> | unknown

export function asyncRoute(handler: AsyncRouteHandler) {
  return (request: Request, response: Response) => {
    Promise.resolve()
      .then(() => handler(request, response))
      .catch((error) => {
        if (!response.headersSent) {
          response.status(500).json({ error: getErrorMessage(error) })
        }
      })
  }
}

export function readRequestSignal(request: Request): AbortSignal | undefined {
  const maybeRequest = request as Request & { raw?: { signal?: AbortSignal }; signal?: AbortSignal }
  return maybeRequest.raw?.signal ?? maybeRequest.signal
}
