import { useEffect, useState } from 'react'

const PROMPT_SELECTION_BANNER_VISIBLE_MS = 3200

type IPromptSelectionBannerProps = {
  promptKey: string | null
  title: string | null
}

function PromptSelectionBanner({ promptKey, title }: IPromptSelectionBannerProps) {
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
