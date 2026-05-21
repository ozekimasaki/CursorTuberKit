import { useCallback, useState } from "react"

/**
 * Encapsulates the dismissible toast-style error banner.
 *
 * Public surface mirrors the original App.tsx inline state:
 * - `showError(msg)` displays a new error (clearing any prior dismissal so the
 *   same message text can be re-surfaced after being dismissed).
 * - `clearError()` hides the toast completely.
 * - `dismissError()` keeps the message in state but suppresses the toast until
 *   a different message is shown (matches the original "close button" UX).
 * - `visibleError` is the message that should currently be rendered, or null.
 */
export function useErrorToast() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dismissedError, setDismissedError] = useState<string | null>(null)

  const showError = useCallback((message: string) => {
    setDismissedError(null)
    setErrorMessage(message)
  }, [])

  const clearError = useCallback(() => {
    setErrorMessage(null)
    setDismissedError(null)
  }, [])

  const dismissError = useCallback(() => {
    setDismissedError(errorMessage)
  }, [errorMessage])

  const visibleError = errorMessage && errorMessage !== dismissedError ? errorMessage : null

  return { clearError, dismissError, showError, visibleError }
}
