import { useEffect, useState } from 'react'

/** How long the nudge stays up before fading itself out. */
const PROMPT_SELECTION_BANNER_VISIBLE_MS = 3200

type IPromptSelectionBannerProps = {
  /** Identifies the pending prompt; changing it re-shows the banner for the new question. */
  promptKey: string | null
  title: string | null
}

/**
 * Transient "pick a card" nudge for effect selection prompts. It announces the question and fades away on its
 * own: the selectable cards (their Select buttons) and the middle phase indicator carry the state from then on,
 * so the banner must never require a click to dismiss.
 */
function PromptSelectionBanner({ promptKey, title }: IPromptSelectionBannerProps) {
  // The caller keys this component by prompt id, so each new question starts un-expired and the only state
  // change comes from the timeout below (setState directly in an effect body is rejected by the React
  // Compiler lint rules).
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsExpired(true)
    }, PROMPT_SELECTION_BANNER_VISIBLE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [])

  if (!promptKey || !title) {
    return null
  }

  return (
    <div
      data-testid="prompt-selection-banner"
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 top-1/2 z-40 max-w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]/95 px-4 py-2 text-center shadow-[var(--panel-shadow)] transition-opacity duration-500 ease-out ${
        isExpired ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
    </div>
  )
}

export { PromptSelectionBanner }
